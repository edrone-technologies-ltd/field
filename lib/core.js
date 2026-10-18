// ליבת האפליקציה: חיבור לשרת, משתמש מחובר, הרשאות מודולים, סנכרון תור, עזרי ממשק.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON, LOGIN_DOMAIN, VAPID_PUBLIC } from '../config.js';
import { outbox, cache, qget, qset, qclear, qprune, setOwner } from './store.js';
export { cache };

// ---------- שכבת רשת אחת לכל הקריאות לשרת ----------
// 1. קריאה זהה שכבר בדרך (שני חלקי מסך שמבקשים אותו דבר) — נשלחת פעם אחת.
// 2. אין קליטה / קליטה חלשה (8 שניות בלי תשובה) — מגישים את התשובה האחרונה ששמורה בטלפון (רק קריאה, לעולם לא כתיבה).
// 3. החיבור פג (401) — מחדשים פעם אחת ושולחים שוב, בלי לזרוק את המשתמש למסך כניסה.
const READ_RPC = /\/rpc\/(my_[a-z_]*|[a-z_]+_(list|stats|status)|reportable_projects|project_readiness|profiles_full)$/;   // קריאה בלבד — לא מנקה זיכרון, נשמר לבלי קליטה
const inflight = new Map(), qWrote = new Map(), recent = new Map();   // recent: תשובה זהה מהשניות האחרונות (טעינה מוקדמת של חלקי מסך)
let refreshing = null;
const qKey = (url, init, h) => (state.user?.id || '') + '|' + (init.method || 'GET') + '|' + url + '|' + (h.get('prefer') || '') + '|' + (h.get('range') || '') + '|' + (init.body || '');
// משיכה לרענון: בלי תשובות מהשניות האחרונות — הכל מהשרת
export const freshReads = () => recent.clear();
async function netFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url, method = (init.method || 'GET').toUpperCase();
  const isRest = url.includes('/rest/v1/'), h = new Headers(init.headers || {});
  const read = isRest && (method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPC.test(url.split('?')[0])));
  // כתיבה מנקה את הזיכרון הקצר — חוץ מרישום שימוש (לא משנה נתונים שמוצגים)
  if (!read) { if (isRest && !/\/rest\/v1\/(app_events|rpc\/touch|push_subscriptions)\b/.test(url)) { inflight.clear(); recent.clear(); qWrote.clear(); } return authRetry(input, init); }   // אחרי כתיבה — הקריאה הבאה נשמרת לבלי קליטה מיד
  const key = qKey(url, init, h), hit = recent.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.r.clone();
  if (inflight.has(key)) return (await inflight.get(key)).clone();
  const p = readFetch(input, init, key, method);
  inflight.set(key, p); p.then(r => { if (r.ok && inflight.get(key) === p) { recent.delete(key); recent.set(key, { at: Date.now(), r }); for (const [k, v] of recent) { if (recent.size <= 60 && Date.now() - v.at < 5000) break; recent.delete(k); } } }, () => {}).finally(() => inflight.get(key) === p && inflight.delete(key)).catch(() => {});
  return (await p).clone();
}
// קליטה "תקועה" (גג/חניון: יש פס אבל שום דבר לא עובר) — בקשה לא נתקעת לנצח ולא חוסמת את התור.
// הזמן לפי גודל הגוף (תמונה ב-2G צריכה דקות), קריאה רגילה — 30 שניות. כל הכתיבות בטוחות לשליחה חוזרת (מזהה קבוע)
function tfetch(input, init = {}) {
  if (init.signal || typeof AbortController === 'undefined') return fetch(input, init);
  const b = init.body, size = b ? (b.size ?? b.length ?? 0) : 0;
  const ms = 30000 + (typeof FormData !== 'undefined' && b instanceof FormData ? 240000 : size / 3);
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  return fetch(input, { ...init, signal: ac.signal }).finally(() => clearTimeout(t));
}
async function authRetry(input, init) {
  let r = await tfetch(input, init);
  if (r.status === 401 && !String(typeof input === 'string' ? input : input.url).includes('/auth/v1/')) {
    const body = await r.clone().text().catch(() => '');
    if (/jwt|expired|token/i.test(body)) {
      refreshing ||= sb.auth.refreshSession().finally(() => { setTimeout(() => refreshing = null, 1000); });
      const { data } = await refreshing.catch(() => ({ data: null }));
      const tok = data?.session?.access_token;
      if (tok) { const h = new Headers(init.headers || {}); h.set('Authorization', 'Bearer ' + tok); r = await tfetch(input, { ...init, headers: h }); }
    }
  }
  return r;
}
// storedN: מונה תשובות שהוגשו מהטלפון — מסך שטוען נתונים יודע שחלקם ישנים (ואז מה שנשמר אצלו מקומית גובר)
const stored = async key => { try { const v = await qget(key); if (!v) return null; state.stale = Date.now(); state.storedN++; updateNet(); return new Response(v.b, { status: 200, headers: v.h }); } catch { return null; } };
async function readFetch(input, init, key, method) {
  if (!navigator.onLine) { const c = await stored(key); if (c) return c; }
  const net = authRetry(input, init).then(r => {
    if (r.ok && Date.now() - (qWrote.get(key) || 0) > 30000) qWrote.set(key, Date.now()), r.clone().text().then(b => { if (b.length < 400000) qset(key, { b, h: { 'content-type': r.headers.get('content-type') || 'application/json', 'content-range': r.headers.get('content-range') || '' } }).catch(() => {}); }).catch(() => {});
    if (state.stale) { state.stale = 0; updateNet(); }
    return r;
  });
  net.catch(() => {});
  let to; const slow = new Promise(ok => to = setTimeout(ok, 8000)).then(() => stored(key)).then(c => c || net);
  try { return await Promise.race([net, slow]); }
  catch (e) { const c = await stored(key); if (c) return c; throw e; }
  finally { clearTimeout(to); }
}

// פתיחה בלי קליטה עם חיבור שפג (הטוקן תקף שעה — בבוקר הוא כמעט תמיד פג): בלי זה הספרייה מנסה לחדש ~30 שניות,
// כל המסכים מחכים לה, ונשארים על מסך הפתיחה. בלי קליטה מציגים לה את החיבור השמור כתקף; כשהקליטה חוזרת — הטוקן האמיתי
// נקרא שוב, מתחדש, ומה שבתור נשלח (וגם 401 מהשרת מחדש פעם אחת ב-authRetry)
// עותק של החיבור נשמר גם ב-IndexedDB: ה-service worker שולח ממנו את התור כשהאפליקציה סגורה (אנדרואיד), ואם הוא חידש
// את החיבור בינתיים — האפליקציה לוקחת את החדש (אחרת הטוקן הישן נשלח פעם שנייה והשרת מנתק את החיבור)
const AUTH_KEY = 'edrone-field-auth';
let idbAuth = null;
const idbRead = () => (idbAuth = cache.get('sw-auth').then(v => v?.s || null).catch(() => null));
const authOf = v => { try { const j = JSON.parse(v); return { e: +j?.expires_at || 0, u: j?.user?.id || '' }; } catch { return { e: 0, u: '' }; } };
const mirror = v => cache.set('sw-auth', v ? { url: SUPABASE_URL, anon: SUPABASE_ANON, s: v } : null).catch(() => {});
const authStore = {
  getItem: async k => { let v = localStorage.getItem(k);
    if (k !== AUTH_KEY) return v;
    if (v) { const w = await (idbAuth || idbRead()); if (w && w !== v) { const a = authOf(v), b = authOf(w); if (b.u === a.u && b.e > a.e) { v = w; localStorage.setItem(k, v); } } }
    if (!v || navigator.onLine) return v;
    try { const s = JSON.parse(v); if (s?.refresh_token && s.expires_at && s.expires_at * 1000 < Date.now() + 120e3) return JSON.stringify({ ...s, expires_at: Math.floor(Date.now() / 1000) + 600 }); } catch { /* */ }
    return v; },
  setItem: (k, v) => { localStorage.setItem(k, v); if (k === AUTH_KEY) { idbAuth = Promise.resolve(v); mirror(v); } },
  removeItem: k => { localStorage.removeItem(k); if (k === AUTH_KEY) { idbAuth = Promise.resolve(null); mirror(null); } },
};
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY, storage: authStore },
  global: { fetch: netFetch },
});

