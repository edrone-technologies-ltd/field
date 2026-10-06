// מסך ראשי: מה דורש תשומת לב, לו"ז, מה קורה בשטח, פרויקטים. הכל מהנתונים שמסונכרנים ממאנדי.
import { sb, state, can, isManager, cache, $, $$, esc, nf, ROLE_HE, initials } from '../lib/core.js';

const ISO = d => d.toISOString().slice(0, 10);
const today = () => ISO(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ISO(d); };
const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dayName = s => { const t = today(); return s === t ? 'היום' : s === addDays(t, 1) ? 'מחר' : `יום ${DOW[new Date(s + 'T12:00:00').getDay()]}`; };
const dm = s => s ? `${+s.slice(8, 10)}.${+s.slice(5, 7)}` : '';
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const STATUS_TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'קביעת מועד': 'warn', 'תואם - ממתין לביצוע': 'warn', 'אושר מול לקוח': 'warn', 'פיילוט': '', 'הסתיים — ממתין לתשלום': 'ok' };
const ARCHIVE = 'group_mm5052gw';

async function load() {
  const q = async (p) => { try { const { data, error } = await p; if (error) throw error; return data || []; } catch { return null; } };
  const since = addDays(today(), -14);
  const [projects, reports, visits, drones, team, specs, fin, sync] = await Promise.all([
    q(sb.from('projects').select('*').neq('monday_group', ARCHIVE)),
    q(sb.from('field_reports').select('*').gte('report_date', since).order('report_date', { ascending: false })),
    q(sb.from('spec_visits').select('*')),
    q(sb.from('equipment').select('*').eq('kind', 'drone').order('name')),
    q(sb.from('profiles').select('full_name,role,is_pilot,pilot_license_expiry,is_active')),
    q(sb.from('sites').select('name,slug,buildings(specs(status))').eq('is_active', true)),
    can('finance') ? q(sb.from('project_finance').select('*')) : Promise.resolve([]),
    q(sb.from('sync_log').select('created_at,status').eq('entity', 'full_pull').order('created_at', { ascending: false }).limit(1)),
  ]);
  const data = { projects, reports, visits, drones, team, specs, fin, sync };
  if (projects) await cache.set('home', data);
  else Object.assign(data, (await cache.get('home')) || {});
  return data;
}

function alerts(d) {
  const out = []; const t = today();
  (d.drones || []).forEach(x => {
    if (x.health === 'grounded') out.push({ tone: 'bad', title: `רחפן ${x.name} מקורקע`, sub: (x.health_detail || '').split('\n')[0].replace(/^[^֐-׿A-Za-z0-9]+/, ''), at: x.health_date });
    else if (x.health === 'warning') out.push({ tone: 'warn', title: `רחפן ${x.name} במעקב`, sub: (x.health_detail || '').split('\n')[0] });
  });
  (d.projects || []).filter(p => p.status_label === 'תקוע').forEach(p => out.push({ tone: 'bad', title: `פרויקט תקוע: ${p.name}`, sub: p.client_name || '', href: '#/p/' + p.id }));
  // פער בין מה שקורה בשטח לבין הלו"ז במאנדי
  const recentByProject = new Map();
  (d.reports || []).forEach(r => { if (r.project_id && !recentByProject.has(r.project_id)) recentByProject.set(r.project_id, r); });
  (d.projects || []).forEach(p => {
    const r = recentByProject.get(p.id);
    if (r && daysBetween(r.report_date, t) <= 7 && !['בביצוע'].includes(p.status_label))
      out.push({ tone: 'warn', title: `יש עבודה בשטח, הסטטוס במאנדי "${p.status_label}"`, sub: `${p.name} · דוח אחרון ${dm(r.report_date)}`, href: '#/p/' + p.id });
  });
  const issues = (d.reports || []).filter(r => r.had_issues && daysBetween(r.report_date, t) <= 7);
  if (issues.length) out.push({ tone: 'warn', title: `${issues.length} דוחות שטח עם תקלות השבוע`, sub: [...new Set(issues.map(r => r.project_label))].join(' · '), href: '#/reports' });
  (d.team || []).filter(p => p.is_active && p.is_pilot && p.pilot_license_expiry).forEach(p => {
    const left = daysBetween(t, p.pilot_license_expiry);
    if (left <= 45) out.push({ tone: left <= 14 ? 'bad' : 'warn', title: `רישיון המטיס של ${p.full_name} ${left < 0 ? 'פג' : `פג בעוד ${left} ימים`}`, sub: `תוקף ${dm(p.pilot_license_expiry)}` });
  });
  const noDate = (d.visits || []).filter(v => !v.visit_date);
  if (noDate.length) out.push({ tone: '', title: `${noDate.length} סיורי אפיון בלי תאריך`, sub: noDate.map(v => v.lead_name).join(' · ') });
  return out;
}

