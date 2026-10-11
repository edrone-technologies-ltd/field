// E-Drone שטח · נקודת כניסה: כניסה, מסגרת עם ניווט תחתון, ניתוב בין המסכים.
import { sb, state, loadMe, signIn, signOut, can, isManager, flush, updateNet, $, $$, esc, initials, ROLE_HE, icon, pushState, enablePush, toast, backBtn, initNav, goBack, sheet, haptic, navDir, skeleton } from './lib/core.js';

const app = $('#app');
// לשוניות תחתונות — מוצגות לפי ההרשאות
const TABS = [
  { k: '', t: 'בית', ic: 'home', ok: () => true },
  { k: 'schedule', t: 'לו"ז', ic: 'calendar', ok: () => can('today') || isManager() },   // מנהל: לוח השיבוץ · עובד: הימים שלו
  { k: 'projects', t: 'פרויקטים', ic: 'folder', ok: () => can('projects') },
  { k: 'inbox', t: 'הודעות', ic: 'chat', ok: () => true },
  { k: 'menu', t: 'עוד', ic: 'menu', ok: () => true },
];
// מסכים עם ניווט תחתון (השאר = מסכי עבודה עם כפתור חזרה ופעולות משלהם)
const WITH_NAV = new Set(['kb', 'news', 'requests', 'weather', '', 'ops', 'schedule', 'projects', 'p', 'client', 'clients', 'inbox', 'menu', 'alerts', 'reports', 'equipment', 'specs', 'admin', 'hours', 'attendance', 'myfile', 'staff', 'purchase', 'expenses', 'dispatch', 'tasks']);

// ---------- כניסה ----------
function renderLogin(msg = '') {
  nav(false); import('./modules/login.js').then(m => m.renderLogin(app, msg, () => boot('login')));
}

