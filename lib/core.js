// ליבת האפליקציה: חיבור לשרת, משתמש מחובר, הרשאות מודולים, סנכרון תור, עזרי ממשק.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON, LOGIN_DOMAIN } from '../config.js';
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
export const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const dm = s => s ? `${+s.slice(8, 10)}.${+s.slice(5, 7)}` : '';
export const dayLabel = s => { const t = isoDay(), n = new Date(s + 'T12:00:00'); const tm = isoDay(new Date(Date.now() + 864e5)); return s === t ? 'היום' : s === tm ? 'מחר' : `יום ${HE_DOW[n.getDay()]} ${dm(s)}`; };
export const fmtTime = (iso) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
