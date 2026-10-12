// שולחן ניהול (#/desk, מנהל תפעול ומעלה): המבט הרחב למחשב — שורה לכל פרויקט פעיל בשבוע, וכל מספר נפתח בפאנל צד
// עם הפריטים עצמם ותיקון בלחיצה (ניהול יום, אישור תיקון, "טופל", "סופק", סימון מוכנות). מטריצת התקדמות לפי חזית.
// המצב (שבוע, מסננים, מיון, פריט פתוח) בכתובת — קישור פותח בדיוק את אותו מקום. j/k שורות · Enter פאנל · Esc סגירה · / חיפוש.
// קריאה אחת לשרת (desk_week, db/121) + תחזית. בלי כסף.
import { sb, state, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, toast, sheet, timeAgo, shortName, backBtn, stLabel, replaceHash, nf } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const sunday = s => addDays(s, -new Date(s + 'T12:00:00').getDay());
const first = n => String(n || '').split(' ')[0];
const sd = d => `${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}`;
const ST = { planned: 'מתוכנן', en_route: 'בדרך', on_site: 'באתר', working: 'בעבודה', issue: 'תקלה', done: 'נסגר' };
const KIND = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'תקלה' };
const WXW = ['טוב לטיסה', 'גבולי', 'לא לטוס'];
const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
const COLS = [
  ['days', 'ימי שטח'], ['crew', 'ימי אדם'], ['m2', 'מ״ר'], ['prog', 'התקדמות'], ['ready', 'מוכנות'],
  ['iss', 'תקלות וחוסרים'], ['rep', 'תיקונים לאישור'], ['rt', 'זמן תיקון ממוצע'], ['unc', 'לא נסגרו'], ['next', 'יום שטח הבא'], ['visit', 'ביקור מנהל אחרון'], ['wx', 'מזג אוויר'],
];
// זמן תיקון: שעות → "5 ש׳" / "2.5 ימים"
const dur = h => h == null ? '' : h < 48 ? `${Math.round(h)} ש׳` : `${Math.round(h / 24 * 10) / 10} ימים`;
const CT = Object.fromEntries([...COLS, ['all', 'הכל'], ['z', 'חזית']]);
let D = null;   // המסך הפתוח

// ---------- מצב בכתובת ----------
const DEF = { w: '', tab: 't', svc: '', lead: '', st: '', q: '', sort: 'next', dir: '1', sel: '', closed: '' };
function parse(qs) { const u = new URLSearchParams(qs || ''), S = { ...DEF }; for (const k in DEF) if (u.has(k)) S[k] = u.get(k); if (!/^\d{4}-\d\d-\d\d$/.test(S.w)) S.w = sunday(isoDay()); else S.w = sunday(S.w); return S; }
function push() {
  const u = new URLSearchParams(); for (const k in DEF) if (D.S[k] && D.S[k] !== DEF[k] && !(k === 'w' && D.S.w === sunday(isoDay()))) u.set(k, D.S[k]);
  const s = u.toString(); replaceHash('#/desk' + (s ? '/' + s : ''), false);
  D.vb?.refresh();
}
// תצוגה שמורה: מחילים במקום (בלי לטעון מחדש), השבוע הנוכחי נשאר
const VK = ['tab', 'svc', 'lead', 'st', 'q', 'sort', 'dir', 'closed'];
function applyView(v) {
  for (const k of VK) D.S[k] = v[k] || DEF[k];
  D.S.sel = ''; D.cur = -1;
  const q = $('#dkq', D.el); if (q) q.value = D.S.q;
  $$('[data-tab]', D.el).forEach(x => x.setAttribute('aria-pressed', x.dataset.tab === D.S.tab));
  $('#dkcl', D.el)?.setAttribute('aria-pressed', !!D.S.closed);
  push(); if (D.data) { prep(); draw(); }
}