export const state = { user: null, profile: null, modules: [], online: navigator.onLine, stale: 0, storedN: 0 };

// ---------- כניסה בטלפון + קוד ----------
export const phoneToLogin = (phone) => 'p' + phone.replace(/\D/g, '').replace(/^972/, '0') + '@' + LOGIN_DOMAIN;
export async function signIn(phone, code) {
  // דרך השרת (invite/login): סופר קודים שגויים ונועל אחרי 5 ב-15 דקות (db/105). הקוד עצמו כבר לא סיסמה ישירה
  const net = 'אין חיבור לשרת — נסו שוב בעוד רגע';
  let r; try { r = await sb.functions.invoke('invite', { body: { action: 'login', phone, code } }); } catch { throw new Error(net); }
  if (r.error || !r.data?.session) { let m = ''; try { m = (await r.error?.context?.json())?.error || ''; } catch { /* */ } throw new Error(m || net); }
  const { error } = await sb.auth.setSession(r.data.session);
  if (error) throw new Error(net);
}
export async function signOut() {
  // יש פריטים שעוד לא נשלחו — לא יוצאים בלי לשאול (הם יישלחו בכניסה הבאה, אבל עדיף לא לצאת באמצע)
  const n = (await outbox.all().catch(() => [])).length;
  if (n && !(await confirmBox(`${n} פריטים עוד לא נשלחו`, { body: 'הם יישלחו כשתיכנסו שוב מהטלפון הזה', ok: 'יציאה בכל זאת', danger: true }))) return;
  await qclear().catch(() => {}); await cache.set('me', null).catch(() => {});
  window.__signingOut = true; await sb.auth.signOut(); location.hash = ''; location.reload();
}
setTimeout(() => qprune().catch(() => {}), 15000);

export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  state.user = session.user; setOwner(session.user.id);
  idbRead().then(w => { const v = localStorage.getItem(AUTH_KEY); if (v && (!w || authOf(w).u !== authOf(v).u)) { idbAuth = Promise.resolve(v); mirror(v); } });   // גרסה קודמת / החלפת משתמש: העותק ל-service worker תמיד של המחובר
  // פתיחה מיידית: הפרופיל השמור בטלפון (של אותו משתמש) מציג את המסך מיד, והרענון מהשרת רץ ברקע.
  // אם ההרשאות/התפקיד השתנו — המסך נטען מחדש; אם הגישה הושבתה — יציאה.
  const fresh = (async () => {
    const [{ data: p, error }, { data: m }] = await Promise.all([
      sb.rpc('profiles_full', { ids: [session.user.id] }).single(),   // השורה המלאה (רישיון וכו') — רק לעצמי ולמנהלים (db/105)
      sb.rpc('my_modules'),
    ]);
    if (error || !p) return null;
    const mods = (m || []).map(x => typeof x === 'string' ? x : x.my_modules);
    cache.set('me', { profile: p, modules: mods }).catch(() => {});
    return { profile: p, modules: mods };
  })().catch(() => null);
  const c = await cache.get('me').catch(() => null);
  if (c?.profile?.id === session.user.id) {
    state.profile = c.profile; state.modules = c.modules || []; setOwner(session.user.id, c.profile.full_name);
    fresh.then(f => {
      if (!f) return; setOwner(session.user.id, f.profile.full_name);
      const changed = f.profile.role !== state.profile.role || f.profile.is_active !== state.profile.is_active || f.modules.slice().sort().join() !== state.modules.slice().sort().join();
      state.profile = f.profile; state.modules = f.modules;
      if (changed) { if (!f.profile.is_active) signOut(); else dispatchEvent(new HashChangeEvent('hashchange')); }
    });
    return true;
  }
  const f = await fresh;
  if (f) { state.profile = f.profile; state.modules = f.modules; setOwner(session.user.id, f.profile.full_name); }
  return !!state.profile;
}
export const can = (mod) => state.modules.includes(mod);
// סטטוס ממאנדי בלי מילים של כסף למי שאין לו הרשאת כספים ("הסתיים — ממתין לתשלום" → "הסתיים")
// סטטוס ממאנדי: "להוצאת חשבונית" / "ממתין לתשלום" רק להנהלה (admin), לא לפי מודול — אביחי 18/10
// כסף לא בממשק למי שאינו הנהלה: משפט בטקסט חופשי (הערות אתר, הנחיות משימה, דגשים, תכנית) שמזכיר הצעת מחיר / חוזה / חשבונית / סכום —
// מוסתר בתצוגה בלבד. הנתון עצמו לא משתנה (לא להשתמש בשדות עריכה — שמירה הייתה מוחקת אותו)
export const MONEY_RE = /₪|ש["״]ח|שקל|מע["״]מ|חשבוני|הצע[תהו]|חוזה|חוזים|קבל[הות]\s*\d|תשלום|תשלומ|משלמ|כספים|חשבון בנק|ניכוי מס|\d[\d,.]*\s*(?:אלף|K\b)/;
export const hideMoneyText = s => { if (!s || state.profile?.role === 'admin') return s || '';
  return String(s).split('\n').map(l => l.split(/(?<=[.!?;])\s+|\s+(?=⚠)/).filter(x => !MONEY_RE.test(x)).join(' ').trim()).filter(Boolean).join('\n'); };
// מה שהוסתר (לשדה עריכה: מוצג בלי, ובשמירה מוחזר לסוף — כך הנתון לא נמחק)
export const moneyPart = s => { if (!s || state.profile?.role === 'admin') return '';
  return String(s).split('\n').flatMap(l => l.split(/(?<=[.!?;])\s+|\s+(?=⚠)/).filter(x => MONEY_RE.test(x))).join(' ').trim(); };
// הבחירה האחרונה של המשתמש בטלפון הזה (סוג תקלה, חוסר שהוקלד, חומר וגלונים לפרויקט) — ברירת מחדל חכמה, פחות הקלדה
export const last = {
  get: k => { try { return JSON.parse(localStorage.getItem(`edrone-last:${state.user?.id || ''}:${k}`)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`edrone-last:${state.user?.id || ''}:${k}`, JSON.stringify(v)); } catch { /* */ } },
};
// מאנדי מוזכר רק להנהלה (admin). לכל השאר — ניסוח ניטרלי
export const mon = (a, b = '') => state.profile?.role === 'admin' ? a : b;
export const stLabel = s => (state.profile?.role !== 'admin' && s ? String(s).replace(/\s*—\s*(ממתין לתשלום|להוצאת חשבונית)/, '').replace(/^שולם ✓$/, 'הסתיים') : s || '');
export const isManager = () => ['admin', 'ops_manager'].includes(state.profile?.role);

