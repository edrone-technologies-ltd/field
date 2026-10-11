// Service worker: האפליקציה נפתחת גם בלי קליטה, ותמונות שכבר נצפו זמינות מהטלפון.
const VERSION = 'edrone-field-v102';
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
