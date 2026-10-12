// Service worker: האפליקציה נפתחת גם בלי קליטה, ותמונות שכבר נצפו זמינות מהטלפון.
const VERSION = 'edrone-field-v104';
const SHELL = ['./', 'index.html', 'tour/ops.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'mark.png', 'lib/audit.js', 'lib/avail.js', 'lib/contacts.js', 'lib/core.js', 'lib/labor.js', 'lib/pay.js', 'lib/store.js', 'lib/sun.js', 'lib/track.js', 'lib/viewer.js', 'lib/wx.js', 'modules/activity.js', 'modules/admin.js', 'modules/attendance.js', 'modules/attention.js', 'modules/chat.js', 'modules/clientreport.js', 'modules/clients.js', 'modules/dayadmin.js', 'modules/dispatch.js', 'modules/equipment.js', 'modules/expenses.js', 'modules/files.js', 'modules/home.js', 'modules/inbox.js', 'modules/knowledge.js', 'modules/login.js', 'modules/news.js', 'modules/onboarding.js', 'modules/ops.js', 'modules/plan.js', 'modules/projects.js', 'modules/purchase.js', 'modules/reports.js', 'modules/signoff.js', 'modules/specs.js', 'modules/staff.js', 'modules/tasks.js', 'modules/today.js', 'modules/tour.js', 'modules/visits.js', 'modules/weather.js', 'modules/welcome.js'];

// קבצי הגרסה נשמרים בהתקנה ישירות מהשרת (cache: 'reload' — לא מהמטמון של הדפדפן), כך שכל הגרסה עקבית
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
const KEEP = [VERSION, 'edrone-img', 'edrone-cdn', 'edrone-api'];
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const SHELL_SET = new Set(SHELL.map(f => new URL(f, self.registration.scope).pathname));
const put = (name, req, r) => { if (r && (r.ok || r.type === 'opaque')) { const c = r.clone(); caches.open(name).then(x => x.put(req, c)).catch(() => {}); } return r; };
// רשת עם גיבוי: עד ms לשרת, אחר כך עותק שמור (אם יש); הרשת ממשיכה ברקע ומעדכנת
function netFirst(req, name, ms, key = req) {
  const fresh = fetch(req).then(r => put(name, key, r));
  const cached = () => caches.open(name).then(c => c.match(key));
  const slow = new Promise(ok => setTimeout(ok, ms)).then(cached).then(h => h || fresh);
  return Promise.race([fresh, slow]).catch(() => cached().then(h => h || Response.error()));
}
// תחזית (open-meteo) לפי נקודה: בקשה לכמה אתרים מפורקת ונשמרת לכל אתר בנפרד, כך שכל מסך (בכל צירוף אתרים)
// מקבל תשובה מיידית מהטלפון אם כל האתרים נטענו בחצי השעה האחרונה. האפליקציה טוענת מראש את האתרים הקרובים.
const METEO_FRESH = 30 * 6e4;
async function meteo(req, u) {
  const la = u.searchParams.get('latitude').split(','), ln = (u.searchParams.get('longitude') || '').split(',');
  const rest = new URLSearchParams(u.search); rest.delete('latitude'); rest.delete('longitude'); rest.sort();
  const keyOf = i => `https://meteo.local/${(+la[i]).toFixed(3)},${(+ln[i]).toFixed(3)}?${rest}`;
  const c = await caches.open('edrone-api');
  const hits = await Promise.all(la.map((_, i) => c.match(keyOf(i))));
  const fresh = hits.every(h => h && Date.now() - +(h.headers.get('x-at') || 0) < METEO_FRESH);
  const compose = async hs => { const arr = await Promise.all(hs.map(h => h.clone().json())); return new Response(JSON.stringify(la.length === 1 ? arr[0] : arr), { headers: { 'content-type': 'application/json' } }); };
  if (fresh) return compose(hits);
  try {
    const r = await fetch(req); if (!r.ok) throw new Error(r.status);
    const j = await r.clone().json(), arr = Array.isArray(j) ? j : [j];
    await Promise.all(arr.map((x, i) => c.put(keyOf(i), new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json', 'x-at': String(Date.now()) } }))));
    return r;
  } catch (err) { if (hits.every(Boolean)) return compose(hits); throw err; }
}
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;
  // תמונות מהאחסון: לפי נתיב, בלי טוקן החתימה, כדי שיישארו זמינות גם כשהקישור מתחדש
  if (u.pathname.includes('/storage/v1/object/sign/')) {
    const key = u.origin + u.pathname;
    e.respondWith(caches.open('edrone-img').then(async c => {
      const hit = await c.match(key);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(key, r.clone()); return r; } catch { return hit || Response.error(); }
    }));
    return;
  }
  // קבצי הגרסה (רשימת SHELL): מהטלפון מיד — פתיחה מיידית גם בלי קליטה. גרסה חדשה = service worker חדש שמוריד הכל מחדש
  if (u.origin === location.origin && (SHELL_SET.has(u.pathname) || req.mode === 'navigate' && /\/(index\.html)?$/.test(u.pathname))) {
    const nav = req.mode === 'navigate', key = nav && /\/$/.test(u.pathname) ? new URL('index.html', self.registration.scope).href : req;
    e.respondWith(caches.open(VERSION).then(c => c.match(key, { ignoreSearch: nav })).then(h => h || fetch(req).then(r => put(VERSION, key, r))).catch(() => caches.match('index.html').then(h => h || Response.error())));
    return;
  }
  // ספריות בגרסה נעולה (jsdelivr/unpkg/cdnjs) וקבצי גופן — לא משתנים לעולם: מהטלפון קודם
  if (/^(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.gstatic\.com)$/.test(u.hostname)) {
    e.respondWith(caches.open('edrone-cdn').then(c => c.match(req)).then(h => h || fetch(req).then(r => put('edrone-cdn', req, r))));
    return;
  }
  // הגדרות גופן (CSS של גוגל): מהטלפון מיד, עדכון ברקע
  if (u.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open('edrone-cdn').then(async c => { const h = await c.match(req); const f = fetch(req).then(r => put('edrone-cdn', req, r)); return h || f; }));
    return;
  }
  // מזג אוויר ומדד Kp: רשת קודם, תחזית אחרונה כשאין קליטה (מפתח בלי פרמטר הזמן)
  if (u.hostname === 'api.open-meteo.com' && u.searchParams.get('latitude')) { e.respondWith(meteo(req, u)); return; }
  if (u.hostname === 'services.swpc.noaa.gov') { e.respondWith(netFirst(req, 'edrone-api', 6000)); return; }
  // שאר קבצי האתר (מסכים מחוץ לרשימה): רשת קודם, עותק שמור כשאין קליטה
  if (u.origin === location.origin && !/\/__/.test(u.pathname)) e.respondWith(netFirst(new Request(req, { cache: 'no-cache' }), VERSION, 3000, req));
});