// ---------- תמונות מאוחסנות ----------
const urlCache = new Map();
// לרשימות: קישור לתמונה הממוזערת (אם קיימת) + קישור למלאה. מחזיר {path: {t, f}}
export async function thumbUrls(bucket, paths) {
  const { thumbPath } = await import('./store.js');
  const [f, t] = await Promise.all([signedUrls(bucket, paths), signedUrls(bucket, paths.filter(Boolean).map(thumbPath))]);
  return Object.fromEntries(paths.map(p => [p, { f: f[p] || '', t: (p && t[thumbPath(p)]) || f[p] || '' }]));
}
export async function signedUrls(bucket, paths) {
  const need = paths.filter(p => p && !urlCache.has(bucket + p));
  // מנסים תמיד (navigator.onLine מחזיר לפעמים "אין קליטה" כשיש) — כישלון = נשארים בלי קישור
  if (need.length) try {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need, 60 * 60 * 24 * 7);
    (data || []).forEach(d => d.signedUrl && urlCache.set(bucket + d.path, d.signedUrl));
  } catch { /* בלי קליטה */ }
  return Object.fromEntries(paths.map(p => [p, urlCache.get(bucket + p) || '']));
}

// ---------- תור שליחה ----------
let flushing = null;   // ההבטחה של הסבב הנוכחי — מי שמחכה לשליחה מחכה לו
// הטלפון מלא: מפנים קודם את מה שאפשר להוריד שוב (תמונות שמורות, תשובות שרת ישנות) ומנסים פעם נוספת.
// אם עדיין אין מקום — הפעולה לא נשמרה, והמשתמש יודע (לא נעלם בשקט)
export async function enqueue(item) {
  try { await outbox.add(item); }
  catch (e) {
    if (!/quota|space|full|disk/i.test(String(e?.name) + String(e?.message))) throw e;
    await Promise.all([caches.delete('edrone-img').catch(() => {}), qclear().catch(() => {})]);
    try { await outbox.add(item); }
    catch (e2) { toast('אין מקום בטלפון — לא נשמר. מפנים מקום ומנסים שוב', 5000, 'error'); const er = new Error('quota'); er.quota = true; throw er; }
  }
  updateNet(); wake(); flush();
}
// שליחה ברקע (Background Sync — אנדרואיד/כרום): הדפדפן מעיר את ה-service worker כשהקליטה חוזרת, גם כשהאפליקציה סגורה.
// באייפון אין — שם התור נשלח רק כשהאפליקציה פתוחה (והניסוח במסכים בהתאם)
export const bgSend = 'serviceWorker' in navigator && typeof SyncManager !== 'undefined';
export const sendsLabel = () => bgSend ? 'יישלח לבד' : 'יישלח כשהאפליקציה פתוחה';
function wake() { if (bgSend) navigator.serviceWorker.ready.then(r => r.sync.register('outbox')).catch(() => {}); }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { const t = e.data?.t;
    if (t === 'flush') flush(); else if (t === 'auth') idbAuth = null; else if (t === 'sent') updateNet(); });
  try { navigator.serviceWorker.startMessages(); } catch { /* */ }
}
// תקלת קליטה (ולא סירוב של השרת): לא נחשבת "ניסיון", ועוצרת את הסבב — אין טעם לשרוף את כל התור על רשת מתה
const NET_ERR = /failed to fetch|networkerror|load failed|network ?error|network request|abort|timed? ?out|timeout|fetch failed|err_|upstream|bad gateway|gateway|service unavailable|50[234]\b/i;
const isNetErr = e => !navigator.onLine || e?.name === 'AbortError' || NET_ERR.test(`${e?.name || ''} ${e?.message || e || ''} ${e?.status || e?.statusCode || ''}`);
// סדר בתוך אותה רשומה: עדכון/תמונה לא עוקפים פעולה קודמת על אותה רשומה שנכשלה (סימון → ביטול, תקלה → התמונה שלה)
const qKeys = it => [it.kind === 'update' ? `${it.table}:${it.rowId}` : it.kind === 'insert' ? `${it.table}:${it.row?.id}` : it.kind === 'photo' ? `photos:${it.photoId}` : it.kind === 'rpc' ? `rpc:${it.fn}:${it.args?.d || ''}` : `file:${it.path}`,
  it.meta?.issue_id && `issues:${it.meta.issue_id}`].filter(Boolean);
