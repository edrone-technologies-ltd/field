// E-Drone שטח · נקודת כניסה: כניסה, בית לפי תפקיד, ניתוב בין מודולים.
import { sb, state, loadMe, signIn, signOut, can, flush, updateNet, $, $$, esc, initials, ROLE_HE, toast } from './lib/core.js';

const app = $('#app');
const MODS = {
  specs: { title: 'אפיונים', sub: 'סיורי אפיון לפי אתר ומבנה', href: '#/specs', icon: 'M4 4h10l6 6v10H4z M14 4v6h6' },
  admin: { title: 'ניהול מערכת', sub: 'צוות, תפקידים והרשאות', href: '#/admin', icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z' },
};
const icon = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// ---------- כניסה ----------
function renderLogin(msg = '') {
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

// ---------- בית ----------
function greeting() { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב'; }
async function renderHome() {
  const p = state.profile, first = (p.full_name || '').split(' ')[0];
  const mine = state.modules.filter(m => MODS[m]);
  app.innerHTML = `<div class="top"><img class="mark" src="mark.png" alt="E-Drone"><span class="grow"></span>
      <button class="avatar" id="me" aria-label="החשבון שלי">${esc(initials(p.full_name))}</button></div>
    <div class="hello"><div class="eyebrow">${esc(ROLE_HE[p.role])}</div><h1>${greeting()}, ${esc(first)}</h1></div>
    <div id="focus"></div>
    <div class="modules">${mine.map(k => `<button class="mod" data-h="${MODS[k].href}"><span class="ic">${icon(MODS[k].icon)}</span><b>${MODS[k].title}</b><small>${MODS[k].sub}</small><span class="badge" id="bd-${k}"></span></button>`).join('')}</div>
    ${mine.length ? '' : '<div class="empty">עדיין לא הוגדרו לך מודולים. המשרד יעדכן את ההרשאות.</div>'}
    <div id="install"></div>`;
  $$('.mod').forEach(m => m.onclick = () => location.hash = m.dataset.h);
  $('#me').onclick = renderMe;
  installHint();
  if (can('specs')) focusSpecs();
}
// מה דורש תשומת לב עכשיו: אפיונים פתוחים
async function focusSpecs() {
  try {
    const { data } = await sb.from('sites').select('name,slug,buildings(specs(status))').eq('is_active', true);
    const open = (data || []).map(s => ({ s, left: s.buildings.filter(b => (b.specs?.[0] || b.specs)?.status !== 'done').length, n: s.buildings.length })).filter(x => x.left);
    const bd = $('#bd-specs'); const tot = open.reduce((t, x) => t + x.left, 0);
    if (bd && tot) bd.innerHTML = `<span class="pill lime">${tot} פתוחים</span>`;
    if (open.length && $('#focus')) $('#focus').innerHTML = `<div class="card stack" style="gap:8px"><div class="eyebrow">ממתין לך</div>${open.map(x =>
      `<button class="item" style="border:0;padding:6px 0;background:transparent" data-s="${esc(x.s.slug)}"><span class="t"><b>${esc(x.s.name)}</b><small>${x.left} מתוך ${x.n} מבנים עוד לא אופיינו</small><span class="progress" style="margin-top:6px"><i style="width:${Math.round((x.n - x.left) / x.n * 100)}%"></i></span></span><span class="pill">פתיחה</span></button>`).join('')}</div>`;
    $$('#focus [data-s]').forEach(b => b.onclick = () => location.hash = '#/site/' + b.dataset.s);
  } catch {}
}
function renderMe() {
  const p = state.profile;
  app.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/';renderHomeAgain()">→ בית</button></div>
    <div class="stack"><div class="row"><span class="avatar" style="width:56px;height:56px;font-size:1.3rem">${esc(initials(p.full_name))}</span><div><h2>${esc(p.full_name)}</h2><div class="muted">${esc(ROLE_HE[p.role])} · ${esc(p.phone || '')}</div></div></div>
    ${p.is_pilot ? `<div class="card"><div class="eyebrow">רישיון מטיס</div><b>${esc(p.pilot_license_no || '')}</b>${p.pilot_license_expiry ? `<div class="${new Date(p.pilot_license_expiry) - Date.now() < 45 * 864e5 ? 'err' : 'muted'}">בתוקף עד ${new Date(p.pilot_license_expiry).toLocaleDateString('he-IL')}</div>` : ''}</div>` : ''}
    <div class="card"><div class="eyebrow">תצוגה</div><div class="chips" style="margin-top:8px">${[['', 'לפי הטלפון'], ['dark', 'כהה'], ['light', 'בהיר']].map(([v, l]) => `<button class="chip" data-th="${v}" aria-pressed="${(document.documentElement.dataset.theme || '') === v}">${l}</button>`).join('')}</div></div>
    <button class="btn ghost block" id="so">יציאה מהחשבון</button></div>`;
  window.renderHomeAgain = () => route();
  $$('[data-th]').forEach(c => c.onclick = () => { setTheme(c.dataset.th); renderMe(); });
  $('#so').onclick = signOut;
}
function setTheme(v) { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; try { localStorage.setItem('edrone-theme', v); } catch {} }
let deferredInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; installHint(); });
function installHint() {
  const box = $('#install'); if (!box || matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  box.innerHTML = `<div class="card row" style="margin-top:14px"><img src="icon-192.png" alt="" style="width:44px;height:44px;border-radius:11px"><div class="grow"><b>התקנה במסך הבית</b><div class="small muted">${ios ? 'בספארי: כפתור השיתוף ← "הוסף למסך הבית"' : 'פותחים כמו אפליקציה, גם בלי קליטה'}</div></div>${deferredInstall ? '<button class="btn primary" id="inst">התקנה</button>' : ''}</div>`;
  const b = $('#inst'); if (b) b.onclick = async () => { deferredInstall.prompt(); deferredInstall = null; box.innerHTML = ''; };
}

// ---------- ניתוב ----------
async function route() {
  try { await routeInner(); } catch (e) { console.error(e); app.innerHTML = `<div class="empty">משהו השתבש בטעינת המסך. נסו לרענן.</div><div class="small muted" style="text-align:center">${esc(e.message || e)}</div>`; }
}
async function routeInner() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  document.querySelectorAll('.bar,.composer').forEach(x => x.remove());
  const guard = m => { if (!can(m)) { app.innerHTML = `<div class="empty">אין לך גישה למסך הזה.</div><button class="btn ghost block" onclick="location.hash='#/'">חזרה לבית</button>`; return false; } return true; };
  if (!h[0]) return renderHome();
  if (h[0] === 'specs' && guard('specs')) return (await import('./modules/specs.js')).renderSites(app);
  if (h[0] === 'site' && guard('specs')) return (await import('./modules/specs.js')).renderSite(app, h[1], h[2] === 'chat' ? 'c' : 'b');
  if (h[0] === 'b' && guard('specs')) return (await import('./modules/specs.js')).renderBuilding(app, h[1], h[2]);
  if (h[0] === 'admin' && guard('admin')) return (await import('./modules/admin.js')).renderAdmin(app);
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
