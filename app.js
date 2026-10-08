// E-Drone שטח · נקודת כניסה: כניסה, מסגרת עם ניווט תחתון, ניתוב בין המסכים.
import { sb, state, loadMe, signIn, signOut, can, isManager, flush, updateNet, $, $$, esc, initials, ROLE_HE, icon, pushState, enablePush, toast, backBtn, initNav, goBack } from './lib/core.js';

const app = $('#app');
// לשוניות תחתונות — מוצגות לפי ההרשאות
const TABS = [
  { k: '', t: 'בית', ic: 'home', ok: () => true },
  { k: 'schedule', t: 'לו"ז', ic: 'calendar', ok: () => can('today') || isManager() },
  { k: 'projects', t: 'פרויקטים', ic: 'folder', ok: () => can('projects') },
  { k: 'inbox', t: 'הודעות', ic: 'chat', ok: () => true },
  { k: 'menu', t: 'עוד', ic: 'menu', ok: () => true },
];
// מסכים עם ניווט תחתון (השאר = מסכי עבודה עם כפתור חזרה ופעולות משלהם)
const WITH_NAV = new Set(['', 'schedule', 'projects', 'inbox', 'menu', 'alerts', 'reports', 'equipment', 'specs', 'admin', 'hours', 'attendance', 'myfile', 'staff', 'purchase', 'expenses', 'dispatch']);

// ---------- כניסה ----------
function renderLogin(msg = '') {
  nav(false);
  app.innerHTML = `<form class="login" id="lf" autocomplete="on">
    <div class="brand"><img src="icon-192.png" alt="E-Drone"><h1>E-Drone שטח</h1><div class="muted">כניסה לצוות</div></div>
    <label class="field" for="ph">מספר טלפון<input id="ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="05X-XXXXXXX" required></label>
    <label class="field" for="cd">קוד אישי<small>6 ספרות. קיבלתם אותו מהמשרד</small><input id="cd" class="code" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required></label>
    <div class="err" id="er">${esc(msg)}</div>
    <button class="btn primary block" id="go">כניסה</button>
  </form>`;
  try { const last = localStorage.getItem('edrone-phone'); if (last) { $('#ph').value = last; $('#cd').focus(); } } catch {}
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'נכנס…';
    try {
      await signIn($('#ph').value, $('#cd').value);
      try { localStorage.setItem('edrone-phone', $('#ph').value); } catch {}
      await boot('login');
    } catch (err) { $('#er').textContent = err.message; b.disabled = false; b.textContent = 'כניסה'; }
  };
}