export async function flush() {
  if (!navigator.onLine || !state.user) return;   // לפני כניסה אין בעלים — שום פריט לא נשלח בשם מישהו אחר
  // סבב אחד בלבד בכל רגע: מי שנכנס באמצע מחכה, ואם נשאר משהו בתור — רק אחד מהממתינים פותח סבב חדש
  while (flushing) await flushing;
  if (!(await outbox.all()).length) return;
  let done; flushing = new Promise(r => done = r);
  updateNet();   // "שולח…" מיד, לא רק אחרי הפריט הראשון
  try {
    // שתי לשוניות פתוחות באותו טלפון — רק אחת שולחת
    if (navigator.locks?.request) await navigator.locks.request('edrone-outbox', { ifAvailable: true }, l => l && drain());
    else await drain();
  } finally { const f = done; flushing = null; f(); updateNet(); }
}
async function drain() {
  {
    // ממשיכים עד שהתור ריק: פריטים שנוספו בזמן השליחה נשלחים באותו סבב, לפי הסדר
    const seen = new Set(), failed = new Set();
    for (;;) {
      // רשומות קודם, תמונות אחריהן: בקליטה חלשה המשרד רואה מיד שהגיעו/נסגר/תקלה, והתמונות הכבדות ממשיכות ברקע
      // (תמונה תלויה רק ברשומה שלה — תקלה — שכבר נשלחה לפניה; החתימה קטנה ונשארת במקומה לפני סגירת היום)
      const items = (await outbox.all()).filter(i => !seen.has(i.id)).sort((a, b) => (a.kind === 'photo') - (b.kind === 'photo'));
      if (!items.length) break;
      for (const it of items) {
        seen.add(it.id);
        if (qKeys(it).some(k => failed.has(k))) continue;   // מחכה לפעולה הקודמת על אותה רשומה
        try {
          await runItem(it);
          await outbox.del(it.id);
        } catch (e) {
          if (isNetErr(e)) { it.net = (it.net || 0) + 1; it.error = 'אין קליטה'; await outbox.put(it).catch(() => {}); updateNet(); wake(); return; }
          it.tries++; it.error = String(e.message || e);
          if (!it.stuck) failed.add(qKeys(it)[0]);
          // כניסה למשמרת שנשמרה בלי קליטה ונשלחה אחרי יותר מ-12 שעות — השרת דוחה אותה לתמיד.
          // אם בתור גם היציאה שלה: הופכים את שתיהן לבקשת תיקון שעות למנהל (במקום לנסות לנצח).
          if (it.kind === 'insert' && it.table === 'shifts' && /row-level security|42501/.test(it.error)) {
            const all = await outbox.all(), out = all.find(x => x.kind === 'update' && x.table === 'shifts' && x.rowId === it.row.id && x.patch?.end_at);
            if (out) {
              const { error } = await sb.from('shift_requests').insert({ user_id: it.row.user_id, shift_id: null, req_start: it.row.start_at, req_end: out.patch.end_at, req_break: out.patch.break_min || 0,
                reason: 'נשמר בטלפון בלי קליטה ונשלח באיחור' + (it.row.note ? ' · ' + it.row.note : '') });
              if (!error) { await outbox.del(it.id); await outbox.del(out.id); seen.add(out.id); toast('המשמרת נשלחה באיחור — הועברה לאישור מנהל', 4000); updateNet(); continue; }
            }
            it.stuck = 'הכניסה למשמרת לא נשלחה בזמן. צריך לבקש תיקון שעות במסך "השעות שלי"';
          } else if (it.tries >= 6) it.stuck = it.error;
          await outbox.put(it);
        }
        updateNet();
      }
    }
  }
}
// העלאה לאחסון: קובץ שכבר עלה (שליחה קודמת שנקטעה באמצע) = הצלחה. אין הרשאת דריסה באחסון, לכן ניסיון שני בלי דריסה
// קובץ מעל 1MB (תמונה שלא הוקטנה, HEIC וכד׳) — העלאה בהמשכים (TUS) בחלקים של 512KB: קליטה שנקטעת ממשיכה
// מהחלק האחרון שהגיע ולא מאפס. כתובת ההעלאה נשמרת בפריט שבתור (גם אחרי סגירת האפליקציה), תקפה ~24 שעות
const TUS_MIN = 1 << 20, TUS_CHUNK = 512 << 10;
const b64 = v => btoa(unescape(encodeURIComponent(v)));
async function tusPut(it, path, blob, contentType) {
  const { data: { session } } = await sb.auth.getSession();
  const H = { authorization: 'Bearer ' + (session?.access_token || SUPABASE_ANON), apikey: SUPABASE_ANON, 'tus-resumable': '1.0.0' };
  const fail = async (r, what) => { const t = await r.text().catch(() => ''); const e = new Error(`${what} ${r.status} ${t.slice(0, 120)}`); e.status = r.status; throw e; };
  let url = it?.tus?.path === path && Date.now() - it.tus.at < 20 * 36e5 ? it.tus.url : null, off = 0;
  if (url) {
    const r = await authRetry(url, { method: 'HEAD', headers: H });
    if (r.ok) off = +r.headers.get('upload-offset') || 0; else if (r.status >= 500) await fail(r, 'head'); else url = null;   // פג/נמחק — מתחילים מחדש
  }
  if (!url) {
    const r = await authRetry(SUPABASE_URL + '/storage/v1/upload/resumable', { method: 'POST', headers: { ...H, 'upload-length': String(blob.size), 'x-upsert': 'false',
      'upload-metadata': `bucketName ${b64('field')},objectName ${b64(path)},contentType ${b64(contentType)},cacheControl ${b64('3600')}` } });
    if (r.status === 409) return;   // כבר עלה (שליחה קודמת)
    if (!r.ok) await fail(r, 'upload');
    url = new URL(r.headers.get('location'), SUPABASE_URL).href;
    if (it) { it.tus = { url, path, at: Date.now() }; await outbox.put(it).catch(() => {}); }
  }
  while (off < blob.size) {
    const r = await authRetry(url, { method: 'PATCH', headers: { ...H, 'upload-offset': String(off), 'content-type': 'application/offset+octet-stream' }, body: blob.slice(off, off + TUS_CHUNK) });
    if (r.status === 409) { const h = await authRetry(url, { method: 'HEAD', headers: H }); if (!h.ok) await fail(h, 'head'); off = +h.headers.get('upload-offset') || 0; continue; }
    if (r.status === 404 || r.status === 410) { if (it) { delete it.tus; await outbox.put(it).catch(() => {}); } return tusPut(it && { ...it, tus: null }, path, blob, contentType); }
    if (!r.ok) await fail(r, 'patch');
    off = +r.headers.get('upload-offset') || off + TUS_CHUNK;
    if (it) it.sent = off;
  }
}
async function putFile(path, blob, contentType, it) {
  if (blob?.size > TUS_MIN) return tusPut(it, path, blob, contentType);
  const st = sb.storage.from('field');
  let { error } = await st.upload(path, blob, { contentType, upsert: true });
  if (error && !/exists|duplicate/i.test(error.message) && /row-level|security|policy|403|unauthorized/i.test(error.message + (error.statusCode || ''))) ({ error } = await st.upload(path, blob, { contentType, upsert: false }));
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}
async function runItem(it) {
  if (it.kind === 'update') {
    const { data, error } = await sb.from(it.table).update(it.patch).eq('id', it.rowId).select('id');
    if (error) throw error;
    // 0 שורות = אין הרשאה לשורה (למשל הוסרתי מהצוות) — לא מוחקים בשקט; נשאר בתור ומסומן
    if (!data?.length) throw new Error('אין גישה לרשומה — פנו למנהל');
  } else if (it.kind === 'insert') {
    let { error } = await sb.from(it.table).upsert(it.row);
    // ניסיון חוזר אחרי שהשליחה הראשונה כן הגיעה (תשובה שאבדה בקליטה חלשה): הרשומה כבר קיימת ואין הרשאת עדכון → מספיק שקיימת
    if (error && /row-level security|42501/.test(error.message + error.code)) ({ error } = await sb.from(it.table).upsert(it.row, { ignoreDuplicates: true }));
    if (error) throw error;
  } else if (it.kind === 'rpc') {
    const { error } = await sb.rpc(it.fn, it.args);
    if (error) throw error;
  } else if (it.kind === 'file') {
    await putFile(it.path, it.blob, it.type || 'application/octet-stream', it);
  } else if (it.kind === 'photo') {
    await putFile(it.path, it.blob, it.blob?.type || 'image/jpeg', it);
    // תמונה ממוזערת לרשימות — חוסכת ~80% תעבורה. כישלון לא עוצר (המסך נופל חזרה לתמונה המלאה)
    try { const { shrink, thumbPath } = await import('./store.js'); const t = await shrink(it.blob, 600, 0.7);
      await sb.storage.from('field').upload(thumbPath(it.path), t, { contentType: 'image/jpeg', upsert: true }); } catch { /* */ }
    const row = { id: it.photoId, storage_path: it.path, uploaded_by: it.uid || state.user.id, ...it.meta };
    let { error: e2 } = await sb.from('photos').upsert(row);
    if (e2 && /row-level security|42501/.test(e2.message + e2.code)) ({ error: e2 } = await sb.from('photos').upsert(row, { ignoreDuplicates: true }));
    if (e2) throw e2;
  }
}
export async function pendingCount() { return (await outbox.all()).length; }
// פריטים של משתמש אחר שהתחבר בעבר בטלפון הזה — לא נשלחים בשם המחובר; מחכים שהבעלים יתחבר שוב
export async function othersPending() {
  const by = new Map();
  for (const x of await outbox.others().catch(() => [])) { const g = by.get(x.uid) || { uid: x.uid, name: '', n: 0 }; g.n++; g.name = x.uname || g.name; by.set(x.uid, g); }
  return [...by.values()];
}
export const othersCard = g => `<div class="alert warn qown"><span class="dot"></span><span class="grow"><b>${g.n} פריטים של ${esc(g.name || 'משתמש קודם')} ממתינים</b><small>מחכים שהוא יתחבר</small></span></div>`;
export async function pendingPhotos(filter) {
  return (await outbox.all()).filter(x => x.kind === 'photo' && filter(x.meta));
}

