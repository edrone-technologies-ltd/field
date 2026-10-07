// Service worker: האפליקציה נפתחת גם בלי קליטה, ותמונות שכבר נצפו זמינות מהטלפון.
const VERSION = 'edrone-field-v30';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'lib/core.js', 'lib/store.js',
  'modules/specs.js', 'modules/chat.js', 'modules/admin.js', 'modules/home.js', 'modules/today.js', 'modules/projects.js', 'modules/equipment.js', 'modules/inbox.js', 'modules/reports.js', 'modules/attendance.js', 'lib/labor.js', 'lib/pay.js', 'modules/files.js', 'modules/staff.js', 'modules/purchase.js', 'modules/expenses.js', 'modules/clientreport.js', 'modules/dispatch.js', 'lib/sun.js', 'manifest.webmanifest', 'icon-192.png', 'mark.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'edrone-img').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // תמונות מהאחסון: לפי נתיב, בלי טוקן החתימה, כדי שיישארו זמינות גם כשהקישור מתחדש
  if (u.pathname.includes('/storage/v1/object/sign/')) {
    const key = u.origin + u.pathname;
    e.respondWith(caches.open('edrone-img').then(async c => {
      const hit = await c.match(key);
      if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) c.put(key, r.clone()); return r; } catch { return hit || Response.error(); }
    }));
    return;
  }
  // קבצי האפליקציה: רשת קודם (לעדכונים), מטמון כשאין קליטה
  if (u.origin === location.origin || u.hostname.endsWith('jsdelivr.net') || u.hostname.includes('fonts.')) {
    // תמיד בודקים מול השרת (no-cache) — כדי שקבצי גרסה ישנה וחדשה לא יתערבבו אחרי עדכון
    const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(new Request(e.request, { cache: 'no-cache' }));
    e.respondWith(fresh.then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(h => h || caches.match('index.html'))));
  }
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
