// הבית של המנהל (מנהל תפעול ומעלה): מסך אחד שעונה על "מה קורה בשטח, מה תקוע, ומה מחכה לי" — ומאשרים ישר מכאן.
// סדר קבוע: מדדים · דורש טיפול (רשימה אחת) · לאישורך · היום בשטח · מחר · המשימות שלי · אתמול.
// היום ומחר בשטח (צוות, מי החתים, מי אישר הגעה, מזג אוויר) · בעיות (מחושבות מהנתונים, שבוע קדימה) · לאישורך (תיקוני שעות, היעדרויות, בקשות למשרד, רכש).
import { sb, state, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, HE_DOW, toast, ask, timeAgo, can, initials, sheet, leadMark, shortName } from '../lib/core.js';
import { attentionItems, sortNeeds, needsList, bindNeeds } from './attention.js';
import { errText } from '../lib/audit.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const first = n => (n || '').split(' ')[0];
const hm = iso => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const ABS = { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש ללא תשלום', other: 'היעדרות' };

export async function renderOps(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהל תפעול ומעלה.</div>'; return; }
  const now = new Date(), hr = now.getHours(), me = state.profile;
  const greet = hr < 5 ? 'לילה טוב' : hr < 12 ? 'בוקר טוב' : hr < 17 ? 'צהריים טובים' : hr < 21 ? 'ערב טוב' : 'לילה טוב';
  const head = `<header class="hhead"><div class="grow"><div class="eyebrow">יום ${HE_DOW[now.getDay()]}, ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(first(me.full_name))}</h1></div>
    <a class="avatar" href="#/menu" aria-label="החשבון שלי">${esc(initials(me.full_name))}</a></header>`;
  if (!el.querySelector('#hm')) el.innerHTML = `${head}<div id="hm" class="stack lg"><div class="skel"></div><div class="skel tall"></div></div>`;
  const home = await import('./home.js');
  const extra = Promise.all([home.load().then(home.alerts).catch(() => []), attentionItems().catch(() => [])]);
  const t = isoDay(), tm = addDays(t, 1), y = addDays(t, -1), wk = addDays(t, 6);
  const q = async p => { try { const { data } = await p; return data || []; } catch { return []; } };
  const admin = state.profile.role === 'admin';
  const [days, people, shifts, abs, sreq, oreq, preq, exq, drones, ended, pulls] = await Promise.all([
    q(sb.from('work_days').select('id,day,status,report_time,crew_lead_id,drone_id,project_id,weather_alerted,gust_max,projects(name,site_id,planned_from,planned_to),work_day_crew(user_id,role,confirmed_at,cant_come_at,cant_come_reason)').gte('day', t).lte('day', wk).neq('status', 'cancelled').order('day').order('report_time')),
    q(sb.from('profiles').select('id,full_name,role,is_active,is_pilot').eq('is_active', true)),
    q(sb.from('shifts').select('id,user_id,start_at,end_at,status,start_dist_m,start_place,note').or(`status.eq.open,start_at.gte.${new Date(y + 'T00:00:00').toISOString()}`).order('start_at', { ascending: false }).limit(80)),
    q(sb.from('absences').select('id,user_id,kind,date_from,date_to,note,status').in('status', ['pending', 'approved']).gte('date_to', y)),
    q(sb.from('shift_requests').select('id,user_id,shift_id,req_start,req_end,reason,created_at').eq('status', 'pending').order('created_at')).then(r => r.filter(x => admin || x.user_id !== state.user.id)),
    q(sb.from('office_requests').select('id,user_id,category,body,status,created_at').neq('status', 'done').order('created_at')).then(r => r.filter(x => x.user_id !== state.user.id && (admin || x.category !== 'שכר'))),   // שכר = הנהלה בלבד
    admin ? q(sb.from('purchase_requests').select('id,status,monday_item_id').in('status', ['submitted', 'pending'])) : [],   // רכש מאושר במאנדי ע״י ההנהלה
    can('finance') ? q(sb.from('expenses').select('id').eq('status', 'pending')) : [],
    q(sb.from('equipment').select('id,name,health').eq('kind', 'drone')),
    q(sb.from('work_days').select('id,day,signoff,project_id,projects!inner(id,name,closed_summary,monday_group)').eq('is_last_day', true).eq('status', 'done').is('projects.closed_summary', null).gte('day', addDays(t, -30))),
    q(sb.from('sync_log').select('created_at,status').eq('entity', 'full_pull').order('created_at', { ascending: false }).limit(6)),
  ]);
  const P = new Map(people.map(p => [p.id, p])), name = id => first(P.get(id)?.full_name) || '—';
  const open = shifts.filter(s => s.status === 'open' && !s.end_at), openBy = new Map(open.map(s => [s.user_id, s]));
  const inToday = new Set(shifts.filter(s => isoDay(new Date(s.start_at)) === t).map(s => s.user_id));
  const absOn = (uid, day) => abs.find(a => a.user_id === uid && a.status === 'approved' && a.date_from <= day && a.date_to >= day);
  const D = new Map(drones.map(d => [d.id, d]));

  // ---- בעיות: כל מה שעלול להפיל יום שטח או שכר (שבוע קדימה — כדי שיהיה זמן לתקן) ----
  const issues = [];
  const busy = new Map(); days.filter(w => w.drone_id && w.status !== 'done').forEach(w => { const k = w.day + w.drone_id; busy.set(k, (busy.get(k) || 0) + 1); });
  for (const w of days) {
    const pn = (w.projects?.name || '').replace(/^[^—]*—\s*/, '') || w.projects?.name || '', when = w.day === t ? 'היום' : w.day === tm ? 'מחר' : `${HE_D1[new Date(w.day + 'T12:00:00').getDay()]} ${dm(w.day)}`, href = `#/day/${w.id}`;
    const crew = (w.work_day_crew || []), ppl = [...new Set([w.crew_lead_id, ...crew.map(c => c.user_id)].filter(Boolean))];
    const fix = w.status === 'planned' ? { act: () => import('./dayadmin.js').then(m => m.openDayAdmin(w.id, () => renderOps(el))) } : {};
    if (!w.crew_lead_id) issues.push({ tone: 'bad', ic: 'users', t: `אין ראש צוות · ${when}`, s: pn, href , ...fix });
    if (!crew.length) issues.push({ tone: 'bad', ic: 'users', t: `לא שובץ צוות · ${when}`, s: pn, href , ...fix });
    else if (!ppl.some(id => P.get(id)?.is_pilot)) issues.push({ tone: 'bad', ic: 'drone', t: `אין מטיס בצוות · ${when}`, s: pn, href , ...fix });
    if (busy.get(w.day + w.drone_id) > 1) issues.push({ tone: 'bad', ic: 'drone', t: `${D.get(w.drone_id)?.name || 'רחפן'} משובץ פעמיים · ${when}`, s: pn, href: `#/dispatch/${w.day}`, ...fix });
    if (w.weather_alerted && w.status === 'planned') issues.push({ tone: 'warn', ic: 'sun', t: `תחזית לא לטוס · ${when}`, s: `${pn}${w.gust_max != null ? ' · משבים עד ' + w.gust_max + ' קמ״ש' : ''}`, href, ...fix });
    const pf = w.projects?.planned_from, pt = w.projects?.planned_to || pf;
    if (pf && w.status === 'planned' && (w.day < pf || w.day > pt)) issues.push({ tone: 'warn', ic: 'calendar', t: `במאנדי ${dm(pf)}${pt !== pf ? '–' + dm(pt) : ''}, משובץ ${when}`, s: pn, href: `#/p/${w.project_id}` });
    // "לא יכול להגיע" — הכי דחוף: צריך מחליף. לחיצה = ניהול היום (הסרה / הוספת אדם)
    crew.filter(c => c.cant_come_at && w.status === 'planned').forEach(c => issues.push({ tone: 'bad', ic: 'users', t: `${name(c.user_id)} לא יכול להגיע · ${when}`, s: [pn, c.cant_come_reason].filter(Boolean).join(' · '), href, ...fix }));
    const un = crew.filter(c => c.role !== 'lead' && !c.confirmed_at && !c.cant_come_at && w.status === 'planned');
    if (un.length && w.day === tm) issues.push({ tone: 'warn', ic: 'clock', t: `${un.length > 1 ? un.length + ' לא אישרו' : name(un[0].user_id) + ' לא אישר'} הגעה למחר`, s: pn + (un.length > 1 ? ' · ' + un.map(c => name(c.user_id)).join(', ') : ''), href, ...fix });
    for (const c of crew) { const a = absOn(c.user_id, w.day); if (a) issues.push({ tone: 'bad', ic: 'calendar', t: `${name(c.user_id)} ב${ABS[a.kind] || 'היעדרות'} ומשובץ ${when}`, s: pn, href, ...fix }); }
    const dr = D.get(w.drone_id); if (dr?.health === 'grounded') issues.push({ tone: 'bad', ic: 'drone', t: `רחפן ${dr.name} מקורקע ומשובץ ${when}`, s: pn, href: `#/equipment/${dr.id}`, ...fix });
  }
  for (const s of open) {
    const h = (Date.now() - new Date(s.start_at)) / 36e5;
    if (isoDay(new Date(s.start_at)) < t) issues.push({ tone: 'bad', ic: 'clock', t: `${name(s.user_id)} לא החתים יציאה מאתמול`, s: `נכנס ${dm(isoDay(new Date(s.start_at)))} ב-${hm(s.start_at)}`, href: `#/attendance/${s.user_id}` });
    else if (h >= 12) issues.push({ tone: 'warn', ic: 'clock', t: `${name(s.user_id)} במשמרת ${Math.floor(h)} שעות`, s: `נכנס ב-${hm(s.start_at)}`, href: `#/attendance/${s.user_id}` });
  }
  shifts.filter(s => isoDay(new Date(s.start_at)) === t && (s.start_dist_m || 0) > 800).forEach(s => issues.push({ tone: 'warn', ic: 'pin', t: `${name(s.user_id)} החתים ${s.start_dist_m >= 1000 ? (s.start_dist_m / 1000).toFixed(1) + ' ק״מ' : s.start_dist_m + ' מ׳'} מהאתר`, s: s.start_place || 'בדיקה', href: `#/attendance/${s.user_id}` }));
  // יום אחרון נסגר בלי חתימת לקוח — החתימה היא מה שמעביר את הפרויקט להנהלה (סיכום + חשבונית), אז חייבים להשיג אותה
  [...new Map(ended.filter(w => !w.signoff && w.projects?.monday_group !== 'group_mm5052gw').map(w => [w.project_id, w])).values()]
    .forEach(w => issues.push({ tone: 'bad', ic: 'report', t: `חסרה חתימת לקוח · ${(w.projects.name || '').replace(/^[^—]*—\s*/, '') || w.projects.name}`, s: `היום האחרון נסגר ב-${dm(w.day)}`, href: `#/signoff/${w.project_id}/${w.id}` }));
  shifts.filter(s => /נסגרה אוטומטית/.test(s.note || '')).forEach(s => issues.push({ tone: 'warn', ic: 'clock', t: `יציאה אוטומטית · ${name(s.user_id)}`, s: `${dm(isoDay(new Date(s.start_at)))} · נרשמו 12 שעות — לוודא`, href: `#/attendance/${s.user_id}` }));
  // הסנכרון עם מאנדי הוא מה שמחזיק את הכל — אם הוא נתקע, זה הדבר הראשון שצריך לדעת
  const lastOk = pulls.find(x => x.status === 'ok');
  if (pulls.length && (!lastOk || Date.now() - new Date(lastOk.created_at) > 40 * 6e4)) issues.unshift({ tone: 'bad', ic: 'alert', t: 'הסנכרון עם מאנדי נעצר', s: lastOk ? `סבב תקין אחרון ${timeAgo(lastOk.created_at)}` : 'הסבבים האחרונים נכשלו', href: can('admin') ? '#/admin/sync' : '' });
  // רשימה אחת: בעיות שטח (שבוע קדימה) + מה שהמערכת מזהה (צי, פרויקטים, רישיונות, סנכרון) + מה שמחכה לי אישית
  const [sys, mineA] = await extra;
  const N = sortNeeds([
    ...issues.map(i => ({ tone: i.tone, ic: icon(i.ic, 20), title: i.t, sub: i.s, ...(i.act ? { act: i.act } : { href: i.href }) })),
    ...sys.filter(a => a.k !== 'shiftreq').map(a => ({ tone: a.tone, ic: icon(a.ic, 20), title: a.title, sub: a.sub, href: a.href, list: a.list, act: a.act })),
    ...mineA.filter(x => x.k !== 'push')]);
  const pushA = mineA.find(x => x.k === 'push');   // הגדרה אישית — לא חלק מתור הניהול

  // ---- היום ומחר ----
  const dayCard = w => {
    const crew = (w.work_day_crew || []).slice().sort((a, b) => (a.user_id === w.crew_lead_id ? -1 : 0) - (b.user_id === w.crew_lead_id ? -1 : 0));
    const chip = c => { const lead = c.user_id === w.crew_lead_id, onShift = openBy.has(c.user_id), was = inToday.has(c.user_id);
      const st = c.cant_come_at ? ['off', 'לא יגיע'] : w.day === t ? (onShift ? ['on', 'במשמרת'] : was ? ['done', 'סיים'] : ['off', 'לא החתים']) : (c.confirmed_at || lead ? ['on', 'אישר'] : ['off', 'לא אישר']);
      return `<span class="opc ${st[0]}" title="${st[1]}"><i></i>${esc(name(c.user_id))}${lead ? leadMark() : ''}<small>${st[1]}</small></span>`; };
    const site = w.projects?.site_id;
    return `<a class="card opday" href="#/day/${w.id}"><div class="row"><b class="grow">${esc(w.projects?.name || '')}</b>${site ? `<span data-wx="${site}|${w.day}"></span>` : ''}</div>
      <small class="muted">${w.report_time ? 'יציאה ' + w.report_time.slice(0, 5) + ' · ' : ''}${w.crew_lead_id ? 'ראש צוות ' + esc(name(w.crew_lead_id)) : 'אין ראש צוות'}${D.get(w.drone_id) ? ' · ' + esc(D.get(w.drone_id).name) : ''}</small>
      <div class="opcrew">${crew.map(chip).join('') || '<small class="muted">לא שובץ צוות</small>'}</div></a>`;
  };
  const dToday = days.filter(w => w.day === t), dTom = days.filter(w => w.day === tm);
  // בבית: שורה אחת לכל יום שטח (שעה · מקום · צוות · רק חריגים). הכרטיס המלא — בפירוט
  const dayRow = w => { const ppl = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
    const cc = u => (w.work_day_crew || []).find(c => c.user_id === u)?.cant_come_at, nc = ppl.filter(cc).length;
    const miss = w.day === t ? ppl.filter(u => !cc(u) && !openBy.has(u) && !inToday.has(u)).length : ppl.filter(u => u !== w.crew_lead_id && !cc(u) && !(w.work_day_crew || []).find(c => c.user_id === u)?.confirmed_at).length;
    const fixIt = nc && w.status === 'planned', tag = fixIt ? 'button' : 'a';   // מישהו לא יגיע → הלחיצה פותחת ישר את ניהול היום
    return `<${tag} class="lrow" ${fixIt ? `type="button" data-da="${w.id}"` : `href="#/day/${w.id}"`}><span class="timebox"><b>${w.report_time ? w.report_time.slice(0, 5) : '—'}</b></span><span class="grow"><b>${esc(shortName(w.projects?.name))}</b><small>${ppl.map(u => (cc(u) ? `<s>${esc(name(u))}</s>` : esc(name(u))) + (u === w.crew_lead_id ? leadMark() : '')).join(' · ') || 'לא שובץ צוות'}</small>
      <span class="tags">${w.projects?.site_id ? `<span data-wx="${w.projects.site_id}|${w.day}"></span>` : ''}${nc ? `<span class="pill bad">${nc > 1 ? nc + ' לא יגיעו' : 'לא יגיע'}</span>` : ''}${miss ? `<span class="pill warn">${miss} ${w.day === t ? 'לא החתימו' : 'לא אישרו'}</span>` : ''}</span></span></${tag}>`; };

  // ---- לאישורך ----
  const pendAbs = abs.filter(a => a.status === 'pending' && (admin || a.user_id !== state.user.id));   // אין אישור עצמי
  const approvals = [
    ...sreq.map(r => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(r.user_id))} · תיקון שעות</b><small class="muted">${timeAgo(r.created_at)}</small></div>
      <small>${r.req_start ? dm(isoDay(new Date(r.req_start))) + ' · <bdi dir="ltr">' + hm(r.req_start) + (r.req_end ? '–' + hm(r.req_end) : '') + '</bdi>' : ''}${r.reason ? ' · ' + esc(r.reason) : ''}</small>
      <div class="row-btns"><button class="btn ghost sm" data-sr="${r.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-sr="${r.id}" data-ok="1">אישור</button></div></div>`),
    ...pendAbs.map(a => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(a.user_id))} · ${ABS[a.kind] || 'היעדרות'}</b></div>
      <small>${dm(a.date_from)}${a.date_to !== a.date_from ? '–' + dm(a.date_to) : ''}${a.note ? ' · ' + esc(a.note) : ''}</small>
      <div class="row-btns"><button class="btn ghost sm" data-ab="${a.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-ab="${a.id}" data-ok="1">אישור</button></div></div>`),
    ...oreq.map(r => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(r.user_id))} · ${esc(r.category || 'בקשה')}</b><small class="muted">${timeAgo(r.created_at)}</small></div>
      <small>${esc((r.body || '').slice(0, 160))}</small>
      <div class="row-btns"><a class="btn ghost sm" href="#/requests">פתיחה</a><button class="btn primary sm" data-or="${r.id}">טופל</button></div></div>`),
  ];
  const pHref = preq.length === 1 && preq[0].monday_item_id ? `https://edroneil-force.monday.com/boards/5099908084/pulses/${preq[0].monday_item_id}" target="_blank" rel="noopener` : '#/purchase';
  if (exq.length) approvals.push(`<a class="lrow card" href="#/expenses"><span class="mic">${icon('receipt', 19)}</span><span class="grow"><b>${exq.length > 1 ? exq.length + ' הוצאות לאישור' : 'הוצאה לאישור'}</b></span><span class="chev">${icon('chev', 18)}</span></a>`);
  if (preq.length) approvals.push(`<a class="lrow card" href="${pHref}"><span class="mic">${icon('cart', 19)}</span><span class="grow"><b>${preq.length > 1 ? preq.length + ' בקשות רכש ממתינות' : 'בקשת רכש ממתינה'}</b><small>לאישור ושליחה לספק</small></span><span class="chev">${icon('chev', 18)}</span></a>`);

  const kpi = (n, l, k, tone = '') => n ? `<button class="kpi ${tone}" data-kpi="${k}" aria-haspopup="dialog"><b>${n}</b><span>${l}</span></button>` : `<div class="kpi zero"><b>0</b><span>${l}</span></div>`;   // 0 = שקט ולא לחיץ
  const nextDay = days.find(w => w.day > tm);
  const none = (title, sub) => `<div class="empty-card"><span class="ei">${icon('drone', 24)}</span><span><b>${title}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;
  $('#hm', el).innerHTML = `
      ${pushA ? pushA.href ? `<a class="lrow slim" id="pushA" href="${pushA.href}"><span class="mic">${icon('chat', 18)}</span><span class="grow"><b>${esc(pushA.title)}</b></span></a>`
        : `<div class="lrow slim" id="pushA"><span class="mic">${icon('chat', 18)}</span><span class="grow"><b>${esc(pushA.title)}</b></span>${pushA.btn ? `<button class="btn ghost sm" id="pushOn">${pushA.btn}</button>` : ''}</div>` : ''}
      <div class="kpis opk">${kpi(dToday.length, 'בשטח היום', 'today')}${kpi(open.length, 'במשמרת', 'shift')}${kpi(N.length, 'לטיפול', 'needs', N.some(i => i.tone === 'bad') ? 'bad' : N.length ? 'warn' : '')}${kpi(approvals.length, 'לאישור', 'appr', approvals.length ? 'warn' : '')}</div>
      ${needsList(N, { limit: 3 })}
      ${approvals.length ? `<section id="sec-appr"><div class="sh-row"><h3 class="sh">לאישורך</h3><span class="count">${approvals.length}</span></div>${approvals.join('')}</section>` : ''}
      <section id="sec-today"><div class="sh-row"><h3 class="sh">היום בשטח</h3><a class="more" href="#/schedule">לו״ז</a></div>${dToday.length ? `<div class="list">${dToday.map(dayRow).join('')}</div>` : `<div class="empty-line">אין ימי שטח היום${nextDay ? ` · הבא ${dm(nextDay.day)} ${esc(shortName(nextDay.projects?.name))}` : ''}</div>`}</section>
      ${dTom.length ? `<section><h3 class="sh">מחר</h3><div class="list">${dTom.map(dayRow).join('')}</div></section>` : ''}
      <div id="mytasks"></div><div id="yday"></div>`;
  // מדד = כניסה לפירוט המלא (לא קפיצה למה שכבר על המסך)
  const shead = (t, n) => `<div class="sh-row"><h3 class="sh">${t}</h3>${n ? `<span class="count">${n}</span>` : ''}</div>`;
  const dur = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const crewToday = [...new Set(dToday.flatMap(w => [w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)]).filter(Boolean))];
  const KPI = {
    today: () => sheet(`${shead('היום בשטח', dToday.length)}${dToday.map(dayCard).join('') || none('אין ימי שטח היום', '')}<a class="btn ghost block" href="#/schedule">לו״ז ושיבוץ</a>`, s2 => import('../lib/wx.js').then(m => m.fillWx(s2)).catch(() => {})),
    shift: () => { const missing = crewToday.filter(u => !openBy.has(u) && !inToday.has(u));
      sheet(`${shead('במשמרת עכשיו', open.length)}${open.length ? `<div class="list">${open.map(x => `<a class="lrow" href="#/attendance/${x.user_id}"><span class="avatar sm">${esc(initials(P.get(x.user_id)?.full_name || ''))}</span><span class="grow"><b>${esc(P.get(x.user_id)?.full_name || '')}</b><small>מ-${hm(x.start_at)} · ${dur(x.start_at)} שעות${x.start_place ? ' · ' + esc(x.start_place) : ''}${(x.start_dist_m || 0) > 800 ? ` · ${(x.start_dist_m / 1000).toFixed(1)} ק״מ מהאתר` : ''}</small></span></a>`).join('')}</div>` : none('אף אחד לא במשמרת', '')}
        ${missing.length ? `${shead('משובצים היום ולא החתימו', missing.length)}<div class="list">${missing.map(u => `<a class="lrow" href="#/attendance/${u}"><span class="avatar sm">${esc(initials(P.get(u)?.full_name || ''))}</span><span class="grow"><b>${esc(P.get(u)?.full_name || '')}</b><small>${esc(dToday.find(w => w.crew_lead_id === u || (w.work_day_crew || []).some(c => c.user_id === u))?.projects?.name || '')}</small></span></a>`).join('')}</div>` : ''}
        <a class="btn ghost block" href="#/attendance">נוכחות צוות</a>`); },
    needs: () => sheet(N.length ? needsList(N, { title: 'לטיפול', limit: 99, id: 'needs-all' }) : none('הכל תחת שליטה', ''), s2 => bindNeeds(s2, N, () => renderOps(el))),
    appr: () => sheet(`${shead('לאישורך', approvals.length)}${approvals.join('') || none('אין מה לאשר', '')}`, (s2, close) => bindAppr(s2, () => { close(); again(); })),
  };
  $$('[data-kpi]', el).forEach(b => b.onclick = () => KPI[b.dataset.kpi]());

  bindNeeds(el, N, () => renderOps(el));
  $$('[data-da]', el).forEach(b => b.onclick = () => import('./dayadmin.js').then(m => m.openDayAdmin(b.dataset.da, () => renderOps(el))));
  const po = $('#pushOn', el); if (po) po.onclick = async () => { if (po.disabled) return; po.disabled = true; const { enablePush } = await import('../lib/core.js');
    try { await enablePush(); toast('ההתראות הופעלו'); $('#pushA', el)?.remove(); } catch (e) { po.disabled = false; toast(errText(e, 'ההתראות לא הופעלו — בדקו את הרשאות הטלפון')); } };
  $$('[data-nmore]', el).forEach(b => b.onclick = KPI.needs);   // "עוד" בבית = אותו פירוט מלא
  home.extras();
  import('../lib/wx.js').then(m => m.fillWx(el)).catch(() => {});
  const again = () => renderOps(el);
  bindAppr(el, again);
  function bindAppr(root, after) {
    const card = b => b.closest('.opr') || b.parentElement;
    const lock = (b, on) => card(b).querySelectorAll('button').forEach(x => x.disabled = on);
    const done = (b, msg) => { toast(msg); const c = card(b); c.classList.add('leaving'); setTimeout(after, 220); };
    const fail = (b, e) => { lock(b, false); toast(errText(e)); };
    $$('[data-sr]', root).forEach(b => b.onclick = async e => { e.preventDefault(); if (b.disabled) return; const ok = b.dataset.ok === '1';
      const reply = ok ? '' : await ask('סיבת הדחייה', { ok: 'דחייה' }); if (reply === null) return; lock(b, true);
      const { error } = await sb.rpc('decide_shift_request', { rid: b.dataset.sr, ok, reply: (reply || '').trim() }); if (error) return fail(b, error); done(b, ok ? 'אושר — השעות עודכנו' : 'נדחה — העובד קיבל הודעה'); });
    $$('[data-ab]', root).forEach(b => b.onclick = async () => { if (b.disabled) return; const ok = b.dataset.ok === '1';
      const reply = ok ? '' : await ask('סיבת הדחייה', { optional: true, ok: 'דחייה' }); if (reply === null) return; lock(b, true);
      const { error } = await sb.from('absences').update({ status: ok ? 'approved' : 'rejected', manager_id: state.user.id, manager_reply: (reply || '').trim() || null, decided_at: new Date().toISOString() }).eq('id', b.dataset.ab);
      if (error) return fail(b, error); done(b, ok ? 'אושר' : 'נדחה — העובד קיבל הודעה'); });
    $$('[data-or]', root).forEach(b => b.onclick = async () => { if (b.disabled) return; const r = await ask('מה נעשה?', { optional: true, ok: 'סגירה' }); if (r === null) return; lock(b, true);
      const { error } = await sb.from('office_requests').update({ status: 'done', reply: (r || '').trim() || 'טופל', handled_by: state.user.id }).eq('id', b.dataset.or); if (error) return fail(b, error); done(b, 'נסגר — העובד קיבל מענה'); });
  }
}