// ---------- מצב רשת ----------
// גלולה קטנה בראש המסך: אין קליטה · N ממתינים / שולח N… / N ממתינים / נשלח ✓ (רגע ונעלם) / לא נשלח (אדום). לחיצה = מסך התור
let netHad = 0, netT = 0;
const SPIN = '<svg class="nspin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';
export async function updateNet() {
  const el = document.getElementById('net'); if (!el) return;
  if (!el.onclick) { el.onclick = showQueue; el.setAttribute('role', 'button'); el.setAttribute('aria-live', 'polite'); el.tabIndex = 0; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') showQueue(); }; }
  const all = await outbox.all(), n = all.length, stuck = all.filter(x => x.stuck).length;
  state.online = navigator.onLine;
  let tone = '', ic = '', txt = '';
  if (stuck) { tone = 'stuck'; ic = icon('alert', 14); txt = stuck > 1 ? `${stuck} לא נשלחו` : 'פריט לא נשלח'; }
  else if (!state.online) { tone = 'off'; ic = '<i class="nd"></i>'; txt = n ? `אין קליטה · ${n} ממתינים` : state.stale ? 'אין קליטה · מוצג מהטלפון' : 'אין קליטה'; }
  else if (!n && netHad) { tone = 'done'; ic = icon('check', 14); txt = 'נשלח'; }   // התור התרוקן עכשיו — זה מה שחשוב לדעת (לפני "קליטה חלשה")
  else if (state.stale && !(n && flushing) && Date.now() - state.stale < 60000) { tone = 'off'; ic = '<i class="nd"></i>'; txt = n ? `קליטה חלשה · ${n} ממתינים` : 'קליטה חלשה · מוצג מהטלפון'; }
  else if (n) { tone = 'sync'; ic = flushing ? SPIN : '<i class="nd"></i>'; txt = flushing ? `שולח ${n}…` : `${n} ממתינים`; }
  else if (netHad) { tone = 'done'; ic = icon('check', 14); txt = 'נשלח'; }
  else { const o = await othersPending(); if (o.length) { tone = 'off'; ic = '<i class="nd"></i>'; const m = o.reduce((a, g) => a + g.n, 0); txt = o.length > 1 ? `${m} ממתינים של משתמשים קודמים` : `${m} ממתינים של ${(o[0].name || 'משתמש קודם').split(' ')[0]}`; } }
  netHad = n;
  clearTimeout(netT);
  if (!txt) { el.hidden = true; return; }
  const html = `${ic}<span>${esc(txt)}</span>`;
  if (el.dataset.k !== tone + txt) { el.className = 'net ' + tone; el.innerHTML = html; el.dataset.k = tone + txt; }
  el.hidden = false;
  if (tone === 'done') netT = setTimeout(() => { el.hidden = true; el.dataset.k = ''; }, 1600);
}
addEventListener('online', () => { updateNet(); flush(); });
addEventListener('offline', updateNet);
setInterval(flush, 30000);
// חזרה לאפליקציה (מהמצלמה / מסך נעול / אפליקציה אחרת) — שולחים מיד, לא מחכים לסבב הבא
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updateNet(); flush(); } });

// ---------- עזרי ממשק ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (n) => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 1 });
// kind (לא חובה): 'success' | 'warn' | 'error' — רטט מתאים באנדרואיד
export function toast(t, ms = 2200, kind = 'light') {
  const e = $('#toast'); e.textContent = t; e.hidden = false;
  haptic(kind);
  clearTimeout(toast.h); toast.h = setTimeout(() => e.hidden = true, ms);
}
// ---------- רטט (אנדרואיד; באייפון אין API — לא עושה כלום) ----------
const HAP = { tap: 6, light: 10, medium: 16, heavy: 24, success: [10, 60, 14], warn: [18, 70, 18], error: [24, 50, 24, 50, 24] };
export function haptic(kind = 'tap') {
  try {
    if (typeof navigator.vibrate !== 'function') return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // לפני מגע ראשון הדפדפן חוסם ומתריע
    navigator.vibrate(HAP[kind] ?? HAP.tap);
  } catch { /* */ }
}
// ---------- שלד טעינה בצורת התוכן ----------
// kind: 'list' (שורות) · 'cards' (מסילת כרטיסים) · 'grid' (אריחים) · 'home' (כרטיס ראשי + מדדים + שורות) · 'detail' (כותרת תמונה + לשוניות + שורות)
const SK_ROW = '<span class="sk-row"><i class="skb sk-av"></i><span class="sk-tx"><i class="skb sk-l1"></i><i class="skb sk-l2"></i></span></span>';
const SK_CARD = '<span class="sk-card"><i class="skb sk-img"></i><span class="sk-tx"><i class="skb sk-l1"></i><i class="skb sk-l2"></i></span></span>';
export function skeleton(kind = 'list', n = 4) {
  const rows = k => `<div class="sk-list">${SK_ROW.repeat(k)}</div>`;
  const kpis = `<div class="sk-kpis">${'<i class="skb sk-kpi"></i>'.repeat(3)}</div>`;
  const body = kind === 'cards' ? `<div class="sk-rail">${SK_CARD.repeat(Math.max(2, n))}</div>`
    : kind === 'grid' ? `<div class="sk-grid">${SK_CARD.repeat(n)}</div>`
    : kind === 'home' ? `<i class="skb sk-hero"></i>${kpis}<i class="skb sk-sh"></i>${rows(3)}`
    : kind === 'detail' ? `<i class="skb sk-hero sm"></i><i class="skb sk-tabs"></i>${rows(n)}`
    : rows(n);
  return `<div class="sk" role="status" aria-busy="true" aria-label="טוען">${body}</div>`;
}
// תמונה במסך מלא: מציג אחד לכל האפליקציה — דפדוף בין תמונות המסך + סימון (lib/viewer.js)
export function zoom(src, title) { import('./viewer.js').then(m => m.openViewer(src, title)); }
export function contactCard(name, phone, label = 'איש קשר באתר') {
  if (!phone) return '';
  const raw = phone.replace(/\D/g, '');
  return `<div class="contact"><div class="grow"><div class="small muted">${esc(label)}</div><b>${esc(name || '')}</b><div class="num">${esc(phone)}</div></div>
    <a href="tel:+972${raw.replace(/^0/, '')}">חיוג</a><button type="button" data-copy="${esc(phone)}">העתקה</button></div>`;
}
export function bindCopy(root = document) {
  $$('[data-copy]', root).forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('המספר הועתק'); }
    catch { toast(b.dataset.copy); }
  });
}
export const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
export const FIELD_HE = { pilot: 'מטיס', operator: 'מפעיל מערכות' };
export const ROLE_HE = { admin: 'הנהלה', ops_manager: 'מנהל תפעול', surveyor: 'סוקר', crew_lead: 'ראש צוות', crew: 'עובד שטח', partner: 'שותף חיצוני' };
export const uid = () => crypto.randomUUID();
// תמונה מהשטח: מוקטנת, נכנסת לתור ונשלחת כשיש קליטה. מחזירה קישור מקומי לתצוגה מיידית.
export async function addFieldPhoto(file, meta) {
  const { shrink } = await import('./store.js');
  // פורמט שהטלפון לא מצליח להקטין (HEIC באנדרואיד וכד׳) — נשמר המקור, עד 15MB, במקום שהתמונה תלך לאיבוד
  const blob = await shrink(file).catch(e => { if (file.size && file.size < 15e6) return file; throw e; }), id = uid();
  const path = `${state.user.id}/${meta.work_day_id || meta.project_id || 'misc'}/${id}.jpg`;
  // מקור: צילום / מהגלריה (+ זמן הצילום המקורי) — lib/photo.js, db/137
  if (file?.__ph) meta = { ...(await (await import('./photo.js')).photoMeta(file)), ...meta };
  await enqueue({ kind: 'photo', blob, photoId: id, path, meta });
  return { id, path, url: URL.createObjectURL(blob), kind: meta.kind };
}
// חלון תחתון לטפסים קצרים (תקלה, חסר לי, שיבוץ)
// back: פונקציה שמחזירה לשלב הקודם (חלון קודם). מופיע כחץ "חזרה" בראש החלון.
export function sheet(html, onMount, { back } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-in">${back ? `<button class="sback" type="button">${icon('back', 18)} חזרה</button>` : ''}${html}</div></div>`;
  s.hidden = false; s.classList.remove('closing'); haptic('light');
  const tok = s.dataset.t = String((+s.dataset.t || 0) + 1);
  // סגירה עם החלקה קצרה למטה; חלון חדש שנפתח בינתיים לא נמחק
  const close = () => {
    if (s.dataset.t !== tok || s.hidden) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { s.hidden = true; s.innerHTML = ''; return; }
    s.classList.add('closing');
    setTimeout(() => { if (s.dataset.t === tok) { s.hidden = true; s.innerHTML = ''; s.classList.remove('closing'); } }, 170);
  };
  // משיכה למטה סוגרת (כמו חלון באייפון) — רק כשהחלון גלול לראש
  const box = s.querySelector('.modal-in'); let y0 = null, dy = 0;
  box.addEventListener('touchstart', e => { y0 = box.scrollTop <= 0 && !e.target.closest('input,textarea,select,canvas,.sig,.sigpad,[data-noptr]') ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  box.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (box.scrollTop > 0) { y0 = null; dy = 0; } box.style.transition = 'none'; box.style.transform = dy ? `translate3d(0,${dy * .9}px,0)` : ''; }, { passive: true });
  box.addEventListener('touchend', () => { if (y0 == null) return; y0 = null; box.style.transition = ''; if (dy > 90) { haptic('tap'); close(); } else box.style.transform = ''; }, { passive: true });
  s.onkeydown = e => { if (e.key === 'Escape' && !s.hidden) close(); };
  if (back) s.querySelector('.sback').onclick = () => { close(); back(); };
  s.querySelector('.modal').onclick = e => { if (e.target.classList.contains('modal')) close(); };
  $$('[data-close]', s).forEach(b => b.onclick = close);
  onMount && onMount(s, close);
  return close;
}
export const HE_DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HE_D1 = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const dm = s => s ? `${+s.slice(8, 10)}.${+s.slice(5, 7)}` : '';
export const dayLabel = s => { const t = isoDay(), n = new Date(s + 'T12:00:00'); const tm = isoDay(new Date(Date.now() + 864e5)); return s === t ? 'היום' : s === tm ? 'מחר' : `יום ${HE_DOW[n.getDay()]} ${dm(s)}`; };
export const fmtTime = (iso) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------- אייקונים (קו, 24px) ----------
export const ICON = {
  cash: 'M2 6h20v12H2z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6 M6 9v6 M18 9v6',
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  calendar: 'M3 5h18v16H3z M3 9h18 M8 3v4 M16 3v4',
  folder: 'M3 6h6l2 2h10v12H3z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  plus: 'M12 5v14 M5 12h14',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  clipboard: 'M9 3h6v4H9z M7 5H5v16h14V5h-2 M9 12h6 M9 16h4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  report: 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h3',
  shield: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  logout: 'M9 21H5V3h4 M16 17l5-5-5-5 M21 12H9',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  chev: 'M15 18l-6-6 6-6',
  back: 'M9 18l6-6-6-6',
  drone: 'M10 10h4v4h-4z M10 10L7 7 M14 10l3-3 M10 14l-3 3 M14 14l3 3 M2.5 5.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M15.5 5.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M2.5 18.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M15.5 18.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  alert: 'M12 3l10 18H2z M12 10v4 M12 17.5v.5',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z M12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  send: 'M4 12l16-8-6 16-2-7z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2 M9 20a1 1 0 1 0 0 .1 M17 20a1 1 0 1 0 0 .1',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h4',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2 21v-1.5A5 5 0 0 1 7 15h4 M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M17 15.5V17l1 1',
  photo: 'M3 6h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5a1 1 0 1 0 0 .1',
  inbox: 'M3 13l3-8h12l3 8v7H3z M3 13h5l1 3h6l1-3h5',
  play: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M10 8.5v7l6-3.5z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z M20 4h-5a3 3 0 0 0-3 3 M20 4v14h-6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  pen: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.5z',
  key: 'M14 4a6 6 0 1 0 0 .1z M10 14l-7 7 M5 19l2 2 M7 17l2 2',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  sync: 'M20 11a8 8 0 0 0-14-4.5L4 9 M4 4v5h5 M4 13a8 8 0 0 0 14 4.5l2-2.5 M20 20v-5h-5',
};
// סימון ראש צוות — אייקון במקום ★ טקסטואלי
export const leadMark = () => `<span class="leadmark" title="ראש צוות" aria-label="ראש צוות">${icon('star', 13)}</span>`;
// שם קצר לפרויקט ברשימות: מה שאחרי "—" (שטיפת מעטפת — מתחם כורדני חיפה → מתחם כורדני חיפה); בעמוד הפרויקט — השם המלא
// פרויקט פתוח — הגדרה אחת לכל המסכים: לא בארכיון, לא "הסתיים…"/"שולם", ולא נסגר באפליקציה (גם לפני שמאנדי התעדכן)
export const isOpenProject = p => !!p && p.monday_group !== 'group_mm5052gw' && !/^הסתיים|שולם|פיילוט הסתיים/.test(p.status_label || '') && !p.closed_summary;
export const shortName = n => { const s = String(n || ''); const i = s.indexOf(' — '); return i > 0 && s.length - i > 6 ? s.slice(i + 3) : s; };
export const icon = (k, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k] || k}"/></svg>`;