// ---------- ניווט תחתון ----------
function nav(show, active = '') {
  let n = $('#tabbar');
  if (!show) { n?.remove(); document.body.classList.remove('has-nav'); return; }
  if (!n) { n = document.createElement('nav'); n.id = 'tabbar'; n.className = 'tabbar'; n.setAttribute('aria-label', 'ניווט ראשי'); document.body.appendChild(n); }
  document.body.classList.add('has-nav');
  n.innerHTML = TABS.filter(t => t.ok()).map(t => `<a href="#/${t.k}" class="${t.k === active ? 'on' : ''}" ${t.k === active ? 'aria-current="page"' : ''}>${icon(t.ic, 23)}<span>${t.t}</span>${t.k === 'inbox' ? '<i class="nb" id="nb" hidden></i>' : ''}</a>`).join('');
  unread();
}
async function unread() {
  try {
    const { data } = await sb.rpc('my_inbox'); const n = (data || []).reduce((s, c) => s + (c.unread || 0), 0);
    const b = $('#nb'); if (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : n; }
    // תג על אייקון האפליקציה: הודעות שלא נקראו + (למנהלים) בקשות שממתינות לאישור
    let pend = 0;
    if (isManager()) { const r = await Promise.all([sb.from('shift_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'), sb.from('absences').select('id', { count: 'exact', head: true }).eq('status', 'pending'), sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending')]); pend = r.reduce((t, x) => t + (x.count || 0), 0); }
    if ('setAppBadge' in navigator) { const t = n + pend; t ? navigator.setAppBadge(t).catch(() => {}) : navigator.clearAppBadge?.().catch(() => {}); }
  } catch {}
}

// ---------- עוד: פרופיל, מודולים נוספים, הגדרות ----------
function renderMenu() {
  const p = state.profile;
  // שלוש קבוצות קבועות: מה שלי · עבודה בשטח · ניהול. אייקון אחר לכל פריט
  const groups = [
    ['שלי', [
      ['#/hours', 'clock', 'השעות שלי', 'כניסה, יציאה ובקשות תיקון'],
      ['#/myfile', 'file', 'התיק שלי', 'תלושים ומסמכים'],
      ['#/expenses', 'receipt', 'הוצאות', 'דלק, חניה, אוכל ולינה'],
      ['#/news', 'inbox', 'הודעות הנהלה', 'עדכונים והוקרה'],
      !isManager() && ['#/requests', 'send', 'בקשה למשרד', 'שכר, ציוד, מסמכים'],
    ]],
    ['שטח', [
      ['#/kb', 'book', 'מרכז ידע', 'הדרכות וסרטוני תפעול'],
      can('specs') && ['#/specs', 'clipboard', 'אפיונים', 'סיורים לפי אתר ומבנה'],
      isManager() && ['#/reports', 'photo', 'דוחות שטח', 'כל הדוחות והתמונות'],
      can('equipment') && ['#/equipment', 'drone', 'ציוד', 'רחפנים ותקלות'],
      can('purchase') && ['#/purchase', 'cart', 'רכש ומלאי', 'בקשת רכש'],
    ]],
    ['ניהול', [
      isManager() && ['#/alerts', 'alert', 'לטיפול', 'מה פתוח ודורש החלטה'],
      isManager() && ['#/requests', 'send', 'בקשות מהצוות', 'שכר, ציוד, מסמכים'],
      isManager() && ['#/attendance', 'team', 'נוכחות צוות', can('finance') ? 'אישורים וייצוא לשכר' : 'אישורים ושעות'],
      isManager() && ['#/staff', 'users', 'עובדים', can('finance') ? 'פרטים, שכר ומסמכים' : 'פרטים ומסמכים'],
      state.profile.role === 'admin' && ['#/activity', 'chart', 'פעילות', 'מי מחובר ומה קורה'],
      can('admin') && ['#/admin', 'shield', 'הרשאות', 'צוות ותפקידים'],
    ]],
  ].map(([t, r]) => [t, r.filter(Boolean)]).filter(([, r]) => r.length);
  const th = document.documentElement.dataset.theme || '';
  app.innerHTML = `<header class="phead">${backBtn('#/')}<h1>עוד</h1></header>
    <div class="stack lg">
      <div class="card prof"><span class="avatar lg">${esc(initials(p.full_name))}</span><div class="grow"><b>${esc(p.full_name)}</b><small>${esc(ROLE_HE[p.role])} · ${esc(p.phone || '')}</small>
        ${p.is_pilot && p.pilot_license_expiry ? `<small class="${new Date(p.pilot_license_expiry) - Date.now() < 45 * 864e5 ? 'err' : ''}">רישיון מטיס ${esc(p.pilot_license_no || '')} · בתוקף עד ${new Date(p.pilot_license_expiry).toLocaleDateString('he-IL')}</small>` : ''}</div></div>
      ${groups.map(([g, rows]) => `<section><h3 class="sh">${g}</h3><div class="mgrid">${rows.map(([h, ic, t, s]) => `<a class="mtile" href="${h}"><span class="mic">${icon(ic, 20)}</span><b>${t}</b><small>${s}</small></a>`).join('')}</div></section>`).join('')}
      <div class="menu"><div class="lrow"><span class="mic">${icon('sun', 20)}</span><span class="grow"><b>תצוגה</b></span>
        <span class="seg">${[['', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, l]) => `<button data-th="${v}" aria-pressed="${th === v}">${l}</button>`).join('')}</span></div>
        <button class="lrow" id="qrow"><span class="mic">${icon('send', 20)}</span><span class="grow"><b>סנכרון</b><small>מה ממתין לשליחה מהטלפון</small></span><span class="chev">${icon('chev', 18)}</span></button>
        <div class="lrow" id="pushrow"><span class="mic">${icon('chat', 20)}</span><span class="grow"><b>התראות לטלפון</b><small id="pushtxt">בודק…</small></span><span id="pushbtn"></span></div>
        <div id="install"></div>
        <button class="lrow" id="so"><span class="mic">${icon('logout', 20)}</span><span class="grow"><b>יציאה מהחשבון</b></span></button></div>
      <div class="foot" id="ver">E-Drone שטח</div>
    </div>`;
  $$('[data-th]').forEach(c => c.onclick = () => { setTheme(c.dataset.th); renderMenu(); });
  $('#so').onclick = signOut;
  $('#qrow').onclick = async () => (await import('./lib/core.js')).showQueue();
  installHint(); pushRow();
  caches.keys().then(k => { const v = k.find(x => x.startsWith('edrone-field-v')); const e = $('#ver'); if (v && e) e.textContent = 'E-Drone שטח · גרסה ' + v.split('-v')[1]; }).catch(() => {});
}
const PUSH_TXT = { on: 'פועלות — הודעות, שיבוצים ותקלות קריטיות', off: 'כבויות', denied: 'נחסמו בהגדרות הטלפון. מפעילים שם: הגדרות ← התראות ← E-Drone', install: 'קודם מתקינים במסך הבית, ואז אפשר להפעיל', unsupported: 'הטלפון לא תומך. צריך iOS 16.4 ומעלה' };
async function pushRow() {
  const st = await pushState().catch(() => 'unsupported'); const t = $('#pushtxt'), b = $('#pushbtn'); if (!t) return;
  t.textContent = PUSH_TXT[st];
  b.innerHTML = st === 'off' ? '<button class="btn primary sm">הפעלה</button>' : st === 'on' ? '<span class="pill ok">פועל</span>' : '';
  const btn = b.querySelector('button'); if (btn) btn.onclick = async () => { btn.disabled = true; try { await enablePush(); toast('ההתראות הופעלו'); } catch (e) { toast(e.message); } pushRow(); };
}
export async function pushCard(box) {
  try { if (localStorage.getItem('edrone-push-dismiss')) return; } catch {}
  const st = await pushState().catch(() => 'unsupported');
  if (!['off', 'install'].includes(st) || !box) return;
  const c = document.createElement('div'); c.className = 'promo pushpromo';
  c.innerHTML = `<span class="mic">${icon('chat', 20)}</span><span class="grow"><b>${st === 'off' ? 'להפעיל התראות?' : 'מתקינים את האפליקציה'}</b><small>${st === 'off' ? 'כדי לדעת מיד על הודעה, שיבוץ או תקלה' : (/iphone|ipad/i.test(navigator.userAgent) ? 'בספארי: שיתוף ← "הוסף למסך הבית". אחר כך אפשר להפעיל התראות' : 'מוסיפים למסך הבית, ואז אפשר להפעיל התראות')}</small></span>
    ${st === 'off' ? '<button class="btn primary sm" id="pc-on">הפעלה</button>' : ''}<button class="x" id="pc-x" aria-label="סגירה">×</button>`;
  box.prepend(c);
  $('#pc-x').onclick = () => { c.remove(); try { localStorage.setItem('edrone-push-dismiss', '1'); } catch {} };
  const on = $('#pc-on'); if (on) on.onclick = async () => { try { await enablePush(); c.remove(); toast('ההתראות הופעלו'); } catch (e) { toast(e.message); } };
}
window.__pushCard = pushCard;
function setTheme(v) { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; try { localStorage.setItem('edrone-theme', v); } catch {} }
let deferredInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; installHint(); });
function installHint() {
  const box = $('#install'); if (!box || matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  box.innerHTML = `<div class="lrow"><img src="icon-192.png" alt="" class="mic img"><span class="grow"><b>התקנה במסך הבית</b><small>${ios ? 'בספארי: כפתור השיתוף ← "הוסף למסך הבית"' : 'נפתחת כמו אפליקציה, גם בלי קליטה'}</small></span>${deferredInstall ? '<button class="btn primary sm" id="inst">התקנה</button>' : ''}</div>`;
  const b = $('#inst'); if (b) b.onclick = async () => { deferredInstall.prompt(); deferredInstall = null; box.innerHTML = ''; };
}

// ---------- ניתוב ----------
async function route() {
  try { await routeInner(); } catch (e) { console.error(e); app.innerHTML = `<div class="empty-card"><span><b>משהו השתבש בטעינת המסך</b><small>${esc(e.message || e)}</small></span></div><button class="btn ghost block" onclick="location.reload()">רענון</button>`; }
}
async function routeInner() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  app.scrollTop = 0;
  document.querySelectorAll('.bar,.composer,.fabs').forEach(x => x.remove());
  $('#sheet').hidden = true;
  nav(WITH_NAV.has(h[0]), h[0] === 'alerts' || h[0] === 'reports' ? (isManager() ? '' : 'menu') : ['specs', 'equipment', 'admin', 'hours', 'attendance', 'myfile', 'staff', 'purchase', 'expenses'].includes(h[0]) ? 'menu' : h[0]);
  const guard = m => { if (!can(m)) { app.innerHTML = `<div class="empty-card"><span><b>אין לך גישה למסך הזה</b><small>אם צריך, המשרד יעדכן את ההרשאות</small></span></div>`; return false; } return true; };
  const home = () => import('./modules/home.js');
  switch (h[0]) {
    case '': return (await home()).renderHome(app);
    case 'schedule': case 'today': return (await home()).renderSchedule(app);
    case 'alerts': return (await home()).renderAlerts(app);
    case 'reports': return (await home()).renderReports(app);
    case 'inbox': return (await import('./modules/inbox.js')).renderInbox(app);
    case 'c': return (await import('./modules/inbox.js')).renderConversation(app, h[1]);
    case 'menu': case 'me': return renderMenu();
    case 'hours': return (await import('./modules/attendance.js')).renderHours(app, null, h[1]);
    case 'attendance': { const m = await import('./modules/attendance.js'); if (h[1] === 'm' || !h[1]) return m.renderAttendance(app, h[2]); return m.renderHours(app, h[1], h[2]); }
    case 'purchase': if (guard('purchase')) return (await import('./modules/purchase.js')).renderPurchase(app); return;
    case 'dispatch': return (await import('./modules/dispatch.js')).renderDispatch(app, h[1]);
    case 'client-report': return (await import('./modules/clientreport.js')).renderClientReport(app, h[1]);
    case 'kb': { const m = await import('./modules/knowledge.js'); return h[1] === 'c' ? m.renderKb(app, decodeURIComponent(h[2] || '')) : h[1] ? m.renderKbItem(app, h[1]) : m.renderKb(app); }
    case 'onboarding': return (await import('./modules/onboarding.js')).renderOnboarding(app);
    case 'news': return (await import('./modules/news.js')).renderNews(app);
    case 'requests': return (await import('./modules/news.js')).renderRequests(app);
    case 'activity': return (await import('./modules/activity.js')).renderActivity(app, h[1] || '');
    case 'tour': return (await import('./modules/tour.js')).renderTour(app, h[1] || 'ops');
    case 'plan': if (guard('projects')) return (await import('./modules/plan.js')).renderPlan(app, h[1], h[2] === 'print'); return;
    case 'visit': { const m = await import('./modules/visits.js'); return h[1] === 'new' ? m.renderVisitForm(app, h[2]) : h[1] === 'edit' ? m.renderVisitForm(app, h[2], h[3]) : h[2] === 'report' ? m.renderVisitReport(app, h[1]) : m.renderVisit(app, h[1]); }
    case 'expenses': return (await import('./modules/expenses.js')).renderExpenses(app);
    case 'myfile': return (await import('./modules/files.js')).renderMyFile(app);
    case 'staff': case 'files': { const m = await import('./modules/staff.js'); return h[1] ? m.renderEmployee(app, h[1], h[2]) : m.renderStaff(app); }
    case 'signoff': return (await import('./modules/reports.js')).renderSignoff(app, h[1]);
    case 'summary': return (await import('./modules/reports.js')).renderSummary(app, h[1]);
    case 'day': return (await import('./modules/today.js')).renderDay(app, h[1]);
    case 'projects': if (guard('projects')) return (await import('./modules/projects.js')).renderProjects(app); return;
    case 'p': if (guard('projects')) return (await import('./modules/projects.js')).renderProject(app, h[1], h[2] || 'o'); return;
    case 'equipment': if (guard('equipment')) return (await import('./modules/equipment.js')).renderEquipment(app); return;
    case 'specs': if (guard('specs')) return (await import('./modules/specs.js')).renderSites(app); return;
    case 'site': if (guard('specs')) return (await import('./modules/specs.js')).renderSite(app, h[1], h[2] === 'chat' ? 'c' : 'b'); return;
    case 'b': if (guard('specs')) return (await import('./modules/specs.js')).renderBuilding(app, h[1], h[2]); return;
    case 'admin': if (guard('admin')) return (await import('./modules/admin.js')).renderAdmin(app); return;
    default: {
      // מסך שהגרסה הטעונה לא מכירה = גרסה חדשה כבר באוויר. טוענים מחדש פעם אחת באותו מסך, ולא זורקים לבית
      const k = 'rr:' + h[0]; let tried = false; try { tried = sessionStorage.getItem(k) === '1'; sessionStorage.setItem(k, '1'); } catch { /* */ }
      if (!tried) { location.reload(); return; }
      location.hash = '#/';
    }
  }
}

async function boot(how = 'open') {
  try { const t = localStorage.getItem('edrone-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  if (!(await loadMe())) return renderLogin();
  if (!state.profile.is_active) { await sb.auth.signOut(); return renderLogin('הגישה שלך הושבתה. פנו למשרד.'); }
  addEventListener('hashchange', route);
  updateNet(); flush(); route();
  import('./lib/track.js').then(m => m.startTracking(how)).catch(() => {});
  // בקשת אחסון קבוע — כדי שהטלפון לא ימחק נתונים שעוד לא נשלחו
  try { navigator.storage?.persist?.(); } catch {}
}
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') renderLogin(); });
// גרסה חדשה: ה-service worker מתעדכן ברקע, והאפליקציה נטענת מחדש פעם אחת (רק אם לא באמצע טופס/שיחה)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return; reloaded = true;
    if (document.querySelector('.bar,.composer,.modal')) { toast('גרסה חדשה מוכנה — תיטען במעבר המסך הבא'); addEventListener('hashchange', () => location.reload(), { once: true }); }
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(r => { r.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); }); }).catch(() => {});
}
// כל חץ חזרה באפליקציה = המסך הקודם בפועל; כשאין (נכנסו מקישור/התראה) — ה-href הוא מסך האב, בהחלפה
initNav();
// באג אייפון (אפליקציית מסך הבית): אחרי שהמקלדת נסגרת המסך נשאר מכווץ — פס מת מתחת לבר התחתון עד סגירת האפליקציה.
// מזהים (הגובה ירד מתחת למקסימום שנמדד / לגובה המסך) ומכריחים מדידה מחדש בהסתרה והחזרה רגעית של התוכן.
{
  let maxVH = innerHeight;
  addEventListener('resize', () => { if (innerWidth < innerHeight) maxVH = Math.max(maxVH, innerHeight); });
  const heal = () => {
    if (innerWidth > innerHeight || maxVH - innerHeight <= 4) return;
    const els = [app, document.getElementById('tabbar')].filter(Boolean), st = app.scrollTop;
    els.forEach(e => e.style.display = 'none'); void document.body.offsetHeight; els.forEach(e => e.style.display = '');
    app.scrollTop = st;
  };
  document.addEventListener('focusout', e => { if (e.target.matches?.('input,textarea,select,[contenteditable]')) { setTimeout(heal, 140); setTimeout(heal, 600); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(heal, 300); });
  addEventListener('pageshow', () => setTimeout(heal, 300));
  setTimeout(heal, 500);
}
document.addEventListener('click', e => {
  const a = e.target.closest('a.back'); if (!a || e.defaultPrevented || a.dataset.hard) return;
  e.preventDefault(); goBack(a.getAttribute('href') || '#/');
});
boot();
