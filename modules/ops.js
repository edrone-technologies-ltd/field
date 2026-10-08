// ניהול מהטלפון (מנהל תפעול ומעלה): מסך אחד שעונה על "מה קורה בשטח, מה תקוע, ומה מחכה לי" — ומאשרים ישר מכאן.
// היום ומחר בשטח (צוות, מי החתים, מי אישר הגעה, מזג אוויר) · בעיות (מחושבות מהנתונים) · לאישורך (תיקוני שעות, היעדרויות, בקשות למשרד, רכש).
import { sb, state, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, toast, ask, timeAgo, can } from '../lib/core.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const first = n => (n || '').split(' ')[0];
const hm = iso => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const ABS = { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש ללא תשלום', other: 'היעדרות' };

export async function renderOps(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהל תפעול ומעלה.</div>'; return; }
  el.innerHTML = `<header class="phead"><h1 class="grow">ניהול</h1><span class="small muted">${HE_D1[new Date().getDay()]} ${dm(isoDay())}</span></header><div class="skel tall"></div>`;
  const t = isoDay(), tm = addDays(t, 1), y = addDays(t, -1);
  const q = async p => { try { const { data } = await p; return data || []; } catch { return []; } };
  const [days, people, shifts, abs, sreq, oreq, preq, drones, ended] = await Promise.all([
    q(sb.from('work_days').select('id,day,status,report_time,crew_lead_id,drone_id,project_id,projects(name,site_id),work_day_crew(user_id,role,confirmed_at)').gte('day', t).lte('day', tm).neq('status', 'cancelled').order('day').order('report_time')),
    q(sb.from('profiles').select('id,full_name,role,is_active').eq('is_active', true)),
    q(sb.from('shifts').select('id,user_id,start_at,end_at,status,start_dist_m,start_place,note').or(`status.eq.open,start_at.gte.${new Date(y + 'T00:00:00').toISOString()}`).order('start_at', { ascending: false }).limit(80)),
    q(sb.from('absences').select('id,user_id,kind,date_from,date_to,note,status').in('status', ['pending', 'approved']).gte('date_to', y)),
    q(sb.from('shift_requests').select('id,user_id,shift_id,req_start,req_end,reason,created_at').eq('status', 'pending').order('created_at')),
    q(sb.from('office_requests').select('id,user_id,category,body,status,created_at').neq('status', 'done').order('created_at')),
    can('purchase') ? q(sb.from('purchase_requests').select('id,status').in('status', ['submitted', 'pending'])) : [],
    q(sb.from('equipment').select('id,name,health').eq('kind', 'drone')),
    q(sb.from('work_days').select('id,day,signoff,project_id,projects!inner(id,name,closed_summary,monday_group)').eq('is_last_day', true).eq('status', 'done').is('projects.closed_summary', null).gte('day', addDays(t, -30))),
  ]);
  const P = new Map(people.map(p => [p.id, p])), name = id => first(P.get(id)?.full_name) || '—';
  const open = shifts.filter(s => s.status === 'open' && !s.end_at), openBy = new Map(open.map(s => [s.user_id, s]));
  const inToday = new Set(shifts.filter(s => isoDay(new Date(s.start_at)) === t).map(s => s.user_id));
  const absOn = (uid, day) => abs.find(a => a.user_id === uid && a.status === 'approved' && a.date_from <= day && a.date_to >= day);
  const D = new Map(drones.map(d => [d.id, d]));

  // ---- בעיות: כל מה שעלול להפיל יום שטח או שכר ----
  const issues = [];
  for (const w of days) {
    const pn = (w.projects?.name || '').replace(/^[^—]*—\s*/, '') || w.projects?.name || '', when = w.day === t ? 'היום' : 'מחר', href = `#/day/${w.id}`;
    const crew = (w.work_day_crew || []);
    if (!w.crew_lead_id) issues.push({ tone: 'bad', ic: 'users', t: `אין ראש צוות · ${when}`, s: pn, href });
    if (!crew.length) issues.push({ tone: 'bad', ic: 'users', t: `לא שובץ צוות · ${when}`, s: pn, href });
    const un = crew.filter(c => c.role !== 'lead' && !c.confirmed_at && w.status === 'planned');
    if (un.length && w.day === tm) issues.push({ tone: 'warn', ic: 'clock', t: `${un.length > 1 ? un.length + ' לא אישרו' : name(un[0].user_id) + ' לא אישר'} הגעה למחר`, s: pn + (un.length > 1 ? ' · ' + un.map(c => name(c.user_id)).join(', ') : ''), href });
    for (const c of crew) { const a = absOn(c.user_id, w.day); if (a) issues.push({ tone: 'bad', ic: 'calendar', t: `${name(c.user_id)} ב${ABS[a.kind] || 'היעדרות'} ומשובץ ${when}`, s: pn, href }); }
    const dr = D.get(w.drone_id); if (dr?.health === 'grounded') issues.push({ tone: 'bad', ic: 'drone', t: `רחפן ${dr.name} מקורקע ומשובץ ${when}`, s: pn, href: '#/equipment' });
  }
  for (const s of open) {
    const h = (Date.now() - new Date(s.start_at)) / 36e5;
    if (isoDay(new Date(s.start_at)) < t) issues.push({ tone: 'bad', ic: 'clock', t: `${name(s.user_id)} לא החתים יציאה מאתמול`, s: `נכנס ${dm(isoDay(new Date(s.start_at)))} ב-${hm(s.start_at)}`, href: `#/hours/${s.user_id}` });
    else if (h >= 12) issues.push({ tone: 'warn', ic: 'clock', t: `${name(s.user_id)} במשמרת ${Math.floor(h)} שעות`, s: `נכנס ב-${hm(s.start_at)}`, href: `#/hours/${s.user_id}` });
  }
  shifts.filter(s => isoDay(new Date(s.start_at)) === t && (s.start_dist_m || 0) > 800).forEach(s => issues.push({ tone: 'warn', ic: 'pin', t: `${name(s.user_id)} החתים ${s.start_dist_m >= 1000 ? (s.start_dist_m / 1000).toFixed(1) + ' ק״מ' : s.start_dist_m + ' מ׳'} מהאתר`, s: s.start_place || 'בדיקה', href: `#/hours/${s.user_id}` }));
  shifts.filter(s => /נסגרה אוטומטית/.test(s.note || '')).forEach(s => issues.push({ tone: 'warn', ic: 'clock', t: `יציאה אוטומטית · ${name(s.user_id)}`, s: `${dm(isoDay(new Date(s.start_at)))} · נרשמו 12 שעות — לוודא`, href: `#/hours/${s.user_id}` }));
  const rank = { bad: 0, warn: 1 };
  issues.sort((a, b) => rank[a.tone] - rank[b.tone]);

  // ---- היום ומחר ----
  const dayCard = w => {
    const crew = (w.work_day_crew || []).slice().sort((a, b) => (a.user_id === w.crew_lead_id ? -1 : 0) - (b.user_id === w.crew_lead_id ? -1 : 0));
    const chip = c => { const lead = c.user_id === w.crew_lead_id, onShift = openBy.has(c.user_id), was = inToday.has(c.user_id);
      const st = w.day === t ? (onShift ? ['on', 'במשמרת'] : was ? ['done', 'סיים'] : ['off', 'לא החתים']) : (c.confirmed_at || lead ? ['on', 'אישר'] : ['off', 'לא אישר']);
      return `<span class="opc ${st[0]}" title="${st[1]}"><i></i>${esc(name(c.user_id))}${lead ? ' ★' : ''}<small>${st[1]}</small></span>`; };
    const site = w.projects?.site_id;
    return `<a class="card opday" href="#/day/${w.id}"><div class="row"><b class="grow">${esc(w.projects?.name || '')}</b>${site ? `<span data-wx="${site}|${w.day}"></span>` : ''}</div>
      <small class="muted">${w.report_time ? 'יציאה ' + w.report_time.slice(0, 5) + ' · ' : ''}${w.crew_lead_id ? 'ראש צוות ' + esc(name(w.crew_lead_id)) : 'אין ראש צוות'}${D.get(w.drone_id) ? ' · ' + esc(D.get(w.drone_id).name) : ''}</small>
      <div class="opcrew">${crew.map(chip).join('') || '<small class="muted">לא שובץ צוות</small>'}</div></a>`;
  };
  const dToday = days.filter(w => w.day === t), dTom = days.filter(w => w.day === tm);

  // ---- לאישורך ----
  const pendAbs = abs.filter(a => a.status === 'pending');
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
  // יום אחרון נסגר בשטח → סגירת פרויקט בהקשה (מסכם ושולח למאנדי "הסתיים")
  const endedP = [...new Map(ended.filter(w => w.projects?.monday_group !== 'group_mm5052gw').map(w => [w.project_id, w])).values()];
  endedP.forEach(w => approvals.unshift(`<div class="card stack opr"><div class="row"><b class="grow">${esc(w.projects.name)}</b><small class="muted">${dm(w.day)}</small></div>
      <small>היום האחרון נסגר בשטח${w.signoff ? ' · חתום על ידי הלקוח' : ' · בלי חתימת לקוח'}</small>
      <div class="row-btns"><a class="btn ghost sm" href="#/p/${w.project_id}">לפרויקט</a><button class="btn primary sm" data-close-p="${w.project_id}">סגירת פרויקט</button></div></div>`));
  if (preq.length) approvals.push(`<a class="lrow card" href="#/purchase"><span class="mic">${icon('cart', 19)}</span><span class="grow"><b>${preq.length > 1 ? preq.length + ' בקשות רכש ממתינות' : 'בקשת רכש ממתינה'}</b><small>לאישור ושליחה לספק</small></span><span class="chev">${icon('chev', 18)}</span></a>`);

  const kpi = (n, l, tone = '') => `<div class="kpi ${tone}"><b>${n}</b><span>${l}</span></div>`;
  el.innerHTML = `<header class="phead"><h1 class="grow">ניהול</h1><span class="small muted">${HE_D1[new Date().getDay()]} ${dm(t)}</span></header>
    <div class="stack lg">
      <div class="kpis opk">${kpi(dToday.length, 'ימי שטח היום')}${kpi(open.length, 'במשמרת עכשיו')}${kpi(issues.length, 'בעיות', issues.some(i => i.tone === 'bad') ? 'bad' : issues.length ? 'warn' : '')}${kpi(approvals.length, 'לאישורך', approvals.length ? 'warn' : '')}</div>
      ${issues.length ? `<section class="stack"><h3 class="sh">בעיות</h3><div class="alist">${issues.map(i => `<a class="arow ${i.tone}" href="${i.href}"><span class="aic">${icon(i.ic, 20)}</span><span class="grow"><b>${esc(i.t)}</b><small>${esc(i.s)}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
      <section class="stack"><div class="sh-row"><h3 class="sh">היום בשטח</h3><a class="more" href="#/dispatch">לוח שיבוץ</a></div>${dToday.map(dayCard).join('') || '<div class="small muted">אין ימי שטח היום</div>'}</section>
      ${approvals.length ? `<section class="stack"><h3 class="sh">לאישורך</h3>${approvals.join('')}</section>` : ''}
      <section class="stack"><h3 class="sh">מחר</h3>${dTom.map(dayCard).join('') || '<div class="small muted">אין ימי שטח מחר</div>'}</section>
      <div class="opquick">${[['#/schedule', 'calendar', 'לו״ז'], ['#/dispatch', 'users', 'שיבוץ'], ['#/attendance', 'clock', 'נוכחות'], ['#/weather', 'sun', 'מזג אוויר'], ['#/equipment', 'drone', 'ציוד'], ['#/requests', 'send', 'בקשות']].map(([h, ic, l]) => `<a href="${h}">${icon(ic, 20)}<span>${l}</span></a>`).join('')}</div>
    </div>`;
  import('../lib/wx.js').then(m => m.fillWx(el)).catch(() => {});
  const again = () => renderOps(el);
  $$('[data-sr]', el).forEach(b => b.onclick = async e => { e.preventDefault(); const ok = b.dataset.ok === '1'; const reply = ok ? '' : await ask('סיבת הדחייה', { optional: true, ok: 'דחייה' }); if (reply === null) return;
    const { error } = await sb.rpc('decide_shift_request', { rid: b.dataset.sr, ok, reply: (reply || '').trim() }); if (error) return toast(error.message); toast(ok ? 'אושר' : 'נדחה'); again(); });
  $$('[data-ab]', el).forEach(b => b.onclick = async () => { const ok = b.dataset.ok === '1';
    const { error } = await sb.from('absences').update({ status: ok ? 'approved' : 'rejected', manager_id: state.user.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.ab); if (error) return toast(error.message); toast(ok ? 'אושר' : 'נדחה'); again(); });
  $$('[data-close-p]', el).forEach(b => b.onclick = async () => { b.disabled = true; const { error } = await sb.rpc('close_project', { p: b.dataset.closeP }); if (error) { b.disabled = false; return toast(error.message); } toast('הפרויקט נסגר — עובר למאנדי'); again(); });
  $$('[data-or]', el).forEach(b => b.onclick = async () => { const r = await ask('מה נעשה?', { optional: true, ok: 'סגירה' }); if (r === null) return;
    const { error } = await sb.from('office_requests').update({ status: 'done', reply: (r || '').trim() || 'טופל', handled_by: state.user.id }).eq('id', b.dataset.or); if (error) return toast(error.message); toast('נסגר'); again(); });
}
