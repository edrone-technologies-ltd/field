// בית: עונה רק על "מה קורה היום ומה צריך אותי". כל השאר בלשוניות.
// מנהל → מסך הבקרה (ops.js). עובד שטח: שעון · מחכה לך · היום שלי · הימים הקרובים. יצירת כל דבר חדש — רק בכפתור +.
import { sb, state, can, isManager, cache, covers, folderGrid, signedUrls, $, $$, esc, nf, initials, icon, isoDay, dm, HE_DOW, HE_D1, timeAgo , stLabel, toast, isOpenProject, enqueue, ask, haptic, othersPending, othersCard, addFieldPhoto, flush } from '../lib/core.js';
import { needsList, bindNeeds } from './attention.js';
import { errText } from '../lib/audit.js';
import { isNight, nightRange, nightTag, carryNight, isCurrent, wxKey } from '../lib/night.js';

const today = () => isoDay();
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const ARCHIVE = 'group_mm5052gw';
export const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'הסתיים — ממתין לתשלום': 'ok', 'הסתיים — להוצאת חשבונית': 'ok', 'פיילוט הסתיים': 'ok' };   // שאר השלבים — אפור ניטרלי
const DAY_ST = { planned: 'מתוכנן', en_route: 'בדרך', on_site: 'באתר', working: 'בעבודה', issue: 'תקלה', done: 'נסגר' };
const RANK = { 'בביצוע': 0, 'תואם - ממתין לביצוע': 1, 'אושר מול לקוח': 2, 'קביעת מועד': 3, 'תקוע': 4 };
const isOpen = isOpenProject;
// סיור אפיון → היעד הנכון: ליד שאוחד → האתר; אפיון בתהליך (מבנה אחד) → ישר לטופס; הושלם / כמה מבנים → עמוד האתר
export function visitHref(v, sites) {
  let s = (sites || []).find(x => x.monday_lead_id === String(v.monday_item_id));
  if (s?.merged_into) s = sites.find(x => x.id === s.merged_into) || s;
  if (!s) return '#/specs';
  const B = s.buildings || [], st = b => (b.specs?.[0] || b.specs)?.status;
  return s.kind === 'lead' && B.length === 1 && st(B[0]) !== 'done' ? `#/b/${s.slug}/${B[0].id}` : `#/site/${s.slug}`;
}
const vHref = v => v.href || `#/site/lead-${v.monday_item_id}`;
const mineDay = w => w.crew_lead_id === state.user.id || (w.work_day_crew || []).some(c => c.user_id === state.user.id);

export async function load() {
  const q = async (p) => { try { const { data, error } = await p; if (error) throw error; return data || []; } catch { return null; } };
  const t = today(), since = addDays(t, -14), M = isManager(), n0 = state.storedN;
  const [projects, reports, visits, drones, team, wdays, sync, pushErr, inbox, shiftReq, vsites] = await Promise.all([
    q(sb.from('projects').select('id,name,client_name,status_label,planned_from,planned_to,actual_from,actual_to,monday_group,cover_path,site_id,closed_summary,lat,lng,sites(lat,lng)')),
    q(sb.from('field_reports').select('monday_item_id,project_id,project_label,report_date,crew,work,had_issues,issues,photos').gte('report_date', since).order('report_date', { ascending: false })),
    M ? q(sb.from('spec_visits').select('*')) : [],
    q(sb.from('equipment').select('id,name,health,health_detail,health_date').eq('kind', 'drone').order('name')),
    M ? q(sb.rpc('profiles_full').select('id,full_name,role,is_pilot,pilot_license_expiry,is_active')) : [],
    q(sb.from('work_days').select('id,day,status,kind,night,report_time,site_arrival,site_end,project_id,crew_lead_id,is_last_day,day_goal,gust_max,wind_max,weather_alerted,departed_at,arrived_at,finished_at,work_day_crew(*,profiles(full_name))').gte('day', addDays(t, -1)).lte('day', addDays(t, 13)).order('report_time')),
    M ? q(sb.from('sync_log').select('created_at').eq('entity', 'full_pull').order('created_at', { ascending: false }).limit(1)) : [],
    M ? q(sb.from('sync_log').select('entity,entity_id,error').eq('direction', 'to_monday').eq('status', 'error').gte('created_at', new Date(Date.now() - 864e5).toISOString()).limit(20)) : [],
    q(sb.rpc('my_inbox')),
    M ? q(sb.from('shift_requests').select('id,user_id').eq('status', 'pending')) : [],
    M ? q(sb.from('sites').select('id,slug,kind,monday_lead_id,merged_into,buildings(id,specs(status))').or('kind.eq.lead,merged_into.is.null')) : [],
  ]);
  if (visits && vsites) visits.forEach(v => v.href = visitHref(v, vsites));
  const data = { projects, reports, visits, drones, team, wdays, sync, pushErr, inbox, shiftReq };
  if (projects) await cache.set('home2', data); else Object.assign(data, (await cache.get('home2')) || {});
  await overlayDays(data.wdays, !projects || state.storedN > n0).catch(() => {});
  return data;
}
// מה שנעשה בטלפון ועוד לא הגיע לשרת (או שהשרת לא נקרא — בלי קליטה) מוחל על הימים: יציאה/הגעה/סגירה, אישור הגעה,
// "לא אגיע". כך הבית לא מציע "פתיחת היום" ליום שכבר עבדו בו. מקור: התור (לפי הסדר) + היום השמור בטלפון (today.js)
const DRANK = { planned: 0, en_route: 1, on_site: 2, working: 3, issue: 3, done: 5 };
async function overlayDays(ws, offline) {
  if (!ws?.length) return;
  const { outbox } = await import('../lib/store.js'); const q = await outbox.all();
  const forDay = id => q.filter(x => x.rowId === id || x.args?.d === id || x.row?.work_day_id === id || x.meta?.work_day_id === id);
  for (const w of ws) {
    if (!mineDay(w)) continue;
    const mine = forDay(w.id); if (!mine.length && !offline) continue;
    const c = await cache.get('day:' + w.id).catch(() => null), crew = w.work_day_crew || [];
    if (c?.day && (DRANK[c.day.status] ?? -1) > (DRANK[w.status] ?? 0)) w.status = c.day.status;
    if (c?.day) ['departed_at', 'arrived_at', 'finished_at'].forEach(k => { w[k] ||= c.day[k]; });
    for (const cc of c?.day?.work_day_crew || []) { const m = crew.find(x => x.user_id === cc.user_id); if (m) { m.clock_in ||= cc.clock_in; m.confirmed_at ||= cc.confirmed_at; m.cant_come_at ||= cc.cant_come_at; } }
    const me = crew.find(x => x.user_id === state.user.id);
    for (const x of mine) {
      if (x.kind === 'update' && x.table === 'work_days') Object.assign(w, x.patch);
      else if (x.kind === 'rpc' && me) {
        if (x.fn === 'crew_depart') me.clock_in ||= x.args.t;
        else if (x.fn === 'confirm_day') { me.confirmed_at ||= new Date(x.at).toISOString(); me.cant_come_at = null; }
        else if (x.fn === 'cant_come') me.cant_come_at ||= new Date(x.at).toISOString();
      }
    }
  }
}
// משימות שסימנתי "בוצע" ועוד בתור — לא מוצגות שוב כפתוחות (גם כשיש קליטה והשרת עוד לא קיבל)
async function hideQueuedTasks() {
  const box = $('#mytasks'); if (!box) return;
  const { outbox } = await import('../lib/store.js');
  const done = new Set((await outbox.all()).filter(x => x.kind === 'update' && x.table === 'tasks' && x.patch?.status === 'done').map(x => x.rowId));
  if (!done.size) return;
  $$('[data-id]', box).forEach(c => done.has(c.dataset.id) && c.remove());
  const sec = box.querySelector('section'), n = sec ? $$('[data-id]', sec).length : 0;
  if (sec && !n) sec.remove(); else if (sec) { const k = sec.querySelector('.count'); if (k) k.textContent = n; }
}