function agenda(d) {
  const t = today(), end = addDays(t, 13), days = [];
  for (let i = 0; i < 14; i++) days.push({ date: addDays(t, i), items: [] });
  const put = (from, to, item) => days.forEach(x => { if (x.date >= from && x.date <= (to || from)) x.items.push(item); });
  (d.projects || []).forEach(p => {
    const f = p.planned_from || p.actual_from, to = p.planned_to || p.actual_to || f;
    if (f && to >= t && f <= end && !String(p.status_label).startsWith('הסתיים')) put(f, to, { kind: 'p', p, tone: STATUS_TONE[p.status_label] ?? '' });
  });
  (d.visits || []).filter(v => v.visit_date).forEach(v => put(v.visit_date, v.visit_date, { kind: 'v', v }));
  return days;
}

export async function renderHome(el) {
  const p = state.profile, first = (p.full_name || '').split(' ')[0];
  const h = new Date().getHours(), greet = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  const t = new Date();
  el.innerHTML = `<div class="top"><img class="mark" src="mark.png" alt="E-Drone"><span class="grow"></span>
      <button class="avatar" id="me" aria-label="החשבון שלי">${esc(initials(p.full_name))}</button></div>
    <div class="hello"><div class="eyebrow">יום ${DOW[t.getDay()]} · ${t.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(first)}</h1></div>
    <div id="hm" class="stack"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
  $('#me').onclick = () => location.hash = '#/me';
  const d = await load();
  const box = $('#hm'); if (!box) return;
  const A = alerts(d), days = agenda(d);
  const active = (d.projects || []).filter(x => !String(x.status_label).startsWith('הסתיים') && x.monday_group !== ARCHIVE);
  const now = active.filter(x => { const f = x.planned_from || x.actual_from, to = x.planned_to || x.actual_to; return f && f <= today() && (to || f) >= today(); });
  const waitPay = (d.projects || []).filter(x => x.monday_group === 'group_mm59srsc');
  const finBy = new Map((d.fin || []).map(f => [f.project_id, f]));
  const owed = waitPay.reduce((s, x) => s + Number(finBy.get(x.id)?.price_gross || finBy.get(x.id)?.price_net || 0), 0);
  const openSpecs = (d.specs || []).reduce((s, x) => s + x.buildings.filter(b => (b.specs?.[0] || b.specs)?.status !== 'done').length, 0);
  const lastSync = d.sync?.[0]?.created_at;

  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${now.length}</b><span>בשטח היום</span></div>
      <div class="kpi"><b>${active.length}</b><span>פרויקטים פתוחים</span></div>
      ${can('finance') ? `<div class="kpi"><b>${owed ? '₪' + nf(Math.round(owed / 1000)) + 'K' : waitPay.length}</b><span>${owed ? 'ממתין לגבייה' : 'ממתינים לתשלום'}</span></div>` : `<div class="kpi"><b>${openSpecs}</b><span>מבנים לאפיון</span></div>`}
    </div>

    ${A.length ? `<section class="stack" style="gap:8px"><h3>דורש תשומת לב</h3>${A.map(a => `<${a.href ? `a href="${a.href}"` : 'div'} class="alert ${a.tone}"><span class="dot"></span><span class="grow"><b>${esc(a.title)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>${a.href ? '<span class="chev">‹</span>' : ''}</${a.href ? 'a' : 'div'}>`).join('')}</section>`
      : `<div class="card row"><span class="dot ok"></span><b>אין כרגע דברים פתוחים שדורשים טיפול</b></div>`}

    <section class="stack" style="gap:8px"><div class="row"><h3 class="grow">לו"ז שבועיים</h3><span class="small muted">מתוך הלו"ז במאנדי</span></div>
      <div class="agenda">${days.filter((x, i) => i < 2 || x.items.length).map(x => `<div class="day ${x.date === today() ? 'is-today' : ''}">
        <div class="dlabel"><b>${dayName(x.date)}</b><span>${dm(x.date)}</span></div>
        <div class="ditems">${x.items.length ? x.items.map(it => it.kind === 'p'
          ? `<a class="ev ${it.tone}" href="#/p/${it.p.id}"><b>${esc(it.p.name)}</b><small>${esc(it.p.status_label || '')}${it.p.client_name ? ' · ' + esc(it.p.client_name) : ''}</small></a>`
          : `<div class="ev blue"><b>סיור אפיון · ${esc(it.v.lead_name)}</b><small>${esc(it.v.owner || '')}</small></div>`).join('')
          : '<div class="ev none">אין עבודה מתוכננת</div>'}</div></div>`).join('')}</div>
    </section>

    <section class="stack" style="gap:8px"><div class="row"><h3 class="grow">מהשטח</h3><a class="small" href="#/reports">כל הדוחות ‹</a></div>
      ${(d.reports || []).slice(0, 5).map(r => `<div class="feed"><span class="pill ${r.had_issues ? 'warn' : 'ok'}">${r.had_issues ? 'תקלה' : 'תקין'}</span>
        <span class="grow"><b>${esc(r.project_label || 'בלי פרויקט')}</b><small>${dayName(r.report_date) === 'היום' ? 'היום' : dm(r.report_date)}${r.crew ? ' · ' + esc(r.crew) : ''}${r.work ? ' · ' + esc(r.work) : ''}</small>
        ${r.issues ? `<small class="issue">${esc(r.issues.slice(0, 140))}</small>` : ''}</span></div>`).join('') || '<div class="empty">אין דוחות שטח בשבועיים האחרונים</div>'}
    </section>

    <section class="stack" style="gap:8px"><h3>פרויקטים</h3>
      <div class="list">${active.sort((a, b) => (a.planned_from || '9') < (b.planned_from || '9') ? -1 : 1).map(x => `<a class="item" href="#/p/${x.id}">
        <span class="t"><b>${esc(x.name)}</b><small>${esc(x.client_name || '')}${x.planned_from ? ` · ${dm(x.planned_from)}${x.planned_to && x.planned_to !== x.planned_from ? '–' + dm(x.planned_to) : ''}` : ' · אין לו"ז'}</small></span>
        <span class="pill ${STATUS_TONE[x.status_label] ?? ''}">${esc(x.status_label || '')}</span></a>`).join('')}</div>
    </section>

    <section class="stack" style="gap:8px"><h3>צי</h3><div class="list">${(d.drones || []).map(x => `<div class="item" style="cursor:default"><span class="dot ${x.health === 'grounded' ? 'bad' : x.health === 'warning' ? 'warn' : 'ok'}"></span>
      <span class="t"><b>${esc(x.name)}</b><small>${x.health === 'grounded' ? 'מקורקע' : x.health === 'warning' ? 'במעקב' : 'תקין'}${x.health_date ? ' · בדיקה אחרונה ' + dm(x.health_date) : ''}</small></span></div>`).join('')}</div></section>

    <div id="tiles"></div>
    <div class="small muted" style="text-align:center">${lastSync ? `מסונכרן ממאנדי · ${new Date(lastSync).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>`;
}

export async function renderProject(el, id) {
  el.innerHTML = `<div class="skel"></div>`;
  const [{ data: p }, { data: reps }, fin] = await Promise.all([
    sb.from('projects').select('*').eq('id', id).single(),
    sb.from('field_reports').select('*').eq('project_id', id).order('report_date', { ascending: false }),
    can('finance') ? sb.from('project_finance').select('*').eq('project_id', id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!p) { el.innerHTML = `<div class="empty">הפרויקט לא נמצא.</div>`; return; }
  const f = fin.data;
  el.innerHTML = `<div class="top"><button class="back" onclick="history.back()">→ חזרה</button><span class="grow"></span><span class="pill ${STATUS_TONE[p.status_label] ?? ''}">${esc(p.status_label || '')}</span></div>
    <div><div class="eyebrow">${esc(p.client_name || '')}</div><h2>${esc(p.name)}</h2>${p.scope ? `<div class="muted">${esc(p.scope)}</div>` : ''}</div>
    <div class="kpis">
      <div class="kpi"><b>${p.planned_from ? dm(p.planned_from) + (p.planned_to && p.planned_to !== p.planned_from ? '–' + dm(p.planned_to) : '') : '—'}</b><span>לו"ז מתוכנן</span></div>
      <div class="kpi"><b>${p.field_days_actual != null ? nf(p.field_days_actual) : '—'}${p.field_days_planned ? ' / ' + nf(p.field_days_planned) : ''}</b><span>ימי שטח בפועל / תכנון</span></div>
      <div class="kpi"><b>${(reps || []).length}</b><span>דוחות שטח</span></div>
    </div>
    ${p.summary ? `<div class="card"><div class="eyebrow">תמונת ביצוע</div>${esc(p.summary)}</div>` : ''}
    ${f ? `<div class="card"><div class="eyebrow">כספים</div><table class="t"><tr><th>מחיר נטו</th><td>${f.price_net ? '₪' + nf(f.price_net) : '—'}</td></tr><tr><th>כולל מע"מ</th><td>${f.price_gross ? '₪' + nf(f.price_gross) : '—'}</td></tr>
      <tr><th>רווח גולמי</th><td>${f.gross_profit ? '₪' + nf(f.gross_profit) + (f.gross_pct ? ` (${nf(f.gross_pct)}%)` : '') : '—'}</td></tr><tr><th>תשלום</th><td>${esc(f.payment_status || '—')}${f.expected_payment ? ' · צפוי ' + dm(f.expected_payment) : ''}</td></tr></table></div>` : ''}
    <h3>דוחות שטח</h3>
    ${(reps || []).map(r => `<div class="feed"><span class="pill ${r.had_issues ? 'warn' : 'ok'}">${r.had_issues ? 'תקלה' : 'תקין'}</span><span class="grow"><b>${dm(r.report_date)}${r.hours ? ` · ${nf(r.hours)} שעות` : ''}${r.gallons ? ` · ${nf(r.gallons)} גלונים` : ''}</b>
      <small>${esc([r.crew, r.work].filter(Boolean).join(' · '))}</small>${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</span></div>`).join('') || '<div class="empty">אין דוחות שטח לפרויקט.</div>'}
    <a class="btn ghost block" href="https://edroneil-force.monday.com/boards/5099780041/pulses/${esc(p.monday_item_id)}" target="_blank" rel="noopener">פתיחה במאנדי</a>`;
}

export async function renderReports(el) {
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/'">→ בית</button></div><div><div class="eyebrow">מהשטח</div><h1>דוחות שטח</h1></div><div id="rl"><div class="skel"></div></div>`;
  const { data } = await sb.from('field_reports').select('*').order('report_date', { ascending: false }).limit(100);
  $('#rl').innerHTML = (data || []).map(r => `<div class="feed"><span class="pill ${r.had_issues ? 'warn' : 'ok'}">${r.had_issues ? 'תקלה' : 'תקין'}</span><span class="grow">
    <b>${esc(r.project_label || 'בלי פרויקט')}</b><small>${dm(r.report_date)}${r.crew ? ' · ' + esc(r.crew) : ''}${r.work ? ' · ' + esc(r.work) : ''}${r.gallons ? ` · ${nf(r.gallons)} גלונים` : ''}</small>
    ${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</span></div>`).join('') || '<div class="empty">אין דוחות.</div>';
}