// ---------- ניווט תחתון ----------
function nav(show, active = '') {
  let n = $('#tabbar');
  if (!show) { n?.remove(); document.body.classList.remove('has-nav'); return; }
  if (!n) { n = document.createElement('nav'); n.id = 'tabbar'; n.className = 'tabbar'; n.setAttribute('aria-label', 'ניווט ראשי'); document.body.appendChild(n); }
  document.body.classList.add('has-nav');
  const T = TABS.filter(t => t.ok()).map(t => `<a href="#/${t.k}" class="${t.k === active ? 'on' : ''}" ${t.k === active ? 'aria-current="page"' : ''}>${icon(t.ic, 23)}<span>${t.t}</span>${t.k === 'inbox' ? '<i class="nb" id="nb" hidden></i>' : ''}</a>`);
  T.splice(Math.floor(T.length / 2), 0, '<button class="tabplus" id="tplus" aria-label="חדש">' + icon('plus', 24) + '</button>');
  n.innerHTML = T.join('');
  $('#tplus').onclick = () => { haptic('medium'); quickAdd(); };
  // לחיצה על הלשונית הפעילה כשכבר במסך השורש שלה = גלילה לראש (כמו באייפון)
  n.onclick = e => {
    const a = e.target.closest('a'); if (!a) return; haptic('tap');
    if (a.classList.contains('on') && (location.hash || '#/') === a.getAttribute('href') && app.scrollTop > 0) { e.preventDefault(); app.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  };
  unread();
}
// כפתור + : המקום היחיד ליצירת משהו חדש. רשת אחת, מילה אחת לכל פעולה; בתוך פרויקט — הדוח משויך אליו מראש
const ADD = { daily: ['report', 'דוח יומי'], issue: ['alert', 'תקלה'], expense: ['receipt', 'הוצאה'], spec: ['clipboard', 'אפיון'], signoff: ['pen', 'החתמה'], visit: ['users', 'ביקור'], summary: ['activity', 'סיכום'] };
async function quickAdd() {
  const { newReport, TYPES } = await import('./modules/reports.js');
  const pid = (location.hash.match(/^#\/p\/([0-9a-f-]{36})/) || [])[1] || null;
  const tiles = [...TYPES.filter(t => t.ok() && !(pid && t.noProject)).map(t => `<button class="ctile" data-k="${t.k}">${icon(ADD[t.k]?.[0] || t.ic, 24)}<b>${ADD[t.k]?.[1] || t.t}</b></button>`),
    `<a class="ctile" href="#/requests/new" data-close>${icon('send', 24)}<b>בקשה למשרד</b></a>`,
    can('purchase') && `<a class="ctile" href="#/purchase/new" data-close>${icon('cart', 24)}<b>רכש</b></a>`].filter(Boolean);
  sheet(`<h3 class="sh">${pid ? 'חדש בפרויקט' : 'חדש'}</h3><div class="cgrid">${tiles.join('')}</div>`, (s, close) => {
    $$('[data-k]', s).forEach(b => b.onclick = () => { close(); newReport(pid, [], b.dataset.k); });
  });
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
      ['#/news', 'inbox', 'עדכוני הנהלה', 'עדכונים והוקרה'],
      !isManager() && ['#/requests', 'send', 'בקשה למשרד', 'שכר, ציוד, מסמכים'],
    ]],
    ['שטח', [
      ['#/weather', 'sun', 'מזג אוויר וטיסה', 'לכל אתר ולכל מקום — רוח, משבים, גשם, Kp'],
      ['#/kb', 'book', 'מרכז ידע', 'הדרכות וסרטוני תפעול'],
      can('specs') && ['#/specs', 'clipboard', 'אפיונים', 'סיורים לפי אתר ומבנה'],
      isManager() && ['#/reports', 'photo', 'דוחות שטח', 'כל הדוחות והתמונות'],
      can('equipment') && ['#/equipment', 'drone', 'ציוד', 'רחפנים ותקלות'],
      can('purchase') && ['#/purchase', 'cart', 'רכש ומלאי', 'בקשת רכש'],
    ]],
    ['ניהול', [
      isManager() && ['#/requests', 'send', 'בקשות מהצוות', 'שכר, ציוד, מסמכים'],
      isManager() && ['#/attendance', 'team', 'נוכחות צוות', can('finance') ? 'אישורים וייצוא לשכר' : 'אישורים ושעות'],
      isManager() && ['#/staff', 'users', 'עובדים', can('finance') ? 'פרטים, שכר ומסמכים' : 'פרטים ומסמכים'],
      isManager() && ['#/clients', 'folder', 'לקוחות', 'תיק לקוח והיסטוריית עבודות'],
      state.profile.role === 'admin' && ['#/activity', 'clock', 'פעילות', 'מי מחובר ומה קורה'],
      state.profile.role === 'admin' && ['#/onboarding/launch', 'activity', 'השקה', 'מי נכנס, התקין והפעיל התראות'],
      can('admin') && ['#/admin', 'shield', 'הרשאות', 'צוות ותפקידים'],
    ]],
  ].map(([t, r]) => [t, r.filter(Boolean)]).filter(([, r]) => r.length);
  const th = document.documentElement.dataset.theme || '';
  app.innerHTML = `<header class="phead">${backBtn('#/')}<h1>עוד</h1></header>
    <div class="stack lg">
      <div class="card prof"><span class="avatar lg">${esc(initials(p.full_name))}</span><div class="grow"><b>${esc(p.full_name)}</b><small>${esc([ROLE_HE[p.role], p.phone].filter(Boolean).join(' · '))}</small>
        ${p.is_pilot && p.pilot_license_expiry ? `<small class="${new Date(p.pilot_license_expiry) - Date.now() < 45 * 864e5 ? 'err' : ''}">רישיון מטיס ${esc(p.pilot_license_no || '')} · בתוקף עד ${new Date(p.pilot_license_expiry).toLocaleDateString('he-IL')}</small>` : ''}</div></div>
      ${groups.map(([g, rows]) => `<section><h3 class="sh">${g}</h3><div class="mgrid">${rows.map(([h, ic, t]) => `<a class="mtile" href="${h}"><span class="mic">${icon(ic, 20)}</span><b>${t}</b></a>`).join('')}</div></section>`).join('')}
      <section><h3 class="sh">הגדרות</h3><div class="menu"><div class="lrow"><span class="mic">${icon('settings', 20)}</span><span class="grow"><b>תצוגה</b></span>
        <span class="seg">${[['', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, l]) => `<button data-th="${v}" aria-pressed="${th === v}">${l}</button>`).join('')}</span></div>
        <button class="lrow" id="qrow"><span class="mic">${icon('sync', 20)}</span><span class="grow"><b>סנכרון</b></span><span class="chev">${icon('chev', 18)}</span></button>
        <div class="lrow" id="pushrow"><span class="mic">${icon('chat', 20)}</span><span class="grow"><b>התראות לטלפון</b><small id="pushtxt">בודק…</small></span><span id="pushbtn"></span></div>
        <div id="install"></div>
      </div></section>
      <div class="menu"><button class="lrow danger" id="so"><span class="mic">${icon('logout', 20)}</span><span class="grow"><b>יציאה מהחשבון</b></span></button></div>
      <div class="foot" id="ver">E-Drone שטח</div>
    </div>`;
  $$('[data-th]').forEach(c => c.onclick = () => { setTheme(c.dataset.th); renderMenu(); });
  $('#so').onclick = signOut;
  $('#qrow').onclick = async () => (await import('./lib/core.js')).showQueue();
  installHint(); pushRow();
  caches.keys().then(k => { const v = k.find(x => x.startsWith('edrone-field-v')); const e = $('#ver'); if (v && e) e.textContent = 'E-Drone שטח · גרסה ' + v.split('-v')[1]; }).catch(() => {});
}
const PUSH_TXT = { on: 'פועלות', off: 'כבויות', denied: 'חסומות בהגדרות הטלפון', install: 'זמינות אחרי התקנה במסך הבית', unsupported: 'לא נתמך בטלפון הזה' };
async function pushRow() {
  const st = await pushState().catch(() => 'unsupported'); const t = $('#pushtxt'), b = $('#pushbtn'); if (!t) return;
  t.textContent = PUSH_TXT[st];
  b.innerHTML = st === 'off' ? '<button class="btn ghost sm">הפעלה</button>' : st === 'on' ? '<span class="pill ok">פועל</span>' : '';
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
function setTheme(v) { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; try { localStorage.setItem('edrone-theme', v); } catch {} themeColor(); }
// צבע שורת המצב/הדפדפן = רקע האפליקציה בפועל (בהיר/כהה/בחירה ידנית)
function themeColor() {
  const m = document.querySelectorAll('meta[name="theme-color"]'); if (!m.length) return;
  requestAnimationFrame(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (c) m.forEach(x => x.setAttribute('content', c)); });
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeColor); } catch {}
let deferredInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; window.__bip = e; installHint(); });
function installHint() {
  const box = $('#install'); if (!box || matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  box.innerHTML = `<div class="lrow"><span class="mic">${icon('home', 20)}</span><span class="grow"><b>התקנה במסך הבית</b>${ios ? '<small>שיתוף ← הוסף למסך הבית</small>' : ''}</span>${deferredInstall ? '<button class="btn ghost sm" id="inst">התקנה</button>' : ''}</div>`;
  const b = $('#inst'); if (b) b.onclick = async () => { deferredInstall.prompt(); deferredInstall = null; box.innerHTML = ''; };
}

// ---------- ניתוב ----------
// מספר ניווט: מסך איטי שסיים (או נכשל) אחרי שהמשתמש כבר עבר מסך — לא כותב על המסך החדש
let navSeq = 0;
export const navToken = () => navSeq;
// ---------- מעבר בין מסכים: החלקה קצרה של התוכן (מסך חדש נכנס משמאל, חזרה — מימין), דהייה בין לשוניות ----------
const isRootHash = h => { const s = (h || '').replace(/^#\/?/, '').split('/'); return s.length === 1 && TABS.some(t => t.k === s[0]); };
let lastHash = null, rtObs = null, rtT = 0;
function transition(kind) {
  rtObs?.disconnect(); clearTimeout(rtT); app.classList.remove('rt-fwd', 'rt-back', 'rt-fade');
  if (!kind || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // הקלאס נכנס רק כשהתוכן החדש נכתב (MutationObserver = לפני הציור), כך שהמסך הישן לא "מהבהב" בזמן טעינת המודול
  rtObs = new MutationObserver(() => {
    rtObs.disconnect(); rtObs = null; app.classList.add('rt-' + kind);
    rtT = setTimeout(() => app.classList.remove('rt-' + kind), 360);
  });
  rtObs.observe(app, { childList: true });
}
app.addEventListener('animationend', e => { if (e.target.parentElement === app && /^rt/.test(e.animationName)) { clearTimeout(rtT); app.classList.remove('rt-fwd', 'rt-back', 'rt-fade'); } });
const NOANIM = { noAnim: true };
async function route(ev) {
  const my = ++navSeq;
  const cur = location.hash || '#/', d = navDir();
  transition(ev === NOANIM ? '' : !ev ? 'fade' : d === 'same' ? '' : lastHash != null && isRootHash(cur) && isRootHash(lastHash) ? 'fade' : d === 'back' ? 'back' : 'fwd');
  lastHash = cur; titleReset();
  // מסך שנתקע על שלד טעינה (קליטה חלשה) — אחרי 15 שניות מציעים לנסות שוב במקום להמתין לנצח
  clearTimeout(route.wd); route.wd = setTimeout(() => { if (my === navSeq && app.querySelector(':scope > .sk, :scope > .stack > .sk') && !app.querySelector('.oops')) app.insertAdjacentHTML('beforeend', oops('הטעינה לוקחת יותר מהרגיל', !navigator.onLine)); }, 15000);
  try { await routeInner(); } catch (e) {
    console.error(e); if (my !== navSeq) return;
    if (chunkErr(e)) return;
    app.innerHTML = oops('המסך לא נטען', !navigator.onLine);
  }
  finally { if (my === navSeq) { rtObs?.disconnect(); rtObs = null; } }   // מסך שלא החליף תוכן — לא מנפישים מאוחר
}
// כרטיס תקלה ידידותי: בלי הודעת שגיאה טכנית, כפתור אחד שמנסה שוב באותו מסך
function oops(t, off) {
  return `<div class="oops" role="alert"><span class="oops-ic">${icon(off ? 'sync' : 'alert', 28)}</span><b>${off ? 'אין קליטה כרגע' : t}</b><button class="btn primary" data-retry>${icon('sync', 18)} לנסות שוב</button>${t !== 'המסך לא נטען' ? '' : '<a class="oops-home" href="#/">למסך הבית</a>'}</div>`;
}
app.addEventListener('click', e => { if (e.target.closest('[data-retry]')) { haptic('tap'); route(NOANIM); } });
// קובץ מסך מגרסה קודמת לא נמצא (עדכון באמצע) — טעינה מחדש אחת, בלי מסך שגיאה
function chunkErr(e) {
  if (!/dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(String(e?.message || e)) || !navigator.onLine) return false;
  let tried = false; try { tried = sessionStorage.getItem('rr:chunk') === '1'; sessionStorage.setItem('rr:chunk', '1'); } catch { /* */ }
  if (tried) return false;
  location.reload(); return true;
}
// שגיאה שלא נתפסה בתוך מסך — אם המסך נשאר ריק (מסך לבן), מציגים כרטיס עם "לנסות שוב"
const whiteGuard = () => setTimeout(() => { if (state.profile && !app.children.length) app.innerHTML = oops('המסך לא נטען', !navigator.onLine); }, 50);
addEventListener('error', whiteGuard);
addEventListener('unhandledrejection', e => { if (chunkErr(e.reason)) return; whiteGuard(); });
setTimeout(() => { try { sessionStorage.removeItem('rr:chunk'); } catch { /* */ } }, 20000);
async function routeInner() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  app.scrollTop = 0;
  document.querySelectorAll('.bar,.composer,.fabs').forEach(x => x.remove());
  $('#sheet').hidden = true;
  // מסך שורש של לשונית (בלי תת-נתיב) — בלי כפתור חזרה בכותרת
  if (h.length === 1 && TABS.some(t => t.k === h[0] && t.ok())) document.body.dataset.root = ''; else delete document.body.dataset.root;
  nav(WITH_NAV.has(h[0]), h[0] === 'ops' ? '' : h[0] === 'dispatch' ? 'schedule' : h[0] === 'p' ? 'projects' : ['client', 'clients'].includes(h[0]) ? 'menu' : h[0] === 'alerts' || h[0] === 'tasks' ? '' : h[0] === 'reports' ? 'menu' : ['specs', 'equipment', 'admin', 'hours', 'attendance', 'myfile', 'staff', 'purchase', 'expenses', 'kb', 'news', 'requests', 'weather'].includes(h[0]) ? 'menu' : h[0]);
  // מסך בלי הרשאה — מסך אחד אחיד (כותרת, חזרה, הסבר קצר), בלי לטעון את המודול
  const deny = () => { app.innerHTML = `<header class="phead">${backBtn('#/')}</header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>אין לך גישה למסך הזה</b><small>אם צריך, המשרד יעדכן את ההרשאות</small></span></div>`; return false; };
  const guard = m => can(m) || deny();
  const MGR = { attendance: 1, dispatch: 1, clients: 1, client: 1, staff: 1, files: 1, 'client-report': 1 };
  if (MGR[h[0]] && !isManager()) return deny();
  if (h[0] === 'activity' && state.profile.role !== 'admin') return deny();
  const home = () => import('./modules/home.js');
  switch (h[0]) {
    case '': return (await home()).renderHome(app);
    case 'ops': return (await import('./modules/ops.js')).renderOps(app);
    case 'schedule': case 'today': return (await home()).renderSchedule(app);
    case 'alerts': return (await home()).renderAlerts(app);
    case 'reports': return (await home()).renderReports(app);
    case 'inbox': return (await import('./modules/inbox.js')).renderInbox(app);
    case 'c': return (await import('./modules/inbox.js')).renderConversation(app, h[1]);
    case 'menu': case 'me': return renderMenu();
    case 'hours': return (await import('./modules/attendance.js')).renderHours(app, null, h[1]);
    case 'attendance': { const m = await import('./modules/attendance.js'); if (h[1] === 'm' || !h[1]) return m.renderAttendance(app, h[2]); return m.renderHours(app, h[1], h[2]); }
    case 'purchase': if (guard('purchase')) { await (await import('./modules/purchase.js')).renderPurchase(app); } return;
    case 'dispatch': return (await import('./modules/dispatch.js')).renderDispatch(app, h[1]);
    case 'client-report': return (await import('./modules/clientreport.js')).renderClientReport(app, h[1]);
    case 'kb': { const m = await import('./modules/knowledge.js'); return h[1] === 'c' ? m.renderKb(app, decodeURIComponent(h[2] || '')) : h[1] ? m.renderKbItem(app, h[1]) : m.renderKb(app); }
    case 'onboarding': return (await import('./modules/onboarding.js')).renderOnboarding(app);
    case 'news': return (await import('./modules/news.js')).renderNews(app);
    case 'requests': await (await import('./modules/news.js')).renderRequests(app); if (h[1] === 'new') $('#rn')?.click(); return;
    case 'weather': return (await import('./modules/weather.js')).renderWeather(app, h[1] || '');
    case 'clients': return (await import('./modules/clients.js')).renderClients(app);
    case 'client': return (await import('./modules/clients.js')).renderClient(app, h[1]);
    case 'activity': return (await import('./modules/activity.js')).renderActivity(app, h[1] || '');
    case 'tour': return (await import('./modules/tour.js')).renderTour(app, h[1] || 'ops');
    case 'plan': if (guard('projects')) return (await import('./modules/plan.js')).renderPlan(app, h[1], h[2] === 'print'); return;
    case 'visit': { const m = await import('./modules/visits.js'); return h[1] === 'new' ? m.renderVisitForm(app, h[2]) : h[1] === 'edit' ? m.renderVisitForm(app, h[2], h[3]) : h[2] === 'report' ? m.renderVisitReport(app, h[1]) : m.renderVisit(app, h[1]); }
    case 'expenses': await (await import('./modules/expenses.js')).renderExpenses(app); return;
    case 'tasks': {   // המשימות שלי — אותה רשימה כמו בבית, במסך מלא
      app.innerHTML = `<header class="phead">${backBtn('#/')}<h1>משימות</h1></header><div id="tk" class="stack lg">${skeleton('list', 4)}</div>`;
      const box = $('#tk'); await (await import('./modules/tasks.js')).myTasks(box);
      if (box.isConnected && (!box.children.length || box.querySelector(':scope > .sk'))) box.innerHTML = `<div class="empty-card ok"><span class="ei">${icon('check', 26)}</span><span><b>אין משימות פתוחות</b><small>הכל טופל</small></span></div>`;
      return;
    }
    case 'myfile': return (await import('./modules/files.js')).renderMyFile(app);
    case 'staff': case 'files': { const m = await import('./modules/staff.js'); return h[1] ? m.renderEmployee(app, h[1], h[2]) : m.renderStaff(app); }
    case 'signoff': return (await import('./modules/signoff.js')).renderSignoff(app, h[1], h[2] || null);   // #/signoff/<project>[/<work_day>]
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

// תחזית מראש לכל האתרים הפתוחים (בקשה אחת). ה-service worker שומר לכל אתר בנפרד — כל מסך מקבל תחזית מיידית
async function wxWarm() {
  if (!navigator.onLine || !state.profile) return;
  try {
    const { data } = await sb.from('projects').select('id,site_id,lat,lng,sites(lat,lng)').neq('monday_group', 'group_mm5052gw').limit(150);
    const S = [...new Map((data || []).map(p => { const la = p.sites?.lat ?? p.lat, ln = p.sites?.lng ?? p.lng; return la != null && ln != null ? [p.site_id || p.id, { id: p.site_id || p.id, lat: la, lng: ln }] : null; }).filter(Boolean)).values()];
    const wx = await import('./lib/wx.js');
    wx.kpSeries().catch(() => {});
    for (let i = 0; i < S.length; i += 50) await wx.forecast(S.slice(i, i + 50)).catch(() => {});
  } catch { /* */ }
}
async function boot(how = 'open') {
  try { const t = localStorage.getItem('edrone-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  if (!(await loadMe())) return renderLogin();
  if (!state.profile.is_active) { await sb.auth.signOut(); return renderLogin('הגישה שלך הושבתה. פנו למשרד.'); }
  addEventListener('hashchange', route);
  updateNet(); flush(); route(); themeColor();
  import('./modules/welcome.js').then(m => m.maybeWelcome()).catch(() => {});
  // בזמן מת: טעינה מוקדמת של מסכי הלשוניות — מעבר ראשון בין לשוניות בלי המתנה לקובץ
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  idle(() => ['home', 'projects', 'inbox', 'today', 'reports', 'ops'].forEach((m, i) => setTimeout(() => import(`./modules/${m}.js`).catch(() => {}), i * 120)), { timeout: 4000 });
  setTimeout(() => idle(wxWarm, { timeout: 5000 }), 6000);
  setInterval(() => { if (document.visibilityState === 'visible') wxWarm(); }, 25 * 6e4);
  import('./lib/track.js').then(m => m.startTracking(how)).catch(() => {});
  // בקשת אחסון קבוע — כדי שהטלפון לא ימחק נתונים שעוד לא נשלחו
  try { navigator.storage?.persist?.(); } catch {}
}
// החיבור פג (לא יציאה יזומה) — חוזרים למסך כניסה עם הטלפון שמור, ואחרי הכניסה לאותו מסך שהיינו בו
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') renderLogin(window.__signingOut ? '' : 'החיבור פג — נכנסים שוב'); });
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
// ---------- כותרת מתכווצת: כשהכותרת הגדולה יוצאת מהמסך — סרגל עליון דק עם השם (וחץ חזרה) ----------
const ct = document.createElement('div'); ct.id = 'ctitle'; ct.className = 'ctitle'; ct.setAttribute('aria-hidden', 'true');
ct.innerHTML = '<span class="ct-s"></span><b class="ct-t"></b><span class="ct-e"></span>';
document.body.appendChild(ct);
let ctSrc = null, ctOn = false, ctRaf = 0, ctH = 0;
const ctFind = () => app.querySelector(':scope > .phead:not(.sticky) h1, :scope > .hhead h1, :scope > .phero .ph-bottom > b');
function ctFill() {
  $('.ct-t', ct).textContent = (ctSrc.textContent || '').trim();
  const hd = ctSrc.closest('.phead,.hhead,.phero'), b = hd?.querySelector('a.back'), s = $('.ct-s', ct);
  const show = b && (hd.classList.contains('phero') || !document.body.hasAttribute('data-root'));
  s.innerHTML = show ? `<a class="back" href="${esc(b.getAttribute('href') || '#/')}" tabindex="-1"${b.dataset.hard ? ' data-hard="1"' : ''}>${icon('back', 20)}</a>` : '';
}
function ctCheck() {
  ctRaf = 0;
  if (!ctSrc || !ctSrc.isConnected) ctSrc = ctFind();
  if (!ctH) ctH = ct.offsetHeight || 44;
  const on = !!ctSrc && app.scrollTop > 8 && ctSrc.getBoundingClientRect().bottom < ctH;
  if (on && !ctOn) ctFill();
  if (on !== ctOn) { ctOn = on; document.body.classList.toggle('ct-on', on); }
}
function titleReset() { ctSrc = null; if (ctOn) { ctOn = false; document.body.classList.remove('ct-on'); } }
app.addEventListener('scroll', () => { if (!ctRaf) ctRaf = requestAnimationFrame(ctCheck); }, { passive: true });
addEventListener('resize', () => { ctH = 0; }, { passive: true });

// ---------- משיכה לרענון (מסכים עם הבר התחתון) ----------
// מאזינים פסיביים בלבד — לא חוסמים גלילה; באייפון הקפיצה הטבעית נשארת, באנדרואיד המחוון לבד
const ptr = document.createElement('div'); ptr.id = 'ptr'; ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
ptr.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>';
document.body.appendChild(ptr);
{
  const TH = 64, NOPTR = 'input,textarea,select,canvas,.mapbox,.wxmap,.leaflet-container,.sig,.sigpad,.rail,.dwrap,.scroll-x,.wxhours,.facades,[data-noptr]';
  let y0 = null, x0 = 0, decided = false, armed = false, busy = false, raf = 0, dist = 0;
  const paint = () => { raf = 0; ptr.style.transform = `translate3d(-50%,${dist}px,0) rotate(${dist * 4}deg)`; ptr.style.opacity = Math.min(1, dist / TH); };
  const hide = () => { ptr.classList.remove('armed', 'spin', 'drag'); ptr.style.transform = ''; ptr.style.opacity = ''; dist = 0; armed = false; };
  const allowed = () => document.body.classList.contains('has-nav') && !document.querySelector('.bar,.composer,.tourfs') && $('#sheet').hidden;
  app.addEventListener('touchstart', e => {
    y0 = null;
    if (busy || e.touches.length !== 1 || app.scrollTop > 0 || !allowed() || e.target.closest?.(NOPTR)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; decided = false;
  }, { passive: true });
  app.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const t = e.touches[0], dy = t.clientY - y0, dx = t.clientX - x0;
    if (!decided) { if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return; decided = true; if (dy <= 0 || Math.abs(dx) > dy) { y0 = null; return; } ptr.classList.add('drag'); }
    if (app.scrollTop > 0 || dy <= 0) { y0 = null; hide(); return; }
    dist = Math.min(TH * 1.5, dy * .5);
    const a = dist >= TH; if (a !== armed) { armed = a; ptr.classList.toggle('armed', a); if (a) haptic('light'); }
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
  const end = async e => {
    if (y0 == null) return; y0 = null; ptr.classList.remove('drag');
    if (!armed || e.type === 'touchcancel') { hide(); return; }
    busy = true; ptr.classList.add('spin'); ptr.style.transform = `translate3d(-50%,${TH}px,0)`; ptr.style.opacity = 1;
    const t0 = Date.now();
    try { await Promise.race([route(NOANIM), new Promise(r => setTimeout(r, 10000))]); } catch { /* */ }
    setTimeout(() => { hide(); busy = false; }, Math.max(0, 450 - (Date.now() - t0)));
  };
  app.addEventListener('touchend', end, { passive: true });
  app.addEventListener('touchcancel', end, { passive: true });
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
