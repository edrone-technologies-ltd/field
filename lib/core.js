// ליבת האפליקציה: חיבור לשרת, משתמש מחובר, הרשאות מודולים, סנכרון תור, עזרי ממשק.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON, LOGIN_DOMAIN, VAPID_PUBLIC } from '../config.js';
import { outbox, cache } from './store.js';
export { cache };

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'edrone-field-auth' },
});

export const state = { user: null, profile: null, modules: [], online: navigator.onLine };

// ---------- כניסה בטלפון + קוד ----------
export const phoneToLogin = (phone) => 'p' + phone.replace(/\D/g, '').replace(/^972/, '0') + '@' + LOGIN_DOMAIN;
export async function signIn(phone, code) {
  const { error } = await sb.auth.signInWithPassword({ email: phoneToLogin(phone), password: code });
  if (error) throw new Error(error.message.includes('Invalid') ? 'הטלפון או הקוד לא נכונים' : 'אין חיבור לשרת. נסו שוב');
}
export async function signOut() { await sb.auth.signOut(); location.hash = ''; location.reload(); }

export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  state.user = session.user;
  try {
    const [{ data: p }, { data: m }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', session.user.id).single(),
      sb.rpc('my_modules'),
    ]);
    if (p) { state.profile = p; state.modules = (m || []).map(x => typeof x === 'string' ? x : x.my_modules); await cache.set('me', { profile: p, modules: state.modules }); }
  } catch { /* בלי קליטה */ }
  if (!state.profile) { const c = await cache.get('me'); if (c) { state.profile = c.profile; state.modules = c.modules; } }
  return !!state.profile;
}
export const can = (mod) => state.modules.includes(mod);
export const isManager = () => ['admin', 'ops_manager'].includes(state.profile?.role);

// ---------- תמונות מאוחסנות ----------
const urlCache = new Map();
export async function signedUrls(bucket, paths) {
  const need = paths.filter(p => p && !urlCache.has(bucket + p));
  if (need.length && state.online) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need, 60 * 60 * 24 * 7);
    (data || []).forEach(d => d.signedUrl && urlCache.set(bucket + d.path, d.signedUrl));
  }
  return Object.fromEntries(paths.map(p => [p, urlCache.get(bucket + p) || '']));
}

// ---------- תור שליחה ----------
let flushing = false;
export async function enqueue(item) { await outbox.add(item); updateNet(); flush(); }
export async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    // ממשיכים עד שהתור ריק: פריטים שנוספו בזמן השליחה נשלחים באותו סבב, לפי הסדר
    const seen = new Set();
    for (;;) {
      const items = (await outbox.all()).filter(i => !seen.has(i.id));
      if (!items.length) break;
      for (const it of items) {
        seen.add(it.id);
        try {
          await runItem(it);
          await outbox.del(it.id);
        } catch (e) {
          it.tries++; it.error = String(e.message || e); await outbox.put(it);
          if (it.tries > 8) console.warn('outbox stuck', it);
        }
        updateNet();
      }
    }
  } finally { flushing = false; updateNet(); }
}
async function runItem(it) {
  if (it.kind === 'update') {
    const { error } = await sb.from(it.table).update(it.patch).eq('id', it.rowId);
    if (error) throw error;
  } else if (it.kind === 'insert') {
    const { error } = await sb.from(it.table).upsert(it.row);
    if (error) throw error;
  } else if (it.kind === 'file') {
    const { error } = await sb.storage.from('field').upload(it.path, it.blob, { contentType: it.type || 'application/octet-stream', upsert: true });
    if (error && !String(error.message).includes('exists')) throw error;
  } else if (it.kind === 'photo') {
    const { error: e1 } = await sb.storage.from('field').upload(it.path, it.blob, { contentType: 'image/jpeg', upsert: true });
    if (e1 && !String(e1.message).includes('exists')) throw e1;
    const { error: e2 } = await sb.from('photos').upsert({ id: it.photoId, storage_path: it.path, uploaded_by: state.user.id, ...it.meta });
    if (e2) throw e2;
  }
}
export async function pendingCount() { return (await outbox.all()).length; }
export async function pendingPhotos(filter) {
  return (await outbox.all()).filter(x => x.kind === 'photo' && filter(x.meta));
}

// ---------- מצב רשת ----------
export async function updateNet() {
  const el = document.getElementById('net'); if (!el) return;
  const n = await pendingCount();
  state.online = navigator.onLine;
  if (!state.online) { el.textContent = n ? `אין קליטה · ${n} ממתינים לשליחה` : 'אין קליטה · עובדים מהטלפון'; el.hidden = false; }
  else if (n) { el.textContent = `שולח ${n}…`; el.hidden = false; }
  else el.hidden = true;
}
addEventListener('online', () => { updateNet(); flush(); });
addEventListener('offline', updateNet);
setInterval(flush, 30000);