// ---------- מה דורש טיפול: מקובץ, הכי חמור קודם ----------
// פרויקט אחד → ישר אליו; כמה → רשימה של בדיוק אותם פרויקטים
const pick = (ps, tab = '') => ps.length === 1 ? { href: `#/p/${ps[0].id}${tab}` } : { list: ps.map(p => ({ href: `#/p/${p.id}${tab}`, t: p.name, s: p.client_name || '' })) };
export function alerts(d) {
  const out = [], t = today(), P = d.projects || [];
  const gr = (d.drones || []).filter(x => x.health === 'grounded');
  if (gr.length) out.push({ tone: 'bad', ic: 'drone', title: gr.length > 1 ? `${gr.length} רחפנים מקורקעים` : `רחפן ${gr[0].name} מקורקע`, sub: gr.length > 1 ? gr.map(x => x.name).join(' · ') : firstLine(gr[0].health_detail), href: gr.length > 1 ? '#/equipment' : `#/equipment/${gr[0].id}` });
  (d.drones || []).filter(x => x.health === 'warning').forEach(x => out.push({ tone: 'warn', ic: 'drone', title: `רחפן ${x.name} במעקב`, sub: firstLine(x.health_detail), href: `#/equipment/${x.id}` }));
  const stuck = P.filter(p => p.status_label === 'תקוע' && isOpen(p));
  if (stuck.length) out.push({ tone: 'bad', ic: 'alert', title: stuck.length > 1 ? `${stuck.length} פרויקטים תקועים` : `פרויקט תקוע: ${stuck[0].name}`, sub: stuck.length > 1 ? stuck.map(p => p.name).join(' · ') : stuck[0].client_name, ...pick(stuck) });
  // תאריך הסיום עבר (ביותר מיומיים), אין ימי שטח עתידיים, והפרויקט עדיין פתוח → לסגור (לשונית הסיכום)
  const ahead = new Set((d.wdays || []).filter(w => w.day >= t && w.status !== 'done').map(w => w.project_id));
  const ended = P.filter(p => isOpen(p) && p.status_label !== 'תקוע' && !ahead.has(p.id) && (p.planned_to || p.actual_to) && daysBetween(p.planned_to || p.actual_to, t) > 2);
  if (ended.length) out.push({ tone: 'warn', ic: 'calendar', title: ended.length > 1 ? `${ended.length} פרויקטים שהסתיימו ועדיין פתוחים` : `הסתיים ב-${dm(ended[0].planned_to || ended[0].actual_to)} ועדיין פתוח`, sub: ended.length > 1 ? ended.map(p => p.name).join(' · ') : ended[0].name, ...pick(ended, '/s') });
  const last = new Map(); (d.reports || []).forEach(r => { if (r.project_id && !last.has(r.project_id)) last.set(r.project_id, r); });
  const mism = P.filter(p => { const r = last.get(p.id); return r && daysBetween(r.report_date, t) <= 7 && p.status_label !== 'בביצוע' && isOpen(p); });
  if (mism.length) out.push({ tone: 'warn', ic: 'report', title: mism.length > 1 ? `${mism.length} פרויקטים בשטח שהסטטוס שלהם במאנדי לא "בביצוע"` : `עובדים בשטח, אבל במאנדי הסטטוס "${mism[0].status_label}"`, sub: mism.map(p => p.name).join(' · '), ...pick(mism) });
  const iss = (d.reports || []).filter(r => r.had_issues && daysBetween(r.report_date, t) <= 7);
  const ip = [...new Map(iss.filter(r => r.project_id).map(r => [r.project_id, { id: r.project_id, name: r.project_label, client_name: dm(r.report_date) }])).values()];
  if (iss.length) out.push({ tone: 'warn', ic: 'alert', title: `${iss.length} דוחות עם תקלות השבוע`, sub: [...new Set(iss.map(r => r.project_label))].join(' · '), ...(ip.length ? pick(ip, '/d') : { href: '#/reports' }) });
  (d.team || []).filter(p => p.is_active && p.is_pilot && p.pilot_license_expiry).forEach(p => {
    const left = daysBetween(t, p.pilot_license_expiry);
    if (left <= 45) out.push({ tone: left <= 14 ? 'bad' : 'warn', ic: 'shield', title: `רישיון המטיס של ${p.full_name.split(' ')[0]} ${left < 0 ? 'פג' : `פג בעוד ${left} ימים`}`, sub: `בתוקף עד ${dm(p.pilot_license_expiry)}`, href: `#/staff/${p.id}` });
  });
  if ((d.shiftReq || []).length) out.push({ k: 'shiftreq', tone: 'warn', ic: 'clock', title: `${d.shiftReq.length} בקשות תיקון שעות ממתינות לאישור`, sub: 'עובדים ששכחו להחתים או ביקשו עריכה', href: '#/attendance' });
  // שליחה למאנדי נכשלה: לפריט עצמו (יום שטח / פרויקט / דוח ביקור / רכש); אחרת — יומן הסנכרון (מנהל מערכת)
  const PE = [...new Map((d.pushErr || []).map(e => [e.entity + ':' + e.entity_id, e])).values()];
  if (PE.length) { const one = PE.length === 1 ? errHref(PE[0]) : null;
    out.push({ tone: 'warn', ic: 'alert', title: PE.length > 1 ? `${PE.length} פריטים לא עברו למאנדי` : 'שליחה למאנדי נכשלה', sub: [...new Set(PE.map(e => ENT_HE[e.entity] || 'עדכון'))].join(' · '),
      href: one || (can('admin') ? '#/admin/sync' : ''), list: !one && !can('admin') && PE.some(errHref) ? PE.filter(errHref).map(e => ({ href: errHref(e), t: ENT_HE[e.entity] || 'עדכון', s: '' })) : null }); }
  // סיור בלי תאריך: לליד עצמו (איש קשר + משימה לצוות לתיאום); כמה — רשימה של בדיוק אותם לידים
  const nd = (d.visits || []).filter(v => !v.visit_date), lead = vHref;
  if (nd.length) out.push({ tone: '', ic: 'calendar', title: nd.length > 1 ? `${nd.length} סיורי אפיון בלי תאריך` : `סיור אפיון בלי תאריך · ${nd[0].lead_name}`, sub: nd.length > 1 ? nd.map(v => v.lead_name).join(' · ') : nd[0].owner || '',
    ...(nd.length > 1 ? { list: nd.map(v => ({ href: lead(v), t: v.lead_name, s: v.owner || '' })) } : { href: lead(nd[0]) }) });
  const rank = { bad: 0, warn: 1, '': 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
const ENT_HE = { work_day: 'דוח יומי', spec: 'אפיון', issue: 'תקלה', missing: 'חסר בשטח', message: 'הודעה', signoff: 'החתמת לקוח', summary: 'סיכום פרויקט', task: 'משימה', task_board: 'משימה',
  visit: 'דוח ביקור', purchase: 'בקשת רכש', contact: 'איש קשר', project_close: 'סגירת פרויקט', project_start: 'פתיחת פרויקט', schedule: 'תאריכי פרויקט' };
const errHref = e => !e.entity_id ? null : e.entity === 'work_day' ? `#/day/${e.entity_id}` : ['summary', 'project_close', 'project_start', 'schedule'].includes(e.entity) ? `#/p/${e.entity_id}`
  : e.entity === 'visit' ? `#/visit/${e.entity_id}` : e.entity === 'purchase' ? '#/purchase' : null;
const firstLine = s => (s || '').split('\n')[0].replace(/^[^֐-׿A-Za-z0-9]+/, '').slice(0, 90);

// ---------- לו״ז: ימי שטח מהאפליקציה + טווחי פרויקטים ממאנדי + סיורי אפיון ----------
export function schedule(d, from, n) {
  const days = []; for (let i = 0; i < n; i++) days.push({ date: addDays(from, i), items: [] });
  const by = new Map((d.projects || []).map(p => [p.id, p]));
  (d.wdays || []).forEach(w => { const x = days.find(y => y.date === w.day); if (x) x.items.push({ kind: 'w', w, p: by.get(w.project_id) }); });
  (d.projects || []).filter(isOpen).forEach(p => {
    const f = p.planned_from || p.actual_from, to = p.planned_to || p.actual_to || f; if (!f) return;
    days.forEach(x => { if (x.date >= f && x.date <= to && !x.items.some(it => it.p?.id === p.id)) x.items.push({ kind: 'p', p }); });
  });
  (d.visits || []).filter(v => v.visit_date).forEach(v => { const x = days.find(y => y.date === v.visit_date); if (x) x.items.push({ kind: 'v', v }); });
  return days;
}
export function evRow(it) {
  if (it.kind === 'w') { const w = it.w; const crew = (w.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', ');
    return `<a class="ev ${w.status === 'done' ? 'ok' : 'lime'}" href="#/day/${w.id}"><b>${esc(it.p?.name || 'יום שטח')}</b><small>יום שטח${w.report_time ? ' · ' + w.report_time.slice(0, 5) : ''}${crew ? ' · ' + esc(crew) : ''}${w.status !== 'planned' ? ' · ' + DAY_ST[w.status] : ''}${w.gust_max != null ? ` · ${w.weather_alerted ? '⚠ ' : ''}משבים ${w.gust_max}` : ''}</small></a>`; }
  if (it.kind === 'p') return `<a class="ev ${TONE[it.p.status_label] ?? ''}" href="#/p/${it.p.id}"><b>${esc(it.p.name)}</b><small>${esc(stLabel(it.p.status_label))}${it.p.client_name ? ' · ' + esc(it.p.client_name) : ''}</small></a>`;
  return `<a class="ev blue" href="${esc(vHref(it.v))}"><b>סיור אפיון · ${esc(it.v.lead_name)}</b><small>${esc(it.v.owner || '')}</small></a>`;
}
const dayWord = s => s === addDays(today(), 1) ? 'מחר' : `יום ${HE_DOW[new Date(s + 'T12:00').getDay()]} ${dm(s)}`;
const empty = (ic, title, sub, tone = '') => `<div class="empty-card ${tone}"><span class="ei">${icon(ic, 26)}</span><span><b>${title}</b><small>${sub}</small></span></div>`;

// ---------- מסך הבית ----------
export async function renderHome(el) {
  if (isManager()) return (await import('./ops.js')).renderOps(el);
  const p = state.profile, first = (p.full_name || '').split(' ')[0];
  const now = new Date(), h = now.getHours();
  const greet = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  el.innerHTML = `<header class="hhead"><div class="grow"><div class="eyebrow">יום ${HE_DOW[now.getDay()]}, ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(first)}</h1></div>
      <a class="avatar" href="#/menu" aria-label="החשבון שלי">${esc(initials(p.full_name))}</a></header>
    <div id="hm" class="stack lg"><div class="skel tall"></div><div class="skel"></div><div class="skel"></div></div>`;
  warmExtras(); const d = await load(); const box = $('#hm'); if (!box) return;
  const t = today(), P = d.projects || [];
  const cov = await covers(P);
  const byId = new Map(P.map(x => [x.id, x]));
  // עבודת לילה שהתחילה אתמול ועוד פתוחה = היום של הצוות גם אחרי חצות
  const mine = (d.wdays || []).filter(w => isCurrent(w, t) && mineDay(w) && w.status !== 'cancelled');

  const ahead = (d.wdays || []).filter(w => w.day > t && mineDay(w) && w.status !== 'cancelled').sort((a, b) => a.day < b.day ? -1 : 1);
  await pendingConfirms();
  // אין יום היום → השיבוץ הבא הוא הכרטיס הראשי (מתי, לאן, עם מי, תחזית). כך הבית אף פעם לא ריק כשיש עבודה בהמשך
  const openToday = mine.filter(w => w.status !== 'done'), doneToday = mine.filter(w => w.status === 'done');
  // יום שנסגר היום (ואין עוד יום פתוח היום) — הכרטיס הראשי נשאר עליו עד היציאה מהמשמרת; אחר כך — השיבוץ הבא
  const heroDays = openToday.length ? openToday : doneToday.length ? doneToday.slice(-1) : ahead.slice(0, 1);
  const pend = ahead.filter(needsOk), pendRest = pend.filter(w => !heroDays.includes(w));
  const sv = can('specs') ? await surveyVisits(t) : [];   // סוקר: הסיורים הקרובים (מהליד) — ישר לטופס האפיון
  const LS = {}; for (const w of heroDays) LS[w.id] = await cache.get('day:' + w.id + ':local').catch(() => null);
  const PS = await prestartHold(heroDays.filter(w => isCurrent(w, t) && ['issue', 'on_site'].includes(w.status)));
  heroDays.forEach(w => { if (PS[w.id]) LS[w.id] = { ...(LS[w.id] || {}), hold: PS[w.id] }; });
  // סדר = כרטיס אחד דומיננטי "מה הבא שלי" ← משמרת ← מחכה לך (עד 3) ← משימות ← דוח פתוח ← השעות שלי
  box.innerHTML = `${heroDays.map(w => dayHero(w, byId.get(w.project_id) || {}, cov[w.project_id], LS[w.id], w.status === 'done' && ahead[0] && !needsOk(ahead[0]) ? { ...ahead[0], pname: byId.get(ahead[0].project_id)?.name } : null)).join('') || (sv.length ? '' : empty('calendar', 'אין שיבוץ בשבועיים הקרובים', 'שיבוץ חדש יופיע כאן'))}
    <div id="hclock"></div><div id="qown"></div><div id="attn"></div>
    <div id="mytasks"></div><div id="openpast"></div>
    ${pendRest.length === 1 ? `<div class="list">${dayRow(pendRest[0], byId)}</div>` : pendRest.length > 1 ? `<div class="okall" data-act="all"><span class="grow"><b>${pendRest.length} ימים מחכים לאישור הגעה</b><small>${pendRest.map(w => dayWord(w.day).replace('יום ', '')).join(' · ')}</small></span><button class="btn primary" data-confirm-all="${pendRest.map(x => x.id).join(',')}">אגיע לכולם ✓</button></div>` : ''}
    ${sv.length ? `<section><div class="sh-row"><h3 class="sh">סיורי אפיון</h3><a class="more" href="#/specs">כל האפיונים</a></div><div class="list">${sv.map(x => `<a class="lrow" href="${esc(x.href)}"><span class="grow"><b>${esc(x.name)}</b><small>${esc([x.visit_date === t ? 'היום' : dayWord(x.visit_date).replace('יום ', ''), x.scope_text, x.contact_name].filter(Boolean).join(' · '))}</small></span><span class="pill ${x.st === 'draft' ? 'warn' : ''}">${x.st === 'draft' ? 'בטיוטה' : 'לאפיון'}</span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
    <div id="pulse">${pulseHtml(await cache.get('pulse').catch(() => null))}</div>`;
  const gone = openToday.find(w => w.status !== 'planned' && w.crew_lead_id !== state.user.id);
  bindConfirm(box); bindNext(box, heroDays); extras(gone ? { label: `${(byId.get(gone.project_id)?.name || 'הצוות')} · הצוות ${gone.status === 'en_route' ? 'בדרך' : 'באתר'}`, project_id: gone.project_id } : null); pastOpen($('#openpast'));
  othersPending().then(o => { const b = $('#qown'); if (b && o.length) b.innerHTML = o.map(othersCard).join(''); }).catch(() => {});
  fillGlance(box, P);
  pulse($('#pulse'), ahead.length + mine.filter(w => w.status !== 'done').length);
  prefetchDays((d.wdays || []).filter(w => (isCurrent(w, t) || w.day === addDays(t, 1)) && mineDay(w)).map(w => w.id));
}
// סיורי אפיון בשבוע הקרוב שעוד לא הושלמו (תאריך הסיור מהליד). ליד עם מבנה אחד → ישר לטופס
async function surveyVisits(t) {
  try {
    const { data } = await sb.from('sites').select('id,slug,name,kind,visit_date,scope_text,contact_name,merged_into,buildings(id,specs(status))')
      .eq('is_active', true).is('merged_into', null).gte('visit_date', t).lte('visit_date', addDays(t, 7)).order('visit_date');
    return (data || []).map(x => { const B = x.buildings || [], st = b => (b.specs?.[0] || b.specs)?.status;
      if (B.length && B.every(b => st(b) === 'done')) return null;
      return { ...x, st: B.some(b => st(b) === 'draft') ? 'draft' : 'new', href: x.kind === 'lead' && B.length === 1 ? `#/b/${x.slug}/${B[0].id}` : `#/site/${x.slug}` };
    }).filter(Boolean);
  } catch { return []; }
}
// כרטיס יום ראשי: היום (פתיחה/המשך) או השיבוץ הבא (מחר / יום ד׳ 14.10) — שעות, כתובת, מי איתי, תחזית ואישור הגעה
// "מה הבא שלי": פעולה אחת לפי השעה והמצב — אישור ← העמסה ← יציאה ← הגעה ← עבודה ← סגירה (ראש צוות) / יציאה מהמשמרת (צוות)
// s = השלב (0 בוקר … 5 נסגר) · act = מה הכפתור עושה: go (ליום) · load / close (ליום, ישר לשלב) · arrive · photo · out
const iLeadOf = w => !w.crew_lead_id || w.crew_lead_id === state.user.id;
// עצירה לפני תחילת העבודה (חריג בבדיקה, db/130): ממתינים להחלטה · הופסקה · הרחפן הושבת ועוד לא הוחלף — במקום "סיום יום"/"מתחילים לעבוד"
async function prestartHold(days) {
  if (!days.length) return {};
  try {
    const ids = days.map(w => w.id);
    const [{ data: I }, { data: W }] = await Promise.all([
      sb.from('issues').select('work_day_id,decision,decision_note,status,equipment_id,created_at').in('work_day_id', ids).not('prestart', 'is', null).order('created_at', { ascending: false }),
      sb.from('work_days').select('id,drone_id,opened_at').in('id', ids)]);
    const out = {};
    for (const w of days) {
      const L = (I || []).filter(x => x.work_day_id === w.id), d = (W || []).find(x => x.id === w.id) || {};
      if (d.opened_at) continue;   // העבודה כבר התחילה — עצירה אחר כך היא תקלה רגילה
      const st = L.find(x => x.decision === 'stopped'), gr = L.find(x => x.decision === 'grounded' && (!x.equipment_id || x.equipment_id === d.drone_id));
      if (L.some(x => !x.decision && x.status === 'open')) out[w.id] = 'העבודה הופסקה · ממתין להחלטת מנהל תפעול';
      else if (w.status === 'issue' && st) out[w.id] = 'העבודה הופסקה' + (st.decision_note ? ' · ' + st.decision_note : '');
      else if (w.status === 'on_site' && gr) out[w.id] = 'הרחפן הושבת · ממתינים לרחפן חלופי';
    }
    return out;
  } catch { return {}; }
}
function nextStep(w, L) {
  const lead = iLeadOf(w), isToday = isCurrent(w, today());
  if (w.day > today()) return needsOk(w) ? { s: -1, confirm: true } : { s: -1, act: 'go', cta: 'לפרטי היום', ghost: true };
  if (w.status === 'done') return { s: 5, act: 'go', cta: 'היום נסגר ✓', ghost: true, done: true };
  if (w.finished_at || (L?.stage === 4 && lead)) return lead ? { s: 4, act: 'close', cta: w.kind === 'report' ? 'שליחת הדוח' : 'סגירת היום ושליחה' } : { s: 4, act: 'out', cta: 'יציאה מהמשמרת', wait: true };
  if (w.kind === 'report') return { s: 4, act: 'close', cta: 'השלמת הדוח' };
  if (L?.hold) return { s: 2, act: 'go', cta: L.hold, ghost: true };
  if (['working', 'issue'].includes(w.status)) return lead ? { s: 3, act: 'close', cta: 'סיום יום' } : { s: 3, act: 'photo', cta: 'צילום מהעבודה' };
  if (w.arrived_at || w.status === 'on_site') return { s: 2, act: 'go', cta: 'מתחילים לעבוד' };
  if (w.departed_at || w.status === 'en_route') return { s: 2, act: 'arrive', cta: 'הגענו לאתר' };
  if (L?.stage === 1) return { s: 1, act: 'go', cta: 'יוצאים לאתר' };
  return { s: 0, act: isToday ? 'load' : 'go', cta: 'מתחילים העמסה' };
}
const minsTo = hm => { if (!hm) return null; const [h, m] = hm.split(':').map(Number), at = new Date(); at.setHours(h, m, 0, 0); return Math.round((at - Date.now()) / 6e4); };
// כרטיס יום ראשי: תמונה, שם, שעות, מי איתי, תחזית — ומתחת כפתור אחד גדול: הדבר הבא שלי
function dayHero(w, pr, cover, L, next) {
  const isToday = isCurrent(w, today()), crew = (w.work_day_crew || []).filter(c => c.user_id !== state.user.id && c.profiles?.full_name);
  const ilead = w.crew_lead_id === state.user.id, N = nextStep(w, L);
  const no = meOn(w)?.cant_come_at || PQ.no.has(w.id), okd = meOn(w)?.confirmed_at || PQ.ok.has(w.id);
  const left = isToday && w.status === 'planned' && N.s <= 1 ? minsTo(w.report_time) : null;
  const when = left == null ? '' : left > 0 && left < 240 ? `עוד ${left >= 60 ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : left + ' דק׳'}` : left <= 0 ? 'זמן לצאת' : '';
  const chip2 = w.status !== 'planned' ? DAY_ST[w.status] : no ? 'לא אגיע' : okd && !isToday ? 'אישרת ✓' : when;
  const steps = N.s >= 0 && w.kind !== 'report' ? `<span class="hsteps" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i < N.s ? 'd' : i === N.s ? 'n' : ''}"></i>`).join('')}</span>` : '';
  const btn = N.confirm ? `<div class="row-btns nxb" data-act="${w.id}"><button class="btn ghost" data-cant="${w.id}">לא אוכל</button><button class="btn primary nxgo" data-confirm="${w.id}">אגיע ✓</button></div>`
    : N.act === 'photo' ? `<label class="btn primary block nxgo">${icon('photo', 22)} ${N.cta}<input type="file" accept="image/*" capture="environment" multiple hidden data-nxph="${w.id}"></label>`
    : `<button class="btn ${N.ghost ? 'ghost' : 'primary'} block nxgo" data-nx="${N.act}" data-id="${w.id}"${N.done ? ' data-done="1"' : ''}${N.wait ? ' data-wait="1"' : ''}>${N.cta}</button>`;
  const nx = N.done && next ? `<a class="lrow nextup" href="#/day/${next.id}"><span class="grow"><small>הבא · ${esc(dayWord(next.day))}</small><b>${esc(next.pname || '')}</b></span>${next.report_time ? `<b class="nxt">${next.report_time.slice(0, 5)}</b>` : ''}<span class="chev">${icon('chev', 18)}</span></a>` : '';
  return `<div class="dhero nxh"><a class="photo-hero" href="#/day/${w.id}">
      <span class="img" style="background-image:url('${cover || ''}')"></span>
      <span class="ph-top"><span class="chip-dark">${isNight(w) ? nightTag(w) + ' ' : ''}${isToday ? (isNight(w) ? 'הלילה' : 'היום') : esc(dayWord(w.day))}${w.is_last_day ? ' · יום אחרון' : ''}${ilead ? ' · ★' : ''}</span>${chip2 ? `<span class="chip-dark">${chip2}</span>` : ''}</span>
      <span class="ph-bottom"><b>${esc(pr.name || '')}</b>
        <span class="hero-times">${w.report_time && N.s < 2 ? `<span><small>יציאה</small><b>${w.report_time.slice(0, 5)}</b></span>` : ''}${w.site_arrival && N.s < 3 ? `<span><small>באתר</small><b>${w.site_arrival.slice(0, 5)}</b></span>` : ''}${isNight(w) && w.site_end && N.s < 4 ? `<span><small>סיום${carryNight(w) ? '' : ' · למחרת'}</small><b>${w.site_end.slice(0, 5)}</b></span>` : ''}${N.s < 4 ? `<span class="wxg" data-wxg="${esc(pr.site_id || pr.id || '')}|${wxKey(w)}"></span>` : ''}</span>
        ${crew.length ? `<span class="hero-crew">${crew.slice(0, 4).map(c => `<span class="avatar xs">${esc(initials(c.profiles.full_name))}</span>`).join('')}<small>${esc(crew.map(c => c.profiles.full_name.split(' ')[0] + (c.user_id === w.crew_lead_id ? ' ★' : '')).join(', '))}</small></span>` : ''}
        ${steps}</span></a>
    ${btn}${nx}</div>`;
}
// הכפתור הראשי: ישר לשלב ביום (בלי לחיצה נוספת שם), הגעה / צילום בלחיצה מהבית, יציאה מהמשמרת
function bindNext(root, days) {
  const setStage = async (id, n) => { const k = 'day:' + id + ':local', L = (await cache.get(k).catch(() => null)) || { stage: null, checks: {}, loaded: null }; L.stage = n; await cache.set(k, L).catch(() => {}); };
  $$('[data-nx]', root).forEach(b => b.onclick = async () => {
    if (b.disabled) return; const id = b.dataset.id, w = days.find(x => x.id === id), a = b.dataset.nx; haptic('tap');
    if (a === 'load') { await setStage(id, 1); location.hash = '#/day/' + id; return; }
    if (a === 'close') { if (w?.kind !== 'report') await setStage(id, 4); location.hash = '#/day/' + id; return; }
    if (a === 'arrive') { b.disabled = true; await enqueue({ kind: 'update', table: 'work_days', rowId: id, patch: { arrived_at: new Date().toISOString(), status: 'on_site' } }); haptic('success');
      await flush().catch(() => {});   // יום השטח נטען אחרי שהשרת קיבל (בלי קליטה — מהתור)
      location.hash = '#/day/' + id; return; }
    if (a === 'out') { const A = await import('./attendance.js'), open = await A.myOpenShift().catch(() => null); if (!open) { location.hash = '#/day/' + id; return; }
      b.disabled = true; b.textContent = 'מאתר מיקום…'; await A.clockOutNow(open); haptic('success'); renderHome($('#app')); return; }
    location.hash = '#/day/' + id;
  });
  // יום שנסגר / ראש הצוות סוגר: יש משמרת פתוחה → הכפתור הופך ל"יציאה מהמשמרת"; אין — הכפתור של "סגור" נשאר שקט
  $$('[data-done],[data-wait]', root).forEach(async b => { const A = await import('./attendance.js'), open = await A.myOpenShift().catch(() => null);
    if (open && b.isConnected) { b.dataset.nx = 'out'; b.className = 'btn primary block nxgo'; b.textContent = 'יציאה מהמשמרת'; const hc = $('#hclock'); if (hc) hc.hidden = true; }   // כרטיס השעון — מיותר כשהכפתור הראשי הוא היציאה
    else if (b.dataset.wait && b.isConnected) { b.dataset.nx = 'go'; b.className = 'btn ghost block nxgo'; b.textContent = 'ראש הצוות סוגר את היום'; } });
  $$('[data-nxph]', root).forEach(inp => inp.onchange = async () => {
    const w = days.find(x => x.id === inp.dataset.nxph); let ok = 0;
    for (const f of [...inp.files]) try { await addFieldPhoto(f, { kind: 'general', work_day_id: w.id, project_id: w.project_id }); ok++; } catch { /* */ }
    inp.value = ''; haptic(ok ? 'success' : 'warn'); toast(ok ? (ok > 1 ? `${ok} תמונות נשמרו` : 'התמונה נשמרה') : 'התמונה לא נשמרה — נסו שוב', 3000, ok ? undefined : 'error');
  });
}
// תחזית במבט: משבים + פסיקה (טוב לטיסה / גבולי / לא לטוס) לכל יום שמסומן data-wxg="siteId|day"
const geoOf = p => { const la = p?.sites?.lat ?? p?.lat, ln = p?.sites?.lng ?? p?.lng; return la != null && ln != null ? { id: p.site_id || p.id, lat: la, lng: ln } : null; };
async function fillGlance(root, projs) {
  const els = $$('[data-wxg]', root); if (!els.length) return;
  const S = [...new Map((projs || []).map(geoOf).filter(Boolean).map(s => [s.id, s])).values()];
  let D = {}; try { D = await (await import('../lib/wx.js')).siteDays(S); } catch { /* */ }
  els.forEach(e => { const [sid, day] = e.dataset.wxg.split('|'), x = D[sid]?.[day]; if (!x) return e.remove();
    e.className = 'wxg ' + ['ok', 'mid', 'bad'][x.L]; e.innerHTML = `<small>${['טוב לטיסה', 'גבולי', 'לא לטוס'][x.L]}</small><b>${Math.round(x.g)}<i>קמ״ש</i></b>`; e.title = 'משבים'; });
}
// הדופק שלי: שעות החודש (מנוע הנוכחות), ימי עבודה, ימי שטח קדימה. נשמר למטמון — מוצג מיד גם בלי קליטה
const pulseHtml = v => !v || !v.days ? '' :   // עובד חדש בלי שעות ובלי שיבוץ — בלי פס אפסים
  `<div class="pulse"><a href="#/hours"><b>${v.h}</b><small>שעות החודש</small></a><a href="#/hours"><b>${v.days}</b><small>ימי עבודה</small></a><a href="#/schedule"><b>${v.ahead}</b><small>קדימה</small></a>${v.ot ? `<a href="#/hours"><b>${v.ot}</b><small>נוספות</small></a>` : ''}</div>`;
async function pulse(box, ahead) {
  if (!box || !navigator.onLine) return;
  try {
    const L = await import('../lib/labor.js'), month = L.ymd(new Date()).slice(0, 7);
    const from = new Date(month + '-01T00:00:00+03:00'); from.setDate(from.getDate() - 7);   // שבוע אחורה — לחישוב השבועי (42)
    const [{ data: sh, error }, { data: st }] = await Promise.all([
      sb.from('shifts').select('start_at,end_at,break_min,source,created_at,start_lat').eq('user_id', state.user.id).gte('start_at', from.toISOString()).order('start_at'),
      sb.from('app_settings').select('value').eq('key', 'attendance').maybeSingle()]);
    if (error) throw error;
    const now = new Date().toISOString(), R = L.computeMonth((sh || []).map(x => x.end_at ? x : { ...x, end_at: now }), month, st?.value || {});
    const T = R.totals, ot = T.ot125 + T.ot150;
    const MON = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const v = { h: L.hhmm(T.net), days: T.days, ahead, ot: ot >= 0.25 ? L.hhmm(ot) : '', m: MON[+month.slice(5) - 1] };
    await cache.set('pulse', v); if (box.isConnected) box.innerHTML = pulseHtml(v);
  } catch { /* בלי קליטה — מה שבמטמון */ }
}
// ימים של היום ומחר נטענים מראש למטמון — כדי שיום השטח ייפתח באתר גם בלי קליטה
async function prefetchDays(ids) {
  if (!ids.length || !navigator.onLine) return;
  try {
    const [{ loadDay }, { outbox }] = await Promise.all([import('./today.js'), import('../lib/store.js')]);
    const q = await outbox.all();
    for (const id of ids) {
      if (q.some(x => x.rowId === id || x.args?.d === id || x.row?.work_day_id === id || x.meta?.work_day_id === id)) continue;   // יש שינויים בתור — לא דורסים
      const c = await cache.get('day:' + id).catch(() => null); if (c?.at && Date.now() - c.at < 15 * 6e4) continue;
      await loadDay(id).catch(() => {});
    }
  } catch { /* */ }
}
// ימים שעברו ועוד לא נסגרו (שלי — בצוות או ראש צוות)
async function pastOpen(box) {
  if (!box) return;
  const me = state.user.id, t = today(), from = addDays(t, -21), sel = 'id,day,status,kind,night,site_arrival,site_end,project_id,crew_lead_id,projects(name)';
  let rows;
  try {
    const [a, b] = await Promise.all([
      sb.from('work_days').select(sel + ',work_day_crew!inner(user_id)').eq('work_day_crew.user_id', me).lt('day', t).gte('day', from).neq('status', 'done'),
      sb.from('work_days').select(sel).eq('crew_lead_id', me).lt('day', t).gte('day', from).neq('status', 'done')]);
    if (a.error || b.error) throw a.error || b.error;
    rows = [...new Map([...(a.data || []), ...(b.data || [])].map(w => [w.id, w])).values()].filter(w => (!w.crew_lead_id || w.crew_lead_id === me) && !carryNight(w, t)).sort((x, y) => x.day < y.day ? 1 : -1);   // לילה של אתמול שעוד בעיצומו — הכרטיס הראשי, לא "לא נסגר"
    await cache.set('home-past', rows);
  } catch { rows = (await cache.get('home-past').catch(() => null)) || []; }
  const open = [];
  for (const w of rows) { const c = await cache.get('day:' + w.id).catch(() => null); if (c?.day?.status !== 'done') open.push(w); }   // נסגר בטלפון ועוד בתור — לא מציגים
  if (!box.isConnected) return;
  box.innerHTML = open.length ? `<section><div class="sh-row"><h3 class="sh">דוח שלא נסגר</h3><span class="count">${open.length}</span></div><div class="list">${open.map(w => `<a class="lrow" href="#/day/${w.id}"><span class="datebox"><b>${+w.day.slice(8)}</b><small>יום ${HE_D1[new Date(w.day + 'T12:00').getDay()]}</small></span>
    <span class="grow"><b>${esc(w.projects?.name || '')}</b><small>${w.kind === 'report' ? 'דוח יומי' : 'יום שטח'} · ${DAY_ST[w.status] || ''}</small></span><span class="pill warn">לסגירה</span></a>`).join('')}</div></section>` : '';
}
// אישורי הגעה / "לא אוכל" שעוד בתור (בלי קליטה) — נחשבים כבר נשלחו
const PQ = { ok: new Set(), no: new Set() };
async function pendingConfirms() {
  try { const { outbox } = await import('../lib/store.js'); const q = (await outbox.all()).filter(x => x.kind === 'rpc');
    PQ.ok = new Set(q.filter(x => x.fn === 'confirm_day').map(x => x.args.d)); PQ.no = new Set(q.filter(x => x.fn === 'cant_come').map(x => x.args.d)); } catch { /* */ }
}
const meOn = w => (w.work_day_crew || []).find(c => c.user_id === state.user.id);
const needsOk = w => { const me = meOn(w); return !!me && !me.confirmed_at && !me.cant_come_at && !PQ.ok.has(w.id) && !PQ.no.has(w.id) && w.status === 'planned' && w.day > today(); };
// שורת יום: תאריך · פרויקט · שעות · מי איתי · תחזית; אישור הגעה בשורה עצמה (שני כפתורים קטנים). "מאשר הכל" — כרטיס אחד מעל הרשימה
const dayRow = (w, byId, compact = false) => { const me = meOn(w), pr = byId.get(w.project_id) || w.projects || {};
  const needConfirm = needsOk(w), no = me?.cant_come_at || PQ.no.has(w.id), okd = me?.confirmed_at || PQ.ok.has(w.id);
  const crew = (w.work_day_crew || []).filter(c => c.user_id !== state.user.id).map(c => (c.profiles?.full_name || '').split(' ')[0]).filter(Boolean);
  const st = no && w.status === 'planned' ? '<span class="pill bad">לא אגיע</span>' : w.status !== 'planned' ? `<span class="pill ${w.status === 'done' ? 'ok' : 'lime'}">${DAY_ST[w.status]}</span>` : okd ? '<span class="pill ok">אישרת ✓</span>' : '';
  return `<div class="dayrow"><a class="lrow" href="#/day/${w.id}"><span class="datebox ${w.day === today() ? 'now' : ''}"><b>${+w.day.slice(8)}</b><small>${w.day === today() ? 'היום' : 'יום ' + HE_D1[new Date(w.day + 'T12:00').getDay()]}</small></span>
  <span class="grow"><b>${esc(pr.name || '')}${nightTag(w)}</b><small>${[w.report_time ? 'יציאה ' + w.report_time.slice(0, 5) : '', isNight(w) ? esc(nightRange(w)) : w.site_arrival ? 'באתר ' + w.site_arrival.slice(0, 5) : '', w.is_last_day ? 'יום אחרון' : '', w.crew_lead_id === state.user.id ? 'ראש צוות' : '', crew.length ? 'עם ' + esc(crew.join(', ')) : ''].filter(Boolean).join(' · ')}</small></span>
  <span class="dr-end">${st}<span class="wxg" data-wxg="${esc(pr.site_id || pr.id || '')}|${wxKey(w)}"></span></span></a>
  ${needConfirm ? `<div class="${compact ? 'chips dr-mini' : 'row-btns dr-act'}" data-act="${w.id}"><button class="${compact ? 'chip' : 'btn ghost sm'}" data-cant="${w.id}">לא אוכל</button><button class="${compact ? 'chip on' : 'btn primary sm'}" data-confirm="${w.id}">אגיע ✓</button></div>` : ''}</div>`; };
// נשלח דרך התור — עובד גם בלי קליטה
function bindConfirm(root) {
  const done = (id, html) => { PQ.ok.add(id); $$(`[data-act="${id}"]`, root).forEach(x => x.outerHTML = html); };
  const ACK = '<div class="acked" style="text-align:center">אישרת הגעה ✓</div>';
  $$('[data-confirm]', root).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true; const id = b.dataset.confirm;
    await enqueue({ kind: 'rpc', fn: 'confirm_day', args: { d: id } }); haptic('success'); toast('אישרת הגעה'); done(id, ACK);
    $$('[data-confirm-all]', root).forEach(x => { const ids = x.dataset.confirmAll.split(',').filter(y => y !== id); if (ids.length < 2) x.closest('.okall')?.remove(); else { x.dataset.confirmAll = ids.join(','); const t = x.closest('.okall')?.querySelector('b'); if (t) t.textContent = `${ids.length} ימים מחכים לאישור הגעה`; } }); });
  $$('[data-confirm-all]', root).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true; const ids = b.dataset.confirmAll.split(',');
    for (const id of ids) { await enqueue({ kind: 'rpc', fn: 'confirm_day', args: { d: id } }); done(id, ACK); }
    haptic('success'); b.closest('.okall')?.classList.add('done'); const t = b.closest('.okall'); if (t) t.innerHTML = `<span class="grow"><b>${ids.length > 1 ? `אישרת ${ids.length} ימים ✓` : 'אישרת הגעה ✓'}</b></span>`;
    toast(`אישרת ${ids.length} ימים`); });
  $$('[data-cant]', root).forEach(b => b.onclick = async () => { const id = b.dataset.cant;
    const why = await ask('לא אוכל להגיע', { placeholder: 'סיבה (לא חובה)', ok: 'עדכון המנהל', optional: true }); if (why == null) return;
    await enqueue({ kind: 'rpc', fn: 'cant_come', args: { d: id, reason: why.trim() || null } }); PQ.no.add(id);
    $$(`[data-act="${id}"]`, root).forEach(x => x.outerHTML = '<div class="acked" style="text-align:center">המנהל קיבל עדכון</div>'); toast('המנהל עודכן'); });
}
// ---------- כל מה שלטיפול ----------
export async function renderAlerts(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>לטיפול</h1></header><div id="al"><div class="skel"></div></div>`;
  const d = await load(); const A = alerts(d).map(a => ({ ...a, ic: icon(a.ic, 20) })), box = $('#al'); if (!box) return;
  box.innerHTML = A.length ? needsList(A, { limit: 99, head: false, id: 'alerts' }) : empty('shield', 'הכל תחת שליטה', '', 'ok');
  bindNeeds(box, A, () => renderAlerts(el));
}

// ---------- לו״ז ----------
export async function renderSchedule(el) {
  const M = isManager();
  if (!M) return mySchedule(el);
  // מנהל: הלשונית היא לוח השיבוץ של השבוע (+ פרויקטים שמחכים לתאריך). עובד: הימים שלו.
  if (M) { const { renderDispatch } = await import('./dispatch.js'); await renderDispatch(el, null, { title: 'לו״ז' }); }
  else el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>לו״ז</h1></header>`;
  el.insertAdjacentHTML('beforeend', '<div id="sc" class="stack lg" style="margin-top:28px"></div>');
  const d = await load(); const box = $('#sc'); if (!box) return;
  const t = today();
  const by = new Map((d.projects || []).map(p => [p.id, p]));
  const mine = (d.wdays || []).filter(w => w.day >= t && mineDay(w));
  const hasDay = new Set((d.wdays || []).filter(w => w.day >= t).map(w => w.project_id));
  const noDate = (d.projects || []).filter(isOpen).filter(p => ['קביעת מועד', 'תואם - ממתין לביצוע', 'אושר מול לקוח', 'בביצוע'].includes(p.status_label) && !hasDay.has(p.id) && !((p.planned_to || p.planned_from || '') >= t));
  await pendingConfirms(); mine.sort((a, b) => a.day < b.day ? -1 : 1);
  box.innerHTML = `${!M ? `<section><h3 class="sh">הימים שלי</h3>${mine.length ? `<div class="list">${mine.map(w => dayRow(w, by, mine)).join('')}</div>` : '<div class="empty-line">אין לך ימי שטח משובצים</div>'}</section>` : ''}
    ${M && noDate.length ? `<section><div class="sh-row"><h3 class="sh">ממתינים לתאריך במאנדי</h3><span class="count">${noDate.length}</span></div>
      <div class="alist">${noDate.map(p => `<a class="arow" href="#/p/${p.id}"><span class="aic">${icon('calendar', 20)}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc([p.status_label, p.client_name].filter(Boolean).join(' · '))}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}`;
  bindConfirm(box);
}

// ---------- הלו״ז שלי (עובד שטח / ראש צוות): פס שבועיים במבט, ואז הימים לפי שבוע, עם מי ותחזית ----------
const dowOf = s => new Date(s + 'T12:00').getDay();
async function myDays(from, to) {
  const me = state.user.id, sel = 'id,day,status,night,report_time,site_arrival,site_end,project_id,crew_lead_id,is_last_day,day_goal,kind,projects(id,name,site_id,lat,lng,sites(lat,lng)),work_day_crew(*,profiles(full_name))';
  const [a, b] = await Promise.all([
    sb.from('work_days').select(sel.replace('work_day_crew(*', 'mine:work_day_crew!inner(user_id),work_day_crew(*')).eq('mine.user_id', me).gte('day', from).lte('day', to),
    sb.from('work_days').select(sel).eq('crew_lead_id', me).gte('day', from).lte('day', to)]);
  if (a.error || b.error) throw a.error || b.error;
  return [...new Map([...(a.data || []), ...(b.data || [])].map(w => [w.id, w])).values()].filter(w => w.status !== 'cancelled').sort((x, y) => x.day < y.day ? -1 : x.day > y.day ? 1 : (x.report_time || '') < (y.report_time || '') ? -1 : 1);
}
async function mySchedule(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>הלו״ז שלי</h1></header><div id="sc" class="stack lg">${'<div class="skel"></div>'.repeat(3)}</div>`;
  const t = today(), m0 = t.slice(0, 8) + '01';
  let rows;
  try { rows = await myDays(m0 < addDays(t, -14) ? m0 : addDays(t, -14), addDays(t, 60)); await cache.set('my-sched', rows); }
  catch { rows = (await cache.get('my-sched').catch(() => null)) || []; }
  const box = $('#sc'); if (!box) return;
  await pendingConfirms();
  const by = new Map(rows.map(w => [w.project_id, w.projects || {}]));
  const ahead = rows.filter(w => w.day >= t), past = rows.filter(w => w.day < t && w.day >= m0).reverse(), pend = ahead.filter(needsOk);
  const byDay = new Map(); rows.forEach(w => { if (!byDay.has(w.day)) byDay.set(w.day, []); byDay.get(w.day).push(w); });
  // פס 14 יום מתחילת השבוע: יום עם שיבוץ צבוע; לחיצה = היום עצמו
  const s0 = addDays(t, -dowOf(t)), strip = Array.from({ length: 14 }, (_, i) => addDays(s0, i));
  const cell = s => { const ws = byDay.get(s) || [], w = ws[0], tone = !w ? '' : w.status === 'done' ? 'ok' : (meOn(w)?.cant_come_at || PQ.no.has(w.id)) ? 'bad' : 'on';
    const tag = w ? `a href="#/day/${w.id}"` : 'span';
    return `<${tag} class="wkc ${tone} ${s === t ? 'now' : ''} ${s < t ? 'past' : ''} ${dowOf(s) === 6 ? 'sat' : ''}"><small>${HE_D1[dowOf(s)]}</small><b>${+s.slice(8)}</b>${ws.length > 1 ? `<i>${ws.length}</i>` : ''}</${tag.split(' ')[0]}>`; };
  const doneM = past.filter(w => w.status === 'done').length + ahead.filter(w => w.status === 'done').length, leftM = ahead.filter(w => w.day.slice(0, 7) === t.slice(0, 7) && w.status !== 'done').length;
  const wk = s => { const k = addDays(s, -dowOf(s)); return k === s0 ? 'השבוע' : k === addDays(s0, 7) ? 'שבוע הבא' : `שבוע ${dm(k)}`; };
  const groups = []; ahead.forEach(w => { const k = wk(w.day); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, ws: [] }); g.ws.push(w); });
  box.innerHTML = `<div class="wkstrip">${strip.map(cell).join('')}</div>
    <div class="pulse sm"><span><b>${doneM}</b><small>ימי שטח החודש</small></span><span><b>${leftM}</b><small>נשארו החודש</small></span><span><b>${ahead.length}</b><small>משובץ קדימה</small></span></div>
    ${pend.length > 1 ? `<div class="okall"><span class="grow"><b>${pend.length} ימים מחכים לאישור הגעה</b><small>${pend.map(w => dayWord(w.day).replace('יום ', '')).join(' · ')}</small></span><button class="btn primary" data-confirm-all="${pend.map(x => x.id).join(',')}">אגיע לכולם ✓</button></div>` : ''}
    ${groups.map(g => `<section><h3 class="sh">${g.k}</h3><div class="list">${g.ws.map(w => dayRow(w, by, pend.length > 1)).join('')}</div></section>`).join('') || empty('calendar', 'אין שיבוץ קדימה', 'שיבוץ חדש יופיע כאן, עם התראה')}
    ${past.length ? `<details class="fold"><summary><span class="sh">ימים שעברו החודש</span><span class="count">${past.length}</span></summary><div class="list">${past.map(w => dayRow(w, by)).join('')}</div></details>` : ''}`;
  bindConfirm(box); fillGlance(box, [...by.values()]);
}