export async function renderDesk(el, qs = '') {
  if (!isManager()) { el.innerHTML = `<header class="phead">${backBtn('#/')}</header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>למנהל תפעול ומעלה</b></span></div>`; return; }
  const S = parse(qs), prevCache = D?.cache;
  D = { el, S, cache: prevCache || new Map(), wx: D?.wx || {}, rows: [], view: [], cur: -1 };
  el.innerHTML = `<div class="dk" id="dk">
    <header class="dkh">${backBtn('#/')}<h1 class="grow">שולחן ניהול</h1>
      <div class="dkwk" role="group" aria-label="שבוע"><button type="button" class="dkic" id="dkprev" aria-label="שבוע קודם">‹</button><button type="button" class="dkwl" id="dkthis"></button><button type="button" class="dkic" id="dknext" aria-label="שבוע הבא">›</button></div>
      <span class="seg dktab">${[['t', 'שבוע'], ['m', 'התקדמות לפי חזית']].map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${l}</button>`).join('')}</span>
      ${state.modules?.includes('finance') || state.profile?.role === 'admin' ? `<a class="btn ghost sm" href="#/costs/${S.w}">${icon('cash', 16)} עלויות</a>` : ''}<!-- כספים בלבד (costs.js, db/129) -->
      <button type="button" class="btn primary sm wzbtn" id="dkwz">${icon('star', 16)} הקוסם</button></header>
    <div class="dkbar"><label class="dkq">${icon('clipboard', 16)}<input type="search" id="dkq" placeholder="חיפוש" value="${esc(S.q)}" autocomplete="off"><kbd>/</kbd></label>
      <select id="dksvc" aria-label="שירות"></select><select id="dklead" aria-label="ראש צוות"></select><select id="dkst" aria-label="סטטוס"></select>
      <button type="button" class="chip dkcl" id="dkcl" aria-pressed="${!!S.closed}">כולל סגורים</button><div id="dkv" hidden></div></div>
    <div class="dkk" id="dkk"></div>
    <div class="dkw" id="dkw">${skeleton()}</div>
    <aside class="dkp" id="dkp" hidden aria-label="פירוט"></aside>
  </div>`;
  const go = n => { D.S.w = addDays(D.S.w, n * 7); D.S.sel = ''; push(); load(); };
  $('#dkwz', el).onclick = () => { location.hash = '#/wizard/' + D.S.w; };
  $('#dkprev', el).onclick = () => go(-1); $('#dknext', el).onclick = () => go(1);
  $('#dkthis', el).onclick = () => { if (D.S.w !== sunday(isoDay())) { D.S.w = sunday(isoDay()); push(); load(); } };
  $$('[data-tab]', el).forEach(b => b.onclick = () => { D.S.tab = b.dataset.tab; $$('[data-tab]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); D.cur = -1; push(); draw(); });
  let qt = 0; $('#dkq', el).oninput = e => { clearTimeout(qt); qt = setTimeout(() => { D.S.q = e.target.value.trim(); push(); draw(); }, 120); };
  [['#dksvc', 'svc'], ['#dklead', 'lead'], ['#dkst', 'st']].forEach(([id, k]) => $(id, el).onchange = e => { D.S[k] = e.target.value; push(); draw(); });
  $('#dkcl', el).onclick = e => { D.S.closed = D.S.closed ? '' : '1'; e.currentTarget.setAttribute('aria-pressed', !!D.S.closed); push(); draw(); };
  D.el = $('#dk', el); D.el.addEventListener('click', onClick);
  // תצוגות שמורות: סינון + מיון + לשונית, בשם, לכל משתמש. Alt+1…9 מעבר מהיר
  import('../lib/views.js').then(V => { if (D?.el.isConnected) D.vb = V.viewsBar($('#dkv', D.el), 'desk', { get: () => Object.fromEntries(VK.map(k => [k, D.S[k] === DEF[k] ? '' : D.S[k]])), apply: applyView }); }).catch(() => {});
  await load();
}
function skeleton() { return `<div class="dksk">${'<i></i>'.repeat(7)}</div>`; }

// מה שכבר נטען מוצג מיד, והגרסה העדכנית מחליפה אותו (גם אחרי פעולה בגיליון שמרענן את המסך)
async function load() {
  const my = D, w = D.S.w;
  if (D.cache.has(w)) { D.data = D.cache.get(w); prep(); draw(); } else { D.data = null; $('#dkw', D.el).innerHTML = skeleton(); }
  // זמן תיקון ממוצע + ביקור מנהל אחרון (desk_extra, db/128) — לא תלוי בשבוע; נטען במקביל
  if (!D.ex) sb.rpc('desk_extra').then(({ data: x }) => { if (my === D && x) { D.ex = x; if (D.data) { prep(); draw(); } } }, () => {});
  const { data, error } = await sb.rpc('desk_week', { w });
  if (my !== D) return;
  if (error) { $('#dkw', D.el).innerHTML = `<div class="empty-card"><span class="ei">${icon('alert', 26)}</span><span><b>הנתונים לא נטענו</b><small>${esc(errText(error, 'נסו שוב'))}</small></span></div>`; return; }
  if (D.S.w !== w) return;
  D.cache.set(w, data); D.data = data; prep(); draw(); weather();
}
const reload = () => { if (D?.el.isConnected) { D.ex = null; load(); } };

// ---------- חישוב לכל פרויקט ----------
const zkey = z => z.b + '|' + z.k;
const zlab = z => z.k === 'all' ? 'כל החזיתות' : String(z.t || '').replace(/^חזית /, '');
function prep() {
  const t = D.data.today;
  D.rows = (D.data.rows || []).map(r => {
    const days = r.days || [], done = days.filter(d => d.status === 'done' || d.closed);
    const ppl = d => [...new Set([d.lead, ...(d.crew || []).filter(c => !c.no).map(c => c.u)].filter(Boolean))];
    const m2 = days.reduce((s, d) => s + (Array.isArray(d.zones) ? d.zones.reduce((a, z) => a + Number(z.m2 || 0), 0) : 0), 0);
    const zn = days.reduce((s, d) => s + (Array.isArray(d.zones) ? d.zones.length : 0), 0);
    const Z = r.zones || [], dn = new Map((r.zdone || []).map(x => [zkey(x), x])), area = Z.length && Z.every(z => z.m2);
    const tot = area ? Z.reduce((s, z) => s + Number(z.m2), 0) : Z.length, got = area ? Z.filter(z => dn.has(zkey(z))).reduce((s, z) => s + Number(z.m2), 0) : Z.filter(z => dn.has(zkey(z))).length;
    const rd = r.ready, items = rd?.items || [];
    const open = x => x.status === 'open';
    return { ...r, short: shortName(r.name) || r.name, st: stLabel(r.status || ''), days, done: done.length, crewDays: days.reduce((s, d) => s + ppl(d).length, 0),
      m2, zn, dn, prog: tot && got ? Math.round(got / tot * 100) : null,   /* בלי חזית שנרשמה — '—' ולא 0% מטעה */ area, tot, got,
      rdy: rd ? { ok: rd.ok, n: rd.n, bad: items.some(i => i.bad), items, up: rd.up || [] } : null,
      iss: (r.issues || []).filter(open).length + (r.missing || []).filter(open).length, crit: (r.issues || []).some(i => open(i) && i.sev === 'critical'),
      pend: (r.repairs || []).filter(x => x.review === 'pending' && x.status === 'in_progress'),
      ropen: (r.repairs || []).filter(x => !['done', 'dropped'].includes(x.status)),
      unc: r.unclosed || [], leads: [...new Set(days.map(d => d.lead).filter(Boolean))],
      wxDays: days.filter(d => d.status === 'planned' && d.day >= t),
      rt: D.ex?.rt?.[r.id] || null, lv: r.site_id ? D.ex?.visit?.[r.site_id] || null : null,
      lvDays: r.site_id && D.ex?.visit?.[r.site_id] ? Math.round((new Date(t + 'T12:00') - new Date(D.ex.visit[r.site_id].day + 'T12:00')) / 864e5) : null };
  });
  // אפשרויות המסננים — מה שקיים בשבוע הזה
  const opt = (id, all, vals, cur) => { const s = $(id, D.el); if (!s) return; s.innerHTML = `<option value="">${all}</option>` + vals.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join(''); s.classList.toggle('on', !!cur); };
  const uniq = a => [...new Map(a.filter(x => x[0]).map(x => [x[0], x])).values()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
  opt('#dksvc', 'כל השירותים', uniq(D.rows.map(r => [r.service, r.service])), D.S.svc);
  opt('#dklead', 'כל ראשי הצוות', uniq(D.rows.flatMap(r => r.days.map(d => [d.lead, d.lead_name || '']))), D.S.lead);
  opt('#dkst', 'כל הסטטוסים', uniq(D.rows.map(r => [r.st, r.st])), D.S.st);
  const a = D.S.w, b = addDays(a, 6), wl = $('#dkthis', D.el);
  if (wl) { wl.innerHTML = `<b dir="ltr">${+a.slice(8)}${a.slice(5, 7) !== b.slice(5, 7) ? '.' + +a.slice(5, 7) : ''}–${dm(b)}</b><small>${a === sunday(t) ? 'השבוע' : a > t ? 'שבוע הבא' + (a > addDays(sunday(t), 7) ? 'ים' : '') : 'שבוע קודם'}</small>`; }
}
function wxLevel(r) {
  const W = D.wx[r.id]; let L = null, worst = null;
  for (const d of r.wxDays) { const x = W?.[d.day]; const l = Math.max(d.wx ? 2 : 0, x?.L ?? (d.wx ? 2 : -1)); if (l > (L ?? -1)) { L = l; worst = d; } }
  return { L: L < 0 ? null : L, d: worst };
}
async function weather() {
  const my = D, S = D.rows.filter(r => r.lat && r.lng && r.wxDays.length).map(r => ({ id: r.id, lat: r.lat, lng: r.lng }));
  if (!S.length) return;
  try { const m = await import('../lib/wx.js'); const W = await m.siteDays(S); if (my !== D) return; Object.assign(D.wx, W); draw(); } catch { /* בלי תחזית — רק התראת השרת */ }
}

// ---------- סינון ומיון ----------
const VAL = {
  name: r => r.short, days: r => r.days.length * 100 + r.done, crew: r => r.crewDays, m2: r => r.m2 || r.zn / 1000, prog: r => r.prog ?? -1,
  ready: r => r.rdy ? r.rdy.ok / (r.rdy.n || 1) : 2, iss: r => r.iss, rep: r => r.pend.length, unc: r => r.unc.length,
  rt: r => r.rt?.avg_h ?? -1, visit: r => r.lvDays ?? (r.site_id ? 1e5 : -1),
  next: r => r.next?.day || '9999', wx: r => wxLevel(r).L ?? -1,
};
function view() {
  const S = D.S, q = S.q.toLowerCase();
  let R = D.rows.filter(r => (!S.svc || r.service === S.svc) && (!S.st || r.st === S.st) && (!S.lead || r.leads.includes(S.lead))
    && (!q || [r.name, r.service, r.st, ...r.days.map(d => d.lead_name)].join(' ').toLowerCase().includes(q)));
  // פתוח בלבד: פרויקט בלי שום דבר פתוח השבוע (בלי ימים, מוכנות, תקלות, תיקונים, ימים פתוחים או יום הבא) — מוסתר
  if (!S.closed) R = R.filter(r => r.days.length || r.rdy || r.iss || r.ropen.length || r.unc.length || r.next || (r.prog != null && r.prog < 100 && r.dn.size));
  const f = VAL[S.sort] || VAL.next, dir = S.dir === '-1' ? -1 : 1;
  return R.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.short.localeCompare(b.short, 'he'); });
}

// ---------- ציור ----------
function draw() {
  if (!D?.data || !D.el.isConnected) return;
  D.view = view();
  kpis();
  const w = $('#dkw', D.el);
  w.innerHTML = D.S.tab === 'm' ? matrix() : table();
  if (D.cur >= 0) mark();
  panel();
  fit();
}
function fit() { const w = D?.el.isConnected && $('#dkw', D.el); if (!w) return; const top = w.getBoundingClientRect().top; w.style.maxHeight = Math.max(320, innerHeight - top - 14) + 'px'; }
const num = (v, tone = '', sub = '') => `<b class="dkn ${v ? tone : 'z'}">${v ? v : '–'}</b>${sub ? `<small>${sub}</small>` : ''}`;
function cell(r, k) {
  switch (k) {
    case 'days': return r.days.length ? `<b class="dkn ${r.done === r.days.length ? 'ok' : ''}">${r.done}/${r.days.length}</b>` : num(0);
    case 'crew': return num(r.crewDays);
    case 'm2': return r.m2 ? num(nf(Math.round(r.m2))) : r.zn ? num(r.zn, '', 'חזיתות') : num(0);
    case 'prog': return r.prog == null ? num(0) : `<span class="dkpr"><b class="dkn">${r.prog}%</b><i><s style="width:${r.prog}%"></s></i></span>`;
    case 'ready': return r.rdy ? `<b class="dkn ${r.rdy.bad ? 'bad' : r.rdy.ok < r.rdy.n ? 'warn' : 'ok'}">${r.rdy.ok}/${r.rdy.n}</b>` : num(0);
    case 'iss': return num(r.iss, r.crit ? 'bad' : 'warn');
    case 'rep': return num(r.pend.length, 'warn', r.ropen.length > r.pend.length ? `${r.ropen.length - r.pend.length} פתוחים` : '');
    case 'unc': return num(r.unc.length, 'bad');
    case 'rt': return r.rt ? `<b class="dkn ${r.rt.avg_h > 72 ? 'bad' : r.rt.avg_h > 24 ? 'warn' : 'ok'}">${dur(r.rt.avg_h)}</b><small>${r.rt.n} תיקונים</small>` : num(0);
    case 'visit': return r.lv ? `<b class="dkn ${r.lvDays > 30 ? 'bad' : ''}">${r.lvDays <= 0 ? 'היום' : r.lvDays === 1 ? 'אתמול' : `לפני ${r.lvDays} ימים`}</b><small>${esc(first(r.lv.by))}</small>` : r.site_id ? '<b class="dkn muted">אף פעם</b>' : num(0);
    case 'next': return r.next ? `<b class="dkn ${r.next.day === D.data.today ? 'lime' : ''}">${r.next.day === D.data.today ? 'היום' : sd(r.next.day)}</b><small>${esc(first(r.next.lead_name) || 'בלי ראש צוות')}</small>` : num(0);
    case 'wx': { const { L, d } = wxLevel(r); return L == null ? num(0) : `<span class="pill ${['ok', 'warn', 'bad'][L]}">${WXW[L]}</span>${L && d ? `<small>${sd(d.day)}</small>` : ''}`; }
  }
  return '';
}
function table() {
  if (!D.view.length) return empty();
  const S = D.S, ar = k => S.sort === k ? `<i class="dkar">${S.dir === '-1' ? '↓' : '↑'}</i>` : '';
  const th = (k, l) => `<th scope="col" aria-sort="${S.sort === k ? (S.dir === '-1' ? 'descending' : 'ascending') : 'none'}"><button type="button" data-sort="${k}">${l}${ar(k)}</button></th>`;
  return `<table class="dkt"><thead><tr>${th('name', 'פרויקט')}${COLS.map(([k, l]) => th(k, l)).join('')}</tr></thead>
    <tbody>${D.view.map((r, i) => `<tr data-p="${r.id}" data-i="${i}"><th scope="row"><button type="button" class="dkname" data-c="${r.id}~all"><b>${esc(r.short)}</b><small>${esc([r.service, r.st].filter(Boolean).join(' · '))}</small></button></th>
      ${COLS.map(([k]) => `<td><button type="button" class="dkc" data-c="${r.id}~${k}" aria-label="${esc(CT[k] + ' · ' + r.short)}">${cell(r, k)}</button></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function empty() { return `<div class="empty-card ok"><span class="ei">${icon('check', 26)}</span><span><b>${D.S.q || D.S.svc || D.S.lead || D.S.st ? 'אין פרויקטים שמתאימים' : 'אין פרויקטים פתוחים בשבוע הזה'}</b>${D.S.closed ? '' : '<small>"כולל סגורים" מציג את כל השאר</small>'}</span></div>`; }
function kpis() {
  const V = D.view, s = f => V.reduce((a, r) => a + f(r), 0);
  const K = [['days', 'ימי שטח', `${s(r => r.done)}/${s(r => r.days.length)}`, ''], ['crew', 'ימי אדם', s(r => r.crewDays), ''], ['m2', 'מ״ר השבוע', nf(Math.round(s(r => r.m2))), ''],
    ['rep', 'תיקונים לאישור', s(r => r.pend.length), 'warn'], ['iss', 'תקלות וחוסרים', s(r => r.iss), V.some(r => r.crit) ? 'bad' : 'warn'], ['unc', 'ימים שלא נסגרו', s(r => r.unc.length), 'bad']];
  $('#dkk', D.el).innerHTML = K.map(([k, l, v, tone]) => `<button type="button" class="dkkp ${v && v !== '0/0' && v !== '0' ? tone : ''}" data-c="*~${k}"><b>${v}</b><span>${l}</span></button>`).join('');
}

// ---------- מטריצת התקדמות: מבנה × חזית ----------
function matrix() {
  const R = D.view.filter(r => (r.zones || []).length);
  if (!R.length) return D.view.length ? `<div class="empty-card"><span class="ei">${icon('clipboard', 26)}</span><span><b>אין עדיין חזיתות מהאפיון</b><small>החזיתות נכנסות מהאפיון של כל אתר</small></span></div>` : empty();
  const cols = []; R.forEach(r => r.zones.forEach(z => { const l = zlab(z); if (!cols.includes(l)) cols.push(l); }));
  const o = l => { const i = DIRS.indexOf(l); return l === 'כל החזיתות' ? 99 : i >= 0 ? i : 50; };
  cols.sort((a, b) => o(a) - o(b) || a.localeCompare(b, 'he'));
  const open = x => !['done', 'dropped'].includes(x.status);
  let i = 0;
  const body = R.map(r => {
    const B = []; r.zones.forEach(z => { let b = B.find(x => x.id === z.b); if (!b) B.push(b = { id: z.b, name: z.bn, z: [] }); b.z.push(z); });
    const rep = (r.repairs || []).filter(open), noB = rep.filter(x => !x.b).length;
    return `<tr class="dkmp"><th scope="rowgroup" colspan="${cols.length + 1}"><button type="button" data-c="${r.id}~prog"><b>${esc(r.short)}</b><span class="dkpr"><b>${r.prog ?? 0}%</b><i><s style="width:${r.prog ?? 0}%"></s></i></span>${noB ? `<span class="dkbadge">⚠ ${noB}</span>` : ''}</button></th></tr>`
      + B.map(b => {
        const bRep = rep.filter(x => x.b === b.id), loose = bRep.filter(x => !(x.f || []).length).length;
        return `<tr data-p="${r.id}" data-i="${i++}"><th scope="row"><button type="button" class="dkname" data-c="${r.id}~prog"><b>${esc(b.name || 'מבנה')}</b>${loose ? `<span class="dkbadge">⚠ ${loose}</span>` : ''}</button></th>
          ${cols.map(l => { const z = b.z.find(x => zlab(x) === l); if (!z) return '<td class="dkx"></td>';
            const d = r.dn.get(zkey(z)), part = !d && (r.zpart || []).some(p => p.b === z.b && (!(p.f || []).length || (z.dir && p.f.includes(z.dir))));
            const n = bRep.filter(x => (x.f || []).length && z.dir && x.f.includes(z.dir)).length + (z.k === 'all' ? loose : 0);
            return `<td><button type="button" class="dkz ${d ? 'on' : part ? 'part' : ''}" data-c="${r.id}~z~${z.b}~${encodeURIComponent(z.k)}" aria-label="${esc(b.name + ' · ' + l + ' · ' + (d ? 'נשטף' : part ? 'חלקי' : 'לא נשטף'))}">
              <span>${d ? icon('check', 14) + dm(d.day) : part ? 'חלקי' : ''}</span>${z.m2 ? `<small>${nf(Math.round(z.m2))}</small>` : ''}${n ? `<em class="dkbadge">⚠ ${n}</em>` : ''}</button></td>`; }).join('')}</tr>`;
      }).join('');
  }).join('');
  return `<table class="dkt dkm"><thead><tr><th scope="col"><span>מבנה</span></th>${cols.map(l => `<th scope="col"><span>${esc(l)}</span></th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
    <div class="dkleg"><span><i class="on"></i>נשטף</span><span><i class="part"></i>חלקי</span><span><i></i>לא נשטף</span><span><em class="dkbadge">⚠</em>פריטי תיקון פתוחים</span></div>`;
}

// ---------- פאנל צד ----------
function open(sel) { D.S.sel = sel; push(); panel(); }
function close() { if (!D.S.sel) return; D.S.sel = ''; push(); panel(); }
function panel() {
  const p = $('#dkp', D.el); if (!p) return;
  $$('.dkc.sel,.dkname.sel,.dkz.sel,.dkkp.sel', D.el).forEach(x => x.classList.remove('sel'));
  if (!D.S.sel) { if (!p.hidden) { p.classList.add('out'); setTimeout(() => { if (!D.S.sel) { p.hidden = true; p.classList.remove('out'); delete p.dataset.proj; D.el.classList.remove('dkwide'); } }, 160); } document.body.classList.remove('dk-open'); return; }
  const [pid, k, b, zk] = D.S.sel.split('~');
  if (k === 'proj') return projPanel(p, pid);
  delete p.dataset.proj; D.el.classList.remove('dkwide');
  const R = pid === '*' ? D.view : D.rows.filter(r => r.id === pid);
  if (!R.length) { D.S.sel = ''; push(); p.hidden = true; return; }
  { const c = $(`[data-c="${CSS.escape(D.S.sel)}"]`, D.el); if (c) { c.classList.add('sel'); if (p.hidden) requestAnimationFrame(() => c.scrollIntoView({ block: 'nearest', inline: 'nearest' })); } }
  const r = R[0], zone = k === 'z' ? (r.zones || []).find(z => z.b === b && z.k === decodeURIComponent(zk || '')) : null;
  const title = pid === '*' ? CT[k] : r.short, sub = pid === '*' ? `${R.length} פרויקטים · ${dm(D.S.w)}–${dm(addDays(D.S.w, 6))}` : k === 'z' && zone ? `${zone.bn} · ${zlab(zone)}` : CT[k] === 'הכל' ? [r.service, r.st].filter(Boolean).join(' · ') : CT[k];
  const body = pid === '*' ? R.map(x => { const h = sec(k, x); return h ? `<section class="dkps"><h4><button type="button" class="dkpl" data-c="${x.id}~all">${esc(x.short)}</button></h4>${h}</section>` : ''; }).join('') || none(k)
    : k === 'all' ? all(r) : k === 'z' ? zoneSec(r, zone) : sec(k, r) || none(k);
  p.innerHTML = `<header class="dkph"><div class="grow"><h3>${esc(title)}</h3><small>${esc(sub)}</small></div>
      ${pid !== '*' ? `<button type="button" class="btn ghost sm" data-c="${r.id}~proj">לפרויקט</button>` : ''}<button type="button" class="dkic" id="dkx" aria-label="סגירה">${icon('x', 18)}</button></header>
    <div class="dkpb">${body}</div>`;
  const was = p.hidden; p.hidden = false; p.classList.remove('out'); if (was) { p.classList.add('in'); setTimeout(() => p.classList.remove('in'), 220); }
  document.body.classList.add('dk-open');
  $('#dkx', p).onclick = close;
  // חוסרים: סימון כמה בבת אחת ו"סופק N" (מסך רחב) — אותו עדכון כמו לחיצה על "סופק"
  if (k === 'iss' && $('[data-bk]', p)) import('../lib/bulk.js').then(B => B.bulk($('.dkpb', p), { label: n => `סופק ${n}`, busy: 'מסמן', min: 2,
    run: async ids => { const { error } = await sb.from('missing_items').update({ status: 'handled' }).in('id', ids); return error ? [error] : []; }, after: reload })).catch(() => {});
}
// הפרויקט עצמו בפאנל רחב, ליד הטבלה (sel=<id>~proj בכתובת) — בלי לעזוב את השולחן
async function projPanel(p, pid) {
  const r = D.rows.find(x => x.id === pid);
  D.el.classList.add('dkwide'); document.body.classList.add('dk-open');
  $$('.dkname.sel', D.el).forEach(x => x.classList.remove('sel'));
  $(`[data-c="${CSS.escape(pid + '~all')}"]`, D.el)?.classList.add('sel');
  const was = p.hidden; p.hidden = false; p.classList.remove('out'); if (was) { p.classList.add('in'); setTimeout(() => p.classList.remove('in'), 220); }
  if (p.dataset.proj === pid) return;
  p.dataset.proj = pid;
  p.innerHTML = `<header class="dkph"><button type="button" class="btn ghost sm" data-c="${pid}~all">סיכום</button><div class="grow"><h3>${esc(r?.short || 'פרויקט')}</h3>${r ? `<small>${esc([r.service, r.st].filter(Boolean).join(' · '))}</small>` : ''}</div>
      <a class="btn ghost sm" href="#/p/${pid}">מסך מלא</a><button type="button" class="dkic" id="dkx" aria-label="סגירה">${icon('x', 18)}</button></header>
    <div class="dkpb dkpp" id="dkpp"></div>`;
  $('#dkx', p).onclick = close;
  const box = $('#dkpp', p);
  // לשונית בתוך הפרויקט כותבת #/p/… — מחזירים את כתובת השולחן
  box.addEventListener('click', e => { if (e.target.closest('#pt button')) setTimeout(() => { if (D?.S.sel === pid + '~proj') push(); }, 0); }, true);
  try { await (await import('./projects.js')).renderProject(box, pid, 'o'); } catch { box.innerHTML = `<div class="empty-line">הפרויקט לא נטען</div>`; }
  if (D?.el.isConnected && D.S.sel === pid + '~proj' && !/^#\/desk/.test(location.hash)) push();
}
const none = k => `<div class="dkok">${icon('check', 18)}<span>${{ iss: 'אין תקלות או חוסרים פתוחים', rep: 'אין תיקונים שממתינים לאישור', unc: 'כל הימים נסגרו', ready: 'אין ימים מתוכננים קדימה', next: 'אין יום שטח מתוכנן', wx: 'אין ימים מתוכננים בתחזית', days: 'אין ימי שטח בשבוע', crew: 'אין ימי שטח בשבוע', m2: 'עוד לא סומנו חזיתות השבוע', prog: 'אין חזיתות מהאפיון', rt: 'עוד אין תיקונים שאושרו', visit: 'עוד לא נרשם ביקור מנהל באתר' }[k] || 'אין פריטים'}</span></div>`;
function all(r) {
  const order = ['ready', 'iss', 'rep', 'rt', 'unc', 'next', 'visit', 'wx', 'days', 'prog'];
  return order.map(k => { const h = sec(k, r); return h ? `<section class="dkps"><h4>${CT[k]}</h4>${h}</section>` : ''; }).join('') || none('');
}
const dayBtn = (id, label = 'ניהול') => `<button type="button" class="btn ghost sm" data-da="${id}">${label}</button>`;
const row = (main, small, act = '', tone = '', attr = '') => `<div class="dkr ${tone}"${attr}><span class="grow"><b>${main}</b>${small ? `<small>${small}</small>` : ''}</span>${act}</div>`;
function sec(k, r) {
  const C = !!D.S.closed, t = D.data.today;
  switch (k) {
    case 'days': return r.days.map(d => row(`${sd(d.day)} · ${ST[d.status] || d.status}`, esc([first(d.lead_name) || 'בלי ראש צוות', `${(d.crew || []).length} בצוות`, Array.isArray(d.zones) && d.zones.length ? d.zones.length + ' חזיתות' : ''].filter(Boolean).join(' · ')),
      d.status === 'done' || d.closed ? `<a class="btn ghost sm" href="#/day/${d.id}">הדוח</a>` : dayBtn(d.id), d.status === 'done' || d.closed ? 'ok' : '')).join('');
    case 'crew': return r.days.map(d => row(`${sd(d.day)}`, (d.crew || []).map(c => `<span class="${c.no ? 'bad' : ''}">${esc(first(c.n))}${c.u === d.lead ? ' ★' : ''}${c.no ? ' · לא יגיע' : ''}</span>`).join(' · ') || 'לא שובץ צוות',
      d.status === 'done' ? '' : dayBtn(d.id, (d.crew || []).some(c => c.no) ? 'מחליף' : 'ניהול'), (d.crew || []).some(c => c.no) ? 'bad' : '')).join('');
    case 'm2': return r.days.filter(d => Array.isArray(d.zones) && d.zones.length).map(d => row(`${sd(d.day)} · ${nf(Math.round(d.zones.reduce((a, z) => a + Number(z.m2 || 0), 0))) || d.zones.length} ${d.zones.some(z => z.m2) ? 'מ״ר' : 'חזיתות'}`,
      esc(d.zones.map(z => (z.bn ? z.bn + ' · ' : '') + String(z.t || '').replace(/^חזית /, '')).join(' · ')), `<a class="btn ghost sm" href="#/day/${d.id}">היום</a>`)).join('');
    case 'prog': {
      if (!(r.zones || []).length) return '';
      const B = []; r.zones.forEach(z => { let b = B.find(x => x.id === z.b); if (!b) B.push(b = { id: z.b, name: z.bn, z: [] }); b.z.push(z); });
      const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
      return `<div class="dkbig"><b>${r.prog}%</b><small>${r.area ? `${nf(Math.round(r.got))} מתוך ${nf(Math.round(r.tot))} מ״ר` : `${r.got} מתוך ${r.tot} חזיתות`}</small></div>` + B.map(b => {
        const bt = r.area ? b.z.reduce((s, z) => s + Number(z.m2), 0) : b.z.length, bd = r.area ? b.z.filter(z => r.dn.has(zkey(z))).reduce((s, z) => s + Number(z.m2), 0) : b.z.filter(z => r.dn.has(zkey(z))).length;
        return `<div class="dkzb"><div class="row"><b class="grow">${esc(b.name || 'מבנה')}</b><small>${pct(bd, bt)}%</small></div><div class="progress"><i style="width:${pct(bd, bt)}%"></i></div>
          <div class="zfs">${b.z.map(z => { const d = r.dn.get(zkey(z)); return `<button type="button" class="zf${d ? ' on' : ''}" data-c="${r.id}~z~${z.b}~${encodeURIComponent(z.k)}">${d ? icon('check', 12) : ''}${esc(zlab(z))}${d ? `<small>${dm(d.day)}</small>` : ''}</button>`; }).join('')}</div></div>`;
      }).join('');
    }
    case 'ready': {
      if (!r.rdy) return '';
      const L = r.rdy.items.filter(i => C || !i.ok);
      return (L.map(i => row(`${i.ok ? '✓ ' : ''}${esc(i.t)}`, esc(i.s || ''), i.ok ? '' : rfix(r, i), i.ok ? 'ok' : i.bad ? 'bad' : 'warn')).join('') || `<div class="dkok">${icon('check', 18)}<span>מוכן · ${r.rdy.ok}/${r.rdy.n}</span></div>`);
    }
    case 'iss': {
      const I = (r.issues || []).filter(i => C || i.status === 'open'), M = (r.missing || []).filter(m => C || m.status === 'open');
      return I.map(i => row(`${i.sev === 'critical' ? '<span class="pill bad">קריטי</span> ' : ''}${esc(i.body)}`, esc([KIND[i.kind] || 'תקלה', first(i.by), timeAgo(i.at), i.status !== 'open' ? 'נסגר' + (i.res ? ' · ' + i.res : '') : ''].filter(Boolean).join(' · ')),
          i.status === 'open' ? `<button type="button" class="btn primary sm" data-iss="${i.id}" data-p="${r.id}">טופל</button>` : '', i.status === 'open' ? (i.sev === 'critical' ? 'bad' : 'warn') : 'ok')).join('')
        + M.map(m => row(`חסר: ${esc(m.item)}${m.qty > 1 ? ' ×' + m.qty : ''}`, esc([m.day ? sd(m.day) : '', first(m.by), timeAgo(m.at), m.status !== 'open' ? 'סופק' : ''].filter(Boolean).join(' · ')),
          m.status === 'open' ? `<button type="button" class="btn primary sm" data-mi="${m.id}">סופק</button>` : '', m.status === 'open' ? 'warn' : 'ok', m.status === 'open' ? ` data-bk="${m.id}"` : '')).join('');
    }
    case 'rep': {
      const P = r.pend, O = r.ropen.filter(x => !P.includes(x)), A = C ? (r.repairs || []).filter(x => x.status === 'done') : [];
      return P.map(x => row(esc(x.title), esc(['טיפל: ' + (first(x.who) || '—'), x.done_at ? timeAgo(x.done_at) : '', x.returns ? `הוחזר ${x.returns}×` : ''].filter(Boolean).join(' · ')), `<button type="button" class="btn primary sm" data-rv="${x.id}" data-p="${r.id}">לאישור</button>`, 'warn')).join('')
        + O.map(x => row(esc(x.title), esc([x.review === 'returned' ? 'הוחזר · ' + (x.review_note || '') : 'פתוח', first(x.who)].filter(Boolean).join(' · ')), `<a class="btn ghost sm" href="${x.visit_id ? `#/visit/${x.visit_id}/fix` : `#/p/${r.id}`}">פתיחה</a>`, x.review === 'returned' ? 'bad' : '')).join('')
        + A.map(x => row('✓ ' + esc(x.title), esc(['אושר', first(x.who), x.done_at ? timeAgo(x.done_at) : ''].filter(Boolean).join(' · ')), '', 'ok')).join('');
    }
    case 'rt': return r.rt ? `<div class="dkbig ${r.rt.avg_h > 72 ? 'bad' : r.rt.avg_h > 24 ? 'warn' : 'ok'}"><b>${dur(r.rt.avg_h)}</b><small>ממוצע מפתיחה לאישור · ${r.rt.n} תיקונים</small></div>`
      + (r.rt.leads || []).map(l => row(esc(l.n), `${l.c} תיקונים`, `<b class="dkn ${l.avg_h > 72 ? 'bad' : l.avg_h > 24 ? 'warn' : 'ok'}">${dur(l.avg_h)}</b>`)).join('') : '';
    case 'visit': return r.lv ? row(`${sd(r.lv.day)} · ${r.lvDays <= 0 ? 'היום' : `לפני ${r.lvDays} ימים`}`, esc(r.lv.by || ''), `<a class="btn ghost sm" href="#/visit/${r.lv.id}">הדוח</a><a class="btn primary sm" href="#/visit/new/${r.id}">ביקור חדש</a>`, r.lvDays > 30 ? 'bad' : 'ok')
      : r.site_id ? row('לא נרשם ביקור מנהל באתר', '', `<a class="btn primary sm" href="#/visit/new/${r.id}">ביקור חדש</a>`, 'bad') : '';
    case 'unc': return r.unc.map(d => row(`${sd(d.day)} · ${d.status === 'planned' ? 'לא התחיל' : 'לא נסגר'}`, esc([first(d.lead_name) || 'בלי ראש צוות', ST[d.status]].filter(Boolean).join(' · ')),
      d.status === 'planned' ? dayBtn(d.id, 'להעביר / לבטל') : `<a class="btn primary sm" href="#/day/${d.id}">סגירת היום</a>`, 'bad')).join('');
    case 'next': return r.next ? row(`${r.next.day === t ? 'היום' : sd(r.next.day)}`, esc(first(r.next.lead_name) || 'בלי ראש צוות'), `<a class="btn ghost sm" href="#/dispatch/${r.next.day}">לוח שיבוץ</a>${dayBtn(r.next.id)}`) : '';
    case 'wx': return r.wxDays.map(d => { const x = D.wx[r.id]?.[d.day], L = Math.max(d.wx ? 2 : 0, x?.L ?? 0), known = x || d.wx;
      return known && (C || L) ? row(`${sd(d.day)} · ${WXW[L]}`, x ? `רוח ${Math.round(x.w)} · משבים ${Math.round(x.g)} קמ״ש${x.p != null ? ` · גשם ${x.p}%` : ''}` : d.gust ? `משבים עד ${d.gust} קמ״ש` : '', L ? dayBtn(d.id, 'להזיז') : '', ['ok', 'warn', 'bad'][L]) : ''; }).join('')
      || (r.wxDays.length ? `<div class="dkok">${icon('sun', 18)}<span>טוב לטיסה בכל הימים בתחזית</span></div>` : '');
  }
  return '';
}
// תיקון למוכנות: סימון בלחיצה (מים/כניסה/מרחב אווירי) · יום (רחפן, אישורים, תחזית, שיבוץ) → ניהול היום · אפיון/תכנית → המסך שלהם
function rfix(r, i) {
  if (i.tog) return `<button type="button" class="btn primary sm" data-rdy="${r.id}|${i.k}">סימון כתואם</button>`;
  if (i.day) return dayBtn(i.day);
  if (i.k === 'sched') return r.next ? dayBtn(r.next.id, 'שיבוץ') : `<a class="btn ghost sm" href="#/dispatch">שיבוץ</a>`;
  if (i.k === 'spec' && r.site_id) return `<a class="btn ghost sm" href="#/site/${r.site_id}">אפיון</a>`;
  if (i.k === 'plan') return `<a class="btn ghost sm" href="#/plan/${r.id}">תכנית</a>`;
  return `<a class="btn ghost sm" href="#/p/${r.id}">פתיחה</a>`;
}
function zoneSec(r, z) {
  if (!z) return none('prog');
  const d = r.dn.get(zkey(z)), part = !d && (r.zpart || []).some(p => p.b === z.b && (!(p.f || []).length || (z.dir && p.f.includes(z.dir))));
  const rep = (r.repairs || []).filter(x => x.b === z.b && (D.S.closed || !['done', 'dropped'].includes(x.status)) && (!(x.f || []).length || (z.dir && x.f.includes(z.dir))));
  return `<div class="dkbig ${d ? 'ok' : part ? 'warn' : ''}"><b>${d ? 'נשטף' : part ? 'חלקי' : 'לא נשטף'}</b><small>${[d ? sd(d.day) : '', z.m2 ? nf(Math.round(z.m2)) + ' מ״ר' : '', z.floors ? z.floors + ' קומות' : ''].filter(Boolean).join(' · ')}</small></div>
    ${d ? `<a class="btn ghost sm block" href="#/day/${d.wd}">דוח היום</a>` : ''}
    ${rep.length ? `<section class="dkps"><h4>פריטי תיקון</h4>${rep.map(x => row(esc(x.title), esc([x.review === 'pending' ? 'ממתין לאישור' : x.status === 'done' ? 'אושר' : x.review === 'returned' ? 'הוחזר' : 'פתוח', first(x.who)].filter(Boolean).join(' · ')),
      x.review === 'pending' && x.status === 'in_progress' ? `<button type="button" class="btn primary sm" data-rv="${x.id}" data-p="${r.id}">לאישור</button>` : x.status === 'done' ? '' : `<a class="btn ghost sm" href="${x.visit_id ? `#/visit/${x.visit_id}/fix` : `#/p/${r.id}`}">פתיחה</a>`, x.status === 'done' ? 'ok' : 'warn')).join('')}</section>` : ''}`;
}

// ---------- לחיצות ----------
async function onClick(e) {
  const t = e.target.closest('button,a'); if (!t || !D.el.contains(t) || t.closest('#dkpp')) return;   // בתוך הפרויקט שבפאנל — הלחיצות שלו
  if (t.dataset.sort) { const k = t.dataset.sort; D.S.dir = D.S.sort === k && D.S.dir === '1' ? '-1' : '1'; D.S.sort = k; push(); draw(); return; }
  if (t.dataset.c) { if (D.S.sel === t.dataset.c && !t.closest('#dkp')) close(); else { const tr = t.closest('tr[data-i]'); if (tr) { D.cur = +tr.dataset.i; mark(); } open(t.dataset.c); } return; }
  if (t.dataset.da) { const m = await import('./dayadmin.js'); m.openDayAdmin(t.dataset.da, reload); return; }
  if (t.dataset.rv) { const r = D.rows.find(x => x.id === t.dataset.p), it = (r?.repairs || []).find(x => x.id === t.dataset.rv); if (!it) return;
    const L = [it, ...r.pend.filter(x => x !== it)]; (await import('./repairs.js')).reviewSheet(L); return; }   // בסיום — המסך נטען מחדש (אותו מצב מהכתובת)
  if (t.dataset.iss) return issueSheet(D.rows.find(x => x.id === t.dataset.p)?.issues.find(i => i.id === t.dataset.iss));
  if (t.dataset.mi) { t.disabled = true; const { error } = await sb.from('missing_items').update({ status: 'handled' }).eq('id', t.dataset.mi);
    if (error) { t.disabled = false; return toast(errText(error)); } toast('סומן שסופק', 1600, 'success'); reload(); return; }
  if (t.dataset.rdy) { const [pid, k] = t.dataset.rdy.split('|'), r = D.rows.find(x => x.id === pid); t.disabled = true;
    const days = [...new Set([...(r?.readiness?.[k]?.days || []), ...(r?.rdy?.up || [])])];
    const { error } = await sb.rpc('set_readiness', { p: pid, k, on_: true, days });
    if (error) { t.disabled = false; return toast(errText(error)); } toast('סומן כתואם', 1600, 'success'); reload(); }
}
function issueSheet(i) {
  if (!i) return;
  sheet(`<div class="stack tight"><h3 class="sh">${esc(i.body)}</h3><small class="muted">${esc([KIND[i.kind] || 'תקלה', first(i.by), timeAgo(i.at)].filter(Boolean).join(' · '))}</small></div>
    <label class="field">איך טופל<textarea id="dkir" rows="2" placeholder="לא חובה"></textarea></label>
    <div class="row-btns">${i.wd ? `<a class="btn ghost" href="#/day/${i.wd}" data-close>יום השטח</a>` : '<button class="btn ghost" data-close>ביטול</button>'}<button class="btn primary" id="dkiok">טופל</button></div>`, (s, closeS) => {
    $('#dkiok', s).onclick = async e => { e.target.disabled = true;
      const { error } = await sb.from('issues').update({ status: 'closed', resolution: $('#dkir', s).value.trim() || 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() }).eq('id', i.id);
      if (error) { e.target.disabled = false; return toast(errText(error)); } closeS(); toast('התקלה נסגרה', 1800, 'success'); reload(); };
  });
}

// ---------- מקלדת: j/k שורה · Enter פאנל · Esc סגירה · / חיפוש ----------
function mark() {
  $$('tr.cur', D.el).forEach(x => x.classList.remove('cur'));
  const tr = $(`tbody tr[data-i="${D.cur}"]`, D.el); if (!tr) return;
  tr.classList.add('cur'); tr.scrollIntoView({ block: 'nearest' });
}
addEventListener('resize', () => fit(), { passive: true });
document.addEventListener('keydown', e => {
  if (!D || !D.el.isConnected || !/^#\/desk(\/|$)/.test(location.hash) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('#sheet')?.hidden) return;
  const typing = e.target.closest?.('input,textarea,select,[contenteditable]');
  if (e.key === 'Escape') { if (typing) { e.target.blur(); return; } if (D.S.sel) { e.preventDefault(); close(); } return; }
  if (typing) return;
  const n = $$('tbody tr[data-i]', D.el).length;
  if (e.key === '/') { e.preventDefault(); $('#dkq', D.el)?.focus(); return; }
  if ((e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
    e.preventDefault(); const dn = e.key === 'j' || e.key === 'ArrowDown';
    D.cur = D.cur < 0 ? 0 : Math.max(0, Math.min(n - 1, D.cur + (dn ? 1 : -1))); mark();
    if (D.S.sel && D.S.sel[0] !== '*') { const tr = $(`tbody tr[data-i="${D.cur}"]`, D.el), k = D.S.sel.split('~')[1]; if (tr) open(`${tr.dataset.p}~${k === 'z' ? 'prog' : k}`); }
    return;
  }
  if (e.key === 'Enter' && D.cur >= 0 && !e.target.closest?.('button,a')) {
    const tr = $(`tbody tr[data-i="${D.cur}"]`, D.el); if (tr) { e.preventDefault(); open(`${tr.dataset.p}~${D.S.tab === 'm' ? 'prog' : 'all'}`); }
  }
});