// ---------- תמונת שער חלופית: חזית בניין + רחפן, צבע לפי שם הפרויקט ----------
export function coverArt(seed = '') {
  // איור שער רגוע כשאין תמונה: רקע בהיר בגוון קבוע לפי השם, מבנה במרכז ורחפן בתוך המסגרת (לא נחתך בקצה)
  let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = [150, 175, 200, 95, 125][h % 5], fl = 4 + h % 3, co = 4 + (h >> 4) % 3;
  const bw = co * 24 + 16, bh = fl * 24 + 14, bx = 200 - bw / 2 - 30, by = 226 - bh;
  let win = '';
  for (let r = 0; r < fl; r++) for (let c = 0; c < co; c++) win += `<rect x="${bx + 10 + c * 24}" y="${by + 10 + r * 24}" width="16" height="16" rx="2" fill="hsl(${hue},30%,${88 - ((r * 7 + c * 3 + h) % 4) * 3}%)"/>`;
  const dx = bx + bw + 52, dy = by + 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},26%,93%)"/><stop offset="1" stop-color="hsl(${hue},24%,85%)"/></linearGradient></defs>
<rect width="400" height="250" fill="url(#g)"/><rect x="0" y="226" width="400" height="24" fill="hsl(${hue},20%,80%)"/>
<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="hsl(${hue},18%,66%)"/>${win}
<g stroke="#5c8f00" stroke-width="3" stroke-linecap="round" fill="none"><path d="M${dx - 18} ${dy}h36 M${dx} ${dy}v7"/><circle cx="${dx - 18}" cy="${dy - 5}" r="7" stroke-width="2.4"/><circle cx="${dx + 18}" cy="${dy - 5}" r="7" stroke-width="2.4"/></g>
<path d="M${dx - 6} ${dy + 10} L${bx + bw + 4} ${dy + 34}" stroke="#5c8f00" stroke-opacity=".5" stroke-width="2" stroke-dasharray="3 5"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
// תיקיות: רכיב אחיד לכל רשימה שמסודרת לפי פרויקט/אתר — תמונה, שם, שורת מידע, תגית מצב, מונה
// items: [{href, img, title, sub, pill, tone, count}]
const FTONE = { ok: 'lime', warn: 'warn', bad: 'bad' };
export const folderGrid = items => `<div class="list">${items.map(f => `<a class="lrow frow" href="${f.href}"${f.data ? ` ${f.data}` : ''}>
  <span class="thumb" style="background-image:url('${f.img}')"></span>
  <span class="grow"><b>${esc(f.title)}</b>${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span>${f.pill ? `<span class="pill ${FTONE[f.tone] || ''}">${esc(f.pill)}</span>` : ''}</a>`).join('')}</div>`;
// ---------- תצלום אוויר לנקודה (Esri World Imagery — אותו מקור כמו מפת האתר) ----------
// אריח Web-Mercator אחד (256px, ~260 מ' בזום 17). בוחרים בין z ל-z-1 את האריח שבו הנקודה הכי קרובה למרכז,
// כדי שהמבנה לא ייחתך בכרטיס 16:10 (בגובה רואים רק ~62% מהאריח). אין מיקום תקין → ''.
export function aerial(lat, lng, z = 17) {
  lat = +lat; lng = +lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return '';
  const r = lat * Math.PI / 180, fx = (lng + 180) / 360, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  const at = zz => { const n = 2 ** zz, x = fx * n, y = fy * n; return { zz, x: Math.floor(x), y: Math.floor(y), off: Math.max(Math.abs(x % 1 - .5) / .5, Math.abs(y % 1 - .5) / .31) }; };
  const a = at(z), b = at(z - 1), t = a.off < .9 || a.off <= b.off ? a : b;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${t.zz}/${t.y}/${t.x}`;
}
// מיקום הפרויקט: האתר (sites — אובייקט או מערך) קודם, אחרת lat/lng של הפרויקט עצמו
const geoOf = p => { const s = Array.isArray(p?.sites) ? p.sites[0] : (p?.sites || p?.site); return s?.lat && s?.lng ? s : p?.lat && p?.lng ? p : null; };
// שער לפרויקט/אתר: תמונה אמיתית → תצלום אוויר → איור
export const coverFor = (p, url) => url || (geoOf(p) ? aerial(geoOf(p).lat, geoOf(p).lng) : '') || coverArt(p?.name || '');
export async function covers(projects) {
  const paths = projects.map(p => p.cover_path).filter(Boolean);
  const u = paths.length ? await signedUrls('media', paths).catch(() => ({})) : {};
  return Object.fromEntries(projects.map(p => [p.id, coverFor(p, p.cover_path && u[p.cover_path])]));
}
export const timeAgo = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };

// ---------- התראות לטלפון ----------
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function pushState() {
  if (!pushSupported()) return isStandalone() ? 'unsupported' : 'install';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ההתראות חסומות בטלפון — מאשרים בהגדרות ומנסים שוב');
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4)), c => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
  if (error) throw error;
  sb.functions.invoke('notify', { body: { type: 'test', user: state.user.id } }).catch(() => {});
}

// שאלה קצרה בחלון תחתון (במקום prompt/confirm של הדפדפן)
export function ask(title, { placeholder = '', value = '', ok = 'שמירה', multiline = false, hint = '', optional = false } = {}) {
  return new Promise(res => {
    let done = false;
    const close = sheet(`<h3>${esc(title)}</h3>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}
      ${multiline ? `<textarea id="askv" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input type="text" id="askv" placeholder="${esc(placeholder)}" value="${esc(value)}">`}
      <div class="row-btns"><button class="btn ghost" id="askc">ביטול</button><button class="btn primary" id="asko">${esc(ok)}</button></div>`, sh => {
      const v = $('#askv', sh); setTimeout(() => v.focus(), 50);
      $('#asko', sh).onclick = () => { const x = v.value.trim(); if (!x && !optional) return v.focus(); done = true; close(); res(x); };
      $('#askc', sh).onclick = () => { close(); res(null); };
      v.onkeydown = e => { if (e.key === 'Enter' && !multiline) $('#asko', sh).click(); };
    });
  });
}
export function confirmBox(title, { body = '', ok = 'אישור', danger = false } = {}) {
  return new Promise(res => {
    const close = sheet(`<h3>${esc(title)}</h3>${body ? `<div class="muted">${esc(body)}</div>` : ''}
      <div class="row-btns"><button class="btn ghost" id="cfc">ביטול</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cfo">${esc(ok)}</button></div>`, sh => {
      $('#cfo', sh).onclick = () => { close(); res(true); };
      $('#cfc', sh).onclick = () => { close(); res(false); };
    });
  });
}