// ---------- עזרי ממשק ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (n) => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 1 });
export function toast(t, ms = 2200) {
  const e = $('#toast'); e.textContent = t; e.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => e.hidden = true, ms);
}
export function zoom(src, title) {
  const s = $('#sheet'); let w = 100;
  s.innerHTML = `<div class="bar2"><b>${esc(title || '')}</b><span><button id="zi">הגדלה</button> <button id="zo">הקטנה</button> <button id="zc">סגירה</button></span></div><div class="body"><img id="zimg" src="${esc(src)}" alt=""></div>`;
  s.hidden = false;
  const img = $('#zimg');
  $('#zi').onclick = () => { w = Math.min(400, w + 60); img.style.setProperty('--zw', w + '%'); };
  $('#zo').onclick = () => { w = Math.max(100, w - 60); img.style.setProperty('--zw', w + '%'); };
  $('#zc').onclick = () => { s.hidden = true; s.innerHTML = ''; };
}
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
export const ROLE_HE = { admin: 'מנהל מערכת', ops_manager: 'מנהל תפעול', surveyor: 'סוקר', crew_lead: 'ראש צוות', crew: 'עובד שטח', partner: 'שותף חיצוני' };
export const uid = () => crypto.randomUUID();
// תמונה מהשטח: מוקטנת, נכנסת לתור ונשלחת כשיש קליטה. מחזירה קישור מקומי לתצוגה מיידית.
export async function addFieldPhoto(file, meta) {
  const { shrink } = await import('./store.js');
  const blob = await shrink(file), id = uid();
  const path = `${state.user.id}/${meta.work_day_id || meta.project_id || 'misc'}/${id}.jpg`;
  await enqueue({ kind: 'photo', blob, photoId: id, path, meta });
  return { id, path, url: URL.createObjectURL(blob), kind: meta.kind };
}
// חלון תחתון לטפסים קצרים (תקלה, חסר לי, שיבוץ)
export function sheet(html, onMount) {
  const s = $('#sheet');
  s.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-in">${html}</div></div>`;
  s.hidden = false;
  const close = () => { s.hidden = true; s.innerHTML = ''; };
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
};
export const icon = (k, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k] || k}"/></svg>`;

// ---------- תמונת שער חלופית: חזית בניין + רחפן, צבע לפי שם הפרויקט ----------
export function coverArt(seed = '') {
  let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = [150, 190, 205, 95, 165][h % 5], fl = 4 + h % 4, co = 5 + (h >> 4) % 3;
  const bw = co * 26 + 14, bh = fl * 28 + 12, bx = 200 - bw / 2 + ((h >> 7) % 3 - 1) * 40, by = 240 - bh;
  let win = '';
  for (let r = 0; r < fl; r++) for (let c = 0; c < co; c++) win += `<rect x="${bx + 10 + c * 26}" y="${by + 10 + r * 28}" width="18" height="20" rx="2" fill="#fff" fill-opacity="${((r * 7 + c * 3 + h) % 5) / 30 + .1}"/>`;
  const dx = bx + bw + 34, dy = by + 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},28%,24%)"/><stop offset="1" stop-color="hsl(${hue + 20},32%,14%)"/></linearGradient></defs>
<rect width="400" height="240" fill="url(#g)"/><rect x="${bx}" y="${by}" width="${bw}" height="${bh + 4}" rx="3" fill="#fff" fill-opacity=".09"/>${win}
<g stroke="#b5e04a" stroke-width="3" stroke-linecap="round" fill="none"><path d="M${dx - 16} ${dy}h32 M${dx} ${dy}v6"/><circle cx="${dx - 16}" cy="${dy - 4}" r="6" stroke-width="2"/><circle cx="${dx + 16}" cy="${dy - 4}" r="6" stroke-width="2"/></g>
<path d="M${dx - 4} ${dy + 8} L${bx + bw + 2} ${dy + 26}" stroke="#b5e04a" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 5"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
// תמונת שער אמיתית אם יש, אחרת האיור
export async function covers(projects) {
  const paths = projects.map(p => p.cover_path).filter(Boolean);
  const u = paths.length ? await signedUrls('media', paths).catch(() => ({})) : {};
  return Object.fromEntries(projects.map(p => [p.id, (p.cover_path && u[p.cover_path]) || coverArt(p.name)]));
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
  if (perm !== 'granted') throw new Error('ההרשאה לא ניתנה');
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4)), c => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
  if (error) throw error;
  sb.functions.invoke('notify', { body: { type: 'test', user: state.user.id } }).catch(() => {});
}
