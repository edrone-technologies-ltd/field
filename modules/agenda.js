// הלו״ז שלי: כל מה שמשויך אליי, לפי ימים — ימי שטח (צוות / ראש צוות), סיורי אפיון ששובצתי אליהם, משימות עם תאריך יעד.
// מקור אחד לכרטיס "היום שלי" בבית (עובד ומנהל) ולמסך המלא (#/my, ולעובד גם הלשונית לו״ז).
// בלי RPC חדש: שלוש קריאות במקביל, כל אחת דרך ה-RLS הקיים (רק השורות שלי). בלי קליטה — מהמטמון של הפעם האחרונה.
import { sb, state, cache, $, $$, esc, icon, isoDay, dm, HE_DOW, HE_D1 } from '../lib/core.js';
import { myDays, dayRow, needsOk, bindConfirm, pendingConfirms, fillGlance, meOn, PQ } from './home.js';
import { isNight, nightRange } from '../lib/night.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const dowOf = s => new Date(s + 'T12:00').getDay();
const hm = t => (t || '').slice(0, 5);
const ltr = s => `<bdi dir="ltr">${s}</bdi>`;   // תאריכים ושעות בתוך עברית
// טקסט מהשרת: כל רצף לטיני/מספרי מבודד, והחיסון (esc) לכל חתיכה בנפרד — כדי לא לפצל ישות HTML (&amp;) לתוך bdi
const bd = t => String(t ?? '').split(/([A-Za-z0-9][A-Za-z0-9.,'&\/ -]*[A-Za-z0-9]|[A-Za-z0-9])/).map((x, i) => i % 2 ? `<bdi dir="ltr">${esc(x)}</bdi>` : esc(x)).join('');
const dayName = (s, t) => s === t ? 'היום' : s === addDays(t, 1) ? 'מחר' : `יום ${HE_DOW[dowOf(s)]} ${ltr(dm(s))}`;

// ---------- סיורי אפיון שלי ----------
// מבודד בכוונה — כאן בלבד נקבע "משובץ לסיור". סיור יכול לקבל כמה מאפיינים: sites.visit_with uuid[] (db/165, ענף feat/spec-multi).
// visit_by נשאר (= visit_with[1]) לתאימות לאחור. לפני ש-165 רץ העמודה לא קיימת → השרת מחזיר שגיאה → נופלים ל-visit_by, ולא מנסים שוב באותה פתיחה.
const V_SEL = 'id,slug,name,kind,address,visit_date,visit_time,merged_into,buildings(id,specs(status))';
let noVisitWith = false;
async function myVisits(from, to) {
  const q = () => sb.from('sites').select(V_SEL).eq('is_active', true).is('merged_into', null).gte('visit_date', from).lte('visit_date', to);
  if (!noVisitWith) {
    const { data, error } = await q().contains('visit_with', [state.user.id]);
    if (!error) return data || [];
    if (!(error.code === '42703' || /visit_with/.test(error.message || ''))) throw error;
    noVisitWith = true;
  }
  const { data, error } = await q().eq('visit_by', state.user.id);
  if (error) throw error;
  return data || [];
}
// משימות שהוקצו לי עם תאריך יעד, שעוד פתוחות (כולל באיחור). משימה של יום שטח — חלק מהיום עצמו, לא כאן. ממתינה לאישור — כבר לא אצלי
async function myDue(to) {
  const { data, error } = await sb.from('tasks').select('id,title,due,status,review,project_id,site_id,sites(name,slug),projects(name)')
    .eq('assignee_id', state.user.id).not('due', 'is', null).lte('due', to).is('work_day_id', null).not('status', 'in', '(done,dropped)').order('due');
  if (error) throw error;
  return (data || []).filter(t => t.review !== 'pending');
}

// טעינה: מהשרת ולמטמון, או (בלי קליטה) מהמטמון. משימה שסימנתי "בוצע" ועוד בתור — לא חוזרת
async function load(key, from, to) {
  let D;
  try {
    const [days, visits, tasks] = await Promise.all([myDays(from, to), myVisits(isoDay(), to), myDue(to)]);
    D = { days, visits, tasks, at: Date.now() };
    cache.set(key, D).catch(() => {});
  } catch { D = (await cache.get(key).catch(() => null)) || null; }
  if (!D) return null;
  try { const { outbox } = await import('../lib/store.js');
    const gone = new Set((await outbox.all()).filter(x => x.kind === 'update' && x.table === 'tasks' && ['done', 'dropped'].includes(x.patch?.status)).map(x => x.rowId));
    D.tasks = D.tasks.filter(t => !gone.has(t.id)); } catch { /* */ }
  return D;
}

// פריט אחיד: { d: יום, t: שעה למיון, k: 'w'|'v'|'t', … }. משימה באיחור — נכנסת להיום
function items(D, t) {
  const out = [];
  (D.days || []).forEach(w => out.push({ k: 'w', d: w.day, t: hm(w.report_time) || '99', w }));
  (D.visits || []).forEach(v => { const B = v.buildings || [], st = b => (b.specs?.[0] || b.specs)?.status;
    if (B.length && B.every(b => st(b) === 'done')) return;   // האפיון הושלם — הסיור מאחוריו
    out.push({ k: 'v', d: v.visit_date, t: hm(v.visit_time) || '98', v, href: v.kind === 'lead' && B.length === 1 ? `#/b/${v.slug}/${B[0].id}` : `#/site/${v.slug}` }); });
  (D.tasks || []).forEach(x => out.push({ k: 't', d: x.due < t ? t : x.due, late: x.due < t, t: 'zz', x, href: x.project_id ? `#/p/${x.project_id}/t` : '#/tasks' }));
  return out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
}

// שורה קומפקטית (בית) / שורה מלאה (מסך): שעה בצד, מה ולאן
function row(it, full = false) {
  if (it.k === 'w' && full) return dayRow(it.w, new Map(), full === 'c', true);   // יום שטח במסך המלא: אישור הגעה, צוות ותחזית — אותה שורה של הלו״ז
  const box = (b, s, tone = '') => `<span class="agt ${tone}"><b>${b}</b><small>${s}</small></span>`;
  if (it.k === 'w') { const w = it.w, p = w.projects || {};
    return `<a class="lrow slim" href="#/day/${w.id}">${box(w.report_time ? ltr(hm(w.report_time)) : '—', 'יציאה')}<span class="grow"><b>${bd(p.name || 'יום שטח')}</b><small>${[w.kind === 'report' ? 'סיכום היום' : 'יום שטח', isNight(w) ? ltr(esc(nightRange(w))) : '', w.crew_lead_id === state.user.id ? 'ראש צוות' : ''].filter(Boolean).join(' · ')}</small></span><span class="chev">${icon('chev', 18)}</span></a>`; }
  if (it.k === 'v') { const v = it.v;
    return `<a class="lrow slim" href="${esc(it.href)}">${box(v.visit_time ? ltr(hm(v.visit_time)) : '—', 'סיור')}<span class="grow"><b>${bd(v.name || '')}</b><small>${['סיור אפיון', v.address ? bd(v.address) : ''].filter(Boolean).join(' · ')}</small></span><span class="chev">${icon('chev', 18)}</span></a>`; }
  const x = it.x, where = x.projects?.name || x.sites?.name || '';
  return `<a class="lrow slim" href="${it.href}">${box(icon('check', 18), 'משימה', it.late ? 'bad' : '')}<span class="grow"><b>${bd(x.title)}</b><small>${[it.late ? `<span class="err">באיחור · ${ltr(dm(x.due))}</span>` : '', where ? bd(where) : ''].filter(Boolean).join(' · ')}</small></span><span class="chev">${icon('chev', 18)}</span></a>`;
}
const brief = it => it.k === 'w' ? `${it.w.report_time ? ltr(hm(it.w.report_time)) + ' ' : ''}${bd(it.w.projects?.name || 'יום שטח')}`
  : it.k === 'v' ? `${it.v.visit_time ? ltr(hm(it.v.visit_time)) + ' ' : ''}סיור · ${bd(it.v.name || '')}` : bd(it.x.title);

// ---------- כרטיס "היום שלי" בבית ----------
// skip = מזהי ימי שטח שכבר מוצגים בכרטיס הראשי (בית העובד). אם כל מה שהיה נכתב כאן כבר שם — הכרטיס לא מוצג (בלי כפילות)
export async function todayCard(box, { skip = [] } = {}) {
  if (!box) return;
  const t = isoDay(), D = await load(`my-agenda:${state.user.id}:home`, t, addDays(t, 7));
  if (!D || !box.isConnected) return;
  const all = items(D, t), now = all.filter(i => i.d === t);
  const covered = L => L.length && L.every(i => i.k === 'w' && skip.includes(i.w.id));
  const head = `<div class="sh-row"><h3 class="sh">היום שלי</h3><a class="more" href="#/my">השבוע</a></div>`;
  if (now.length) {
    if (covered(now)) { box.innerHTML = ''; return; }
    box.innerHTML = `<section class="agday">${head}<div class="list">${now.map(i => row(i)).join('')}</div></section>`; return; }
  // היום ריק: שורה אחת — מה מחר (או הדבר הבא בשבוע)
  const nd = all[0]?.d, nx = all.filter(i => i.d === nd);
  if (!nx.length || covered(nx)) { box.innerHTML = ''; return; }
  const lbl = nd === addDays(t, 1) ? 'מחר' : `${dayName(nd, t)}`;
  box.innerHTML = `<section class="agday">${head}<div class="list"><a class="lrow slim" href="#/my"><span class="grow"><b>אין משימות היום</b><small>${lbl}: ${brief(nx[0])}${nx.length > 1 ? ` ${ltr('+' + (nx.length - 1))}` : ''}</small></span><span class="chev">${icon('chev', 18)}</span></a></div></section>`;
}

// ---------- המסך המלא: #/my (ולעובד — הלשונית לו״ז) ----------
export async function renderMy(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>הלו״ז שלי</h1></header><div id="sc" class="stack lg">${'<div class="skel"></div>'.repeat(3)}</div>`;
  const t = isoDay(), m0 = t.slice(0, 8) + '01', from = m0 < addDays(t, -14) ? m0 : addDays(t, -14);
  const D = await load(`my-agenda:${state.user.id}:full`, from, addDays(t, 60));
  const box = $('#sc'); if (!box) return;
  if (!D) { box.innerHTML = `<div class="empty-card"><span class="ei">${icon('calendar', 26)}</span><span><b>אין קליטה</b><small>הלו״ז יופיע כשתחזור קליטה</small></span></div>`; return; }
  await pendingConfirms();
  const rows = D.days || [], all = items(D, t), ahead = all.filter(i => i.d >= t);
  const pastW = rows.filter(w => w.day < t && w.day >= m0).reverse(), aheadW = rows.filter(w => w.day >= t), pend = aheadW.filter(needsOk);
  const byDay = new Map(); ahead.forEach(i => { if (!byDay.has(i.d)) byDay.set(i.d, []); byDay.get(i.d).push(i); });
  // פס 14 יום מתחילת השבוע: יום שטח — ירוק; סיור / משימה בלבד — מסגרת. לחיצה = גלילה ליום (בשבוע הקרוב) או ליום השטח
  const s0 = addDays(t, -dowOf(t)), strip = Array.from({ length: 14 }, (_, i) => addDays(s0, i)), wk7 = addDays(t, 6);
  const wOn = s => rows.filter(w => w.day === s);
  const cell = s => { const L = s >= t ? (byDay.get(s) || []) : wOn(s).map(w => ({ k: 'w', w })), w = L.find(i => i.k === 'w')?.w;
    const tone = w ? (w.status === 'done' ? 'ok' : (meOn(w)?.cant_come_at || PQ.no.has(w.id)) ? 'bad' : 'on') : L.length ? 'vis' : '';
    const cls = `wkc ${tone} ${s === t ? 'now' : ''} ${s < t ? 'past' : ''} ${dowOf(s) === 6 ? 'sat' : ''}`, inner = `<small>${HE_D1[dowOf(s)]}</small><b>${+s.slice(8)}</b>${L.length > 1 ? `<i>${L.length}</i>` : ''}`;
    if (L.length && s >= t && s <= wk7) return `<button type="button" class="${cls}" data-go="${s}" aria-label="${s === t ? 'היום' : 'יום ' + HE_DOW[dowOf(s)]}">${inner}</button>`;
    if (w) return `<a class="${cls}" href="#/day/${w.id}">${inner}</a>`;
    return `<span class="${cls}">${inner}</span>`; };
  // השבוע הקרוב — יום-יום (היום תמיד, גם כשריק); אחריו — לפי שבועות
  const near = [], later = [];
  for (let i = 0; i < 7; i++) { const s = addDays(t, i), L = byDay.get(s) || []; if (L.length || i === 0) near.push({ s, L }); }
  const wk = s => { const k = addDays(s, -dowOf(s)); return k === s0 ? 'בהמשך השבוע' : k === addDays(s0, 7) ? 'שבוע הבא' : `שבוע ${ltr(dm(k))}`; };
  ahead.filter(i => i.d > wk7).forEach(i => { const k = wk(i.d); let g = later.find(x => x.k === k); if (!g) later.push(g = { k, L: [] }); g.L.push(i); });
  const doneM = rows.filter(w => w.day >= m0 && w.day.slice(0, 7) === t.slice(0, 7) && w.status === 'done').length, leftM = aheadW.filter(w => w.day.slice(0, 7) === t.slice(0, 7) && w.status !== 'done').length;
  const dayRows = L => L.map(i => i.k === 'w' ? row(i, pend.length > 1 ? 'c' : true) : row(i)).join('');   // כמה ימים לאישור — כפתור אחד למעלה, בשורות כפתורים קטנים
  box.innerHTML = `<div class="wkstrip">${strip.map(cell).join('')}</div>
    ${rows.length ? `<div class="pulse sm"><span><b>${doneM}</b><small>ימי שטח החודש</small></span><span><b>${leftM}</b><small>נשארו החודש</small></span><span><b>${aheadW.length}</b><small>משובץ קדימה</small></span></div>` : ''}
    ${pend.length > 1 ? `<div class="okall"><span class="grow"><b>${pend.length} ימים מחכים לאישור הגעה</b><small>${pend.map(w => dayName(w.day, t).replace('יום ', '')).join(' · ')}</small></span><button class="btn primary" data-confirm-all="${pend.map(x => x.id).join(',')}">אגיע לכולם ✓</button></div>` : ''}
    ${near.map(g => `<section id="ag-${g.s}"><h3 class="sh">${dayName(g.s, t)}</h3>${g.L.length ? `<div class="list">${dayRows(g.L)}</div>` : '<div class="empty-line">אין משימות היום</div>'}</section>`).join('')}
    ${later.map(g => `<section><h3 class="sh">${g.k}</h3><div class="list">${g.L.map(i => i.k === 'w' ? dayRow(i.w, new Map(), pend.length > 1) : row(i)).join('')}</div></section>`).join('')}
    ${pastW.length ? `<details class="fold"><summary><span class="sh">ימים שעברו החודש</span><span class="count">${pastW.length}</span></summary><div class="list">${pastW.map(w => dayRow(w, new Map())).join('')}</div></details>` : ''}`;
  $$('[data-go]', box).forEach(b => b.onclick = () => $('#ag-' + b.dataset.go, box)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  bindConfirm(box); fillGlance(box, rows.map(w => w.projects).filter(Boolean));
}