// ---------- התראות ----------
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'E-Drone שטח', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'E-Drone שטח', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'he', tag: d.tag, renotify: !!d.tag, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); } }
    return clients.openWindow(url);
  }));
});

// ---------- שליחה ברקע (Background Sync: אנדרואיד/כרום) ----------
// הדפדפן מעיר את ה-service worker כשהקליטה חוזרת. אפליקציה פתוחה על המסך — היא שולחת בעצמה (מקבלת הודעה).
// סגורה/ברקע — ה-service worker שולח את התור בעצמו עם החיבור השמור (רק פריטים של המשתמש המחובר), לפי הסדר,
// ונעצר בתקלה הראשונה שאינה קליטה (האפליקציה מטפלת בה כשנפתחת). באייפון אין Background Sync — האפליקציה שולחת כשנפתחת.
self.addEventListener('sync', e => { if (e.tag === 'outbox') e.waitUntil(bgSync()); });
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('edrone-field'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onupgradeneeded = () => { r.transaction.abort(); no(new Error('nodb')); }; });
const itx = (d, store, mode, fn) => new Promise((ok, no) => { const t = d.transaction(store, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined), x = fn(t.objectStore(store)); t.oncomplete = () => ok(x && 'result' in x ? x.result : x); t.onerror = () => no(t.error); t.onabort = () => no(t.error); });
class NetErr extends Error {}
async function bgSync() {
  const ws = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const vis = ws.filter(w => w.visibilityState === 'visible');
  if (vis.length) { vis.forEach(w => w.postMessage({ t: 'flush' })); return; }
  const run = () => replay().catch(err => { if (err instanceof NetErr) throw err; });   // קליטה — הדפדפן ינסה שוב מאוחר יותר
  if (self.navigator?.locks?.request) return navigator.locks.request('edrone-outbox', { ifAvailable: true }, l => l && run());
  return run();
}
async function swAuth(d, A, force) {
  let s = JSON.parse(A.s);
  if (!force && s.expires_at && s.expires_at * 1000 > Date.now() + 60e3) return s;
  // חידוש תחת אותו מנעול של ספריית החיבור — כך האפליקציה לא מחדשת במקביל עם אותו טוקן
  const refresh = async () => {
    const r = await fetch(A.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: A.anon, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => { throw new NetErr('net'); });
    if (r.status >= 500) throw new NetErr('auth ' + r.status);
    if (!r.ok) return null;
    const j = await r.json(); if (!j.expires_at) j.expires_at = Math.floor(Date.now() / 1000) + (j.expires_in || 3600);
    const v = JSON.stringify(j); await itx(d, 'cache', 'readwrite', st => st.put({ ...A, s: v }, 'sw-auth'));
    (await clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage({ t: 'auth' }));
    return j;
  };
  return self.navigator?.locks?.request ? navigator.locks.request('lock:edrone-field-auth', refresh) : refresh();
}
const qKeys = it => [it.kind === 'update' ? `${it.table}:${it.rowId}` : it.kind === 'insert' ? `${it.table}:${it.row?.id}` : it.kind === 'photo' ? `photos:${it.photoId}` : it.kind === 'rpc' ? `rpc:${it.fn}:${it.args?.d || ''}` : `file:${it.path}`, it.meta?.issue_id && `issues:${it.meta.issue_id}`].filter(Boolean);
async function replay() {
  const d = await idb().catch(() => null); if (!d || !d.objectStoreNames.contains('outbox')) return;
  try {
    const A = await itx(d, 'cache', 'readonly', st => st.get('sw-auth')); if (!A?.s) return;
    let s = await swAuth(d, A); if (!s?.access_token) return;
    const me = s.user?.id; let sent = 0;
    const H = () => ({ apikey: A.anon, authorization: 'Bearer ' + s.access_token });
    const go = async (url, init, size = 0, again = true) => {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 30000 + size / 3);
      let r; try { r = await fetch(url, { ...init, headers: { ...H(), ...init.headers }, signal: ac.signal }); } catch { throw new NetErr('net'); } finally { clearTimeout(t); }
      if (r.status === 401 && again) { const n = await swAuth(d, { ...A, s: JSON.stringify(s) }, true); if (!n) throw new Error('auth'); s = n; return go(url, init, size, false); }
      if (r.status >= 502 && r.status <= 504) throw new NetErr(String(r.status));
      return r;
    };
    // מעל 1MB — בהמשכים (TUS), ממשיך מהחלק האחרון שהגיע (גם אם האפליקציה התחילה את ההעלאה)
    const T = { 'tus-resumable': '1.0.0' }, CH = 512 << 10, b64 = v => btoa(unescape(encodeURIComponent(v)));
    const tus = async (it, path, blob, type) => {
      let url = it.tus?.path === path && Date.now() - it.tus.at < 20 * 36e5 ? it.tus.url : null, off = 0;
      if (url) { const r = await go(url, { method: 'HEAD', headers: T }); if (r.ok) off = +r.headers.get('upload-offset') || 0; else if (r.status >= 500) throw new Error('head ' + r.status); else url = null; }
      if (!url) {
        const r = await go(A.url + '/storage/v1/upload/resumable', { method: 'POST', headers: { ...T, 'upload-length': String(blob.size), 'x-upsert': 'false',
          'upload-metadata': `bucketName ${b64('field')},objectName ${b64(path)},contentType ${b64(type)},cacheControl ${b64('3600')}` } });
        if (r.status === 409) return; if (!r.ok) throw new Error('upload ' + r.status);
        url = new URL(r.headers.get('location'), A.url).href; it.tus = { url, path, at: Date.now() };
        await itx(d, 'outbox', 'readwrite', st => st.put(it));
      }
      while (off < blob.size) {
        const r = await go(url, { method: 'PATCH', headers: { ...T, 'upload-offset': String(off), 'content-type': 'application/offset+octet-stream' }, body: blob.slice(off, off + CH) }, CH);
        if (r.status === 409) { const h = await go(url, { method: 'HEAD', headers: T }); if (!h.ok) throw new Error('head ' + h.status); off = +h.headers.get('upload-offset') || 0; continue; }
        if (!r.ok) throw new Error('patch ' + r.status);
        off = +r.headers.get('upload-offset') || off + CH; it.sent = off;
      }
    };
    const upload = async (path, blob, type, it) => {
      if (it && blob.size > 1 << 20) return tus(it, path, blob, type);
      const u = A.url + '/storage/v1/object/field/' + path.split('/').map(encodeURIComponent).join('/');
      let r = await go(u, { method: 'POST', headers: { 'content-type': type, 'x-upsert': 'true' }, body: blob }, blob.size);
      if (!r.ok && r.status !== 409) { const t = await r.text(); if (/exist|duplicate/i.test(t)) return; if (/row-level|security|policy|unauthorized/i.test(t) || r.status === 403) r = await go(u, { method: 'POST', headers: { 'content-type': type }, body: blob }, blob.size); else throw new Error(t); }
      if (!r.ok && r.status !== 409) { const t = await r.text(); if (!/exist|duplicate/i.test(t)) throw new Error(t); }
    };
    const upsert = async (table, row) => {
      let r = await go(`${A.url}/rest/v1/${table}`, { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok && /row-level security|42501/.test(await r.clone().text())) r = await go(`${A.url}/rest/v1/${table}`, { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(await r.text());
    };
    const thumb = async blob => { try { const bm = await createImageBitmap(blob), k = Math.min(1, 600 / Math.max(bm.width, bm.height)), c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 }); } catch { return null; } };
    const all = (await itx(d, 'outbox', 'readonly', st => st.getAll())).filter(x => !x.uid || x.uid === me)
      .sort((a, b) => a.at - b.at || (a.n || 0) - (b.n || 0)).sort((a, b) => (a.kind === 'photo') - (b.kind === 'photo'));
    const failed = new Set(), keep = it => itx(d, 'outbox', 'readwrite', st => st.put({ ...it, error: 'אין קליטה' })).catch(() => {});
    for (const it of all) {
      if (qKeys(it).some(k => failed.has(k))) continue;
      if (it.stuck || it.tries) { failed.add(qKeys(it)[0]); continue; }   // נכשל בעבר — האפליקציה מטפלת (ומה שאחריו על אותה רשומה מחכה)
      if (it.kind === 'update') {
        const r = await go(`${A.url}/rest/v1/${it.table}?id=eq.${encodeURIComponent(it.rowId)}&select=id`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(it.patch) });
        if (!r.ok || !(await r.json()).length) break;
      } else if (it.kind === 'insert') { try { await upsert(it.table, it.row); } catch { break; } }
      else if (it.kind === 'rpc') { const r = await go(`${A.url}/rest/v1/rpc/${it.fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(it.args || {}) }); if (!r.ok) break; }
      else if (it.kind === 'file') { try { await upload(it.path, it.blob, it.type || 'application/octet-stream', it); } catch (err) { if (err instanceof NetErr) { await keep(it); throw err; } break; } }
      else if (it.kind === 'photo') {
        try { await upload(it.path, it.blob, it.blob?.type || 'image/jpeg', it);
          const t = await thumb(it.blob); if (t) await upload(it.path.replace(/\.jpg$/i, '') + '_t.jpg', t, 'image/jpeg').catch(err => { if (err instanceof NetErr) throw err; });
          await upsert('photos', { id: it.photoId, storage_path: it.path, uploaded_by: it.uid || me, ...it.meta });
        } catch (err) { if (err instanceof NetErr) { await keep(it); throw err; } break; }
      } else break;
      await itx(d, 'outbox', 'readwrite', st => st.delete(it.id)); sent++;
    }
    if (sent) (await clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage({ t: 'sent', n: sent }));
  } finally { d.close(); }
}
