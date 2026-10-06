// בית: עונה רק על "מה קורה היום ומה צריך אותי". כל השאר בלשוניות.
// מנהל: היום בשטח · לטיפול (3 הכי חשובים) · השבוע · פרויקטים פעילים. עובד שטח: היום שלי · הימים הקרובים · הודעות.
import { sb, state, can, isManager, cache, covers, signedUrls, $, $$, esc, nf, initials, icon, isoDay, dm, HE_DOW, HE_D1, timeAgo } from '../lib/core.js';

const today = () => isoDay();
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const ARCHIVE = 'group_mm5052gw';
export const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'קביעת מועד': 'warn', 'תואם - ממתין לביצוע': 'warn', 'אושר מול לקוח': 'warn', 'הסתיים — ממתין לתשלום': 'ok' };
const DAY_ST = { planned: 'מתוכנן', en_route: 'בדרך', on_site: 'באתר', working: 'בעבודה', issue: 'תקלה', done: 'נסגר' };
const RANK = { 'בביצוע': 0, 'תואם - ממתין לביצוע': 1, 'אושר מול לקוח': 2, 'קביעת מועד': 3, 'תקוע': 4 };
const isOpen = p => p.monday_group !== ARCHIVE && !String(p.status_label || '').startsWith('הסתיים');
const mineDay = w => w.crew_lead_id === state.user.id || (w.work_day_crew || []).some(c => c.user_id === state.user.id);

export async function load() {
  const q = async (p) => { try { const { data, error } = await p; if (error) throw error; return data || []; } catch { return null; } };
  const t = today(), since = addDays(t, -14), M = isManager();
  const [projects, reports, visits, drones, team, wdays, sync, pushErr, inbox, shiftReq] = await Promise.all([
    q(sb.from('projects').select('id,name,client_name,status_label,planned_from,planned_to,actual_from,actual_to,monday_group,cover_path,site_id')),
    q(sb.from('field_reports').select('monday_item_id,project_id,project_label,report_date,crew,work,had_issues,issues,photos').gte('report_date', since).order('report_date', { ascending: false })),
    M ? q(sb.from('spec_visits').select('*')) : [],
    q(sb.from('equipment').select('id,name,health,health_detail,health_date').eq('kind', 'drone').order('name')),
    M ? q(sb.from('profiles').select('full_name,role,is_pilot,pilot_license_expiry,is_active')) : [],
    q(sb.from('work_days').select('id,day,status,report_time,project_id,crew_lead_id,is_last_day,day_goal,gust_max,wind_max,weather_alerted,work_day_crew(user_id,confirmed_at,profiles(full_name))').gte('day', addDays(t, -1)).lte('day', addDays(t, 13)).order('report_time')),
    M ? q(sb.from('sync_log').select('created_at').eq('entity', 'full_pull').order('created_at', { ascending: false }).limit(1)) : [],
    M ? q(sb.from('sync_log').select('entity,error').eq('direction', 'to_monday').eq('status', 'error').gte('created_at', new Date(Date.now() - 864e5).toISOString()).limit(20)) : [],
    q(sb.rpc('my_inbox')),
    M ? q(sb.from('shift_requests').select('id,user_id').eq('status', 'pending')) : [],
  ]);
  const data = { projects, reports, visits, drones, team, wdays, sync, pushErr, inbox, shiftReq };
  if (projects) await cache.set('home2', data); else Object.assign(data, (await cache.get('home2')) || {});
  return data;
}

