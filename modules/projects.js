// פרויקטים: מרכז הביצוע. סקירה ממאנדי + אתר ואפיון, תכנית עבודה מהאפיון, שיבוץ ימים, צ'אט צוות, תקלות וסיכום.
import { navButtons, replaceHash, thumbUrls } from '../lib/core.js';
import { facadeOrder } from '../lib/sun.js';
import { sb, state, can, isManager, cache, enqueue, signedUrls, covers, coverArt, sheet, icon, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm, ask, confirmBox } from '../lib/core.js';

const ARCHIVE = 'group_mm5052gw';
const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'קביעת מועד': 'warn', 'תואם - ממתין לביצוע': 'warn', 'אושר מול לקוח': 'warn', 'הסתיים — ממתין לתשלום': 'ok' };
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'in_progress', dropped: 'todo' };
const DAY_ST = { planned: ['מתוכנן', ''], en_route: ['בדרך', 'warn'], on_site: ['באתר', 'lime'], working: ['בעבודה', 'lime'], issue: ['תקלה', 'bad'], done: ['נסגר', 'ok'] };
const KIND_HE = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' };
const FIELD_ROLES = ['admin', 'ops_manager', 'crew_lead', 'crew', 'surveyor'];

// ---------- רשימה ----------
export async function renderProjects(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1>פרויקטים</h1></header><input type="search" id="pq" class="search" placeholder="חיפוש פרויקט או לקוח"><div class="tabs" id="pf"><button aria-selected="true" data-f="a">פתוחים</button><button aria-selected="false" data-f="d">הסתיימו</button></div><div id="pl" class="list"><div class="skel"></div></div>`;
  let rows;
  try {
    const { data, error } = await sb.from('projects').select('id,name,client_name,status_label,planned_from,planned_to,monday_group,site_id,cover_path,work_days(id,day,status),tasks(status)').order('planned_from', { nullsFirst: false });
    if (error) throw error; rows = data || []; await cache.set('projects', rows);
  } catch { rows = (await cache.get('projects')) || []; }
  const t = isoDay();
  const cov = await covers(rows);
  const RANK = { 'בביצוע': 0, 'תואם - ממתין לביצוע': 1, 'אושר מול לקוח': 2, 'קביעת מועד': 3, 'תקוע': 4, 'פיילוט': 6 };
  const range = p => p.planned_from ? (p.planned_to && p.planned_to !== p.planned_from ? `${dm(p.planned_from)}–${dm(p.planned_to)}` : dm(p.planned_from)) : null;
  let F = 'a';
  const draw = (f = F) => {
    F = f; const q = ($('#pq')?.value || '').trim();
    const list = rows.filter(p => (f === 'a') === !(p.monday_group === ARCHIVE || String(p.status_label).startsWith('הסתיים')))
      .filter(p => !q || (p.name + ' ' + (p.client_name || '')).includes(q))
      .sort((a, b) => (RANK[a.status_label] ?? 5) - (RANK[b.status_label] ?? 5) || ((b.planned_from || '') > (a.planned_from || '') ? 1 : -1));
    $('#pl').innerHTML = list.map(p => {
      const next = (p.work_days || []).filter(d => d.day >= t && d.status !== 'done').sort((a, b) => a.day < b.day ? -1 : 1)[0];
      const tot = (p.tasks || []).filter(x => x.status !== 'dropped').length, done = (p.tasks || []).filter(x => x.status === 'done').length;
      return `<a class="item prj" href="#/p/${p.id}"><img src="${cov[p.id]}" alt="" loading="lazy"><span class="t"><b>${esc(p.name)}</b>
        <small>${esc([p.client_name, next ? `יום שטח ${dayLabel(next.day)}` : range(p)].filter(Boolean).join(' · '))}</small>
        ${tot ? `<span class="progress" style="margin-top:6px"><i style="width:${Math.round(done / tot * 100)}%"></i></span>` : ''}</span>
        <span class="pill ${TONE[p.status_label] ?? ''}">${esc(p.status_label || '')}</span></a>`;
    }).join('') || (q ? '<div class="empty">לא נמצא פרויקט בשם הזה.</div>' : `<div class="empty-card"><span class="ei">${icon('folder', 26)}</span><span><b>אין פרויקטים להצגה</b><small>${isManager() ? '' : 'כאן יופיעו הפרויקטים שתשובץ אליהם'}</small></span></div>`);
  };
  $$('#pf button').forEach(b => b.onclick = () => { $$('#pf button').forEach(x => x.setAttribute('aria-selected', x === b)); draw(b.dataset.f); });
  $('#pq').oninput = () => draw();
  draw('a');
}

// ---------- פרויקט ----------
export async function renderProject(el, id, tab = 'o') {
  el.innerHTML = `<div class="skel"></div>`;
  const ck = 'proj:' + id; let D;
  try {
    const [{ data: p, error }, { data: tasks }, { data: days }, { data: issues }, { data: reps }, fin, { data: sites }, { data: team }, { data: drones }] = await Promise.all([
      sb.from('projects').select('*, sites(id,slug,name,address,contact_name,contact_phone,lat,lng)').eq('id', id).single(),
      sb.from('tasks').select('*, buildings(name,code)').eq('project_id', id).order('day_no', { nullsFirst: false }).order('seq'),
      sb.from('work_days').select('*, work_day_crew(user_id,role,hours,confirmed_at,profiles(full_name))').eq('project_id', id).order('day'),
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
  const TABS = [['o', 'סקירה'], ['t', 'תכנית'], ['d', 'דוחות'], ['c', "צ'אט"], ['s', 'סיכום']];
  const openIss = D.issues.filter(i => i.status === 'open').length;

  const coverUrl = p.cover_path ? (await signedUrls('media', [p.cover_path]).catch(() => ({})))[p.cover_path] : null;
  el.innerHTML = `<div class="phero"><span class="img" style="background-image:url('${coverUrl || coverArt(p.name)}')"></span>
      <a class="back glass" href="#/projects" aria-label="חזרה">${icon('back', 20)}</a>
      <span class="ph-bottom"><span class="pill ${TONE[p.status_label] ?? ''}">${esc(p.status_label || '')}</span><b>${esc(p.name)}</b><small>${esc(p.client_name || '')}</small></span></div>
    <div class="tabs" id="pt">${TABS.map(([k, t]) => `<button data-t="${k}" aria-selected="${k === tab || (tab === 'i' && k === 'o')}">${t}</button>`).join('')}</div>
    <div id="pb" class="stack"></div>`;
  $$('#pt button').forEach(b => b.onclick = () => { replaceHash(`#/p/${id}/${b.dataset.t}`, false); renderTab(b.dataset.t); $$('#pt button').forEach(x => x.setAttribute('aria-selected', x === b)); });
  const reload = t => renderProject(el, id, t);

  function renderTab(t) {
    document.querySelectorAll('.bar,.composer').forEach(x => x.remove());
    const box = $('#pb');
    if (t === 'd') { import('./reports.js').then(m => m.reportsTab(box, D, { reload, schedule: scheduleSheet })); return; }
    ({ o: overview, t: plan, c: chat, s: summary }[t] || overview)(box);
    bindCopy(box);
  }

  // ----- סקירה -----
  function overview(box) {
    const tot = D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const dDone = D.days.filter(d => d.status === 'done').length, f = D.fin, s = p.sites;
    const next = D.days.find(d => d.day >= isoDay() && d.status !== 'done');
    const open = D.issues.filter(i => i.status === 'open');
    const range = p.planned_from ? (p.planned_to && p.planned_to !== p.planned_from ? `${dm(p.planned_from)}–${dm(p.planned_to)}` : dm(p.planned_from)) : null;
    const appPlan = tot || D.days.length;
    const kv = (ic, label, val, act = '') => `<div class="lrow kv" ${act ? `data-act="${act}" role="button" tabindex="0"` : ''}><span class="mic">${icon(ic, 19)}</span><span class="grow"><small>${label}</small><b>${val}</b></span>${act ? `<span class="chev">${icon('chev', 18)}</span>` : ''}</div>`;
    const tel = s?.contact_phone ? s.contact_phone.replace(/\D/g, '').replace(/^0/, '') : '';
    box.innerHTML = `
      <div class="kpis">${appPlan
        ? `<div class="kpi"><b>${tot ? Math.round(done / tot * 100) + '%' : '—'}</b><span>מהתכנית בוצע</span></div><div class="kpi"><b>${dDone}/${D.days.length}</b><span>ימי שטח</span></div><div class="kpi"><b>${open.length}</b><span>תקלות פתוחות</span></div>`
        : `${range ? `<div class="kpi"><b>${range}</b><span>לו"ז</span></div>` : ''}<div class="kpi"><b>${Math.max(Number(p.field_days_actual || 0), new Set(D.reps.map(r => r.report_date)).size)}${p.field_days_planned ? '/' + nf(p.field_days_planned) : ''}</b><span>ימי שטח</span></div><div class="kpi"><b>${D.reps.length}</b><span>דוחות שטח</span></div>`}</div>
      ${next ? `<a class="arow card-like" href="#/day/${next.id}"><span class="aic ok">${icon('calendar', 20)}</span><span class="grow"><b>יום השטח הבא: ${dayLabel(next.day)}</b><small>${next.report_time ? 'יציאה ' + next.report_time.slice(0, 5) + ' · ' : ''}${next.site_arrival ? 'באתר ' + next.site_arrival.slice(0, 5) + ' · ' : ''}${esc((next.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', '))}</small></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
      ${open.length ? `<section><h3 class="sh">תקלות פתוחות</h3><div class="alist">${open.map(i => `<div class="arow ${i.severity === 'critical' ? 'bad' : 'warn'}"><span class="aic">${icon('alert', 20)}</span><span class="grow"><b>${esc(i.body)}</b><small>${KIND_HE[i.kind] || ''} · ${new Date(i.created_at).toLocaleDateString('he-IL')}</small></span>${M ? `<button class="chip" data-x="${i.id}">טופל</button>` : ''}</div>`).join('')}</div></section>` : ''}
      <div class="menu">
        ${p.scope ? kv('report', 'היקף', esc(p.scope)) : ''}
        ${kv('pin', 'אתר', s ? esc(s.name) + (s.address ? ` <span class="muted small">· ${esc(s.address)}</span>` : '') : '<span class="muted">לא משויך — משייכים כדי לבנות תכנית מהאפיון</span>', M ? 'site' : '')}
        ${s?.contact_phone ? `<div class="lrow kv"><span class="mic">${icon('users', 19)}</span><span class="grow"><small>איש קשר באתר</small><b>${esc(s.contact_name || '')} <span class="muted small" dir="ltr">${esc(s.contact_phone)}</span></b></span><a class="btn primary sm" href="tel:+972${tel}">חיוג</a></div>` : ''}
        ${p.work_notes ? kv('clipboard', 'דגשים לצוות', esc(p.work_notes), M ? 'notes' : '') : M ? `<div class="lrow kv" data-act="notes" role="button" tabindex="0"><span class="mic">${icon('plus', 19)}</span><span class="grow"><span class="muted">הוספת דגשים לצוות</span></span></div>` : ''}
        ${p.summary ? kv('chat', 'תמונת ביצוע', esc(p.summary)) : ''}
        ${f ? kv('shield', 'כספים', `${f.price_net ? '₪' + nf(f.price_net) + ' נטו' : '—'}${f.gross_pct ? ` · רווח ${nf(f.gross_pct)}%` : ''}${f.payment_status ? ' · ' + esc(f.payment_status) : ''}`) : ''}
        ${M ? `<button class="lrow kv" id="share" type="button"><span class="mic">${icon('send', 19)}</span><span class="grow"><b>קישור התקדמות ללקוח</b><small>עמוד עם סטטוס ותמונות — בלי מחירים, שעות או שמות</small></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
        ${s && can('specs') ? `<a class="lrow kv" href="#/site/${esc(s.slug)}"><span class="mic">${icon('clipboard', 19)}</span><span class="grow"><b>אפיון האתר</b></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
      </div>
      ${s?.lat || p.lat ? navButtons(s?.lat || p.lat, s?.lng || p.lng) : ''}
      ${M ? '<div class="sigline" id="sig"></div>' : ''}
      <div id="gal"></div>
      ${D.reps.length ? `<section><h3 class="sh">דוחות שטח</h3><div class="list">${D.reps.slice(0, 4).map(r => `<div class="rep compact"><span class="grow"><b>${dm(r.report_date)}${r.gallons ? ` · ${nf(r.gallons)} גלונים` : ''}${r.hours ? ` · ${nf(r.hours)} שעות` : ''}</b><small>${esc([r.crew, r.work].filter(Boolean).join(' · '))}</small>${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}</span>${r.had_issues ? '<span class="pill warn">תקלה</span>' : ''}</div>`).join('')}</div></section>` : ''}
      ${M && p.monday_item_id ? `<a class="more center" href="https://edroneil-force.monday.com/boards/5099780041/pulses/${esc(p.monday_item_id)}" target="_blank" rel="noopener">פתיחת הפרויקט במאנדי</a>` : ''}`;
    if (M) import('../lib/audit.js').then(m => m.signature($('#sig'), { project_id: id }));
    const phs = D.reps.flatMap(r => (r.photos || []).filter(Boolean).map(x => ({ x, d: r.report_date })));
    if (phs.length) signedUrls('media', phs.map(o => o.x)).then(u => { const g = $('#gal'); if (g) { g.innerHTML = `<section><h3 class="sh">מהשטח</h3><div class="gallery">${phs.slice(0, 9).map(o => `<button data-z="${esc(u[o.x])}"><img src="${esc(u[o.x])}" alt="" loading="lazy"><span>${dm(o.d)}</span></button>`).join('')}</div></section>`; $$('[data-z]', g).forEach(b => b.onclick = () => zoom(b.dataset.z, '')); } });
    $$('[data-x]', box).forEach(b => b.onclick = () => closeIssue(b.dataset.x, () => overview(box)));
    $$('[data-act]', box).forEach(r => r.onclick = () => r.dataset.act === 'site' ? siteSheet() : notesSheet());
    const sh = $('#share', box); if (sh) sh.onclick = shareSheet;
  }
  async function shareSheet() {
    const { data: list } = await sb.from('project_shares').select('*').eq('project_id', id).eq('revoked', false).order('created_at', { ascending: false });
    const url = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?t=' + t;
    const active = (list || []).filter(x => new Date(x.expires_at) > new Date());
    sheet(`<h3>קישור התקדמות ללקוח</h3><div class="small muted">הלקוח רואה סטטוס, ימי עבודה, אחוז התקדמות ותמונות "אחרי". לא רואה מחירים, שעות, שמות עובדים או תקלות. הקישור פג אחרי 60 יום.</div>
      ${active.map(x => `<div class="lrow"><span class="grow"><b dir="ltr" style="font-size:.78rem;word-break:break-all">${esc(url(x.token))}</b><small>נפתח ${x.views} פעמים · בתוקף עד ${new Date(x.expires_at).toLocaleDateString('he-IL')}</small></span>
        <span class="stack" style="gap:4px"><button class="chip" data-cp="${x.token}">העתקה</button><button class="chip" data-rv="${x.token}">ביטול</button></span></div>`).join('')}
      <div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="mk">${active.length ? 'קישור חדש' : 'יצירת קישור'}</button></div>`, (s2, close) => {
      const copy = async t => { try { if (navigator.share) await navigator.share({ title: p.name, url: url(t) }); else { await navigator.clipboard.writeText(url(t)); toast('הקישור הועתק'); } } catch { } };
      $$('[data-cp]', s2).forEach(b => b.onclick = () => copy(b.dataset.cp));
      $$('[data-rv]', s2).forEach(b => b.onclick = async () => { await sb.from('project_shares').update({ revoked: true }).eq('token', b.dataset.rv); close(); toast('הקישור בוטל'); });
      $('#mk', s2).onclick = async () => { const { data, error } = await sb.from('project_shares').insert({ project_id: id, created_by: state.user.id }).select().single(); if (error) return toast(error.message); close(); copy(data.token); shareSheet(); };
    });
  }
  function siteSheet() {
    sheet(`<h3>שיוך לאתר</h3><div class="small muted">השיוך מחבר את הפרויקט לאפיון של האתר, וממנו נבנית תכנית העבודה.</div>
      <div class="list">${D.sites.map(x => `<button class="lrow" data-s="${x.id}"><span class="grow"><b>${esc(x.name)}</b></span>${x.id === p.site_id ? '<span class="pill lime">משויך</span>' : ''}</button>`).join('')}</div>
      <button class="btn ghost block" data-close>ביטול</button>`, (sh, close) => {
      $$('[data-s]', sh).forEach(b => b.onclick = async () => { const { error } = await sb.from('projects').update({ site_id: b.dataset.s }).eq('id', id); if (error) return toast(error.message); close(); toast('שויך לאתר'); reload('o'); });
    });
  }
  function notesSheet() {
    sheet(`<h3>דגשים לצוות</h3><div class="small muted">מה שהצוות צריך לדעת: גישה, חניה, שעות שקטות, דרישות הלקוח. מופיע להם בבוקר של יום השטח.</div>
      <textarea id="wn" rows="5">${esc(p.work_notes || '')}</textarea>
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="wns">שמירה</button></div>`, (sh, close) => {
      $('#wns', sh).onclick = async () => { const v = $('#wn', sh).value.trim() || null; await enqueue({ kind: 'update', table: 'projects', rowId: id, patch: { work_notes: v } }); p.work_notes = v; close(); toast('נשמר'); renderTab('o'); };
    });
  }
  async function closeIssue(iid, redraw) {
    const r = await ask('איך טופל?', { multiline: true, placeholder: 'מה נעשה כדי לפתור', ok: 'סגירת התקלה' }); if (r == null) return;
    const i = D.issues.find(x => x.id === iid); Object.assign(i, { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: new Date().toISOString() });
    await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: i.closed_at } }); redraw();
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
        return `<div class="stack" style="gap:6px"><div class="row"><h3 class="grow">${n ? 'יום ' + n : 'בלי יום'}${wd ? ` · ${dayLabel(wd.day)}` : ''}</h3><span class="pill ${dn === ts.length ? 'ok' : ''}">${dn}/${ts.length}</span></div>${dayBrief(wd, ts)}${ts.map(taskRow).join('')}</div>`; }).join('')}
      ${D.tasks.length ? '<div class="small muted">הקשה = הסטטוס הבא. לחיצה ארוכה = נתקע עם הערה.</div>' : ''}`;
    const g = $('#gen'); if (g) g.onclick = async () => {
      if (D.tasks.length && !(await confirmBox('לבנות את התכנית מחדש?', { body: 'משימות שכבר התחילו או בוצעו נשארות כמו שהן.', ok: 'בנייה מחדש' }))) return;
      g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: id }); if (error) { g.disabled = false; return toast(error.message, 4000); }
      toast(`נבנתה תכנית ל-${data} ימי עבודה`); reload('t');
    };
    bindTasks(box, () => plan(box));
  }
  // תקציר יום: סדר חזיתות לפי השמש (כשיש תאריך), חומר וכמות, לוגיסטיקה מהאפיון
  function dayBrief(wd, ts) {
    const exec = ts.filter(t => t.phase === 'ביצוע' && t.status !== 'done');
    const out = [];
    const night = wd?.site_arrival && (+wd.site_arrival.slice(0, 2) >= 18 || +wd.site_arrival.slice(0, 2) < 5);
    if (night) out.push(`<small><b>משמרת לילה</b> · באתר ${wd.site_arrival.slice(0, 5)}${wd.site_end ? '–' + wd.site_end.slice(0, 5) : ''}</small>`);
    if (wd && exec.length && !night) {
      const fac = [...new Set(exec.flatMap(t => t.facades || []))];
      const ord = facadeOrder(wd.day, p.sites?.lat || p.lat, p.sites?.lng || p.lng, fac);
      if (ord.length > 1) out.push(`<small><b>סדר לפי השמש:</b> ${ord.map(o => `${esc(o.name)} <span class="muted">(${esc(o.when)})</span>`).join(' ← ')}</small>`);
    }
    if (wd?.gallons_planned) out.push(`<small><b>חומר:</b> ${nf(wd.gallons_planned)} גלון ${esc(wd.material_planned || '')}</small>`);
    (wd?.logistics || []).forEach(l => out.push(`<small class="issue">${esc(l)}</small>`));
    return out.length ? `<div class="daybrief">${out.join('')}</div>` : '';
  }
  function taskRow(t) {
    return `<button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? '✓' : t.status === 'blocked' ? '!' : ''}</span><span class="t"><b>${esc(t.title)}</b>
      <small>${esc([t.phase, T_STATUS[t.status]?.[0], t.status_note].filter(Boolean).join(' · '))}</small>${t.risk && t.status !== 'done' ? `<small class="issue">${esc(t.risk)}</small>` : ''}</span></button>`;
  }
  function bindTasks(box, redraw) {
    $$('[data-t]', box).forEach(b => {
      let timer, long = false; const t = D.tasks.find(x => x.id === b.dataset.t);
      b.onpointerdown = () => { long = false; timer = setTimeout(async () => { long = true; const note = await ask('מה תקוע?', { value: t.status_note || '', placeholder: 'למשל: מחכים למפתח לגג', ok: 'סימון כנתקע' }); if (note == null) return; Object.assign(t, { status: 'blocked', status_note: note }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: { status: 'blocked', status_note: note } }); redraw(); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = async () => { if (long) return; t.status = NEXT[t.status]; const patch = { status: t.status }; if (t.status === 'done') Object.assign(patch, { done_by: state.user.id, done_at: new Date().toISOString() }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch }); redraw(); };
    });
  }

  // ----- ימים -----
  function daysTab(box) {
    box.innerHTML = `${M ? `<button class="btn ${D.days.length ? 'ghost' : 'primary'} block" id="sch">${D.days.length ? 'שיבוץ מחדש' : 'שיבוץ ימי עבודה'}</button>` : ''}
      ${D.days.map(d => { const st = DAY_ST[d.status] || ['', '']; const crew = (d.work_day_crew || []).map(c => (c.profiles?.full_name?.split(' ')[0] || '') + (d.status === 'planned' && c.role !== 'lead' ? (c.confirmed_at ? ' ✓' : ' ?') : '')).filter(Boolean);
        return `<a class="item" href="#/day/${d.id}"><span class="t"><b>${dayLabel(d.day)}${d.is_last_day ? ' · יום אחרון' : ''}</b><small>${d.site_arrival ? 'באתר ' + d.site_arrival.slice(0, 5) + (d.site_end ? '–' + d.site_end.slice(0, 5) : '') + ' · ' : d.report_time ? d.report_time.slice(0, 5) + ' · ' : ''}${esc(crew.join(', ') || 'בלי צוות')}${d.gallons != null ? ` · ${nf(d.gallons)} גל׳` : ''}</small>${d.day_goal ? `<small>${esc(d.day_goal)}</small>` : ''}</span><span class="pill ${st[1]}">${st[0]}</span></a>`; }).join('')
        || '<div class="empty">אין ימי שטח משובצים.</div>'}`;
    const b = $('#sch'); if (b) b.onclick = scheduleSheet;
  }
  async function scheduleSheet() {
    const { data: teams } = await sb.from('teams').select('id,name,pilot_id,operator_id,lead_id').eq('active', true).order('sort');
    const maxDay = Math.max(0, ...D.tasks.map(t => t.day_no || 0)) || Number(p.field_days_planned) || 1;
    let start = (() => { const d = new Date(Date.now() + 864e5); while ([5, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return isoDay(d); })();
    const leads = D.team.filter(x => ['crew_lead', 'ops_manager', 'admin'].includes(x.role));
    sheet(`<h3>שיבוץ ימי עבודה</h3>
      <label class="field">מתחילים ב-<input type="date" id="sd" value="${start}"></label>
      <label class="field">מספר ימים<small>${D.tasks.length ? 'לפי התכנית' : 'אין תכנית — לפי ימי השטח המתוכננים'}. שבת מדולגת, שישי רק כשמסמנים</small><input type="number" id="sn" min="1" value="${maxDay}"></label>
      ${(teams || []).length ? `<div class="field">צוות<small>בחירת צוות ממלאת ראש צוות וצוות — אפשר לשנות</small><div class="chips">${teams.map(t => `<button type="button" class="chip" data-team="${t.id}" aria-pressed="false">${esc(t.name)}</button>`).join('')}</div></div>` : ''}
      <label class="field">ראש צוות<select id="sl">${leads.map(x => `<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></label>
      <div class="field">צוות<div class="chips">${D.team.map(x => `<button class="chip" data-u="${x.id}" aria-pressed="false">${esc(x.full_name)}</button>`).join('')}</div></div>
      <label class="field">רחפן<select id="sdr"><option value="">בלי רחפן</option>${D.drones.map(x => `<option value="${x.id}">${esc(x.name)}${x.health === 'grounded' ? ' — מקורקע' : x.health === 'warning' ? ' — במעקב' : ''}</option>`).join('')}</select></label>
      <div class="row"><label class="field grow">הגעה לאתר<input type="time" id="sa" value="07:00"></label><label class="field grow">סיום באתר<small>לא חובה</small><input type="time" id="se"></label></div>
      <label class="field">יציאה מהמשרד<small id="sthint">מחשב לפי מרחק…</small><input type="time" id="st" value="06:00"></label>
      <label class="tog"><span>כולל שישי <small class="muted">— מקרים חריגים, מסיימים לפני כניסת שבת</small></span><span class="sw"><input type="checkbox" id="sfr"><i></i></span></label>
      <div class="field">תחזית לימים שנבחרו<small>יום עם רוח, משבים או גשם מעל הסף מדולג אוטומטית. הקשה על יום = דילוג / ביטול דילוג</small><div id="wxs" class="wxs"><div class="small muted">בודק תחזית…</div></div></div>
      ${D.days.some(d => d.status === 'planned') ? '<div class="note">ימים מתוכננים שעוד לא נפתחו יוחלפו בשיבוץ החדש.</div>' : ''}
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="sgo">שיבוץ</button></div>`, (s, close) => {
      $$('[data-u]', s).forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
      $$('[data-team]', s).forEach(c => c.onclick = () => {
        const t = teams.find(x => x.id === c.dataset.team); $$('[data-team]', s).forEach(x => x.setAttribute('aria-pressed', x === c));
        const sel = $('#sl', s); if (t.lead_id && [...sel.options].some(o => o.value === t.lead_id)) sel.value = t.lead_id;
        $$('[data-u]', s).forEach(x => x.setAttribute('aria-pressed', [t.pilot_id, t.operator_id].includes(x.dataset.u) && x.dataset.u !== t.lead_id));
      });
      // תחזית: open-meteo עד 16 יום קדימה, בשעות העבודה 06-17. מעבר לטווח — אין נתון ולא מדלגים
      const lat = p.sites?.lat || p.lat, lng = p.sites?.lng || p.lng; const H = {}; const manual = new Map();  // date → true=דילוג / false=לא לדלג
      const hr = id => { const v = $(id, s).value; return v ? +v.slice(0, 2) + +v.slice(3) / 60 : null; };
      // תחזית לשעות המשמרת בפועל: משמרת לילה שחוצה חצות לוקחת גם את שעות הבוקר של היום הבא
      const wxFor = d => {
        const a = hr('#sa') ?? 7, e0 = hr('#se'), e = e0 ?? (a + 9) % 24, wrap = e <= a;
        const keys = []; for (let h = 0; h < 24; h++) { if (h + 1 > a && (wrap || h < e)) keys.push(`${d}T${String(h).padStart(2, '0')}`); if (wrap && h < e) keys.push(`${add1(d)}T${String(h).padStart(2, '0')}`); }
        const xs = keys.map(k => H[k]).filter(Boolean); if (!xs.length) return null;
        return { w: Math.max(...xs.map(x => x.w)), g: Math.max(...xs.map(x => x.g)), r: xs.reduce((t, x) => t + x.r, 0) };
      };
      const add1 = d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + 1); return isoDay(x); };
      const plan = () => {
        const n = +$('#sn', s).value || 1, out = []; let d = $('#sd', s).value; if (!d) return out;
        for (let guard = 0; out.filter(x => !x.skip).length < n && guard < 60; guard++, d = add1(d)) {
          const dow = new Date(d + 'T12:00').getDay(); if (dow === 6 || (dow === 5 && !$('#sfr', s).checked)) continue;
          const w = wxFor(d), bad = w && (w.g >= 35 || w.w >= 25 || w.r >= 2);
          out.push({ d, w, bad, skip: manual.has(d) ? manual.get(d) : !!bad });
        }
        return out;
      };
      const drawWx = () => {
        const list = plan();
        $('#wxs', s).innerHTML = (lat ? '' : '<div class="small muted">אין מיקום לאתר — אין בדיקת תחזית. שומרים מיקום בעמוד האתר.</div>')
          + list.map(x => `<button type="button" class="wxday ${x.skip ? 'skip' : ''} ${x.bad ? 'bad' : ''}" data-wd="${x.d}"><b>${dayLabel(x.d)}</b><small>${x.w ? `משבים ${Math.round(x.w.g)}${x.w.r >= 0.5 ? ` · גשם ${x.w.r.toFixed(1)}` : ''}` : 'אין תחזית עדיין'}</small><small>${x.skip ? 'מדולג' : 'עבודה'}</small></button>`).join('');
        $$('[data-wd]', s).forEach(b => b.onclick = () => { const x = list.find(y => y.d === b.dataset.wd); manual.set(x.d, !x.skip); drawWx(); });
      };
      $('#sd', s).onchange = $('#sn', s).oninput = $('#sfr', s).onchange = $('#se', s).onchange = drawWx;
      // יציאה מהמשרד = הגעה − נסיעה (כביש × מקדם תנועה) − העמסה. המנהל יכול לשנות ידנית
      let travelMin = null, touched = false; const Dp = { office: [31.2524, 34.7908], office_name: 'המשרד', load_min: 20, traffic_factor: 1.15 };
      const recalc = () => {
        const a = hr('#sa'); if (a == null) return;
        const tot = (travelMin ?? 0) + Dp.load_min, dep = ((a * 60 - tot) % 1440 + 1440) % 1440, r5 = Math.floor(dep / 5) * 5;
        if (!touched) $('#st', s).value = `${String(Math.floor(r5 / 60)).padStart(2, '0')}:${String(r5 % 60).padStart(2, '0')}`;
        $('#sthint', s).textContent = travelMin != null ? `מומלץ: נסיעה ${Math.floor(travelMin / 60)}:${String(travelMin % 60).padStart(2, '0')} מ${Dp.office_name} + ${Dp.load_min} דק׳ העמסה` : lat ? 'מחשב מרחק…' : `אין מיקום לאתר — רק ${Dp.load_min} דק׳ העמסה. שומרים מיקום בעמוד האתר`;
      };
      $('#sa', s).onchange = () => { recalc(); drawWx(); }; $('#st', s).oninput = () => { touched = true; };
      sb.from('app_settings').select('value').eq('key', 'dispatch').maybeSingle().then(async ({ data }) => {
        Object.assign(Dp, data?.value || {}); recalc();
        if (!lat) return;
        try { const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${Dp.office[1]},${Dp.office[0]};${lng},${lat}?overview=false`)).json();
          if (j.routes?.[0]) travelMin = Math.ceil(j.routes[0].duration / 60 * Dp.traffic_factor); } catch {}
        recalc();
      });
      if (lat) fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_gusts_10m,precipitation&timezone=Asia%2FJerusalem&forecast_days=16`)
        .then(r => r.json()).then(j => { const h = j.hourly; h.time.forEach((t, i) => { H[t.slice(0, 13)] = { w: h.wind_speed_10m[i], g: h.wind_gusts_10m[i], r: h.precipitation[i] || 0 }; }); drawWx(); }).catch(drawWx);
      else drawWx();
      $('#sgo', s).onclick = async () => {
        const crew = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u);
        const args = { p: id, start_day: $('#sd', s).value, lead: $('#sl', s).value, crew, drone: $('#sdr', s).value || null, report: $('#st', s).value || '06:00', ndays: +$('#sn', s).value || null, skip: plan().filter(x => x.skip).map(x => x.d),
          arrive: $('#sa', s).value || null, shift_end: $('#se', s).value || null, fridays: $('#sfr', s).checked };
        if (!args.start_day || !args.lead) return toast('חסר תאריך או ראש צוות');
        const { data, error } = await sb.rpc('schedule_work_days', args); if (error) return toast(error.message, 4000);
        close(); toast(`שובצו ${data} ימי עבודה`); reload('d');
      };
    });
  }

  // ----- צ'אט צוות -----
  async function chat(box) {
    box.innerHTML = `<div class="small muted">צ'אט הצוות של הפרויקט. רק מי ששובץ לפרויקט רואה אותו. הודעה שסומנה "!" דורשת אישור קריאה ועוברת גם למשרד.</div><div id="cx"></div>`;
    (await import('./chat.js')).renderChat($('#cx'), { project: p });
  }

  // ----- תקלות -----
  function issuesTab(box) {
    box.innerHTML = D.issues.map(i => `<div class="feed"><span class="pill ${i.status === 'closed' ? 'ok' : i.severity === 'critical' ? 'bad' : 'warn'}">${i.status === 'closed' ? 'טופל' : KIND_HE[i.kind] || 'תקלה'}</span>
      <span class="grow"><b>${esc(i.body)}</b><small>${new Date(i.created_at).toLocaleDateString('he-IL')}${i.severity === 'critical' ? ' · קריטית' : ''}</small>${i.resolution ? `<small>טיפול: ${esc(i.resolution)}</small>` : ''}</span>
      ${M && i.status === 'open' ? `<button class="chip" data-x="${i.id}">סגירה</button>` : ''}</div>`).join('') || '<div class="empty">אין תקלות בפרויקט.</div>';
    $$('[data-x]', box).forEach(b => b.onclick = async () => {
      const r = await ask('איך טופל?', { multiline: true, placeholder: 'מה נעשה כדי לפתור', ok: 'סגירת התקלה' }); if (r == null) return;
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
      <div id="labor"></div>
      ${sign ? `<div class="card"><div class="eyebrow">חתימת לקוח</div><b>${esc(sign.name || '')}</b>${sign.role ? ' · ' + esc(sign.role) : ''}<div class="small muted">${sign.satisfied ? 'מרוצה' : 'לא מרוצה'}${sign.notes ? ' · ' + esc(sign.notes) : ''}</div><div id="sgimg"></div></div>` : ''}
      <h3>לפני / אחרי</h3><div class="photos" id="gal"><div class="skel" style="width:100%"></div></div>
      ${M ? `<a class="btn ghost block" href="#/client-report/${id}">${icon('report', 18)} דוח ללקוח (PDF)</a>` : ''}
      ${M && !cs ? `<button class="btn primary block" id="cls">סגירת פרויקט</button><div class="small muted">הסגירה מקבעת את הסיכום. הסטטוס נקבע במשרד.</div>` : ''}`;
    if (M) laborBlock();
    const { data: ph } = await sb.from('photos').select('kind,storage_path,work_day_id').eq('project_id', id).in('kind', ['before', 'after']).order('created_at');
    const urls = await signedUrls('field', [...(ph || []).map(x => x.storage_path), ...(sign?.signature_path ? [sign.signature_path] : [])]);
    const tu = await thumbUrls('field', (ph || []).map(x => x.storage_path));
    $('#gal').innerHTML = (ph || []).map(x => `<button class="ph" data-z="${esc(urls[x.storage_path])}"><img src="${esc(tu[x.storage_path].t)}" data-full="${esc(urls[x.storage_path])}" alt="" loading="lazy"><span class="q">${x.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join('') || '<div class="muted small">אין עדיין תמונות לפני/אחרי.</div>';
    if (sign?.signature_path && urls[sign.signature_path]) $('#sgimg').innerHTML = `<img src="${esc(urls[sign.signature_path])}" alt="חתימה" style="max-width:240px;background:#fff;border-radius:8px;margin-top:8px">`;
    $$('[data-z]', box).forEach(b => b.onclick = () => zoom(b.dataset.z, ''));
    const c = $('#cls'); if (c) c.onclick = async () => {
      if (D.days.some(d => d.status !== 'done') && !(await confirmBox('יש ימים שלא נסגרו', { body: 'לסגור את הפרויקט בכל זאת?', ok: 'סגירת פרויקט' }))) return;
      const { error } = await sb.rpc('close_project', { p: id }); if (error) return toast(error.message);
      toast('הפרויקט נסגר'); reload('s');
    };
  }

  // ---------- שעות ועלות עבודה מהנוכחות (מנהלים; כסף רק עם הרשאת כספים) ----------
  async function laborBlock() {
    const box = $('#labor'); if (!box) return;
    const { data: rows } = await sb.from('project_labor_days').select('user_id,day,work_h,travel_h,ot_h,profiles(full_name)').eq('project_id', id).order('day');
    const ex = can('finance') ? Number(D.fin?.expenses_actual || 0) : 0;
    if (!(rows || []).length) { box.innerHTML = `${ex ? `<div class="card row"><b class="grow">הוצאות שטח שאושרו</b><b>₪${nf(ex)}</b></div>` : ''}<div class="small muted">שעות מהנוכחות יופיעו כאן אחרי שהצוות יחתים כניסה ויציאה בימי העבודה של הפרויקט.</div>`; return; }
    const h = x => { const m = Math.round(x * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
    const W = rows.reduce((t, r) => t + Number(r.work_h), 0), T = rows.reduce((t, r) => t + Number(r.travel_h), 0), O = rows.reduce((t, r) => t + Number(r.ot_h), 0);
    const by = {}; rows.forEach(r => { const k = r.profiles?.full_name || ''; (by[k] ||= { w: 0, t: 0, o: 0, d: new Set() }); by[k].w += +r.work_h; by[k].t += +r.travel_h; by[k].o += +r.ot_h; by[k].d.add(r.day); });
    const cost = can('finance') ? D.fin?.labor_cost_actual : null;
    box.innerHTML = `<section><h3 class="sh">שעות עבודה מהנוכחות</h3>
      <div class="kpis"><div class="kpi"><b>${h(W)}</b><span>באתר</span></div><div class="kpi"><b>${h(T)}</b><span>נסיעה</span></div><div class="kpi"><b>${cost != null ? '₪' + nf(Math.round(cost)) : h(O)}</b><span>${cost != null ? 'עלות שכר בפועל' : 'שעות נוספות'}</span></div></div>
      <div class="split"><i style="flex:${W}"></i><i class="tr" style="flex:${T}"></i></div><div class="small muted">${Math.round(T / (W + T) * 100)}% מהזמן בנסיעה${cost != null ? ` · מתוכן ${h(O)} שעות נוספות` : ''}</div>
      ${ex ? `<div class="card row"><b class="grow">הוצאות שטח שאושרו</b><b>₪${nf(ex)}</b></div>` : ''}
      <div class="menu">${Object.entries(by).map(([n, v]) => `<div class="lrow kv"><span class="grow"><small>${esc(n)} · ${v.d.size === 1 ? "יום אחד" : v.d.size + " ימים"}</small><b>באתר ${h(v.w)} · נסיעה ${h(v.t)}${v.o ? ` · נוספות ${h(v.o)}` : ''}</b></span></div>`).join('')}</div></section>`;
  }

  renderTab(tab);
}