// ---------- דוחות שטח ----------
export async function renderReports(el) {
  // דוחות שטח מסודרים בתיקיות: תיקייה לכל פרויקט (תמונה, כמה דוחות, האחרון, תקלות). לחיצה = הדוחות של אותו פרויקט
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1>דוחות שטח</h1></header>
    <div id="prodx"></div><input type="search" class="search" id="rq" placeholder="חיפוש פרויקט"><div id="rl"><div class="skel"></div></div>`;
  import('./zones.js').then(m => m.prodSection($('#prodx'))).catch(() => {});   // תפוקה: מ״ר לשעה (db/112)
  const [{ data: reps }, { data: days }, { data: projs }] = await Promise.all([
    sb.from('field_reports').select('project_id,report_date,had_issues').limit(2000),
    sb.from('work_days').select('project_id,day,status').eq('status', 'done').limit(2000),
    sb.from('projects').select('id,name,client_name,cover_path,status_label')]);
  const by = new Map();
  for (const r of reps || []) { const k = r.project_id || '_'; const x = by.get(k) || { n: 0, last: '', iss: 0 }; x.n++; if (r.report_date > x.last) x.last = r.report_date; if (r.had_issues) x.iss++; by.set(k, x); }
  for (const d of days || []) { const k = d.project_id || '_'; const x = by.get(k) || { n: 0, last: '', iss: 0 }; x.n++; if (d.day > x.last) x.last = d.day; by.set(k, x); }
  const P = (projs || []).filter(p => by.has(p.id)).sort((a, b) => by.get(b.id).last.localeCompare(by.get(a.id).last));
  const cov = await covers(P);
  const draw = q => {
    const list = P.filter(p => !q || (p.name + ' ' + (p.client_name || '')).includes(q));
    $('#rl').innerHTML = list.length ? folderGrid(list.map(p => { const x = by.get(p.id);
      return { href: `#/p/${p.id}/d`, img: cov[p.id], title: p.name, sub: `${x.n} דוחות · אחרון ${dm(x.last)}`, count: x.n, pill: x.iss ? `${x.iss} תקלות` : '', tone: 'warn' }; }))
      : '<div class="empty-card"><span><b>לא נמצא</b><small>נסו שם אחר</small></span></div>';
  };
  $('#rq').oninput = e => draw(e.target.value.trim()); draw('');
}