// ---------- מה דורש טיפול: מקובץ, הכי חמור קודם ----------
export function alerts(d) {
  const out = [], t = today(), P = d.projects || [];
  const gr = (d.drones || []).filter(x => x.health === 'grounded');
  if (gr.length) out.push({ tone: 'bad', ic: 'drone', title: gr.length > 1 ? `${gr.length} רחפנים מקורקעים` : `רחפן ${gr[0].name} מקורקע`, sub: gr.length > 1 ? gr.map(x => x.name).join(' · ') : firstLine(gr[0].health_detail), href: '#/equipment' });
  (d.drones || []).filter(x => x.health === 'warning').forEach(x => out.push({ tone: 'warn', ic: 'drone', title: `רחפן ${x.name} במעקב`, sub: firstLine(x.health_detail), href: '#/equipment' }));
  const stuck = P.filter(p => p.status_label === 'תקוע' && isOpen(p));
  if (stuck.length) out.push({ tone: 'bad', ic: 'alert', title: stuck.length > 1 ? `${stuck.length} פרויקטים תקועים` : `פרויקט תקוע: ${stuck[0].name}`, sub: stuck.length > 1 ? stuck.map(p => p.name).join(' · ') : stuck[0].client_name, href: stuck.length > 1 ? '#/projects' : '#/p/' + stuck[0].id });
  const last = new Map(); (d.reports || []).forEach(r => { if (r.project_id && !last.has(r.project_id)) last.set(r.project_id, r); });
  const mism = P.filter(p => { const r = last.get(p.id); return r && daysBetween(r.report_date, t) <= 7 && p.status_label !== 'בביצוע' && isOpen(p); });
  if (mism.length) out.push({ tone: 'warn', ic: 'report', title: mism.length > 1 ? `${mism.length} פרויקטים בשטח שהסטטוס שלהם במאנדי לא "בביצוע"` : `עובדים בשטח, אבל במאנדי הסטטוס "${mism[0].status_label}"`, sub: mism.map(p => p.name).join(' · '), href: mism.length > 1 ? '#/projects' : '#/p/' + mism[0].id });
  const iss = (d.reports || []).filter(r => r.had_issues && daysBetween(r.report_date, t) <= 7);
  if (iss.length) out.push({ tone: 'warn', ic: 'alert', title: `${iss.length} דוחות עם תקלות השבוע`, sub: [...new Set(iss.map(r => r.project_label))].join(' · '), href: '#/reports' });
  (d.team || []).filter(p => p.is_active && p.is_pilot && p.pilot_license_expiry).forEach(p => {
    const left = daysBetween(t, p.pilot_license_expiry);
    if (left <= 45) out.push({ tone: left <= 14 ? 'bad' : 'warn', ic: 'shield', title: `רישיון המטיס של ${p.full_name.split(' ')[0]} ${left < 0 ? 'פג' : `פג בעוד ${left} ימים`}`, sub: `בתוקף עד ${dm(p.pilot_license_expiry)}` });
  });
  if ((d.shiftReq || []).length) out.push({ tone: 'warn', ic: 'clock', title: `${d.shiftReq.length} בקשות תיקון שעות ממתינות לאישור`, sub: 'עובדים ששכחו להחתים או ביקשו עריכה', href: '#/attendance' });
  if ((d.pushErr || []).length) out.push({ tone: 'warn', ic: 'alert', title: 'שליחה למאנדי נכשלה', sub: String(d.pushErr[0].error || '').slice(0, 90) });
  const nd = (d.visits || []).filter(v => !v.visit_date);
  if (nd.length) out.push({ tone: '', ic: 'calendar', title: `${nd.length} סיורי אפיון בלי תאריך`, sub: nd.map(v => v.lead_name).join(' · ') });
  const rank = { bad: 0, warn: 1, '': 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
const firstLine = s => (s || '').split('\n')[0].replace(/^[^֐-׿A-Za-z0-9]+/, '').slice(0, 90);
export const alertRow = a => `<${a.href ? `a href="${a.href}"` : 'div'} class="arow ${a.tone}"><span class="aic">${icon(a.ic, 20)}</span><span class="grow"><b>${esc(a.title)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>${a.href ? `<span class="chev">${icon('chev', 18)}</span>` : ''}</${a.href ? 'a' : 'div'}>`;

// ---------- לו"ז: ימי שטח מהאפליקציה + טווחי פרויקטים ממאנדי + סיורי אפיון ----------
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
  if (it.kind === 'p') return `<a class="ev ${TONE[it.p.status_label] ?? ''}" href="#/p/${it.p.id}"><b>${esc(it.p.name)}</b><small>${esc(it.p.status_label || '')}${it.p.client_name ? ' · ' + esc(it.p.client_name) : ''}</small></a>`;
  return `<div class="ev blue"><b>סיור אפיון · ${esc(it.v.lead_name)}</b><small>${esc(it.v.owner || '')}</small></div>`;
}
const dayWord = s => s === addDays(today(), 1) ? 'מחר' : `יום ${HE_DOW[new Date(s + 'T12:00').getDay()]} ${dm(s)}`;
const empty = (ic, title, sub, tone = '') => `<div class="empty-card ${tone}"><span class="ei">${icon(ic, 26)}</span><span><b>${title}</b><small>${sub}</small></span></div>`;

// ---------- מסך הבית ----------
export async function renderHome(el) {
  const p = state.profile, first = (p.full_name || '').split(' ')[0], M = isManager();
  const now = new Date(), h = now.getHours();
  const greet = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  el.innerHTML = `<header class="hhead"><div class="grow"><div class="eyebrow">יום ${HE_DOW[now.getDay()]}, ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(first)}</h1></div>
      <a class="avatar" href="#/menu" aria-label="החשבון שלי">${esc(initials(p.full_name))}</a></header>
    <div id="hm" class="stack lg"><div class="skel tall"></div><div class="skel"></div><div class="skel"></div></div>`;
  const d = await load(); const box = $('#hm'); if (!box) return;
  const t = today(), P = d.projects || [];
  const cov = await covers(P);
  const byId = new Map(P.map(x => [x.id, x]));
  const mine = (d.wdays || []).filter(w => w.day === t && mineDay(w));

  const myDay = mine.map(w => { const pr = byId.get(w.project_id) || {}; return `<a class="photo-hero" href="#/day/${w.id}">
      <span class="img" style="background-image:url('${cov[w.project_id] || ''}')"></span>
      <span class="ph-top"><span class="chip-dark">יום השטח שלך${w.is_last_day ? ' · יום אחרון' : ''}</span><span class="chip-dark">${DAY_ST[w.status]}</span></span>
      <span class="ph-bottom"><b>${esc(pr.name || '')}</b><small>${w.report_time ? 'התייצבות ' + w.report_time.slice(0, 5) : ''}${w.day_goal ? ' · ' + esc(w.day_goal) : ''}</small>
      <span class="btn primary">${w.status === 'planned' ? 'פתיחת היום' : w.status === 'done' ? 'סיכום היום' : 'המשך היום'}</span></span></a>`; }).join('');

  if (!M) {
    const next = (d.wdays || []).filter(w => w.day > t && mineDay(w)).slice(0, 4);
    box.innerHTML = `${myDay}<button class="btn primary block big" id="qnew">${icon('plus', 20)} דוח חדש</button>${myDay ? '' : empty('calendar', 'אין לך יום שטח היום', next[0] ? `הבא: ${esc(byId.get(next[0].project_id)?.name || '')}, ${dayWord(next[0].day)}` : 'כשתשובץ, היום יופיע כאן')}
      ${next.length ? `<section><h3 class="sh">הימים הקרובים</h3><div class="list">${next.map(w => dayRow(w, byId)).join('')}</div></section>` : ''}
      ${inboxPeek(d)}`;
    bindConfirm(box); extras(); return;
  }

  const A = alerts(d);
  const inField = new Map();
  (d.wdays || []).filter(w => w.day === t).forEach(w => inField.set(w.project_id, { p: byId.get(w.project_id), w }));
  P.filter(isOpen).forEach(x => { const f = x.planned_from || x.actual_from, to = x.planned_to || x.actual_to || f; if (f && f <= t && to >= t && !inField.has(x.id)) inField.set(x.id, { p: x }); });
  const field = [...inField.values()].filter(x => x.p);
  const nextField = !field.length ? schedule(d, addDays(t, 1), 13).find(x => x.items.some(i => i.kind !== 'v')) : null;
  const week = schedule(d, t, 7);
  const active = P.filter(isOpen).filter(x => x.status_label !== 'פיילוט' || inField.has(x.id))
    .sort((a, b) => (inField.has(b.id) - inField.has(a.id)) || (RANK[a.status_label] ?? 5) - (RANK[b.status_label] ?? 5) || ((a.planned_from || '9') < (b.planned_from || '9') ? -1 : 1)).slice(0, 8);

  box.innerHTML = `
    ${myDay}<div id="yday"></div><button class="btn primary block big" id="qnew">${icon('plus', 20)} דוח חדש</button>
    <section><div class="sh-row"><h3 class="sh">היום בשטח</h3>${field.length ? `<span class="count">${field.length}</span>` : ''}</div>
      ${field.length ? `<div class="rail">${field.map(x => `<a class="pcard" href="${x.w ? '#/day/' + x.w.id : '#/p/' + x.p.id}"><span class="img" style="background-image:url('${cov[x.p.id]}')"></span>
        <span class="pc-b"><b>${esc(x.p.name)}</b><small>${x.w ? `${DAY_ST[x.w.status]}${x.w.report_time ? ' · ' + x.w.report_time.slice(0, 5) : ''} · ${esc((x.w.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).join(', '))}` : esc(x.p.client_name || x.p.status_label || '')}</small></span></a>`).join('')}</div>`
      : empty('drone', 'אין עבודה בשטח היום', nextField ? `הבא: ${esc(nextField.items.find(i => i.kind !== 'v').p?.name || '')}, ${dayWord(nextField.date)}` : 'אין עבודה מתוכננת בשבועיים הקרובים')}
    </section>

    <section><div class="sh-row"><h3 class="sh">לטיפול</h3>${A.length > 3 ? `<a class="more" href="#/alerts">הכל (${A.length})</a>` : ''}</div>
      ${A.length ? `<div class="alist">${A.slice(0, 3).map(alertRow).join('')}</div>` : empty('shield', 'הכל תחת שליטה', 'אין כרגע דברים פתוחים', 'ok')}
    </section>

    <section><div class="sh-row"><h3 class="sh">השבוע</h3><a class="more" href="#/schedule">לו"ז מלא</a></div>
      <div class="week" id="wk">${week.map((x, i) => `<button class="wd" data-i="${i}" aria-pressed="false"><small>${i === 0 ? 'היום' : HE_D1[new Date(x.date + 'T12:00').getDay()]}</small><b>${+x.date.slice(8)}</b><span class="dots">${x.items.slice(0, 3).map(it => `<i class="${it.kind === 'v' ? 'blue' : it.kind === 'w' ? 'lime' : TONE[it.p?.status_label] || 'grey'}"></i>`).join('')}</span></button>`).join('')}</div>
      <div id="wkday" class="ditems"></div>
    </section>

    <section><div class="sh-row"><h3 class="sh">פרויקטים פעילים</h3><a class="more" href="#/projects">הכל</a></div>
      <div class="rail">${active.map(x => `<a class="pcard sm" href="#/p/${x.id}"><span class="img" style="background-image:url('${cov[x.id]}')"><span class="pill ${TONE[x.status_label] ?? ''}">${esc(x.status_label || '')}</span></span>
        <span class="pc-b"><b>${esc(x.name)}</b><small>${esc([x.client_name, x.planned_from ? dm(x.planned_from) : null].filter(Boolean).join(' · '))}</small></span></a>`).join('')}</div>
    </section>

    ${inboxPeek(d)}
    <div class="foot">${d.sync?.[0] ? `מסונכרן עם מאנדי · ${timeAgo(d.sync[0].created_at)}` : ''}</div>`;

  const pick = i => { $$('#wk .wd').forEach(b => b.setAttribute('aria-pressed', b.dataset.i == i)); const x = week[i];
    $('#wkday').innerHTML = x.items.length ? x.items.map(evRow).join('') : `<div class="ev none">אין עבודה מתוכננת ${i == 0 ? 'היום' : 'ביום הזה'}</div>`; };
  $$('#wk .wd').forEach(b => b.onclick = () => pick(+b.dataset.i));
  extras();
  pick(week[0].items.length ? 0 : Math.max(0, week.findIndex(x => x.items.length)));
}
const dayRow = (w, byId) => { const me = (w.work_day_crew || []).find(c => c.user_id === state.user.id);
  const needConfirm = me && !me.confirmed_at && w.status === 'planned' && w.day > today();
  return `<div class="dayrow"><a class="lrow" href="#/day/${w.id}"><span class="datebox ${w.day === today() ? 'now' : ''}"><b>${+w.day.slice(8)}</b><small>${w.day === today() ? 'היום' : 'יום ' + HE_D1[new Date(w.day + 'T12:00').getDay()]}</small></span>
  <span class="grow"><b>${esc(byId.get(w.project_id)?.name || '')}</b><small>${w.report_time ? 'התייצבות ' + w.report_time.slice(0, 5) : ''}${w.is_last_day ? ' · יום אחרון' : ''}${me?.confirmed_at && w.status === 'planned' ? ' · אישרת הגעה ✓' : ''}</small></span><span class="pill ${w.status === 'done' ? 'ok' : w.status === 'planned' ? '' : 'lime'}">${DAY_ST[w.status]}</span></a>
  ${needConfirm ? `<button class="btn primary sm block" data-confirm="${w.id}">מאשר הגעה</button>` : ''}</div>`; };
function bindConfirm(root) {
  $$('[data-confirm]', root).forEach(b => b.onclick = async () => { b.disabled = true; const { error } = await sb.rpc('confirm_day', { d: b.dataset.confirm });
    if (error) { b.disabled = false; return; } b.outerHTML = '<div class="acked" style="text-align:center">אישרת הגעה ✓</div>'; });
}
function inboxPeek(d) {
  const un = (d.inbox || []).filter(c => c.unread > 0).slice(0, 3);
  if (!un.length) return '';
  return `<section><div class="sh-row"><h3 class="sh">הודעות חדשות</h3><a class="more" href="#/inbox">הכל</a></div><div class="list">${un.map(c => `<a class="lrow" href="#/c/${c.id}"><span class="avatar sm ${c.kind === 'group' ? 'grp' : ''}">${c.kind === 'group' ? icon('users', 18) : esc(initials(c.title))}</span><span class="grow"><b>${esc(c.title || '')}</b><small>${esc(c.last_message || '')}</small></span><span class="badge">${c.unread}</span></a>`).join('')}</div></section>`;
}

// ---------- כל מה שלטיפול ----------
export async function renderAlerts(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>לטיפול</h1></header><div id="al" class="alist"><div class="skel"></div></div>`;
  const d = await load(); const A = alerts(d);
  $('#al').innerHTML = A.map(alertRow).join('') || empty('shield', 'הכל תחת שליטה', '', 'ok');
}

// ---------- לו"ז ----------
export async function renderSchedule(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>לו"ז</h1></header><div id="sc" class="stack lg"><div class="skel"></div></div>`;
  const d = await load(); const box = $('#sc'); if (!box) return;
  const t = today(), M = isManager();
  const by = new Map((d.projects || []).map(p => [p.id, p]));
  const mine = (d.wdays || []).filter(w => w.day >= t && mineDay(w));
  const days = schedule(d, t, 14).filter((x, i) => i === 0 || x.items.length);
  const hasDay = new Set((d.wdays || []).filter(w => w.day >= t).map(w => w.project_id));
  const noDate = (d.projects || []).filter(isOpen).filter(p => ['קביעת מועד', 'תואם - ממתין לביצוע', 'אושר מול לקוח', 'בביצוע'].includes(p.status_label) && !hasDay.has(p.id) && !((p.planned_to || p.planned_from || '') >= t));
  box.innerHTML = `${can('today') ? `<section><h3 class="sh">הימים שלי</h3>${mine.length ? `<div class="list">${mine.map(w => dayRow(w, by)).join('')}</div>` : empty('calendar', 'אין לך ימי שטח משובצים', 'השיבוץ נעשה בתוך הפרויקט')}</section>` : ''}
    ${M ? `<a class="btn primary block" href="#/dispatch">${icon('users', 18)} לוח שיבוץ שבועי</a>` : ''}
    ${M ? `<section><div class="sh-row"><h3 class="sh">כל החברה · שבועיים</h3><a class="more" href="#/reports">דוחות שטח</a></div>
      <div class="agenda">${days.map(x => `<div class="day ${x.date === t ? 'is-today' : ''}"><div class="dlabel"><b>${x.date === t ? 'היום' : HE_DOW[new Date(x.date + 'T12:00').getDay()]}</b><span>${dm(x.date)}</span></div>
        <div class="ditems">${x.items.length ? x.items.map(evRow).join('') : '<div class="ev none">אין עבודה מתוכננת</div>'}</div></div>`).join('')}</div></section>` : ''}
    ${M && noDate.length ? `<section><div class="sh-row"><h3 class="sh">ממתינים לתאריך</h3><span class="count">${noDate.length}</span></div><div class="small muted">פרויקטים פתוחים בלי תאריך ביצוע עתידי במאנדי</div>
      <div class="alist">${noDate.map(p => `<a class="arow" href="#/p/${p.id}"><span class="aic">${icon('calendar', 20)}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc([p.status_label, p.client_name].filter(Boolean).join(' · '))}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}`;
  bindConfirm(box);
}

// ---------- דוחות שטח ----------
export async function renderReports(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/schedule" aria-label="חזרה">${icon('back', 20)}</a><h1>דוחות שטח</h1></header><div id="rl" class="list"><div class="skel"></div></div>`;
  const { data } = await sb.from('field_reports').select('*').order('report_date', { ascending: false }).limit(100);
  const th = (data || []).map(r => (r.photos || []).find(Boolean)).filter(Boolean);
  const u = th.length ? await signedUrls('media', th) : {};
  $('#rl').innerHTML = (data || []).map(r => { const ph = (r.photos || []).find(Boolean);
    return `<a class="rep" ${r.project_id ? `href="#/p/${r.project_id}"` : ''}>${ph ? `<img src="${esc(u[ph])}" alt="" loading="lazy">` : `<span class="rep-ph">${icon('report', 22)}</span>`}<span class="grow"><b>${esc(r.project_label || 'בלי פרויקט')}</b>
      <small>${dm(r.report_date)}${r.crew ? ' · ' + esc(r.crew) : ''}${r.gallons ? ` · ${nf(r.gallons)} גלונים` : ''}</small>
      ${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : r.work ? `<small>${esc(r.work)}</small>` : ''}</span>${r.had_issues ? '<span class="pill warn">תקלה</span>' : ''}</a>`; }).join('') || '<div class="empty">אין דוחות.</div>';
}

// תוספות בראש המסך אחרי שהוא צויר: הודעות לאישור, הפעלת התראות
function extras() {
  if (isManager()) yesterday();
  pendingAcks(); window.__pushCard?.($('#hm'));
  import('./attendance.js').then(m => m.clockCard($('#hm')));
  const n = $('#qnew'); if (n) n.onclick = async () => (await import('./reports.js')).newReport();
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
    b.disabled = true; const { enqueue } = await import('../lib/core.js');
    await enqueue({ kind: 'insert', table: 'message_acks', row: { message_id: b.dataset.ok, user_id: state.user.id } });
    b.closest('.must').remove();
  });
}

// אתמול בשטח (מנהלים): דוחות, שעות, תקלות, הוצאות — במבט אחד
async function yesterday() {
  const box = $('#yday'); if (!box) return;
  const y = addDays(today(), -1), from = new Date(y + 'T00:00:00').toISOString(), to = new Date(today() + 'T00:00:00').toISOString();
  const q = p => p.then(r => r.data || []).catch(() => []);
  const [reps, days, iss, exps, shifts] = await Promise.all([
    q(sb.from('field_reports').select('project_label,hours').eq('report_date', y)),
    q(sb.from('work_days').select('id,projects(name)').eq('day', y).eq('status', 'done')),
    q(sb.from('issues').select('id,severity').gte('created_at', from).lt('created_at', to)),
    q(sb.from('expenses').select('amount').eq('day', y)),
    q(sb.from('shifts').select('start_at,end_at').gte('start_at', from).lt('start_at', to)),
  ]);
  const hrs = shifts.reduce((t, s) => t + (s.end_at ? (new Date(s.end_at) - new Date(s.start_at)) / 36e5 : 0), 0);
  const projs = new Set([...reps.map(r => r.project_label), ...days.map(d => d.projects?.name)].filter(Boolean));
  if (!projs.size && !hrs && !iss.length && !exps.length) return;
  const ex = exps.reduce((t, e) => t + Number(e.amount), 0);
  box.innerHTML = `<a class="yday" href="#/schedule"><span class="eyebrow">אתמול בשטח</span><span class="ys">
    <span><b>${projs.size}</b><small>פרויקטים</small></span><span><b>${hrs ? Math.round(hrs) : '—'}</b><small>שעות צוות</small></span>
    <span><b>${iss.length}</b><small>תקלות</small></span><span><b>${ex ? '₪' + Math.round(ex) : '—'}</b><small>הוצאות</small></span></span>
    <small class="muted">${esc([...projs].join(' · '))}</small></a>`;
}
