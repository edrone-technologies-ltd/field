// הבית של המנהל (מנהל תפעול ומעלה): מסך אחד שעונה על "מה קורה בשטח, מה תקוע, ומה מחכה לי" — ומאשרים ישר מכאן.
// סדר קבוע: מדדים · דורש טיפול (רשימה אחת) · לאישורך · היום בשטח · מחר · המשימות שלי · אתמול.
// היום ומחר בשטח (צוות, מי החתים, מי אישר הגעה, מזג אוויר) · בעיות (מחושבות מהנתונים, שבוע קדימה) · לאישורך (תיקוני שעות, היעדרויות, בקשות למשרד, רכש).
import { sb, state, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, HE_DOW, toast, ask, confirmBox, timeAgo, can, initials, sheet, leadMark, shortName, dayLabel } from '../lib/core.js';
import { attentionItems, sortNeeds, needsList, bindNeeds } from './attention.js';
import { errText } from '../lib/audit.js';
import { nightTag, wxKey } from '../lib/night.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const first = n => (n || '').split(' ')[0];
const hm = iso => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
// מה קורה עכשיו ביום השטח (מהטלפון של ראש הצוות) — המנהל רואה בלי להתקשר
const LIVE = { en_route: 'בדרך', on_site: 'באתר', working: 'בעבודה', issue: 'תקלה', done: 'נסגר' };
const ABS = { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש ללא תשלום', other: 'היעדרות' };

export async function renderOps(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהל תפעול ומעלה.</div>'; return; }
  const now = new Date(), hr = now.getHours(), me = state.profile;
  const greet = hr < 5 ? 'לילה טוב' : hr < 12 ? 'בוקר טוב' : hr < 17 ? 'צהריים טובים' : hr < 21 ? 'ערב טוב' : 'לילה טוב';
  const head = `<header class="hhead"><div class="grow"><div class="eyebrow">יום ${HE_DOW[now.getDay()]}, ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(first(me.full_name))}</h1></div>
    <a class="dkgo" href="#/desk">שולחן ניהול</a><a class="lvgo" href="#/live" aria-label="מגדל פיקוח"><i></i>שטח חי</a><a class="avatar" href="#/menu" aria-label="החשבון שלי">${esc(initials(me.full_name))}</a></header>`;
  if (!el.querySelector('#hm')) el.innerHTML = `${head}<div id="hm" class="stack lg"><div class="skel"></div><div class="skel tall"></div></div>`;
  const home = await import('./home.js');
  home.warmExtras?.();
  const extra = Promise.all([home.load().then(home.alerts).catch(() => []), attentionItems().catch(() => [])]);
  const t = isoDay(), tm = addDays(t, 1), y = addDays(t, -1), wk = addDays(t, 6);
  const q = async p => { try { const { data } = await p; return data || []; } catch { return []; } };
  const admin = state.profile.role === 'admin';
  const [days, people, shifts, abs, sreq, oreq, preq, exq, drones, ended, pulls, rdy, crit, miss, lowStock] = await Promise.all([
    q(sb.from('work_days').select('id,day,status,night,site_arrival,site_end,report_time,crew_lead_id,drone_id,project_id,weather_alerted,gust_max,projects(name,site_id,planned_from,planned_to,readiness),work_day_crew(user_id,role,confirmed_at,cant_come_at,cant_come_reason)').gte('day', t).lte('day', wk).neq('status', 'cancelled').order('day').order('report_time')),
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
    q(sb.rpc('readiness_list')),
    // מהשטח: תקלה קריטית פתוחה · חסר בשטח שעוד לא סופק · מלאי מתחת למינימום — לטפל מכאן בלחיצה, לא לחפש בפרויקט
    q(sb.from('issues').select('id,body,kind,project_id,work_day_id,equipment_id,opened_by,created_at,prestart,decision,resolution,projects(name)').eq('status', 'open').eq('severity', 'critical').gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).order('created_at', { ascending: false })),
    q(sb.from('missing_items').select('id,item,qty,created_at,work_day_id,work_days(day,project_id,projects(name))').eq('status', 'open').gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).order('created_at')),
    q(sb.from('catalog_items').select('name,stock,min_qty').eq('in_app', true).not('min_qty', 'is', null)).then(r => r.filter(c => c.stock != null && Number(c.stock) <= Number(c.min_qty))),
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
    const i0 = issues.length;
    const pn = (w.projects?.name || '').replace(/^[^—]*—\s*/, '') || w.projects?.name || '', when = w.day === t ? 'היום' : w.day === tm ? 'מחר' : `${HE_D1[new Date(w.day + 'T12:00:00').getDay()]} ${dm(w.day)}`, href = `#/day/${w.id}`;
    const crew = (w.work_day_crew || []), ppl = [...new Set([w.crew_lead_id, ...crew.map(c => c.user_id)].filter(Boolean))];
    const fix = w.status !== 'done' ? { act: () => import('./dayadmin.js').then(m => m.openDayAdmin(w.id, () => renderOps(el))) } : {};
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
    issues.slice(i0).forEach(i => { i.d = w.day; i.w = when; });
  }
  // אותה בעיה באותו פרויקט בכמה ימים = שורה אחת ("אין מטיס בצוות · 3 ימים"), לא שלוש
  { const G = new Map(), out = [];
    for (const i of issues) { if (!i.w) { out.push(i); continue; }
      const k = i.t.replace(i.w, '').replace(/[\s·]+$/, '') + '|' + i.s;
      const g = G.get(k); if (g) { g.ds.push(i.d); if (i.tone === 'bad') g.tone = 'bad'; continue; }
      const n = { ...i, base: i.t.replace(i.w, '').replace(/[\s·]+$/, ''), ds: [i.d] }; G.set(k, n); out.push(n); }
    for (const g of G.values()) if (g.ds.length > 1) g.t = `${g.base} · ${g.ds.length} ימים מ${g.w === 'היום' || g.w === 'מחר' ? g.w : '-' + dm(g.ds[0])}`;
    issues.splice(0, issues.length, ...out); }
  // מוכנות להיום/מחר (project_readiness — אותה רשימה כמו בפרויקט): מה שלא מכוסה כבר בשורות למעלה (צוות/רחפן/תחזית/אישורים).
  // רק מרחב אווירי חסר → סימון בלחיצה מכאן. אחרת → רשימת המוכנות בפרויקט
  const PREP = ['אפיון', 'תכנית עבודה', 'מקור מים', 'מכלית מים', 'תיאום כניסה לאתר', 'מרחב אווירי'];
  for (const r of rdy.filter(x => x.next_day && x.next_day <= tm)) {
    const miss = (r.miss || []).filter(m => PREP.includes(m)); if (!miss.length) continue;
    const w = days.find(x => x.project_id === r.project_id && x.day === r.next_day), nm = shortName(w?.projects?.name || ''), when = r.next_day === t ? 'היום' : 'מחר';
    const pd = days.filter(x => x.project_id === r.project_id && x.status === 'planned').map(x => x.day);
    const onlyAir = miss.length === 1 && miss[0] === 'מרחב אווירי';
    issues.push({ tone: 'warn', ic: onlyAir ? 'drone' : 'clipboard', ds: [r.next_day], t: onlyAir ? `מרחב אווירי לא תואם · ${when}` : `לא מוכן ל${when} · ${nm}`, s: onlyAir ? nm : miss.join(' · '),
      ...(onlyAir ? { act: async () => {
        if (!(await confirmBox('מרחב אווירי תואם?', { body: nm, ok: 'סימון כתואם' }))) return;
        const { error } = await sb.rpc('set_readiness', { p: r.project_id, k: 'airspace', on_: true, days: [...new Set([...(w?.projects?.readiness?.airspace?.days || []), ...pd])] });
        if (error) return toast(errText(error)); toast('סומן — מרחב אווירי תואם', 1800, 'success'); renderOps(el); } } : { href: `#/p/${r.project_id}` }) });
  }
  // תקלה קריטית מהשטח: הקשה = גיליון עם "טופל" (ומה נעשה) או מעבר ליום עצמו
  const KIND = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'תקלה' };
  // חריג בבדיקה לפני עבודה: הצוות באתר ומחכה — ראשון ברשימה, והקשה = "כשיר לעבוד" / "השבתה"
  crit.filter(i => i.prestart).forEach(i => issues.unshift({ tone: 'bad', ic: i.prestart === 'drone' ? 'drone' : 'alert', t: `${i.prestart === 'drone' ? 'בדיקת רחפן' : 'בדיקת בטיחות'} · ${shortName(i.projects?.name || '') || 'שטח'} · ממתין לך`,
    s: `${String(i.body || '').replace(/^[^·]*·\s*/, '')} · ${name(i.opened_by)} · ${timeAgo(i.created_at)}`,
    act: () => import('./prestart.js').then(m => m.decideSheet(i, { who: name(i.opened_by), after: r => m.afterDecide(r, () => renderOps(el)) })) }));
  crit.filter(i => !i.prestart).forEach(i => issues.push({ tone: 'bad', ic: 'alert', t: `תקלה קריטית · ${shortName(i.projects?.name || '') || 'שטח'}`, s: `${i.body} · ${name(i.opened_by)} · ${timeAgo(i.created_at)}`, act: () => sheet(`<div class="stack tight"><h3 class="sh">${esc(i.body)}</h3><small class="muted">${esc([shortName(i.projects?.name || ''), KIND[i.kind], name(i.opened_by), timeAgo(i.created_at)].filter(Boolean).join(' · '))}</small></div>
      <label class="field">איך טופל<textarea id="isr" rows="2" placeholder="לא חובה"></textarea></label>
      <div class="row-btns"><a class="btn ghost" href="${i.work_day_id ? '#/day/' + i.work_day_id : '#/p/' + i.project_id}" data-close>${i.work_day_id ? 'יום השטח' : 'הפרויקט'}</a><button class="btn primary" id="isok">טופל</button></div>`, (s2, close) => {
      $('#isok', s2).onclick = async e => { e.target.disabled = true;
        const { error } = await sb.from('issues').update({ status: 'closed', resolution: $('#isr', s2).value.trim() || 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() }).eq('id', i.id);
        if (error) { e.target.disabled = false; return toast(errText(error)); } close(); toast('התקלה נסגרה', 1800, 'success'); renderOps(el); }; }) }));
  // חסר בשטח: קבוצה לכל יום שטח. "סופק" לכל פריט, או הכל בלחיצה
  [...new Map(miss.map(m => [m.work_day_id, miss.filter(x => x.work_day_id === m.work_day_id)])).values()].forEach(ms => { const wd = ms[0].work_days, it = m => m.item + (m.qty > 1 ? ' ×' + m.qty : '');
    const mark = async ids => { const { error } = await sb.from('missing_items').update({ status: 'handled' }).in('id', ids); if (error) { toast(errText(error)); return false; } return true; };
    issues.push({ tone: 'warn', ic: 'cart', d: wd?.day, t: `חסר בשטח · ${shortName(wd?.projects?.name || '')}`, s: ms.map(it).join(' · '), act: () => sheet(`<h3>חסר בשטח · ${esc(shortName(wd?.projects?.name || ''))}</h3>
      <div class="list">${ms.map(m => `<div class="lrow"><span class="grow"><b>${esc(it(m))}</b><small>${timeAgo(m.created_at)}</small></span><button class="chip" data-mi="${m.id}">סופק</button></div>`).join('')}</div>
      <div class="row-btns"><a class="btn ghost" href="#/day/${ms[0].work_day_id}" data-close>יום השטח</a><button class="btn primary" id="miall">${ms.length > 1 ? 'הכל סופק' : 'סופק'}</button></div>`, (s2, close) => {
      let left = ms.length;
      $$('[data-mi]', s2).forEach(b => b.onclick = async () => { b.disabled = true; if (!(await mark([b.dataset.mi]))) { b.disabled = false; return; } b.closest('.lrow').remove(); if (!--left) { close(); renderOps(el); } else toast('סומן', 1200, 'success'); });
      $('#miall', s2).onclick = async e => { e.target.disabled = true; if (!(await mark(ms.map(m => m.id)))) { e.target.disabled = false; return; } close(); toast('סומן שסופק', 1800, 'success'); renderOps(el); }; }) }); });
  if (lowStock.length) issues.push({ tone: 'warn', ic: 'cart', t: lowStock.length > 1 ? `${lowStock.length} פריטים במלאי מתחת למינימום` : `${lowStock[0].name} מתחת למינימום`, s: lowStock.length > 1 ? lowStock.map(c => c.name).join(' · ') : `במלאי ${lowStock[0].stock} · מינימום ${lowStock[0].min_qty}`, href: '#/purchase' });
  for (const s of open) {
    const h = (Date.now() - new Date(s.start_at)) / 36e5;
    if (isoDay(new Date(s.start_at)) < t) issues.push({ tone: 'bad', ic: 'clock', t: `${name(s.user_id)} לא החתים יציאה מאתמול`, s: `נכנס ${dm(isoDay(new Date(s.start_at)))} ב-${hm(s.start_at)}`, href: `#/attendance/${s.user_id}` });
    else if (h >= 12) issues.push({ tone: 'warn', ic: 'clock', t: `${name(s.user_id)} במשמרת ${Math.floor(h)} שעות`, s: `נכנס ב-${hm(s.start_at)}`, href: `#/attendance/${s.user_id}` });
  }
  shifts.filter(s => isoDay(new Date(s.start_at)) === t && (s.start_dist_m || 0) > 800).forEach(s => issues.push({ tone: 'warn', ic: 'pin', t: `${name(s.user_id)} החתים ${s.start_dist_m >= 1000 ? (s.start_dist_m / 1000).toFixed(1) + ' ק״מ' : s.start_dist_m + ' מ׳'} מ${s.start_place || 'המשרד'}`, s: s.note ? `"${s.note}"` : 'לא במשרד ולא באתר שלו', href: `#/attendance/${s.user_id}` }));
  // יום אחרון נסגר בלי חתימת לקוח — החתימה היא מה שמעביר את הפרויקט להנהלה (סיכום + חשבונית), אז חייבים להשיג אותה
  [...new Map(ended.filter(w => !w.signoff && w.projects?.monday_group !== 'group_mm5052gw').map(w => [w.project_id, w])).values()]
    .forEach(w => issues.push({ tone: 'bad', ic: 'report', t: `חסרה חתימת לקוח · ${(w.projects.name || '').replace(/^[^—]*—\s*/, '') || w.projects.name}`, s: `היום האחרון נסגר ב-${dm(w.day)}`, href: `#/signoff/${w.project_id}/${w.id}` }));
  shifts.filter(s => /נסגרה אוטומטית/.test(s.note || '')).forEach(s => issues.push({ tone: 'warn', ic: 'clock', t: `יציאה אוטומטית · ${name(s.user_id)}`, s: `${dm(isoDay(new Date(s.start_at)))} · נרשמו 12 שעות — לוודא`, href: `#/attendance/${s.user_id}` }));
  // הסנכרון עם מאנדי הוא מה שמחזיק את הכל — אם הוא נתקע, זה הדבר הראשון שצריך לדעת
  const lastOk = pulls.find(x => x.status === 'ok');
  if (pulls.length && (!lastOk || Date.now() - new Date(lastOk.created_at) > 40 * 6e4)) issues.unshift({ tone: 'bad', ic: 'alert', t: 'הסנכרון עם מאנדי נעצר', s: lastOk ? `סבב תקין אחרון ${timeAgo(lastOk.created_at)}` : 'הסבבים האחרונים נכשלו', href: can('admin') ? '#/admin/sync' : '' });
  // רשימה אחת: בעיות שטח (שבוע קדימה) + מה שהמערכת מזהה (צי, פרויקטים, רישיונות, סנכרון) + מה שמחכה לי אישית
  const [sys, mineA] = await extra;
  // רחפן מקורקע שכבר מופיע כ"מקורקע ומשובץ" (עם תיקון בלחיצה) — לא שורה נוספת
  const grIds = new Set(days.filter(w => w.status !== 'done' && D.get(w.drone_id)?.health === 'grounded').map(w => w.drone_id));
  const grDup = a => [...grIds].some(id => a.href === '#/equipment/' + id);
  const N = sortNeeds([
    ...issues.map(i => ({ tone: i.tone, ic: icon(i.ic, 20), title: i.t, sub: i.s, ds: i.ds || (i.d ? [i.d] : []), ...(i.act ? { act: i.act } : { href: i.href }) })),
    ...sys.filter(a => a.k !== 'shiftreq' && !grDup(a)).map(a => ({ tone: a.tone, ic: icon(a.ic, 20), title: a.title, sub: a.sub, href: a.href, list: a.list, act: a.act })),
    ...mineA.filter(x => x.k !== 'push' && x.k !== 'chat')]);
  const pushA = mineA.find(x => x.k === 'push');
  const chatA = mineA.find(x => x.k === 'chat');   // הודעות שלא נקראו — פס בולט בראש הבית, לא שורה שנבלעת ב"עוד" (db/133)   // הגדרה אישית — לא חלק מתור הניהול

  // ---- היום ומחר ----
  const dayCard = w => {
    const crew = (w.work_day_crew || []).slice().sort((a, b) => (a.user_id === w.crew_lead_id ? -1 : 0) - (b.user_id === w.crew_lead_id ? -1 : 0));
    const chip = c => { const lead = c.user_id === w.crew_lead_id, onShift = openBy.has(c.user_id), was = inToday.has(c.user_id);
      const st = c.cant_come_at ? ['off', 'לא יגיע'] : w.day === t ? (onShift ? ['on', 'במשמרת'] : was ? ['done', 'סיים'] : ['off', 'לא החתים']) : (c.confirmed_at || lead ? ['on', 'אישר'] : ['off', 'לא אישר']);
      return `<span class="opc ${st[0]}" title="${st[1]}"><i></i>${esc(name(c.user_id))}${lead ? leadMark() : ''}<small>${st[1]}</small></span>`; };
    const site = w.projects?.site_id;
    return `<a class="card opday" href="#/day/${w.id}"><div class="row"><b class="grow">${esc(w.projects?.name || '')}${nightTag(w)}</b>${site ? `<span data-wx="${site}|${wxKey(w)}"></span>` : ''}</div>
      <small class="muted">${w.report_time ? 'יציאה ' + w.report_time.slice(0, 5) + ' · ' : ''}${w.crew_lead_id ? 'ראש צוות ' + esc(name(w.crew_lead_id)) : 'אין ראש צוות'}${D.get(w.drone_id) ? ' · ' + esc(D.get(w.drone_id).name) : ''}</small>
      <div class="opcrew">${crew.map(chip).join('') || '<small class="muted">לא שובץ צוות</small>'}</div></a>`;
  };
  const dToday = days.filter(w => w.day === t), dTom = days.filter(w => w.day === tm);
  // בבית: שורה אחת לכל יום שטח (שעה · מקום · צוות · רק חריגים). הכרטיס המלא — בפירוט
  const dayRow = w => { const ppl = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
    const cc = u => (w.work_day_crew || []).find(c => c.user_id === u)?.cant_come_at, nc = ppl.filter(cc).length;
    const miss = w.status === 'done' ? 0 : w.day === t ? ppl.filter(u => !cc(u) && !openBy.has(u) && !inToday.has(u)).length : ppl.filter(u => u !== w.crew_lead_id && !cc(u) && !(w.work_day_crew || []).find(c => c.user_id === u)?.confirmed_at).length;
    const fixIt = nc && w.status === 'planned', tag = fixIt ? 'button' : 'a';   // מישהו לא יגיע → הלחיצה פותחת ישר את ניהול היום
    return `<${tag} class="lrow" ${fixIt ? `type="button" data-da="${w.id}"` : `href="#/day/${w.id}"`}><span class="timebox"><b>${w.report_time ? w.report_time.slice(0, 5) : '—'}</b></span><span class="grow"><b>${esc(shortName(w.projects?.name))}${nightTag(w)}</b><small>${ppl.map(u => (cc(u) ? `<s>${esc(name(u))}</s>` : esc(name(u))) + (u === w.crew_lead_id ? leadMark() : '')).join(' · ') || 'לא שובץ צוות'}</small>
      <span class="tags">${LIVE[w.status] ? `<span class="pill ${w.status === 'done' ? 'ok' : w.status === 'issue' ? 'bad' : 'lime'}">${LIVE[w.status]}</span>` : ''}${w.projects?.site_id && w.status === 'planned' ? `<span data-wx="${w.projects.site_id}|${wxKey(w)}"></span>` : ''}${nc ? `<span class="pill bad">${nc > 1 ? nc + ' לא יגיעו' : 'לא יגיע'}</span>` : ''}${miss ? `<span class="pill warn">${miss} ${w.day === t ? 'לא החתימו' : 'לא אישרו'}</span>` : ''}</span></span></${tag}>`; };

  // ---- השבוע במבט אחד: 7 ימים, כמה ימי שטח וצבע לפי הבעיה הכי חמורה. לחיצה = היום הזה (בעיות + ימי שטח + שיבוץ) ----
  const wkDays = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(t, i));
  const wkTone = d => { const is = N.filter(x => x.ds?.includes(d)); return is.some(x => x.tone === 'bad') ? 'bad' : is.length ? 'warn' : days.some(w => w.day === d) ? 'ok' : ''; };
  const week = `<div class="wks" role="list">${wkDays.map(d => { const n = days.filter(w => w.day === d).length, dw = new Date(d + 'T12:00').getDay();
    return `<button type="button" role="listitem" class="wkd ${wkTone(d)} ${d === t ? 'now' : ''} ${dw === 6 ? 'sat' : ''}" data-wk="${d}" aria-label="${esc(dayLabel(d))}${n ? ' · ' + n + ' ימי שטח' : ''}"><small>${d === t ? 'היום' : HE_D1[dw]}</small><b>${+d.slice(8)}</b><span class="wdots">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`; }).join('')}</div>`;
  const wkSheet = d => { const ws = days.filter(w => w.day === d), is = N.filter(x => x.ds?.includes(d));
    sheet(`<h3>${esc(dayLabel(d))}</h3>${is.length ? needsList(is, { head: false, limit: 99, id: 'wkn' }) : ''}${ws.length ? `<div class="list">${ws.map(dayRow).join('')}</div>` : `<div class="empty-line">אין ימי שטח</div>`}
      <a class="btn ghost block" href="#/dispatch/${d}">${icon('plus', 18)} שיבוץ</a>`, s2 => { bindNeeds(s2, is, () => renderOps(el));
      $$('[data-da]', s2).forEach(b => b.onclick = () => import('./dayadmin.js').then(m => m.openDayAdmin(b.dataset.da, () => renderOps(el))));
      import('../lib/wx.js').then(m => m.fillWx(s2)).catch(() => {}); }); };

  // ---- לאישורך ----
  const pendAbs = abs.filter(a => a.status === 'pending' && (admin || a.user_id !== state.user.id));   // אין אישור עצמי
  // בקשת חופש של מי שמשובץ בימים האלה: רואים את זה על הכרטיס, ו"אישור" פותח ישר את היום עם מחליף בלחיצה
  const absDays = pendAbs.length ? await q(sb.from('work_day_crew').select('user_id,work_days!inner(id,day,status,projects(name))').in('user_id', pendAbs.map(a => a.user_id))
    .gte('work_days.day', pendAbs.map(a => a.date_from).sort()[0]).lte('work_days.day', pendAbs.map(a => a.date_to).sort().at(-1)).eq('work_days.status', 'planned')) : [];
  const absHit = a => absDays.filter(c => c.user_id === a.user_id && c.work_days.day >= a.date_from && c.work_days.day <= a.date_to).map(c => c.work_days).sort((x, y) => x.day < y.day ? -1 : 1);
  const approvals = [
    ...sreq.map(r => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(r.user_id))} · תיקון שעות</b><small class="muted">${timeAgo(r.created_at)}</small></div>
      <small>${r.req_start ? dm(isoDay(new Date(r.req_start))) + ' · <bdi dir="ltr">' + hm(r.req_start) + (r.req_end ? '–' + hm(r.req_end) : '') + '</bdi>' : ''}${r.reason ? ' · ' + esc(r.reason) : ''}</small>
      <div class="row-btns"><button class="btn ghost sm" data-sr="${r.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-sr="${r.id}" data-ok="1">אישור</button></div></div>`),
    ...pendAbs.map(a => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(a.user_id))} · ${ABS[a.kind] || 'היעדרות'}</b></div>
      <small>${dm(a.date_from)}${a.date_to !== a.date_from ? '–' + dm(a.date_to) : ''}${a.note ? ' · ' + esc(a.note) : ''}</small>
      ${absHit(a).length ? `<small class="bad">משובץ ${absHit(a).map(w => `${HE_D1[new Date(w.day + 'T12:00').getDay()]} ${dm(w.day)} · ${esc(shortName(w.projects?.name || ''))}`).join(' · ')}</small>` : ''}
      <div class="row-btns"><button class="btn ghost sm" data-ab="${a.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-ab="${a.id}" data-ok="1" ${absHit(a).length ? `data-swapday="${absHit(a)[0].id}"` : ''}>${absHit(a).length ? 'אישור והחלפה' : 'אישור'}</button></div></div>`),
    ...oreq.map(r => `<div class="card stack opr"><div class="row"><b class="grow">${esc(name(r.user_id))} · ${esc(r.category || 'בקשה')}</b><small class="muted">${timeAgo(r.created_at)}</small></div>
      <small>${esc((r.body || '').slice(0, 160))}</small>
      <div class="row-btns"><a class="btn ghost sm" href="#/requests">פתיחה</a><button class="btn primary sm" data-or="${r.id}">סימון כטופל</button></div></div>`),
  ];
  const pHref = preq.length === 1 && preq[0].monday_item_id ? `https://edroneil-force.monday.com/boards/5099908084/pulses/${preq[0].monday_item_id}" target="_blank" rel="noopener` : '#/purchase';
  if (exq.length) approvals.push(`<a class="lrow card" href="#/expenses"><span class="mic">${icon('receipt', 19)}</span><span class="grow"><b>${exq.length > 1 ? exq.length + ' הוצאות לאישור' : 'הוצאה לאישור'}</b></span><span class="chev">${icon('chev', 18)}</span></a>`);
  if (preq.length) approvals.push(`<a class="lrow card" href="${pHref}"><span class="mic">${icon('cart', 19)}</span><span class="grow"><b>${preq.length > 1 ? preq.length + ' בקשות רכש ממתינות' : 'בקשת רכש ממתינה'}</b><small>לאישור ושליחה לספק</small></span><span class="chev">${icon('chev', 18)}</span></a>`);

  const kpi = (n, l, k, tone = '') => n ? `<button class="kpi ${tone}" data-kpi="${k}" aria-haspopup="dialog"><b>${n}</b><span>${l}</span></button>` : `<div class="kpi zero"><b>0</b><span>${l}</span></div>`;   // 0 = שקט ולא לחיץ
  const nextDay = days.find(w => w.day > tm);
  const none = (title, sub) => `<div class="empty-card"><span class="ei">${icon('drone', 24)}</span><span><b>${title}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;
  const hmBox = $('#hm', el); if (!hmBox) return;   // עברו למסך אחר בזמן הטעינה
  hmBox.innerHTML = `
      ${pushA ? pushA.href ? `<a class="lrow slim" id="pushA" href="${pushA.href}"><span class="mic">${icon('chat', 18)}</span><span class="grow"><b>${esc(pushA.title)}</b></span></a>`
        : `<div class="lrow slim" id="pushA"><span class="mic">${icon('chat', 18)}</span><span class="grow"><b>${esc(pushA.title)}</b></span>${pushA.btn ? `<button class="btn ghost sm" id="pushOn">${pushA.btn}</button>` : ''}</div>` : ''}
      ${chatA ? `<a class="lrow slim chatA" href="${chatA.list ? '#/inbox' : chatA.href}"><span class="mic">${icon('chat', 18)}</span><span class="grow"><b>${esc(chatA.title)}</b>${chatA.sub ? `<small>${esc(chatA.sub)}</small>` : ''}</span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
      <div class="kpis opk">${kpi(dToday.length, 'בשטח היום', 'today')}${kpi(open.length, 'במשמרת', 'shift')}${kpi(N.length, 'לטיפול', 'needs', N.some(i => i.tone === 'bad') ? 'bad' : N.length ? 'warn' : '')}${kpi(approvals.length, 'לאישור', 'appr', approvals.length ? 'warn' : '')}</div>
      ${week}
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
      sheet(`${shead('במשמרת עכשיו', open.length)}${open.length ? `<div class="list">${open.map(x => `<a class="lrow" href="#/attendance/${x.user_id}"><span class="avatar sm">${esc(initials(P.get(x.user_id)?.full_name || ''))}</span><span class="grow"><b>${esc(P.get(x.user_id)?.full_name || '')}</b><small>מ-${hm(x.start_at)} · ${dur(x.start_at)} שעות${(x.start_dist_m || 0) > 800 ? ` · ${(x.start_dist_m / 1000).toFixed(1)} ק״מ מ${esc(x.start_place || 'המשרד')}` : x.start_place ? ' · ' + esc(x.start_place) : ''}</small></span></a>`).join('')}</div>` : none('אף אחד לא במשמרת', '')}
        ${missing.length ? `${shead('משובצים היום ולא החתימו', missing.length)}<div class="list">${missing.map(u => `<a class="lrow" href="#/attendance/${u}"><span class="avatar sm">${esc(initials(P.get(u)?.full_name || ''))}</span><span class="grow"><b>${esc(P.get(u)?.full_name || '')}</b><small>${esc(dToday.find(w => w.crew_lead_id === u || (w.work_day_crew || []).some(c => c.user_id === u))?.projects?.name || '')}</small></span></a>`).join('')}</div>` : ''}
        <a class="btn ghost block" href="#/attendance">נוכחות צוות</a>`); },
    needs: () => sheet(N.length ? needsList(N, { title: 'לטיפול', limit: 99, id: 'needs-all' }) : none('הכל תחת שליטה', ''), s2 => bindNeeds(s2, N, () => renderOps(el))),
    appr: () => sheet(`${shead('לאישורך', approvals.length)}${approvals.join('') || none('אין מה לאשר', '')}`, (s2, close) => bindAppr(s2, () => { close(); again(); })),
  };
  $$('[data-kpi]', el).forEach(b => b.onclick = () => KPI[b.dataset.kpi]());
  $$('[data-wk]', el).forEach(b => b.onclick = () => wkSheet(b.dataset.wk));

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
      if (error) return fail(b, error); done(b, ok ? 'אושר' : 'נדחה — העובד קיבל הודעה');
      if (ok && b.dataset.swapday) setTimeout(() => import('./dayadmin.js').then(m => m.openDayAdmin(b.dataset.swapday, () => renderOps(el))), 350); });
    $$('[data-or]', root).forEach(b => b.onclick = async () => { if (b.disabled) return; const r = await ask('מה נעשה?', { optional: true, ok: 'סגירת הבקשה' }); if (r === null) return; lock(b, true);
      const { error } = await sb.from('office_requests').update({ status: 'done', reply: (r || '').trim() || 'טופל', handled_by: state.user.id }).eq('id', b.dataset.or); if (error) return fail(b, error); done(b, 'נסגר — העובד קיבל מענה'); });
  }
}