// תוספות בראש המסך אחרי שהוא צויר: הודעות לאישור, הפעלת התראות
export function extras(clockHint = null) {
  if (isManager()) yesterday();
  import('./tasks.js').then(m => m.myTasks($('#mytasks'))).then(hideQueuedTasks).catch(() => {});
  import('./attention.js').then(m => m.attention($('#attn'), isManager() ? {} : { limit: 3 }));
  pendingAcks();
  import('./attendance.js').then(m => m.clockCard($('#hclock') || $('#hm'), null, clockHint));
}
// הודעות חשובות שמחכות לאישור שלי — בראש המסך, עד שמאשרים
async function pendingAcks() {
  let rows = []; try { const { data } = await sb.rpc('my_pending_acks'); rows = data || []; } catch { return; }
  const box = $('#hm'); if (!box || !rows.length) return;
  const wrap = document.createElement('div'); wrap.className = 'stack'; wrap.style.gap = '10px';
  wrap.innerHTML = rows.slice(0, 3).map(m => `<div class="must" data-m="${m.id}"><div class="mh"><span class="pill warn">חשוב · לאישור</span><small>${esc(m.author || '')} · ${esc(m.title || '')}</small></div>
    <div class="mb">${esc(m.body || 'תמונה')}</div><div class="row-btns"><a class="btn ghost sm" href="${m.conversation_id ? '#/c/' + m.conversation_id : '#/p/' + m.project_id + '/c'}">לשיחה</a><button class="btn primary sm" data-ok="${m.id}">קראתי ואישרתי</button></div></div>`).join('');
  box.prepend(wrap);
  $$('[data-ok]', wrap).forEach(b => b.onclick = async () => {
    if (b.disabled) return; b.disabled = true; const { enqueue } = await import('../lib/core.js');
    await enqueue({ kind: 'insert', table: 'message_acks', row: { message_id: b.dataset.ok, user_id: state.user.id } });
    b.closest('.must').remove();
  });
}

