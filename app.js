// E-Drone שטח · נקודת כניסה: כניסה, מסגרת עם ניווט תחתון, ניתוב בין המסכים.
import { sb, state, loadMe, signIn, signOut, can, isManager, flush, updateNet, $, $$, esc, initials, ROLE_HE, icon } from './lib/core.js';

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
const WITH_NAV = new Set(['', 'schedule', 'projects', 'inbox', 'menu', 'alerts', 'reports', 'equipment', 'specs', 'admin']);

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
      await boot();
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
  try { const { data } = await sb.rpc('my_inbox'); const n = (data || []).reduce((s, c) => s + (c.unread || 0), 0); const b = $('#nb'); if (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : n; } } catch {}
}

// ---------- עוד: פרופיל, מודולים נוספים, הגדרות ----------
function renderMenu() {
  const p = state.profile;
  const rows = [
    can('specs') && ['#/specs', 'clipboard', 'אפיונים', 'סיורי אפיון לפי אתר ומבנה'],
    can('equipment') && ['#/equipment', 'wrench', 'ציוד', 'צי, ציוד ותקלות'],
    isManager() && ['#/reports', 'report', 'דוחות שטח', 'כל דוחות הביצוע עם תמונות'],
    isManager() && ['#/alerts', 'alert', 'לטיפול', 'כל מה שפתוח ודורש החלטה'],
    can('admin') && ['#/admin', 'shield', 'ניהול מערכת', 'צוות, תפקידים והרשאות'],
  ].filter(Boolean);
  const th = document.documentElement.dataset.theme || '';
  app.innerHTML = `<header class="phead"><h1>עוד</h1></header>
    <div class="stack lg">
      <div class="card prof"><span class="avatar lg">${esc(initials(p.full_name))}</span><div class="grow"><b>${esc(p.full_name)}</b><small>${esc(ROLE_HE[p.role])} · ${esc(p.phone || '')}</small>
        ${p.is_pilot && p.pilot_license_expiry ? `<small class="${new Date(p.pilot_license_expiry) - Date.now() < 45 * 864e5 ? 'err' : ''}">רישיון מטיס ${esc(p.pilot_license_no || '')} · בתוקף עד ${new Date(p.pilot_license_expiry).toLocaleDateString('he-IL')}</small>` : ''}</div></div>
      ${rows.length ? `<div class="menu">${rows.map(([h, ic, t, s]) => `<a class="row" href="${h}"><span class="mic">${icon(ic, 20)}</span><span class="grow"><b>${t}</b><small>${s}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div>` : ''}
      <div class="menu"><div class="row"><span class="mic">${icon('sun', 20)}</span><span class="grow"><b>תצוגה</b></span>
        <span class="seg">${[['', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, l]) => `<button data-th="${v}" aria-pressed="${th === v}">${l}</button>`).join('')}</span></div>
        <div id="install"></div>
        <button class="row" id="so"><span class="mic">${icon('logout', 20)}</span><span class="grow"><b>יציאה מהחשבון</b></span></button></div>
      <div class="foot">E-Drone שטח · גרסה 4</div>
    </div>`;
  $$('[data-th]').forEach(c => c.onclick = () => { setTheme(c.dataset.th); renderMenu(); });
  $('#so').onclick = signOut;
  installHint();
}
function setTheme(v) { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; try { localStorage.setItem('edrone-theme', v); } catch {} }
let deferredInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; installHint(); });
function installHint() {
  const box = $('#install'); if (!box || matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  box.innerHTML = `<div class="row"><img src="icon-192.png" alt="" class="mic img"><span class="grow"><b>התקנה במסך הבית</b><small>${ios ? 'בספארי: כפתור השיתוף ← "הוסף למסך הבית"' : 'נפתחת כמו אפליקציה, גם בלי קליטה'}</small></span>${deferredInstall ? '<button class="btn primary sm" id="inst">התקנה</button>' : ''}</div>`;
  const b = $('#inst'); if (b) b.onclick = async () => { deferredInstall.prompt(); deferredInstall = null; box.innerHTML = ''; };
}

// ---------- ניתוב ----------
async function route() {
  try { await routeInner(); } catch (e) { console.error(e); app.innerHTML = `<div class="empty-card"><span><b>משהו השתבש בטעינת המסך</b><small>${esc(e.message || e)}</small></span></div><button class="btn ghost block" onclick="location.reload()">רענון</button>`; }
}
async function routeInner() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  document.querySelectorAll('.bar,.composer,.fabs').forEach(x => x.remove());
  $('#sheet').hidden = true;
  nav(WITH_NAV.has(h[0]), h[0] === 'alerts' || h[0] === 'reports' ? (isManager() ? '' : 'menu') : ['specs', 'equipment', 'admin'].includes(h[0]) ? 'menu' : h[0]);
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
    case 'day': return (await import('./modules/today.js')).renderDay(app, h[1]);
    case 'projects': if (guard('projects')) return (await import('./modules/projects.js')).renderProjects(app); return;
    case 'p': if (guard('projects')) return (await import('./modules/projects.js')).renderProject(app, h[1], h[2] || 'o'); return;
    case 'equipment': if (guard('equipment')) return (await import('./modules/equipment.js')).renderEquipment(app); return;
    case 'specs': if (guard('specs')) return (await import('./modules/specs.js')).renderSites(app); return;
    case 'site': if (guard('specs')) return (await import('./modules/specs.js')).renderSite(app, h[1], h[2] === 'chat' ? 'c' : 'b'); return;
    case 'b': if (guard('specs')) return (await import('./modules/specs.js')).renderBuilding(app, h[1], h[2]); return;
    case 'admin': if (guard('admin')) return (await import('./modules/admin.js')).renderAdmin(app); return;
    default: location.hash = '#/';
  }
}

async function boot() {
  try { const t = localStorage.getItem('edrone-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  if (!(await loadMe())) return renderLogin();
  if (!state.profile.is_active) { await sb.auth.signOut(); return renderLogin('הגישה שלך הושבתה. פנו למשרד.'); }
  addEventListener('hashchange', route);
  updateNet(); flush(); route();
}
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') renderLogin(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
