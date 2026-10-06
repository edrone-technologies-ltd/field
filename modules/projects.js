// פרויקטים: מרכז הביצוע. סקירה ממאנדי + אתר ואפיון, תכנית עבודה מהאפיון, שיבוץ ימים, צ'אט צוות, תקלות וסיכום.
import { sb, state, can, isManager, cache, enqueue, signedUrls, sheet, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm } from '../lib/core.js';

const ARCHIVE = 'group_mm5052gw';
const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'קביעת מועד': 'warn', 'תואם - ממתין לביצוע': 'warn', 'אושר מול לקוח': 'warn', 'הסתיים — ממתין לתשלום': 'ok' };
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'in_progress', dropped: 'todo' };
const DAY_ST = { planned: ['מתוכנן', ''], en_route: ['בדרך', 'warn'], on_site: ['באתר', 'lime'], working: ['בעבודה', 'lime'], issue: ['תקלה', 'bad'], done: ['נסגר', 'ok'] };
const KIND_HE = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' };
const FIELD_ROLES = ['admin', 'ops_manager', 'crew_lead', 'crew', 'surveyor'];

// ---------- רשימה ----------
export async function renderProjects(el) {
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/'">→ בית</button></div>
    <div><div class="eyebrow">ביצוע</div><h1>פרויקטים</h1></div><div class="tabs" id="pf"><button aria-selected="true" data-f="a">פתוחים</button><button aria-selected="false" data-f="d">הסתיימו</button></div><div id="pl" class="list"><div class="skel"></div></div>`;
  let rows;
  try {
    const { data, error } = await sb.from('projects').select('id,name,client_name,status_label,planned_from,planned_to,monday_group,site_id,work_days(id,day,status),tasks(status)').order('planned_from', { nullsFirst: false });
    if (error) throw error; rows = data || []; await cache.set('projects', rows);
  } catch { rows = (await cache.get('projects')) || []; }
  const t = isoDay();
  const draw = f => {
    const list = rows.filter(p => (f === 'a') === !(p.monday_group === ARCHIVE || String(p.status_label).startsWith('הסתיים')));
    $('#pl').innerHTML = list.map(p => {
      const next = (p.work_days || []).filter(d => d.day >= t && d.status !== 'done').sort((a, b) => a.day < b.day ? -1 : 1)[0];
      const tot = (p.tasks || []).filter(x => x.status !== 'dropped').length, done = (p.tasks || []).filter(x => x.status === 'done').length;
      return `<a class="item" href="#/p/${p.id}"><span class="t"><b>${esc(p.name)}</b>
        <small>${esc([p.client_name, next ? `יום שטח ${dayLabel(next.day)}` : p.planned_from ? dm(p.planned_from) : null].filter(Boolean).join(' · '))}</small>
        ${tot ? `<span class="progress" style="margin-top:6px"><i style="width:${Math.round(done / tot * 100)}%"></i></span>` : ''}</span>
        <span class="pill ${TONE[p.status_label] ?? ''}">${esc(p.status_label || '')}</span></a>`;
    }).join('') || '<div class="empty">אין פרויקטים להצגה.</div>';
  };
  $$('#pf button').forEach(b => b.onclick = () => { $$('#pf button').forEach(x => x.setAttribute('aria-selected', x === b)); draw(b.dataset.f); });
  draw('a');
}

// ---------- פרויקט ----------
export async function renderProject(el, id, tab = 'o') {
  el.innerHTML = `<div class="skel"></div>`;
  const ck = 'proj:' + id; let D;
  try {
    const [{ data: p, error }, { data: tasks }, { data: days }, { data: issues }, { data: reps }, fin, { data: sites }, { data: team }, { data: drones }] = await Promise.all([
      sb.from('projects').select('*, sites(id,slug,name,address,contact_name,contact_phone)').eq('id', id).single(),
      sb.from('tasks').select('*, buildings(name,code)').eq('project_id', id).order('day_no', { nullsFirst: false }).order('seq'),
      sb.from('work_days').select('*, work_day_crew(user_id,role,hours,profiles(full_name))').eq('project_id', id).order('day'),
      sb.from('issues').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('field_reports').select('*').eq('project_id', id).order('report_date', { ascending: false }),
      can('finance') ? sb.from('project_finance').select('*').eq('project_id', id).maybeSingle() : Promise.resolve({ data: null }),
      isManager() ? sb.from('sites').select('id,name,buildings(specs(status,days_expected))').eq('is_active', true) : Promise.resolve({ data: [] }),
      isManager() ? sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true) : Promise.resolve({ data: [] }),
      sb.from('equipment').select('id,name,health').eq('kind', 'drone'),
    ]);
    if (error) throw error;
    D = { p, tasks: tasks || [], days: days || [], issues: issues || [], reps: reps || [], fin: fin.data, sites: sites || [], team: (team || []).filter(x => FIELD_ROLES.includes(x.role)), drones: drones || [] };
    await cache.set(ck, D);
  } catch { D = await cache.get(ck); }
  if (!D) { el.innerHTML = `<div class="empty">הפרויקט לא נמצא.</div>`; return; }
  const p = D.p, M = isManager();
  const TABS = [['o', 'סקירה'], ['t', 'תכנית'], ['d', 'ימים'], ['c', "צ'אט"], ['i', 'תקלות'], ['s', 'סיכום']];
  const openIss = D.issues.filter(i => i.status === 'open').length;

  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/projects'">→ פרויקטים</button><span class="grow"></span><span class="pill ${TONE[p.status_label] ?? ''}">${esc(p.status_label || '')}</span></div>
    <div><div class="eyebrow">${esc(p.client_name || '')}</div><h2>${esc(p.name)}</h2></div>
    <div class="tabs scroll-x" id="pt">${TABS.map(([k, t]) => `<button data-t="${k}" aria-selected="${k === tab}">${t}${k === 'i' && openIss ? ` <span class="pill bad">${openIss}</span>` : ''}</button>`).join('')}</div>
    <div id="pb" class="stack"></div>`;
  $$('#pt button').forEach(b => b.onclick = () => { history.replaceState(null, '', `#/p/${id}/${b.dataset.t}`); renderTab(b.dataset.t); $$('#pt button').forEach(x => x.setAttribute('aria-selected', x === b)); });
  const reload = t => renderProject(el, id, t);

  function renderTab(t) {
    document.querySelectorAll('.bar,.composer').forEach(x => x.remove());
    const box = $('#pb');
    ({ o: overview, t: plan, d: daysTab, c: chat, i: issuesTab, s: summary }[t] || overview)(box);
    bindCopy(box);
  }

  // ----- סקירה -----
  function overview(box) {
    const tot = D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const dDone = D.days.filter(d => d.status === 'done').length, f = D.fin, s = p.sites;
    const next = D.days.find(d => d.day >= isoDay() && d.status !== 'done');
    box.innerHTML = `
      <div class="kpis"><div class="kpi"><b>${tot ? Math.round(done / tot * 100) + '%' : '—'}</b><span>מהתכנית בוצע</span></div>
        <div class="kpi"><b>${dDone}/${D.days.length || (p.field_days_planned ? nf(p.field_days_planned) : '—')}</b><span>ימי שטח</span></div>
        <div class="kpi"><b>${openIss}</b><span>תקלות פתוחות</span></div></div>
      ${next ? `<a class="alert" href="#/day/${next.id}"><span class="dot ok"></span><span class="grow"><b>יום השטח הבא: ${dayLabel(next.day)}</b><small>${next.report_time ? 'התייצבות ' + next.report_time.slice(0, 5) + ' · ' : ''}${esc((next.work_day_crew || []).map(c => c.profiles?.full_name).filter(Boolean).join(', '))}</small></span><span class="chev">‹</span></a>` : ''}
      ${p.scope ? `<div class="card"><div class="eyebrow">היקף</div>${esc(p.scope)}</div>` : ''}
      ${p.summary ? `<div class="card"><div class="eyebrow">תמונת ביצוע (מאנדי)</div>${esc(p.summary)}</div>` : ''}
      <div class="card stack" style="gap:8px"><div class="eyebrow">אתר</div>
        ${s ? `<div class="row"><b class="grow">${esc(s.name)}</b>${can('specs') ? `<a class="pill lime" href="#/site/${esc(s.slug)}">אפיון האתר</a>` : ''}</div>${s.address ? `<div class="small muted">${esc(s.address)}</div>` : ''}`
          : `<div class="muted">הפרויקט עוד לא משויך לאתר. השיוך מחבר אותו לאפיון ולתכנית העבודה.</div>`}
        ${M ? `<select id="site"><option value="">${s ? 'החלפת אתר…' : 'שיוך לאתר…'}</option>${D.sites.map(x => `<option value="${x.id}" ${x.id === p.site_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      </div>
      ${s ? contactCard(s.contact_name, s.contact_phone) : ''}
      <div class="card stack" style="gap:8px"><div class="eyebrow">דגשים לצוות</div>
        ${M ? `<textarea id="wn" placeholder="מה הצוות צריך לדעת: גישה, חניה, שעות שקטות, דרישות הלקוח">${esc(p.work_notes || '')}</textarea><button class="btn ghost" id="wns">שמירה</button>` : `<div>${esc(p.work_notes || 'אין דגשים')}</div>`}</div>
      ${f ? `<div class="card"><div class="eyebrow">כספים</div><table class="t"><tr><th>מחיר נטו</th><td>${f.price_net ? '₪' + nf(f.price_net) : '—'}</td></tr><tr><th>רווח גולמי</th><td>${f.gross_profit ? '₪' + nf(f.gross_profit) + (f.gross_pct ? ` (${nf(f.gross_pct)}%)` : '') : '—'}</td></tr><tr><th>תשלום</th><td>${esc(f.payment_status || '—')}${f.expected_payment ? ' · צפוי ' + dm(f.expected_payment) : ''}</td></tr></table></div>` : ''}
      ${D.reps.length ? `<h3>דוחות שטח (מאנדי)</h3>${D.reps.slice(0, 6).map(r => `<div class="feed"><span class="pill ${r.had_issues ? 'warn' : 'ok'}">${r.had_issues ? 'תקלה' : 'תקין'}</span><span class="grow"><b>${dm(r.report_date)}${r.gallons ? ` · ${nf(r.gallons)} גלונים` : ''}</b><small>${esc([r.crew, r.work].filter(Boolean).join(' · '))}</small>${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}</span></div>`).join('')}` : ''}
      ${p.monday_item_id ? `<a class="btn ghost block" href="https://edroneil-force.monday.com/boards/5099780041/pulses/${esc(p.monday_item_id)}" target="_blank" rel="noopener">פתיחה במאנדי</a>` : ''}`;
    if (M) {
      $('#site').onchange = async e => { if (!e.target.value) return; const { error } = await sb.from('projects').update({ site_id: e.target.value }).eq('id', id); if (error) return toast(error.message); toast('שויך לאתר'); reload('o'); };
      $('#wns').onclick = async () => { await enqueue({ kind: 'update', table: 'projects', rowId: id, patch: { work_notes: $('#wn').value || null } }); p.work_notes = $('#wn').value; toast('נשמר'); };
    }
  }

  // ----- תכנית עבודה -----
  function plan(box) {
    const by = new Map(); D.tasks.forEach(t => { const k = t.day_no ?? 0; if (!by.has(k)) by.set(k, []); by.get(k).push(t); });
    const dayOf = n => D.days.find(d => D.tasks.some(t => t.day_no === n && t.work_day_id === d.id));
    const tot = D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const blocked = D.tasks.filter(t => t.status === 'blocked');
    box.innerHTML = `${tot ? `<div class="card row"><div class="ring" style="--p:${Math.round(done / tot * 100)}"><b>${Math.round(done / tot * 100)}%</b></div><div class="grow"><b>${done} מתוך ${tot} משימות</b><div class="small muted">${by.size} ימי עבודה בתכנית${blocked.length ? ` · ${blocked.length} נתקעו` : ''}</div></div></div>` : ''}
      ${!D.tasks.length ? `<div class="empty">עוד אין תכנית עבודה.${p.site_id ? '<br>התכנית נבנית מהאפיון: יום עבודה לכל יום צפוי במבנה, בקרת איכות לכל מבנה, הכנה ומסירה.' : '<br>קודם משייכים את הפרויקט לאתר (בלשונית סקירה).'}</div>` : ''}
      ${M && p.site_id ? `<button class="btn ${D.tasks.length ? 'ghost' : 'primary'} block" id="gen">${D.tasks.length ? 'בנייה מחדש מהאפיון' : 'בניית תכנית עבודה מהאפיון'}</button>` : ''}
      ${blocked.length ? `<div class="stack" style="gap:6px"><h3>נתקעו</h3>${blocked.map(taskRow).join('')}</div>` : ''}
      ${[...by.entries()].map(([n, ts]) => { const wd = dayOf(n); const dn = ts.filter(t => t.status === 'done').length;
        return `<div class="stack" style="gap:6px"><div class="row"><h3 class="grow">${n ? 'יום ' + n : 'בלי יום'}${wd ? ` · ${dayLabel(wd.day)}` : ''}</h3><span class="pill ${dn === ts.length ? 'ok' : ''}">${dn}/${ts.length}</span></div>${ts.map(taskRow).join('')}</div>`; }).join('')}
      ${D.tasks.length ? '<div class="small muted">הקשה = הסטטוס הבא. לחיצה ארוכה = נתקע עם הערה.</div>' : ''}`;
    const g = $('#gen'); if (g) g.onclick = async () => {
      if (D.tasks.length && !confirm('לבנות מחדש? משימות שכבר התחילו או בוצעו נשארות.')) return;
      g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: id }); if (error) { g.disabled = false; return toast(error.message, 4000); }
      toast(`נבנתה תכנית ל-${data} ימי עבודה`); reload('t');
    };
    bindTasks(box, () => plan(box));
  }
  function taskRow(t) {
    return `<button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? '✓' : t.status === 'blocked' ? '!' : ''}</span><span class="t"><b>${esc(t.title)}</b>
      <small>${esc([t.phase, T_STATUS[t.status]?.[0], t.status_note].filter(Boolean).join(' · '))}</small>${t.risk && t.status !== 'done' ? `<small class="issue">${esc(t.risk)}</small>` : ''}</span></button>`;
  }
  function bindTasks(box, redraw) {
    $$('[data-t]', box).forEach(b => {
      let timer, long = false; const t = D.tasks.find(x => x.id === b.dataset.t);
      b.onpointerdown = () => { long = false; timer = setTimeout(async () => { long = true; const note = prompt('מה תקוע?', t.status_note || ''); if (note == null) return; Object.assign(t, { status: 'blocked', status_note: note }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: { status: 'blocked', status_note: note } }); redraw(); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = async () => { if (long) return; t.status = NEXT[t.status]; const patch = { status: t.status }; if (t.status === 'done') Object.assign(patch, { done_by: state.user.id, done_at: new Date().toISOString() }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch }); redraw(); };
    });
  }

  // ----- ימים -----
  function daysTab(box) {
    box.innerHTML = `${M ? `<button class="btn ${D.days.length ? 'ghost' : 'primary'} block" id="sch">${D.days.length ? 'שיבוץ מחדש' : 'שיבוץ ימי עבודה'}</button>` : ''}
      ${D.days.map(d => { const st = DAY_ST[d.status] || ['', '']; const crew = (d.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).filter(Boolean);
        return `<a class="item" href="#/day/${d.id}"><span class="t"><b>${dayLabel(d.day)}${d.is_last_day ? ' · יום אחרון' : ''}</b><small>${d.report_time ? d.report_time.slice(0, 5) + ' · ' : ''}${esc(crew.join(', ') || 'בלי צוות')}${d.gallons != null ? ` · ${nf(d.gallons)} גל׳` : ''}</small>${d.day_goal ? `<small>${esc(d.day_goal)}</small>` : ''}</span><span class="pill ${st[1]}">${st[0]}</span></a>`; }).join('')
        || '<div class="empty">אין ימי שטח משובצים.</div>'}`;
    const b = $('#sch'); if (b) b.onclick = scheduleSheet;
  }
  function scheduleSheet() {
    const maxDay = Math.max(0, ...D.tasks.map(t => t.day_no || 0)) || Number(p.field_days_planned) || 1;
    let start = (() => { const d = new Date(Date.now() + 864e5); while ([5, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return isoDay(d); })();
    const leads = D.team.filter(x => ['crew_lead', 'ops_manager', 'admin'].includes(x.role));
    sheet(`<h3>שיבוץ ימי עבודה</h3>
      <label class="field">מתחילים ב-<input type="date" id="sd" value="${start}"></label>
      <label class="field">מספר ימים<small>${D.tasks.length ? 'לפי התכנית' : 'אין תכנית — לפי מאנדי'}. שישי ושבת מדולגים</small><input type="number" id="sn" min="1" value="${maxDay}"></label>
      <label class="field">ראש צוות<select id="sl">${leads.map(x => `<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></label>
      <div class="field">צוות<div class="chips">${D.team.map(x => `<button class="chip" data-u="${x.id}" aria-pressed="false">${esc(x.full_name)}</button>`).join('')}</div></div>
      <label class="field">רחפן<select id="sdr"><option value="">בלי רחפן</option>${D.drones.map(x => `<option value="${x.id}">${esc(x.name)}${x.health === 'grounded' ? ' — מקורקע' : x.health === 'warning' ? ' — במעקב' : ''}</option>`).join('')}</select></label>
      <label class="field">שעת התייצבות<input type="time" id="st" value="07:00"></label>
      ${D.days.some(d => d.status === 'planned') ? '<div class="note">ימים מתוכננים שעוד לא נפתחו יוחלפו בשיבוץ החדש.</div>' : ''}
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="sgo">שיבוץ</button></div>`, (s, close) => {
      $$('[data-u]', s).forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
      $('#sgo', s).onclick = async () => {
        const crew = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u);
        const args = { p: id, start_day: $('#sd', s).value, lead: $('#sl', s).value, crew, drone: $('#sdr', s).value || null, report: $('#st', s).value || '07:00', ndays: +$('#sn', s).value || null };
        if (!args.start_day || !args.lead) return toast('חסר תאריך או ראש צוות');
        const { data, error } = await sb.rpc('schedule_work_days', args); if (error) return toast(error.message, 4000);
        close(); toast(`שובצו ${data} ימי עבודה`); reload('d');
      };
    });
  }

  // ----- צ'אט צוות -----
  async function chat(box) {
    box.innerHTML = `<div class="small muted">צ'אט הצוות של הפרויקט. רק מי ששובץ לפרויקט רואה אותו. הודעה שסומנה "!" עוברת גם לעדכונים בפריט במאנדי.</div><div id="cx"></div>`;
    (await import('./chat.js')).renderChat($('#cx'), { project: p });
  }

  // ----- תקלות -----
  function issuesTab(box) {
    box.innerHTML = D.issues.map(i => `<div class="feed"><span class="pill ${i.status === 'closed' ? 'ok' : i.severity === 'critical' ? 'bad' : 'warn'}">${i.status === 'closed' ? 'טופל' : KIND_HE[i.kind] || 'תקלה'}</span>
      <span class="grow"><b>${esc(i.body)}</b><small>${new Date(i.created_at).toLocaleDateString('he-IL')}${i.severity === 'critical' ? ' · קריטית' : ''}</small>${i.resolution ? `<small>טיפול: ${esc(i.resolution)}</small>` : ''}</span>
      ${M && i.status === 'open' ? `<button class="chip" data-x="${i.id}">סגירה</button>` : ''}</div>`).join('') || '<div class="empty">אין תקלות בפרויקט.</div>';
    $$('[data-x]', box).forEach(b => b.onclick = async () => {
      const r = prompt('איך טופל?'); if (r == null) return;
      const i = D.issues.find(x => x.id === b.dataset.x); Object.assign(i, { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: new Date().toISOString() });
      await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: i.closed_at } }); issuesTab(box);
    });
  }

  // ----- סיכום -----
  async function summary(box) {
    const done = D.days.filter(d => d.status === 'done');
    const hrs = done.reduce((s, d) => s + (d.work_day_crew || []).reduce((a, c) => a + Number(c.hours || 0), 0), 0);
    const gal = done.reduce((s, d) => s + Number(d.gallons || 0), 0);
    const sign = [...D.days].reverse().find(d => d.signoff)?.signoff;
    const cs = p.closed_summary;
    box.innerHTML = `${cs ? `<div class="card row"><span class="dot ok"></span><b class="grow">הפרויקט נסגר ${new Date(cs.closed_at).toLocaleDateString('he-IL')}</b></div>` : ''}
      <div class="kpis"><div class="kpi"><b>${done.length}</b><span>ימי שטח שנסגרו</span></div><div class="kpi"><b>${hrs ? nf(hrs) : '—'}</b><span>שעות צוות</span></div><div class="kpi"><b>${gal ? nf(gal) : '—'}</b><span>גלונים</span></div></div>
      <div class="kpis"><div class="kpi"><b>${D.tasks.filter(t => t.status === 'done').length}/${D.tasks.filter(t => t.status !== 'dropped').length}</b><span>משימות</span></div><div class="kpi"><b>${D.issues.length}</b><span>תקלות</span></div><div class="kpi"><b>${D.tasks.filter(t => t.is_extra).length}</b><span>תוספות מהלקוח</span></div></div>
      ${sign ? `<div class="card"><div class="eyebrow">חתימת לקוח</div><b>${esc(sign.name || '')}</b>${sign.role ? ' · ' + esc(sign.role) : ''}<div class="small muted">${sign.satisfied ? 'מרוצה' : 'לא מרוצה'}${sign.notes ? ' · ' + esc(sign.notes) : ''}</div><div id="sgimg"></div></div>` : ''}
      <h3>לפני / אחרי</h3><div class="photos" id="gal"><div class="skel" style="width:100%"></div></div>
      ${M && !cs ? `<button class="btn primary block" id="cls">סגירת פרויקט</button><div class="small muted">הסגירה מקבעת את הסיכום. הסטטוס במאנדי מתעדכן במאנדי.</div>` : ''}`;
    const { data: ph } = await sb.from('photos').select('kind,storage_path,work_day_id').eq('project_id', id).in('kind', ['before', 'after']).order('created_at');
    const urls = await signedUrls('field', [...(ph || []).map(x => x.storage_path), ...(sign?.signature_path ? [sign.signature_path] : [])]);
    $('#gal').innerHTML = (ph || []).map(x => `<button class="ph" data-z="${esc(urls[x.storage_path])}"><img src="${esc(urls[x.storage_path])}" alt="" loading="lazy"><span class="q">${x.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join('') || '<div class="muted small">אין עדיין תמונות לפני/אחרי.</div>';
    if (sign?.signature_path && urls[sign.signature_path]) $('#sgimg').innerHTML = `<img src="${esc(urls[sign.signature_path])}" alt="חתימה" style="max-width:240px;background:#fff;border-radius:8px;margin-top:8px">`;
    $$('[data-z]', box).forEach(b => b.onclick = () => zoom(b.dataset.z, ''));
    const c = $('#cls'); if (c) c.onclick = async () => {
      if (D.days.some(d => d.status !== 'done') && !confirm('יש ימים שלא נסגרו. לסגור בכל זאת?')) return;
      const { error } = await sb.rpc('close_project', { p: id }); if (error) return toast(error.message);
      toast('הפרויקט נסגר'); reload('s');
    };
  }

  renderTab(tab);
}