// אתמול בשטח (מנהלים): דוחות, שעות, תקלות, הוצאות — במבט אחד
// הנתונים של חלקי המסך המשניים (אתמול, הודעות לאישור) — אפשר להתחיל לטעון במקביל לטעינה הראשית (warmExtras)
function yData() {
  const y = addDays(today(), -1), from = new Date(y + 'T00:00:00').toISOString(), to = new Date(today() + 'T00:00:00').toISOString();
  const q = p => p.then(r => r.data || []).catch(() => []);
  return Promise.all([
    q(sb.from('field_reports').select('project_label,hours').eq('report_date', y)),
    q(sb.from('work_days').select('id,projects(name)').eq('day', y).eq('status', 'done')),
    q(sb.from('issues').select('id,severity').gte('created_at', from).lt('created_at', to)),
    can('finance') ? q(sb.from('expenses').select('amount').eq('day', y)) : Promise.resolve([]),
    q(sb.from('shifts').select('start_at,end_at').gte('start_at', from).lt('start_at', to)),
  ]);
}
export function warmExtras() { try { if (isManager()) yData(); sb.rpc('my_pending_acks').then(() => {}, () => {}); import('./tasks.js'); import('./attention.js'); import('./attendance.js'); } catch { /* */ } }
async function yesterday() {
  const box = $('#yday'); if (!box) return;
  const y = addDays(today(), -1);
  const [reps, days, iss, exps, shifts] = await yData();
  const hrs = shifts.reduce((t, s) => t + (s.end_at ? (new Date(s.end_at) - new Date(s.start_at)) / 36e5 : 0), 0);
  const projs = new Set([...reps.map(r => r.project_label), ...days.map(d => d.projects?.name)].filter(Boolean));
  if (!projs.size && hrs < 0.5) return;  // מוצג רק כשהייתה עבודת שטח אתמול — לא כרטיס של אפסים
  const ex = exps.reduce((t, e) => t + Number(e.amount), 0);
  box.innerHTML = `<a class="yday" href="${days.length === 1 ? '#/day/' + days[0].id : '#/dispatch/' + y}"><span class="eyebrow">אתמול בשטח</span><span class="ys">
    <span><b>${projs.size}</b><small>פרויקטים</small></span><span><b>${hrs ? Math.round(hrs) : '—'}</b><small>שעות צוות</small></span>
    <span><b>${iss.length}</b><small>תקלות</small></span>${can('finance') ? `<span><b>${ex ? '₪' + Math.round(ex) : '—'}</b><small>הוצאות</small></span>` : ''}</span>
    <small class="muted">${esc([...projs].join(' · '))}</small></a>`;
}
