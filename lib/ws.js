// סביבת עבודה למחשב (מסך ≥1100, מנהל תפעול ומעלה): סרגל ניווט קבוע עם מונים, חיפוש מהיר (Ctrl/⌘+K),
// רשימה + פירוט (פרויקט נפתח ליד הרשימה, יום שטח נפתח ליד לוח השיבוץ), תצוגות שמורות, ותיאור לטקסט חתוך.
// נטען רק במסך רחב — בטלפון לא נטען בכלל.
import { sb, state, can, isManager, $, $$, esc, icon, initials, ROLE_HE, replaceHash, toast, haptic } from './core.js';

let H = {};   // פעולות מהמסגרת (app.js): quickAdd, setTheme
const MINI = 'edrone-ws-mini';
const SVG = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const I_SEARCH = SVG('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4');
const I_SIDE = SVG('M3 4h18v16H3z M9 4v16');
const M = () => isManager();
// [מפתח, אייקון, שם, הרשאה, מונה]
const NAV = [
  [['', 'home', 'בית', () => true, 'needs'], ['desk', 'clipboard', 'שולחן ניהול', M, 'rep'], ['live', 'map', 'מגדל פיקוח', M], ['dispatch', 'calendar', 'לוח שיבוץ', M]],
  [['projects', 'folder', 'פרויקטים', () => can('projects')], ['specs', 'report', 'אפיונים', () => can('specs')], ['equipment', 'drone', 'ציוד', () => can('equipment')], ['purchase', 'cart', 'רכש', () => can('purchase')], ['clients', 'users', 'לקוחות', M], ['decks', 'send', 'מצגות', () => state.profile.role === 'admin']],
  [['attendance', 'team', 'נוכחות', M, 'att'], ['compliance', 'shield', 'תוקף ותעודות', M], ['expenses', 'receipt', 'הוצאות', () => can('finance'), 'exp']],
  [['inbox', 'chat', 'הודעות', () => true, 'msg'], ['kb', 'book', 'מרכז ידע', () => true], ['menu', 'settings', 'הגדרות', () => true]],
];
const ACTIVE = { ops: '', schedule: 'dispatch', today: 'dispatch', p: 'projects', site: 'specs', b: 'specs', client: 'clients', c: 'inbox', me: 'menu', day: 'dispatch', plan: 'projects', visit: 'projects', signoff: 'projects' };
const base = h => (h || '#/').replace(/^#\/?/, '').split('/')[0];

// ---------- סרגל צד ----------
export function mount(handlers) {
  H = handlers || H;
  let s = $('#side');
  if (!s) {
    s = document.createElement('nav'); s.id = 'side'; s.className = 'side'; s.setAttribute('aria-label', 'ניווט ראשי');
    document.body.appendChild(s);
    try { document.body.classList.toggle('ws-mini', localStorage.getItem(MINI) === '1'); } catch { /* */ }
    bindGlobal();
  }
  const p = state.profile || {};
  s.innerHTML = `<div class="sd-top"><img src="mark.png" alt="" width="26" height="26" class="sd-logo"><b class="sd-brand">E-Drone</b><button type="button" class="sd-col" id="sdcol" aria-label="כיווץ התפריט" title="כיווץ התפריט">${I_SIDE}</button></div>
    <button type="button" class="sd-it sd-search" id="sdk" title="חיפוש (Ctrl+K)"><span class="sd-ic">${I_SEARCH}</span><span class="sd-l">חיפוש</span><kbd>${/Mac|iP/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd></button>
    <button type="button" class="sd-it sd-new" id="sdnew" title="חדש"><span class="sd-ic">${icon('plus', 18)}</span><span class="sd-l">חדש</span></button>
    <div class="sd-list">${NAV.map(g => g.filter(x => x[3]()).map(([k, ic, t, , b]) => `<a class="sd-it" href="#/${k}" data-k="${k}" title="${esc(t)}"><span class="sd-ic">${icon(ic, 18)}</span><span class="sd-l">${esc(t)}</span>${b ? `<i class="sd-b ${b === 'msg' ? 'bad' : ''}" data-b="${b}" hidden></i>` : ''}</a>`).join('')).filter(Boolean).join('<hr>')}</div>
    <a class="sd-me" href="#/menu" title="${esc(p.full_name || '')}"><span class="avatar sm">${esc(initials(p.full_name))}</span><span class="sd-l"><b>${esc(p.full_name || '')}</b><small>${esc(ROLE_HE[p.role] || '')}</small></span></a>`;
  $('#sdcol', s).onclick = () => { const on = !document.body.classList.contains('ws-mini'); document.body.classList.toggle('ws-mini', on); try { localStorage.setItem(MINI, on ? '1' : ''); } catch { /* */ } haptic('tap'); };
  $('#sdk', s).onclick = () => palette();
  $('#sdnew', s).onclick = () => H.quickAdd?.();
  active(location.hash); badges(true);
}
export function unmount() { $('#side')?.remove(); document.body.classList.remove('ws', 'ws-mini'); closePalette(); }
export function active(h) {
  const k = base(h), a = ACTIVE[k] ?? k;
  $$('#side .sd-it[data-k]').forEach(x => { const on = x.dataset.k === a; x.classList.toggle('on', on); on ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'); });
}
// מונים: דורש טיפול · תיקונים לאישור · בקשות נוכחות · הוצאות לאישור · הודעות שלא נקראו. לכל היותר פעם בדקה
let bT = 0;
export async function badges(force = false) {
  if (!$('#side') || (!force && Date.now() - bT < 60e3)) return; bT = Date.now();
  const cnt = q => q.then(r => r.count || 0, () => 0), set = (k, n) => { const b = $(`#side [data-b="${k}"]`); if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; } };
  const me = state.user?.id;
  const jobs = {
    msg: sb.rpc('my_inbox').then(({ data }) => (data || []).reduce((s, c) => s + (c.unread || 0), 0), () => 0),
    rep: sb.rpc('repair_queue').then(({ data }) => (data || []).length, () => 0),
    att: Promise.all([cnt(sb.from('shift_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')), cnt(sb.from('absences').select('id', { count: 'exact', head: true }).eq('status', 'pending'))]).then(([a, b]) => a + b),
    exp: can('finance') ? cnt(sb.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending').neq('user_id', me)) : Promise.resolve(0),
    needs: import('../modules/attention.js').then(m => m.attentionItems()).then(L => L.filter(x => x.k !== 'push' && x.k !== 'chat' && ['bad', 'warn', 'gold'].includes(x.tone)).length, () => 0),
  };
  for (const [k, p] of Object.entries(jobs)) p.then(n => { if (k !== 'needs' || !NEEDS_DOM) set(k, n); });
}
// מסך הבית כבר ספר את "דורש טיפול" המלא (כולל שטח, תוקף ופרויקטים) — המונה בסרגל מתיישר אליו
let NEEDS_DOM = false;
export function syncNeeds() {
  [1500, 4000, 8000].forEach(ms => setTimeout(() => {
    const c = document.querySelector('#app #needs .count'); if (!c) return;
    const n = parseInt(c.textContent, 10) || 0, b = $('#side [data-b="needs"]'); if (!b) return;
    NEEDS_DOM = true; b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  }, ms));
}

// ---------- אירועים גלובליים: Ctrl/⌘+K, תיאור לטקסט חתוך, Esc לפאנל ----------
function bindGlobal() {
  addEventListener('keydown', e => {
    if (!document.body.classList.contains('ws')) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmdk') ? closePalette() : palette(); return; }
    if (e.key === 'Escape' && !$('#cmdk') && $('#sheet')?.hidden && $('#wsdr') && !e.target.closest?.('input,textarea,select')) { e.preventDefault(); closeDrawer(); }
  });
  document.addEventListener('mouseover', e => {
    if (!document.body.classList.contains('ws')) return;
    const t = e.target.closest?.('b,small,span,a,button,td,th,h1,h2,h3,h4,label'); if (!t || t.title || t.closest('#side,#cmdk,svg')) return;
    if (t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).overflow !== 'visible') t.title = t.textContent.trim().replace(/\s+/g, ' ');
  }, { passive: true });
}

// ---------- חיפוש מהיר / פקודות ----------
let IDX = null, IDXat = 0;
const nz = s => String(s || '').toLowerCase().replace(/["'׳״`\-–—.,()]/g, ' ').replace(/\s+/g, ' ').trim();
const RECENT = () => `edrone-cmdk-recent:${state.user?.id || ''}`;
const recentGet = () => { try { return JSON.parse(localStorage.getItem(RECENT()) || '[]'); } catch { return []; } };
const recentAdd = it => { try { const L = recentGet().filter(x => x.h !== it.h || x.t !== it.t); L.unshift({ g: it.g, t: it.t, s: it.s, h: it.h, ic: it.ic }); localStorage.setItem(RECENT(), JSON.stringify(L.slice(0, 6))); } catch { /* */ } };
const curProject = () => (location.hash.match(/^#\/(?:p|projects)\/([0-9a-f-]{36})/) || [])[1] || null;
function actions() {
  const A = (t, s, ic, run, kw = '') => ({ g: 'פעולות', t, s, ic, run, kw });
  const go = h => () => { location.hash = h; };
  const rep = k => async () => { const m = await import('../modules/reports.js'); m.newReport(curProject(), [], k); };
  return [
    M() && A('שיבוץ', 'לוח שיבוץ', 'calendar', go('#/dispatch'), 'dispatch שבוע צוות'),
    A('תקלה חדשה', curProject() ? 'בפרויקט הזה' : 'דיווח תקלה או אירוע', 'alert', rep('issue'), 'issue בעיה'),
    M() && A('מגדל פיקוח', 'כל השטח עכשיו', 'map', go('#/live'), 'live מפה'),
    M() && A('שולחן ניהול', 'טבלה שבועית', 'clipboard', go('#/desk'), 'desk'),
    A('סיכום היום', '', 'report', rep('daily'), 'daily'),
    A('הוצאה חדשה', '', 'receipt', go('#/expenses/new'), 'expense קבלה'),
    can('purchase') && A('בקשת רכש', '', 'cart', go('#/purchase/new'), 'purchase'),
    A('בקשה למשרד', '', 'send', go('#/requests/new'), 'request'),
    M() && A('נוכחות צוות', 'אישורים ושעות', 'team', go('#/attendance'), 'attendance שעות'),
    M() && A('תוקף ותעודות', '', 'shield', go('#/compliance'), 'compliance רישיון'),
    M() && A('עובדים', '', 'users', go('#/staff'), 'staff'),
    A('חדש…', 'דוח, תקלה, הוצאה, אפיון', 'plus', () => H.quickAdd?.(), 'new'),
    A('מצב כהה / בהיר', '', 'sun', () => { const d = matchMedia('(prefers-color-scheme: dark)').matches, t = document.documentElement.dataset.theme || (d ? 'dark' : 'light'); H.setTheme?.(t === 'dark' ? 'light' : 'dark'); }, 'theme dark light'),
    A('כיווץ / הרחבת התפריט', '', 'menu', () => $('#sdcol')?.click(), 'sidebar'),
  ].filter(Boolean);
}
async function index() {
  if (IDX && Date.now() - IDXat < 5 * 6e4) return IDX;
  const ok = q => q.then(r => r.data || [], () => []);
  const [P, U, S, E, C] = await Promise.all([
    can('projects') ? ok(sb.from('projects').select('id,name,client_name,service,status_label,monday_group,closed_summary').order('planned_from', { ascending: false, nullsFirst: false }).limit(800)) : [],
    M() ? ok(sb.from('profiles').select('id,full_name,role').eq('is_active', true).order('full_name')) : [],
    can('specs') ? ok(sb.from('sites').select('id,slug,name,address').eq('is_active', true).limit(800)) : [],
    can('equipment') ? ok(sb.from('equipment').select('id,name,kind').eq('kind', 'drone')) : [],
    M() ? ok(sb.from('clients').select('id,name').limit(800)) : [],
  ]);
  const done = p => p.monday_group === 'group_mm5052gw' || /^הסתיים|שולם/.test(p.status_label || '') || p.closed_summary;
  IDX = [
    ...P.map(p => ({ g: 'פרויקטים', t: p.name, s: [p.service, p.client_name, done(p) ? 'הסתיים' : ''].filter(Boolean).join(' · '), ic: 'folder', h: `#/p/${p.id}`, k: nz(p.name + ' ' + (p.client_name || '')), w: done(p) ? 1 : 0 })),
    ...U.map(u => ({ g: 'אנשים', t: u.full_name, s: ROLE_HE[u.role] || '', ic: 'users', h: `#/staff/${u.id}`, k: nz(u.full_name) })),
    ...S.map(x => ({ g: 'אתרים', t: x.name, s: x.address || '', ic: 'pin', h: `#/site/${x.slug || x.id}`, k: nz(x.name + ' ' + (x.address || '')) })),
    ...E.map(x => ({ g: 'רחפנים', t: x.name, s: '', ic: 'drone', h: `#/equipment/${x.id}`, k: nz(x.name) })),
    ...C.map(x => ({ g: 'לקוחות', t: x.name, s: '', ic: 'folder', h: `#/client/${x.id}`, k: nz(x.name) })),
  ];
  IDXat = Date.now(); return IDX;
}
function score(it, q, words) {
  const k = it.k ?? nz(it.t + ' ' + (it.kw || '') + ' ' + (it.s || ''));
  if (!words.every(w => k.includes(w))) return -1;
  const t = nz(it.t);
  return (t.startsWith(q) ? 0 : t.split(' ').some(x => x.startsWith(words[0])) ? 1 : 2) + (it.w || 0) * 3;
}
let PAL = null;
export function closePalette() { const c = $('#cmdk'); if (!c) return; c.remove(); PAL?.focus?.focus?.(); PAL = null; }
export async function palette() {
  if ($('#cmdk')) return;
  const box = document.createElement('div'); box.id = 'cmdk'; box.className = 'cmdk';
  box.innerHTML = `<div class="cmdk-in" role="dialog" aria-modal="true" aria-label="חיפוש מהיר"><label class="cmdk-q">${I_SEARCH}<input type="search" id="cmdq" placeholder="פרויקט, אדם, אתר, רחפן או פעולה" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdl"><kbd>Esc</kbd></label><div class="cmdk-l" id="cmdl" role="listbox"></div></div>`;
  document.body.appendChild(box);
  PAL = { focus: document.activeElement, sel: 0, L: [] };
  const inp = $('#cmdq', box), list = $('#cmdl', box);
  box.onclick = e => { if (e.target === box) closePalette(); };
  const draw = () => {
    const q = nz(inp.value), words = q.split(' ').filter(Boolean), A = actions();
    let L;
    if (!q) L = [...recentGet().map(x => ({ ...x, g: 'אחרונים' })), ...A.slice(0, 6)];
    else {
      const pool = [...A, ...(IDX || [])].map(it => [it, score(it, q, words)]).filter(([, s]) => s >= 0).sort((a, b) => a[1] - b[1]);
      const per = {}; L = pool.filter(([it]) => (per[it.g] = (per[it.g] || 0) + 1) <= (it.g === 'פעולות' ? 5 : 7)).map(([it]) => it);
      const order = ['פעולות', 'פרויקטים', 'אנשים', 'אתרים', 'לקוחות', 'רחפנים'];
      L.sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g));
      if (L[0]?.g === 'פעולות' && pool[0] && pool[0][0].g !== 'פעולות') L.sort((a, b) => (a.g === pool[0][0].g ? -1 : 0) - (b.g === pool[0][0].g ? -1 : 0));
    }
    PAL.L = L; PAL.sel = Math.min(PAL.sel, Math.max(0, L.length - 1));
    let g = '';
    list.innerHTML = L.length ? L.map((it, i) => `${it.g !== g ? `<div class="cmdk-g">${esc(g = it.g)}</div>` : ''}<button type="button" class="cmdk-it ${i === PAL.sel ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === PAL.sel}"><span class="cmdk-ic">${icon(it.ic || 'chev', 17)}</span><span class="grow"><b>${esc(it.t)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}</span>${i === PAL.sel ? '<kbd>↵</kbd>' : ''}</button>`).join('')
      : `<div class="cmdk-none">${IDX ? 'לא נמצא' : 'טוען…'}</div>`;
    list.querySelector('.cmdk-it.on')?.scrollIntoView({ block: 'nearest' });
  };
  const run = it => {
    if (!it) return; closePalette(); haptic('tap');
    if (it.run) it.run(); else if (it.h) { recentAdd(it); location.hash = it.h; }
  };
  inp.oninput = () => { PAL.sel = 0; draw(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = PAL.L.length; if (n) { PAL.sel = (PAL.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; draw(); } }
    else if (e.key === 'Enter') { e.preventDefault(); run(PAL.L[PAL.sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  };
  list.onclick = e => { const b = e.target.closest('[data-i]'); if (b) run(PAL.L[+b.dataset.i]); };
  list.onmousemove = e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== PAL.sel) { PAL.sel = +b.dataset.i; draw(); } };
  draw(); inp.focus();
  index().then(() => { if (PAL && box.isConnected) draw(); }).catch(() => {});
}

// ---------- רשימה + פירוט: פרויקטים ----------
// #/projects → הרשימה (הפרויקט עצמו — #/p/<id>, מסך מלא)
export async function projectsMD(app, id, tab) {
  // פרויקט = מסך אחד גם במחשב, בלי חלונית צד (אביחי 18/10). קישור ישן #/projects/<id> → #/p/<id>
  if (id) { replaceHash(`#/p/${id}${tab && !['o', 'sch'].includes(tab) ? '/' + tab : ''}`); return; }
  app.innerHTML = `<div id="mdl"></div>`;
  const m = await import('../modules/projects.js'), mdl = $('#mdl');
  const pr = m.renderProjects(mdl);
  // תצוגות שמורות: חיפוש + לשונית
  const vb = document.createElement('div'); mdl.querySelector('.phead')?.after(vb);
  import('./views.js').then(V => V.viewsBar(vb, 'projects', {
    get: () => ({ q: ($('#pq')?.value || '').trim(), f: $('#pf [aria-selected="true"]')?.dataset.f || 'a' }),
    apply: v => { const q = $('#pq'); if (q) q.value = v.q || ''; const b = $(`#pf [data-f="${v.f || 'a'}"]`) || $('#pf [data-f="a"]'); b ? b.click() : q?.dispatchEvent(new Event('input')); },
  })).then(bar => { mdl.addEventListener('input', () => bar.refresh()); mdl.addEventListener('click', e => { if (e.target.closest('#pf')) setTimeout(() => bar.refresh(), 0); }); });
  await pr;
}
// ---------- מעבר בלי לטעון את הרשימה מחדש ----------
// true = רק הפאנל משתנה (אותה רשימה כבר במסך)
export function paneOnly(prev, cur) {
  const a = (prev || '').split('/'), b = (cur || '').split('/');
  if (a[1] === 'dispatch' && b[1] === 'dispatch' && $('#app > :not(#wsdr)') && (a[2] || '') === (b[2] || '') && (b[3] === 'd' || a[3] === 'd')) return true;
  return false;
}
export async function paneUpdate(cur) {
  const b = cur.split('/');
  if (b[1] === 'dispatch') return b[3] === 'd' && b[4] ? drawerDay(b[4], b[2] || '') : closeDrawer(true);
}
// לוח השיבוץ → יום שטח: נפתח במגירה ליד הלוח (#/dispatch/<שבוע>/d/<יום>)
export function dayPeek(prev, cur) {
  const m = /^#\/day\/([0-9a-f-]{36})$/.exec(cur || ''), a = (prev || '').split('/');
  if (!m || a[1] !== 'dispatch' || a[3] === 'd' && a[4] === m[1]) return null;
  return `#/dispatch/${a[2] || ''}/d/${m[1]}`;
}
let drTok = 0;
export async function drawerDay(id, wk) {
  let d = $('#wsdr');
  if (!d) {
    d = document.createElement('aside'); d.id = 'wsdr'; d.className = 'wsdr in'; d.setAttribute('aria-label', 'יום שטח');
    $('#app').appendChild(d); setTimeout(() => d.classList.remove('in'), 220);
    document.body.classList.add('dr-open');
  }
  d.dataset.wk = wk;
  if (d.dataset.id === id) return;
  const my = ++drTok; d.dataset.id = id;
  d.innerHTML = `<div class="md-ph"><a class="btn ghost sm" href="#/day/${id}" data-hard="1">מסך מלא</a><button type="button" class="dkic" data-drx aria-label="סגירה">${icon('x', 18)}</button></div><div id="wsdrb" class="wsdrb"></div>`;
  d.querySelector('[data-drx]').onclick = () => closeDrawer();
  try { await (await import('../modules/today.js')).renderDay($('#wsdrb', d), id); } catch (e) { if (my === drTok) $('#wsdrb', d).innerHTML = `<div class="empty-line">היום לא נטען</div>`; console.error(e); }
}
export function closeDrawer(fromRoute = false) {
  const d = $('#wsdr'); if (!d) return;
  const wk = d.dataset.wk || '';
  d.remove(); document.body.classList.remove('dr-open'); document.querySelectorAll('body > .bar').forEach(x => x.remove());
  if (!fromRoute) replaceHash(`#/dispatch/${wk}`, false);
}
