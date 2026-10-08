// Service worker: האפליקציה נפתחת גם בלי קליטה, ותמונות שכבר נצפו זמינות מהטלפון.
const VERSION = 'edrone-field-v90';
const SHELL = ['./', 'index.html', 'tour/ops.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'mark.png', 'lib/audit.js', 'lib/contacts.js', 'lib/core.js', 'lib/labor.js', 'lib/pay.js', 'lib/store.js', 'lib/sun.js', 'lib/track.js', 'lib/viewer.js', 'lib/wx.js', 'modules/activity.js', 'modules/admin.js', 'modules/attendance.js', 'modules/attention.js', 'modules/chat.js', 'modules/clientreport.js', 'modules/clients.js', 'modules/dispatch.js', 'modules/equipment.js', 'modules/expenses.js', 'modules/files.js', 'modules/home.js', 'modules/inbox.js', 'modules/knowledge.js', 'modules/news.js', 'modules/onboarding.js', 'modules/ops.js', 'modules/plan.js', 'modules/projects.js', 'modules/purchase.js', 'modules/reports.js', 'modules/specs.js', 'modules/staff.js', 'modules/tasks.js', 'modules/today.js', 'modules/tour.js', 'modules/visits.js', 'modules/weather.js'];

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
    // קליטה חלשה: אם השרת לא עונה תוך 3 שניות ויש עותק בטלפון — מגישים אותו (הרשת ממשיכה ברקע ומעדכנת את המטמון)
    const fresh = (e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(new Request(e.request, { cache: 'no-cache' })))
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; });
    const cached = () => caches.match(e.request).then(h => h || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined));
    const slow = new Promise(ok => setTimeout(ok, 3000)).then(cached).then(h => h || fresh);
    e.respondWith(Promise.race([fresh, slow]).catch(() => cached().then(h => h || Response.error())));
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