// מסך התור: מה ממתין לשליחה, מה נתקע, שליחה חוזרת
const KIND_LABEL = { photo: 'תמונה', file: 'קובץ (חתימה)', insert: 'רשומה חדשה', update: 'עדכון' };
const TABLE_LABEL = { shifts: 'משמרת', shift_requests: 'בקשת תיקון שעות',  work_days: 'יום שטח', tasks: 'משימה', issues: 'תקלה', missing_items: 'חסר בשטח', messages: 'הודעה', specs: 'אפיון', safety_checks: 'בדיקת בטיחות', work_day_crew: 'שעות צוות', message_acks: 'אישור קריאה', projects: 'פרויקט' };
// שם אנושי לכל פריט בתור — מה קרה בשטח, לא איזו טבלה
const RPC_LABEL = { crew_depart: 'יציאה לאתר · הצוות', set_day_hours: 'שעות צוות', set_day_crew: 'צוות היום', confirm_day: 'אישור הגעה', cant_come: 'לא אוכל להגיע' };
const PH_LABEL = { before: 'תמונת לפני', after: 'תמונת אחרי', issue: 'תמונת תקלה', general: 'תמונה מהעבודה', receipt: 'קבלה' };
function qLabel(it) {
  const p = it.patch || {};
  if (it.kind === 'photo') return PH_LABEL[it.meta?.kind] || 'תמונה';
  if (it.kind === 'file') return /signature/.test(it.path || '') ? 'חתימת לקוח' : 'קובץ';
  if (it.kind === 'rpc') return RPC_LABEL[it.fn] || 'עדכון';
  if (it.table === 'work_days' && it.kind === 'update') return p.status === 'done' ? 'סגירת היום' : p.status === 'working' ? 'תחילת עבודה' : p.status === 'issue' ? 'עצירה בגלל תקלה' : p.arrived_at ? 'הגעה לאתר' : p.departed_at ? 'יציאה לאתר' : 'עדכון יום שטח';
  if (it.table === 'tasks' && it.kind === 'update') return p.status === 'done' ? 'משימה בוצעה' : p.status === 'blocked' ? 'משימה נתקעה' : 'עדכון משימה';
  if (it.table === 'shifts') return it.kind === 'insert' ? 'כניסה למשמרת' : p.end_at ? 'יציאה מהמשמרת' : 'עדכון משמרת';
  if (it.table === 'safety_checks') return 'בדיקות בטיחות';
  if (it.table === 'tasks') return 'משימה חדשה';
  return TABLE_LABEL[it.table] || KIND_LABEL[it.kind] || 'פריט';
}
const qSub = it => it.kind !== 'insert' || it.table === 'safety_checks' ? '' : it.row?.item ? it.row.item + (it.row.qty > 1 ? ' ×' + it.row.qty : '') : it.row?.body || it.row?.title || '';
// רצף של פריטים מאותו סוג = שורה אחת (×N), תמונות עם תצוגה מקדימה מהטלפון
function qGroups(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1], k = qLabel(it) + '|' + qSub(it);
    if (last && !it.stuck && !last.it.stuck && last.k === k) { last.n++; if (it.blob && it.kind === 'photo') last.ph.push(it.blob); continue; }
    out.push({ it, k, n: 1, ph: it.kind === 'photo' && it.blob ? [it.blob] : [] });
  }
  return out;
}
let qUrls = [];
const qUrl = b => { try { const u = URL.createObjectURL(b); qUrls.push(u); return u; } catch { return ''; } };
const mb = n => n >= 1e6 ? nf(Math.round(n / 1e5) / 10) + 'MB' : Math.max(1, Math.round(n / 1e3)) + 'KB';
function qSummary(items, est) {
  if (!items.length) return '';
  const ph = items.filter(x => x.blob), bytes = ph.reduce((s, x) => s + (x.blob.size || 0), 0);
  const full = est?.quota && est.usage / est.quota > 0.85;
  return `<div class="kpis qk"><div class="kpi"><b>${items.length}</b><span>ממתינים</span></div>${ph.length ? `<div class="kpi"><b>${ph.length}</b><span>תמונות · ${mb(bytes)}</span></div>` : ''}</div>
    ${full ? `<div class="alert bad"><span class="dot"></span><span class="grow"><b>הטלפון כמעט מלא</b><small>לא למחוק את האפליקציה ולא לנקות נתונים לפני שהכל נשלח</small></span></div>` : ''}`;
}
export async function showQueue() {
  const items = await outbox.all(), others = await othersPending();
  qUrls.forEach(u => URL.revokeObjectURL(u)); qUrls = [];
  const est = await navigator.storage?.estimate?.().catch(() => null);
  sheet(`<div class="row"><h3 class="grow">ממתינים לשליחה</h3><span class="pill ${navigator.onLine ? 'lime' : 'warn'}">${navigator.onLine ? 'יש קליטה' : 'אין קליטה'}</span></div>
    <div class="small muted">${bgSend ? 'כל מה שנשמר בטלפון נשלח לבד כשיש קליטה, גם כשהאפליקציה סגורה.' : 'כל מה שנשמר בטלפון נשלח לבד כשיש קליטה והאפליקציה פתוחה.'} שום דבר לא נמחק עד שהשרת מאשר.</div>
    ${qSummary(items, est)}${others.map(othersCard).join('')}
    <div class="list">${qGroups(items).map(({ it, n, ph }) => `<div class="lrow"><span class="grow"><b>${esc(qLabel(it))}${n > 1 ? ` ×${n}` : ''}</b>
      <small>${new Date(it.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}${qSub(it) ? ' · ' + esc(qSub(it)) : ''}${it.sent && it.blob?.size ? ` · עלו ${Math.min(99, Math.round(it.sent / it.blob.size * 100))}%` : ''}${it.tries ? ` · ${it.tries} ניסיונות` : ''}${it.error && !it.stuck ? ' · ' + esc(String(it.error).slice(0, 80)) : ''}</small>${ph.length ? `<span class="qth">${ph.slice(0, 5).map(b => `<img src="${qUrl(b)}" alt="">`).join('')}</span>` : ''}${it.stuck ? `<small class="qstuck">${esc(it.stuck)}</small>${it.kind === 'insert' && it.table === 'shifts' ? `<span class="row" style="gap:6px;margin-top:6px"><a class="chip sm" href="#/hours" data-close>לבקשת תיקון</a><button class="chip sm" data-qdel="${it.id}">ביקשתי — להסיר מהתור</button></span>` : ''}` : ''}</span>${it.stuck ? '<span class="pill bad">לא נשלח</span>' : it.tries > 3 ? '<span class="pill bad">נתקע</span>' : '<span class="pill">ממתין</span>'}</div>`).join('') || (others.length ? '' : '<div class="empty-card ok"><span><b>הכל נשלח</b><small>אין פריטים בתור</small></span></div>')}</div>
    <div class="row-btns"><button class="btn ghost" data-close>סגירה</button>${items.length ? '<button class="btn primary" id="qretry">שליחה עכשיו</button>' : ''}</div>`, (sh, close) => {
    $$('[data-qdel]', sh).forEach(b => b.onclick = async () => { await outbox.del(b.dataset.qdel); updateNet(); close(); showQueue(); });
    const r = $('#qretry', sh); if (r) r.onclick = async () => { r.disabled = true; r.textContent = 'שולח…'; await flush(); close(); showQueue(); };
  });
}

// ---------- ניווט: מחסנית מסכים אמיתית ----------
// כל רשומת היסטוריה מקבלת מספר (history.state.i). כך יודעים בוודאות אם הגענו בחזרה או למסך חדש,
// ו"חזרה למסך האב" מגלגלת את ההיסטוריה אחורה אליו במקום להוסיף רשומה — בלי לופים בין מסכים.
const NK = 'edrone-stack';
let navCur = 0, navD = 'same';
// כיוון הניווט האחרון: 'fwd' מסך חדש/קדימה · 'back' חזרה · 'same' אותו מסך (רענון/החלפת פרמטר)
export const navDir = () => navD;
const stackGet = () => { try { return JSON.parse(sessionStorage.getItem(NK)) || []; } catch { return []; } };
const stackSet = s => { try { sessionStorage.setItem(NK, JSON.stringify(s.slice(0, 80))); } catch {} };
function onNav() {
  const h = location.hash || '#/', st = history.state; let s = stackGet();
  if (st && typeof st.i === 'number') { navD = st.i < navCur ? 'back' : st.i > navCur ? 'fwd' : 'same'; navCur = st.i; s[navCur] = h; }               // חזרה/קדימה/רענון
  else { navD = 'fwd'; navCur = s.length ? navCur + 1 : 0; history.replaceState({ ...(st || {}), i: navCur }, ''); s = s.slice(0, navCur); s[navCur] = h; }  // מסך חדש
  stackSet(s);
}
export function initNav() {
  const st = history.state;
  if (st && typeof st.i === 'number') navCur = st.i; else { stackSet([]); }
  onNav(); addEventListener('hashchange', onNav);
}
// אותו מסך, פרמטר אחר (לשונית, חודש, שבוע) — מחליף את הרשומה הנוכחית ולא מוסיף
export function replaceHash(h, rerender = true) {
  history.replaceState({ ...(history.state || {}), i: navCur }, '', h);
  const s = stackGet(); s[navCur] = h; stackSet(s);
  if (rerender) dispatchEvent(new HashChangeEvent('hashchange'));
}
// חזרה: למסך הקודם באפליקציה; אם אין (נכנסו מקישור/התראה) — למסך האב, בהחלפה
export function goBack(fallback = '#/') { if (navCur > 0) history.back(); else replaceHash(fallback); }
// עלייה למסך אב (למשל מבנה ← אתר): אם הוא כבר בהיסטוריה — חוזרים אליו; אחרת מחליפים
export function goUp(target) {
  const s = stackGet(), base = target.split('/').slice(0, 3).join('/');
  for (let j = navCur - 1; j >= 0; j--) if (s[j] === target || (s[j] || '').split('/').slice(0, 3).join('/') === base) { history.go(j - navCur); return; }
  replaceHash(target);
}

// חזרה למסך הקודם (באייפון אין כפתור "אחורה" באפליקציה מותקנת)
export const backBtn = (fallback = '#/') => `<a class="back" href="${fallback}" aria-label="חזרה">${icon('back', 20)}</a>`;

// ניווט לאתר: נקודה מדויקת אם נשמר מיקום, אחרת כתובת/שם
export function navUrls(lat, lng, text = '') {
  if (lat && lng) return { waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` };
  const q = encodeURIComponent(text || ''); if (!q) return null;
  return { waze: `https://waze.com/ul?q=${q}&navigate=yes`, maps: `https://www.google.com/maps/dir/?api=1&destination=${q}` };
}
export const navButtons = (lat, lng, text) => { const u = navUrls(lat, lng, text); return u ? `<div class="row navbtns"><a class="btn ghost grow" href="${u.waze}" target="_blank" rel="noopener">${icon('pin', 18)} Waze</a><a class="btn ghost grow" href="${u.maps}" target="_blank" rel="noopener">Google Maps</a></div>` : ''; };
