// פרויקטים: מרכז הביצוע. סקירה ממאנדי + אתר ואפיון, תכנית עבודה מהאפיון, שיבוץ ימים, צ׳אט צוות, תקלות וסיכום.
import { navButtons, replaceHash, thumbUrls, stLabel, isOpenProject } from '../lib/core.js';
import { hideMoneyText as noMoney$ } from '../lib/core.js';
import { availability } from '../lib/avail.js';
import { facadeOrder } from '../lib/sun.js';
import { isNight, nightRange, nightTag, nightToggleHtml, bindNight } from '../lib/night.js';
import { dtTag, dtPickHtml, bindDtPick, isWorkDay, SHORT as DT_SHORT } from '../lib/daytype.js';
import { errText } from '../lib/audit.js';
import { sb, state, can, isManager, cache, enqueue, signedUrls, covers, coverArt, folderGrid, sheet, icon, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm, ask, confirmBox, backBtn, HE_D1, leadMark, coverFor, skeleton } from '../lib/core.js';

const ARCHIVE = 'group_mm5052gw';
const ADMIN = () => state.profile?.role === 'admin';   // סכומים (מחיר, עלות, הוצאות) — רק שלושת השותפים. לא מנהל תפעול
const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'הסתיים — ממתין לתשלום': 'ok', 'הסתיים — להוצאת חשבונית': 'ok' };   // שלבי עבודה = אפור
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'in_progress', dropped: 'todo' };
const KIND_HE = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' };
const FIELD_ROLES = ['admin', 'ops_manager', 'crew_lead', 'crew', 'surveyor'];
// שורת מדדים: רק אריחים עם ערך (בלי 0 / ריק); אם הכל ריק — כלום
// מדד עם מקור (go = סינון 'פתוח' במסך) — כפתור; בלי מקור — טקסט
const kpiRow = xs => { const k = xs.filter(([v]) => v && v !== '—'); return k.length ? `<div class="kpis">${k.map(([v, l, go]) => go ? `<button type="button" class="kpi" data-cnt="${go}"><b>${v}</b><span>${l}</span></button>` : `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''; };

// ---------- פעימות: לו״ז לא רציף (db/127). פעימה = [מ, עד]. חופפות/צמודות (רק שישי-שבת ביניהן) מתאחדות ----------
const pAdd = (d, n = 1) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return isoDay(x); };
const pDow = d => new Date(d + 'T12:00').getDay();
const pNextWd = d => { let x = pAdd(d); while ([5, 6].includes(pDow(x))) x = pAdd(x); return x; };
const mergePulses = xs => {
  const s = xs.filter(r => r[0] && (r[1] || r[0]) >= r[0]).map(r => [r[0], r[1] || r[0]]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0), out = [];
  for (const r of s) { const l = out.at(-1); if (l && r[0] <= pNextWd(l[1])) { if (r[1] > l[1]) l[1] = r[1]; } else out.push([...r]); }
  return out;
};
// ימים → פעימות: ימי עבודה רצופים (שישי-שבת לא שוברים רצף)
const groupDays = ds => mergePulses([...new Set(ds)].sort().map(d => [d, d]));
const pulseLbl = ([f, t]) => f === t ? dm(f) : f.slice(5, 7) === t.slice(5, 7) ? `${+f.slice(8)}–${dm(t)}` : `${dm(f)}–${dm(t)}`;
const pulseWd = (pl, fri = false) => { let n = 0; for (const [f, t] of pl) for (let d = f; d <= t; d = pAdd(d)) { const g = pDow(d); if (g !== 6 && (g !== 5 || fri)) n++; } return n; };
const projPulses = p => Array.isArray(p.pulses) && p.pulses.length > 1 ? p.pulses : p.planned_from ? [[p.planned_from, p.planned_to || p.planned_from]] : [];
// עורך פעימות: שורת התחלה/סיום + "+" לעוד פעימה, × להסרה. סיום לפני התחלה = מסומן בשורה. onChange(פעימות תקינות ממוזגות, יש שגיאה)
function pulseEditor(box, init, onChange) {
  let rows = (init.length ? init : [[isoDay(), isoDay()]]).map(r => [...r]);
  const draw = () => {
    box.innerHTML = rows.map((r, i) => `<div class="prow" data-pr="${i}"><label class="field grow">${i ? '' : 'התחלה'}<input type="date" data-pf value="${r[0] || ''}"></label><label class="field grow">${i ? '' : 'סיום'}<input type="date" data-pt value="${r[1] || ''}"></label>
      ${i ? `<button type="button" class="pdel" data-px aria-label="הסרת פעימה">×</button>` : `<button type="button" class="padd" data-padd aria-label="עוד פעימה">${icon('plus', 18)}</button>`}<small class="perr" ${r[1] && r[0] && r[1] < r[0] ? '' : 'hidden'}>הסיום לפני ההתחלה</small></div>`).join('');
    $$('[data-pr]', box).forEach(el => { const i = +el.dataset.pr;
      $('[data-pf]', el).onchange = e => { rows[i][0] = e.target.value; if (!rows[i][1] || rows[i][1] < rows[i][0]) { rows[i][1] = rows[i][0]; $('[data-pt]', el).value = rows[i][0]; } fire(); };
      $('[data-pt]', el).onchange = e => { rows[i][1] = e.target.value; fire(); };
      const x = $('[data-px]', el); if (x) x.onclick = () => { rows.splice(i, 1); draw(); fire(); };
    });
    const a = $('[data-padd]', box); if (a) a.onclick = () => { const last = rows.filter(r => r[1] || r[0]).map(r => r[1] || r[0]).sort().at(-1) || isoDay(); const s = pNextWd(pNextWd(last)); rows.push([s, s]); draw(); fire(); $$('[data-pf]', box).at(-1)?.focus(); };
  };
  const fire = () => { $$('[data-pr]', box).forEach(el => { const r = rows[+el.dataset.pr]; $('.perr', el).hidden = !(r[0] && r[1] && r[1] < r[0]); el.classList.toggle('bad', !!(r[0] && r[1] && r[1] < r[0])); });
    const bad = rows.some(r => r[0] && r[1] && r[1] < r[0]); onChange(bad ? [] : mergePulses(rows), bad); };
  draw(); fire();
  return { get: () => mergePulses(rows), bad: () => rows.some(r => r[0] && r[1] && r[1] < r[0]) };
}

// ---------- רשימה ----------
export async function renderProjects(el) {
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>פרויקטים</h1></header><input type="search" id="pq" class="search" placeholder="חיפוש פרויקט או לקוח"><div class="tabs" id="pf"><button aria-selected="true" data-f="a">פתוחים</button><button aria-selected="false" data-f="d">הסתיימו</button></div><div id="pl" class="list"><div class="skel"></div></div>`;
  const RDp = isManager() ? sb.rpc('readiness_list').then(r => new Map((r.data || []).map(x => [x.project_id, x]))).catch(() => new Map()) : Promise.resolve(new Map());   // במקביל לרשימה
  let rows;
  try {
    const { data, error } = await sb.from('projects').select('id,name,client_name,status_label,engagement,service,planned_from,planned_to,monday_group,site_id,cover_path,closed_summary,lat,lng,sites(lat,lng),work_days(id,day,status),tasks(status)').order('planned_from', { nullsFirst: false });
    if (error) throw error; rows = data || []; await cache.set('projects', rows);
  } catch { rows = (await cache.get('projects')) || []; }
  const t = isoDay();
  // ציון מוכנות לביצוע לכל פרויקט שמתוכנן קדימה (מנהלים) — אותו חישוב כמו בפרויקט עצמו
  const [cov, RD] = await Promise.all([covers(rows), RDp]);
  const soon = addD(t, 2);
  const RANK = { 'בביצוע': 0, 'תואם - ממתין לביצוע': 1, 'אושר מול לקוח': 2, 'קביעת מועד': 3, 'תקוע': 4 };
  const range = p => p.planned_from ? (p.planned_to && p.planned_to !== p.planned_from ? `${dm(p.planned_from)}–${dm(p.planned_to)}` : dm(p.planned_from)) : null;
  let F = 'a';
  const draw = (f = F) => {
    F = f; const q = ($('#pq')?.value || '').trim();
    const nr = p => { const r = RD.get(p.id); return r && r.ok < r.n; }, nx = p => RD.get(p.id)?.next_day || p.planned_from || '9';
    const list = (f === 'r' ? rows.filter(nr) : rows.filter(p => (f === 'a') === !(p.monday_group === ARCHIVE || String(p.status_label).startsWith('הסתיים') || p.closed_summary)))
      .filter(p => !q || (p.name + ' ' + (p.client_name || '')).includes(q))
      .sort(f === 'r' ? (a, b) => nx(a) < nx(b) ? -1 : 1 : (a, b) => (RANK[a.status_label] ?? 5) - (RANK[b.status_label] ?? 5) || ((b.planned_from || '') > (a.planned_from || '') ? 1 : -1));
    $('#pl').innerHTML = list.length ? folderGrid(list.map(p => {
      const next = (p.work_days || []).filter(d => d.day >= t && d.status !== 'done').sort((a, b) => a.day < b.day ? -1 : 1)[0];
      return { href: `#/p/${p.id}`, img: cov[p.id], title: p.name, data: RD.has(p.id) ? `data-rd="${p.id}"` : '', sub: [p.engagement === 'פיילוט' ? 'פיילוט' : null, p.service, p.client_name, next ? `יום שטח ${dayLabel(next.day)}` : range(p)].filter(Boolean).join(' · '),
        pill: stLabel(p.status_label), tone: { lime: 'ok', bad: 'bad', warn: 'warn' }[TONE[p.status_label]] || '' };
    })) : `<div class="empty-line">${q ? 'לא נמצא פרויקט' : 'אין פרויקטים'}</div>`;
    $$('#pl [data-rd]').forEach(a => { const r = RD.get(a.dataset.rd), all = r.ok === r.n, near = r.next_day && r.next_day <= soon;
      a.querySelector('.grow')?.insertAdjacentHTML('afterend', `<span class="rdring ${all ? 'ok' : near ? 'warn' : ''}" style="--p:${Math.round(r.ok / r.n * 100)}" title="${esc(all ? 'מוכן לשטח' : 'חסר: ' + (r.miss || []).join(', '))}" aria-label="מוכנות ${r.ok} מתוך ${r.n}"><b>${all ? icon('check', 14) : r.ok + '/' + r.n}</b></span>`); });
    // הודעות שלא נקראו בצ׳אט הפרויקט → תגית על השורה (לחיצה = ישר לצ׳אט)
    if (UR) $$('#pl a.frow').forEach(a => { const pid = a.getAttribute('href').split('/')[2], pr = rows.find(x => x.id === pid), n = pr && unreadOf(UR, { project: pr });
      if (n) { a.querySelector('.grow')?.insertAdjacentHTML('afterend', ubadge(n)); a.setAttribute('href', `#/p/${pid}/c`); } });
  };
  let UR = null, unreadOf, ubadge;
  import('./chat.js').then(async m => { unreadOf = m.unreadOf; ubadge = m.ubadge; UR = await m.workUnread(); if ([...UR.byP.values(), ...UR.byS.values()].some(Boolean) && $('#pl')) draw(); }).catch(() => {});
  // "לא מוכנים" — פרויקטים שמתוכננים קדימה ועוד חסר בהם משהו (הקרוב ביותר ראשון)
  const nrN = [...RD.values()].filter(x => x.ok < x.n).length;
  if (nrN) $('#pf [data-f="d"]').insertAdjacentHTML('beforebegin', `<button aria-selected="false" data-f="r">לא מוכנים <span class="count">${nrN}</span></button>`);
  $$('#pf button').forEach(b => b.onclick = () => { $$('#pf button').forEach(x => x.setAttribute('aria-selected', x === b)); draw(b.dataset.f); });
  $('#pq').oninput = () => draw();
  draw('a');
}

const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
// ---------- פרויקט ----------
export async function renderProject(el, id, tab = 'o') {
  el.innerHTML = skeleton('detail');
  const ck = 'proj:' + id; let D;
  try {
    const q = x => x.then(r => r.data || []).catch(() => []);
    const [{ data: p, error }, { data: tasks }, { data: days }, { data: issues }, { data: reps }, fin, { data: sites }, { data: team }, { data: drones }, { data: ready }, miss, ph, pdays] = await Promise.all([
      sb.from('projects').select('*, sites(id,slug,name,address,contact_name,contact_phone,lat,lng)').eq('id', id).single(),
      sb.from('tasks').select('*, buildings(name,code)').eq('project_id', id).order('day_no', { nullsFirst: false }).order('seq'),
      sb.from('work_days').select('*, work_day_crew(user_id,role,hours,confirmed_at,cant_come_at,profiles(full_name))').eq('project_id', id).order('day'),
      sb.from('issues').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('field_reports').select('*').eq('project_id', id).order('report_date', { ascending: false }),
      ADMIN() ? sb.from('project_finance').select('*').eq('project_id', id).maybeSingle() : Promise.resolve({ data: null }),   // סכומים — רק admin (שלושת השותפים). מנהל תפעול לא
      isManager() ? sb.from('sites').select('id,name,slug,kind,buildings(id,specs(status,days_expected,hydrants,power,docking))').eq('is_active', true) : Promise.resolve({ data: [] }),
      isManager() ? sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true) : Promise.resolve({ data: [] }),
      sb.from('equipment').select('id,name,health').eq('kind', 'drone'),
      isManager() ? sb.rpc('project_readiness', { p: id }) : Promise.resolve({ data: null }),
      q(sb.from('missing_items').select('id,work_day_id,item,qty,reported_by,status,created_at,work_days!inner(project_id)').eq('work_days.project_id', id).order('created_at')),
      q(sb.from('photos').select('id,kind,storage_path,work_day_id,issue_id').eq('project_id', id).in('kind', ['before', 'after']).order('created_at')),
      q(sb.from('plan_days').select('day_no,body').eq('project_id', id).order('day_no')),
    ]);
    if (error) throw error;
    D = { p, tasks: tasks || [], days: days || [], issues: issues || [], reps: reps || [], fin: fin.data, sites: sites || [], team: (team || []).filter(x => FIELD_ROLES.includes(x.role)), drones: drones || [], ready, miss, ph, pdays, names: {} };
    // שמות המדווחים (גם לעובד, שלא טוען את הצוות) — עמודות גלויות בלבד
    const known = new Set((team || []).map(x => x.id)), want = [...new Set([...D.issues.map(i => i.opened_by), ...D.miss.map(m => m.reported_by)].filter(u => u && !known.has(u)))];
    (team || []).forEach(x => { D.names[x.id] = x.full_name; });
    D.days.forEach(d => (d.work_day_crew || []).forEach(c => { if (c.profiles?.full_name) D.names[c.user_id] = c.profiles.full_name; }));
    if (want.some(u => !D.names[u])) (await q(sb.from('profiles').select('id,full_name').in('id', want.filter(u => !D.names[u])))).forEach(x => { D.names[x.id] = x.full_name; });
    await cache.set(ck, D);
  } catch { D = await cache.get(ck); }
  if (!D) { el.innerHTML = `<header class="phead">${backBtn('#/projects')}<h1>פרויקט</h1></header><div class="empty-line">הפרויקט לא נמצא</div>`; return; }   // בלי מבוי סתום — יש חזרה
  D.miss ||= []; D.ph ||= []; D.pdays ||= []; D.names ||= {};   // מטמון מגרסה קודמת
  const p = D.p, M = isManager(), LEAD = state.profile.role === 'crew_lead';
  const reload = t => renderProject(el, id, t);
  const T0 = isoDay(), OPENP = isOpenProject(p);
  // מסך אחד (אביחי 18/10): כותרת · שורת מצב · מונים + צעד הבא · פתוח · תכנית עבודה · תיק הפרויקט · אפיון · צ׳אט | ימי שטח
  const showSpec = p.site_id && (M || can('specs'));
  el.innerHTML = `<div class="pj">
    <header class="phead pjhead">${backBtn('#/projects')}<span class="grow"><h1>${esc(p.name)}</h1><small class="pjsub">${esc([p.client_name, p.service].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="hbtn" id="pjnew" aria-label="חדש">${icon('plus', 22)}</button></header>
    <div class="pjstat" id="pjstat"></div>
    <div class="pjcnt" id="pjcnt"></div>
    <div class="pjgrid">
      <div class="pjcol stack" id="pjmain">
        <section id="pjopen"></section>
        <div id="pjready"></div>
        ${!M ? '<div id="pjsafe"></div>' : ''}
        <details class="fold" id="fplan"><summary><span class="sh">תכנית עבודה</span><small class="fmeta" id="fplanm"></small></summary><div id="pjplan" class="stack"></div></details>
        <details class="fold" id="ffile"><summary><span class="sh">תיק הפרויקט</span><small class="fmeta" id="ffilem"></small></summary><div id="pjfile" class="stack"></div></details>
        ${showSpec ? `<details class="fold" id="fspec"><summary><span class="sh">אפיון</span><small class="fmeta">${esc(p.sites?.name || '')}</small></summary><div id="pjspec" class="stack"></div></details>` : ''}
        <details class="fold" id="fchat"><summary><span class="sh">צ׳אט</span><span id="fchatb"></span></summary><div id="pjchat"></div></details>
        <details class="fold" id="finfo"><summary><span class="sh">פרטים</span><small class="fmeta">${esc(p.sites?.name || '')}</small></summary><div id="pjinfo" class="stack"></div></details>
        ${M ? `<details class="fold" id="fhours"><summary><span class="sh">שעות עבודה</span></summary><div id="pjhours" class="stack"></div></details>` : ''}
      </div>
      <div class="pjcol stack" id="pjdays"></div>
    </div></div>`;
  // צ׳אט: כמה לא נקראו (צוות שטח + לפני ביצוע של האתר)
  import('./chat.js').then(async m => { const n = m.unreadOf(await m.workUnread(), { project: p }); const b = $('#fchatb', el); if (n && b) b.innerHTML = m.ubadge(n); }).catch(() => {});
  const nw = $('#pjnew', el); if (nw) nw.onclick = () => import('./reports.js').then(m => m.newReport(id));
  // סעיף מקופל נטען בפתיחה הראשונה
  const lazy = (fid, fn) => { const f = $('#' + fid, el); if (!f) return; let done = false; f.addEventListener('toggle', () => { if (f.open && !done) { done = true; fn(); } }); };
  // מסמכי בטיחות: רק לראש הצוות של יום בפרויקט, מ-3 ימים לפני עד 7 אחרי (db/149). תמיד מהרשת, לא מהמטמון
  const lo = isoDay(new Date(Date.now() - 7 * 864e5)), hi = isoDay(new Date(Date.now() + 3 * 864e5));
  if (!M && D.days.some(d => d.crew_lead_id === state.user.id && d.status !== 'cancelled' && d.day >= lo && d.day <= hi))
    import('./pfiles.js').then(m => m.safetyRow($('#pjsafe', el), id)).catch(() => {});
  lazy('fspec', () => specTab($('#pjspec', el)));
  lazy('fchat', () => chat($('#pjchat', el)));
  lazy('ffile', () => fileBox($('#pjfile', el)));
  lazy('fplan', () => planBox($('#pjplan', el)));
  lazy('finfo', () => infoBox($('#pjinfo', el)));
  lazy('fhours', () => hoursBox($('#pjhours', el)));
  // ----- אפיון האתר, בתוך הפרויקט -----
  async function specTab(box) {
    box.innerHTML = '<div class="skel"></div>';
    const { data: st } = await sb.from('sites').select('slug,name,buildings(id,name,sort,facade_area_m2,specs(status,days_expected))').eq('id', p.site_id).maybeSingle();
    if (!st) { box.innerHTML = '<div class="empty-line">אין גישה לאפיון</div>'; return; }
    const B = (st.buildings || []).sort((a, b) => a.sort - b.sort).map(b => ({ ...b, sp: Array.isArray(b.specs) ? b.specs[0] : b.specs }));
    const done = B.filter(b => b.sp?.status === 'done'), days = done.reduce((t, b) => t + Number(b.sp.days_expected || 0), 0);
    const ST = { done: ['ok', 'הושלם'], draft: ['warn', 'טיוטה'] };
    box.innerHTML = `<div class="kpis plain"><div class="kpi"><b>${done.length}/${B.length}</b><span>מבנים אופיינו</span></div><div class="kpi"><b>${days ? nf(Math.ceil(days - 1e-3)) : '—'}</b><span>ימי עבודה</span></div></div>
      <div class="list">${B.map(b => `<a class="lrow" href="#/b/${esc(st.slug)}/${b.id}"><span class="grow"><b>${esc(b.name)}</b><small>${[b.sp?.days_expected ? nf(b.sp.days_expected) + ' ימים' : null, b.facade_area_m2 ? nf(b.facade_area_m2) + ' מ״ר' : null].filter(Boolean).join(' · ')}</small></span>
        ${ST[b.sp?.status] ? `<span class="pill ${ST[b.sp.status][0]}">${ST[b.sp.status][1]}</span>` : '<span class="pill">לא מולא</span>'}</a>`).join('')}</div>
      <a class="btn ghost block" href="#/site/${esc(st.slug)}">${icon('clipboard', 18)} האפיון המלא</a>`;
  }

  // ----- ימי שטח, פתוח, שורת מצב -----
  const DST = { planned: ['מתוכנן', ''], en_route: ['בדרך', 'warn'], on_site: ['באתר', 'lime'], working: ['בעבודה', 'lime'], issue: ['תקלה', 'bad'], done: ['בוצע', 'ok'] };
  const first = u => (D.names[u] || '').split(' ')[0];
  const mono = s => `<bdi dir="ltr" class="num">${esc(s)}</bdi>`;
  const live = () => D.days.filter(d => d.status !== 'cancelled');
  const isPast = d => d.status === 'done';
  const upcoming = () => live().filter(d => !isPast(d)).sort((a, b) => a.day < b.day ? -1 : 1);
  const crewIds = d => [...new Set([d.crew_lead_id, ...(d.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
  const crewTxt = d => crewIds(d).map(u => esc(first(u)) + (u === d.crew_lead_id ? leadMark() : '')).join(' · ');
  const cantCome = d => (d.work_day_crew || []).filter(c => c.cant_come_at);
  const hrsTxt = d => d.site_arrival ? `${d.site_arrival.slice(0, 5)}${d.site_end ? '–' + d.site_end.slice(0, 5) : ''}` : '';

  // ---- פתוח: תקלות (כפולות מקובצות ×N) + חוסרים (לפי יציאה) + משימות ----
  const stem = w => w.replace(/(ים|ות)$/, '').replace(/ה$/, '').replace(/[ןםךףץ]$/, c => ({ ן: 'נ', ם: 'מ', ך: 'כ', ף: 'פ', ץ: 'צ' })[c]);   // חלונות/חלון, פתוחים/פתוח → אותה בעיה
  const issKey = i => i.kind + '|' + String(i.body || '').replace(/^[^:\n]{1,14}:\s*/, '').replace(/[^֐-׿a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(stem).join(' ');
  const dayOfId = wid => D.days.find(d => d.id === wid);
  const iDay = i => i.work_day_id ? dayOfId(i.work_day_id)?.day : isoDay(new Date(i.created_at));
  function openItems() {
    const out = [];
    const G = new Map();
    D.issues.filter(i => i.status === 'open').sort((a, b) => a.created_at < b.created_at ? -1 : 1).forEach(i => { const k = i.prestart && !i.decision ? 'ps|' + i.id : issKey(i); (G.get(k) || G.set(k, []).get(k)).push(i); });
    for (const [k, xs] of G) { const i = xs.at(-1);
      out.push({ key: 'i:' + xs[0].id, type: 'issue', xs, title: String(i.body || '').replace(/\s+/g, ' '), day: iDay(xs[0]), who: first(i.opened_by), sev: xs.some(x => x.severity === 'critical') ? 'bad' : 'warn', ps: k.startsWith('ps|') ? i : null }); }
    const MG = new Map(); D.miss.filter(m => m.status !== 'handled').forEach(m => (MG.get(m.work_day_id) || MG.set(m.work_day_id, []).get(m.work_day_id)).push(m));
    for (const [wid, xs] of MG) { const d = dayOfId(wid);
      out.push({ key: 'm:' + wid, type: 'miss', xs, title: xs.length === 1 ? xs[0].item : `${xs.length} חוסרים מיציאה ${dm(d?.day || '')}`, day: d?.day, who: first(xs[0].reported_by), sev: 'warn' }); }
    const TG = new Map(); D.tasks.filter(t => ['todo', 'in_progress', 'blocked'].includes(t.status)).forEach(t => { const k = t.title.trim() + '|' + (t.work_day_id || ''); (TG.get(k) || TG.set(k, []).get(k)).push(t); });
    for (const [, xs] of TG) { const t = xs[0], d = t.work_day_id && dayOfId(t.work_day_id);
      out.push({ key: 't:' + t.id, type: 'task', xs, title: t.title, day: d?.day || t.due || null, who: t.assignee_id ? first(t.assignee_id) : '', sev: t.status === 'blocked' ? 'bad' : '', wd: d || null }); }
    return out;
  }
  const TYPE_HE = { issue: 'תקלה', miss: 'חוסר', task: 'משימה' };
  const counts = () => { const O = openItems(); return { O, issue: O.filter(x => x.type === 'issue').length, issueN: D.issues.filter(i => i.status === 'open').length, miss: D.miss.filter(m => m.status !== 'handled').length, task: O.filter(x => x.type === 'task').reduce((n, x) => n + x.xs.length, 0) }; };
  let FIL = 'all', OPENED = null, DONE_OPEN = false, ADDING = false;
  // מה שטופל: תקלות שנסגרו (עם הטיפול), פריטי מעקב שבוצעו, חוסרים שטופלו — מהחדש לישן
  const doneItems = () => [
    ...D.issues.filter(i => i.status !== 'open').map(i => ({ at: i.closed_at || i.created_at, t: String(i.body || '').replace(/\s+/g, ' '), s: ['תקלה', i.resolution || (i.decision === 'cleared' ? 'כשיר לעבוד' : '')].filter(Boolean).join(' · '), href: i.work_day_id ? '#/day/' + i.work_day_id : '' })),
    ...D.tasks.filter(t => t.status === 'done' && t.phase === 'מעקב').map(t => ({ at: t.done_at || '', t: t.title, s: ['משימה', t.done_note || ''].filter(Boolean).join(' · '), href: '' })),
    ...D.miss.filter(m => m.status === 'handled').map(m => ({ at: m.created_at, t: m.item, s: 'חוסר · ' + dm(dayOfId(m.work_day_id)?.day || ''), href: '#/day/' + m.work_day_id })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
  function openRow(x) {
    const n = x.type === 'miss' ? 0 : x.xs.length;
    const act = x.type === 'issue' ? (M ? (x.ps ? `<button type="button" class="chip sm" data-oact="${x.key}">החלטה</button>` : `<button type="button" class="chip sm" data-oact="${x.key}">טופל</button>`) : '')
      : x.type === 'task' ? (x.xs[0].status === 'blocked' ? '<span class="pill bad">נתקע</span>' : x.wd ? `<a class="chip sm" href="#/day/${x.wd.id}">${x.wd.day === T0 ? 'היום' : 'משובץ ' + dm(x.wd.day)}</a>` : M && ['ביצוע', 'הכנה'].includes(x.xs[0].phase) && !upcoming().length ? `<button type="button" class="chip sm" data-osch>לשבץ</button>` : `<button type="button" class="chip sm" data-oact="${x.key}">בוצע</button>`) : '';
    return `<div class="orow ${x.sev}" data-key="${x.key}"><button type="button" class="ohead" aria-expanded="${OPENED === x.key}"><span class="odot"></span><span class="grow"><b>${esc(x.title)}</b><small>${[TYPE_HE[x.type], x.day ? dm(x.day) : '', x.who].filter(Boolean).map(esc).join(' · ')}</small></span>${n > 1 ? `<span class="pill">${mono('×' + n)}</span>` : x.type === 'miss' && x.xs.length > 1 ? `<span class="pill warn">${mono('×' + x.xs.length)}</span>` : ''}</button>${act}${OPENED === x.key ? `<div class="obody" id="ob"></div>` : ''}</div>`;
  }
  function drawOpen() {
    const C = counts(), box = $('#pjopen', el); if (!box) return;
    const L = C.O.filter(x => FIL === 'all' || x.type === FIL);
    const chip = (k, t, n) => n || k === 'all' ? `<button type="button" class="chip sm" data-of="${k}" aria-pressed="${FIL === k}">${t}${k === 'all' ? '' : ' ' + mono(String(n))}</button>` : '';
    box.innerHTML = `<div class="sh-row"><h2 class="sh">פתוח</h2></div>
      <div class="ohead2">${C.O.length ? `<div class="chips ofil">${chip('all', 'הכל', 0)}${chip('issue', 'תקלות', C.issueN)}${chip('miss', 'חוסרים', C.miss)}${chip('task', 'משימות', C.task)}</div>` : ''}<button type="button" class="btn ghost sm oadd" id="oadd" aria-expanded="${ADDING}">+ משימה</button></div>
      <form class="ckadd" id="ckadd"${ADDING ? '' : ' hidden'}><input id="ckin" placeholder="משימה חדשה" autocomplete="off" aria-label="משימה חדשה"><button class="btn primary sm">הוספה</button><button type="button" class="hbtn" id="ckx" aria-label="סגירה">×</button></form>
      ${C.O.length ? `<div class="olist">${L.map(openRow).join('') || '<div class="empty-line">אין</div>'}</div>` : `<div class="empty-line">אין פריטים פתוחים</div>`}
      ${(() => { const H = doneItems(); return H.length ? `<details class="fold sub" id="odone"${DONE_OPEN ? ' open' : ''}><summary><span class="sh">טופלו</span><span class="count">${H.length}</span></summary><div class="olines">${H.map(x => x.href ? `<a class="oline" href="${x.href}"><span class="grow"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><span class="chev">${icon('chev', 16)}</span></a>` : `<div class="oline"><span class="grow"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></div>`).join('')}</div></details>` : ''; })()}`;
    const od = $('#odone', box); if (od) od.ontoggle = () => { DONE_OPEN = od.open; };
    $$('[data-of]', box).forEach(b => b.onclick = () => { FIL = b.dataset.of; OPENED = null; drawOpen(); });
    $$('.ohead', box).forEach(b => b.onclick = () => { const k = b.closest('[data-key]').dataset.key; OPENED = OPENED === k ? null : k; drawOpen(); });
    $$('[data-oact]', box).forEach(b => b.onclick = e => { e.stopPropagation(); doAct(C.O.find(x => x.key === b.dataset.oact), b); });
    $$('[data-osch]', box).forEach(b => b.onclick = () => openSched());
    // "+ משימה" בראש "פתוח" (אביחי לא מצא את השדה בתחתית): לחיצה פותחת שדה עם פוקוס, Enter מוסיף, Esc / × סוגר
    const shut = () => { ADDING = false; $('#ckadd', box).hidden = true; $('#oadd', box).setAttribute('aria-expanded', 'false'); };
    $('#oadd', box).onclick = () => { ADDING = true; $('#ckadd', box).hidden = false; $('#oadd', box).setAttribute('aria-expanded', 'true'); $('#ckin', box).focus(); };
    $('#ckx', box).onclick = shut; $('#ckin', box).onkeydown = e => { if (e.key === 'Escape') shut(); };
    const f = $('#ckadd', box); f.onsubmit = async e => { e.preventDefault(); const v = $('#ckin', box).value.trim(); if (!v) return;
      const row = { id: crypto.randomUUID(), project_id: id, title: v, phase: 'מעקב', status: 'todo', is_extra: true, created_by: state.user.id };
      D.tasks.push(row); await enqueue({ kind: 'insert', table: 'tasks', row }); refresh(); setTimeout(() => $('#ckin', el)?.focus(), 30); };
    if (OPENED) { const x = C.O.find(y => y.key === OPENED); if (x) openBody(x, $('#ob', box)); }
  }
  async function doAct(x, b) {
    if (!x || b.disabled) return;
    if (x.type === 'issue' && x.ps) { const P = await import('./prestart.js'); return P.decideSheet(x.ps, { who: first(x.ps.opened_by), after: r => P.afterDecide(r, () => reload()) }); }
    if (x.type === 'issue') { const r = await ask('איך טופל?', { multiline: true, placeholder: 'מה נעשה כדי לפתור', ok: x.xs.length > 1 ? `סגירת ${x.xs.length} הדיווחים` : 'סגירת התקלה' }); if (r == null) return;
      const at = new Date().toISOString();
      for (const i of x.xs) { Object.assign(i, { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: at }); await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: at } }); }
      OPENED = null; toast('התקלה נסגרה'); return refresh(); }
    if (x.type === 'task') { const t = x.xs[0];
      if (t.project_id && (t.photos?.before?.length || !M)) return (await import('./tasks.js')).completeTask(t, refresh);   // תיעוד בשטח (תמונת אחרי)
      for (const y of x.xs) { Object.assign(y, { status: 'done', done_by: state.user.id, done_at: new Date().toISOString() }); await enqueue({ kind: 'update', table: 'tasks', rowId: y.id, patch: { status: 'done', done_by: state.user.id, done_at: y.done_at } }); }
      OPENED = null; toast('בוצע', 1400, 'success'); return refresh(); }
  }
  async function openBody(x, box) {
    if (!box) return;
    if (x.type === 'miss') {
      box.innerHTML = `<div class="olines">${x.xs.map(m => `<div class="oline"><span class="grow">${esc(m.item)}${m.qty > 1 ? ' ' + mono('×' + m.qty) : ''}</span>${M ? `<button type="button" class="chip sm" data-mh="${m.id}">טופל</button>` : ''}</div>`).join('')}</div>
        ${x.day ? `<a class="more" href="#/day/${x.xs[0].work_day_id}">יום שטח · ${dm(x.day)}</a>` : ''}`;
      $$('[data-mh]', box).forEach(b => b.onclick = async () => { const m = D.miss.find(y => y.id === b.dataset.mh); m.status = 'handled'; await enqueue({ kind: 'update', table: 'missing_items', rowId: m.id, patch: { status: 'handled' } }); refresh(); });
      return;
    }
    if (x.type === 'task') { const t = x.xs[0];
      const meta = [t.phase, T_STATUS[t.status]?.[0], t.assignee_id ? 'אחראי: ' + first(t.assignee_id) : '', t.due ? 'עד ' + dm(t.due) : ''].filter(Boolean);
      box.innerHTML = `<small>${meta.map(esc).join(' · ')}</small>${t.status_note ? `<div class="note">${esc(t.status_note)}</div>` : ''}${t.risk ? `<small class="issue">${esc(t.risk)}</small>` : ''}${t.instructions ? `<small>${esc(noMoney$(t.instructions))}</small>` : ''}
        <div class="row">${x.wd ? `<a class="more" href="#/day/${x.wd.id}">יום שטח · ${dm(x.wd.day)}</a>` : ''}${M ? `<button type="button" class="chip sm" data-who>${t.assignee_id ? 'החלפת אחראי' : 'שיוך'}</button>` : ''}${t.day_no ? `<a class="more" href="#/plan/${id}">תכנית עבודה · יום ${t.day_no}</a>` : ''}</div>`;
      const w = $('[data-who]', box); if (w) w.onclick = () => sheet(`<h3>למי?</h3><div class="list">${D.team.map(u => `<button class="lrow" data-u="${u.id}"><b class="grow">${esc(u.full_name)}</b>${t.assignee_id === u.id ? `<span class="pill ok">${icon('check', 16)}</span>` : ''}</button>`).join('')}</div>
        <label class="field">עד מתי (לא חובה)<input type="date" id="ckd" value="${t.due || ''}"></label><button class="btn ghost block" data-close>סגירה</button>`, (s, close) => {
        $$('[data-u]', s).forEach(y => y.onclick = async () => { t.assignee_id = y.dataset.u; t.due = $('#ckd', s).value || null;
          await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: { assignee_id: t.assignee_id, due: t.due } }); close(); toast('שויך'); refresh(); }); });
      return;
    }
    // תקלה: התמונה, היום, המדווח, וכל הדיווחים על אותה בעיה
    box.innerHTML = `${x.xs.length > 1 ? '' : `<div>${esc(x.xs[0].body)}</div>`}<div class="photos" id="oph"></div>
      <div class="olines">${x.xs.map(i => { const d = i.work_day_id && dayOfId(i.work_day_id), when = new Date(i.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
        return d ? `<a class="oline" href="#/day/${d.id}"><span class="grow"><b>יום שטח · ${dm(d.day)}</b><small>${esc(first(i.opened_by))} · ${mono(when)}${x.xs.length > 1 ? ' · ' + esc(i.body) : ''}</small></span><span class="chev">${icon('chev', 16)}</span></a>`
          : `<div class="oline"><span class="grow"><b>${esc(KIND_HE[i.kind] || 'תקלה')}</b><small>${esc(first(i.opened_by))} · ${mono(when)}${x.xs.length > 1 ? ' · ' + esc(i.body) : ''}</small></span></div>`; }).join('')}</div>`;
    const ids = x.xs.map(i => i.id);
    const { data: ip } = await sb.from('photos').select('storage_path').in('issue_id', ids).limit(8).then(r => r, () => ({ data: [] }));
    if ((ip || []).length && box.isConnected) { const u = await thumbUrls('field', ip.map(y => y.storage_path)).catch(() => ({}));
      const b2 = $('#oph', box); if (b2) { b2.innerHTML = ip.filter(y => u[y.storage_path]).map(y => `<button type="button" class="ph" data-z="${esc(u[y.storage_path].f)}"><img src="${esc(u[y.storage_path].t)}" alt="" loading="lazy"></button>`).join(''); $$('[data-z]', b2).forEach(z => z.onclick = () => zoom(z.dataset.z, '')); } }
  }
  // מונה → גלילה ל"פתוח" + סינון
  const goOpen = f => { FIL = f; OPENED = null; drawOpen(); $('#pjopen', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // ---- צעד הבא אחד, נגזר מהמצב ----
  function nextStep() {
    const C = counts(), up = upcoming(), nx = up[0], liveDay = D.days.find(d => ['en_route', 'on_site', 'working', 'issue'].includes(d.status));
    const ps = C.O.filter(x => x.ps);
    if (M && ps.length) return { t: ps.length > 1 ? `${ps.length} תקלות ממתינות להחלטה` : 'תקלה ממתינה להחלטה', act: () => doAct(ps[0], {}), tone: 'bad' };
    if (liveDay) return { t: `יום השטח פתוח · ${DST[liveDay.status]?.[0] || ''}`, href: `#/day/${liveDay.id}` };
    if (nx && nx.day <= isoDay(new Date(Date.now() + 864e5))) {
      const un = (nx.work_day_crew || []).filter(c => !c.confirmed_at && !c.cant_come_at), cc = cantCome(nx);
      const when = nx.day === T0 ? 'להיום' : 'למחר';
      if (M && cc.length) return { t: `${cc.length === 1 ? first(cc[0].user_id) + ' לא יכול' : cc.length + ' לא יכולים'} להגיע ${when}`, act: () => import('./dayadmin.js').then(m => m.openDayAdmin(nx.id, () => reload())), tone: 'bad' };
      if (M && un.length) return { t: `${un.length} לא אישרו הגעה ${when}`, href: `#/day/${nx.id}` };
    }
    const allDone = live().length && !up.length;
    if (allDone && !p.closed_summary && (M || LEAD) && !SIGNED) return { t: 'חסרה חתימת לקוח', href: `#/signoff/${id}` };
    if (M && D.ready?.items && nx) { const r = readyItems(); const bad = r?.out.filter(x => !x.ok) || []; if (bad.length) return { t: `${bad[0].t}${bad.length > 1 ? ` ועוד ${bad.length - 1}` : ''}`, act: () => $('#ready', el)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }; }
    if (M && !up.length && !allDone && OPENP) return { t: 'שיבוץ ימי שטח', act: () => openSched() };
    return null;
  }
  let SIGNED = !!D.days.some(d => d.signoff);
  // דוחות יומיים ישנים (מלפני ימי השטח באפליקציה) = ימי עבודה שבוצעו
  const legacyReps = () => { const pushed = new Set(D.days.map(d => d.monday_item_id).filter(Boolean)), L = live(); return D.reps.filter(r => !pushed.has(r.monday_item_id) && !L.some(d => d.day === r.report_date)); };
  function drawStatus() {
    const work = live().filter(d => isWorkDay(d)), lg = legacyReps().length, doneW = work.filter(isPast).length + lg, up = upcoming(), nx = up[0], tot = work.length + lg;
    const cur = Math.min(tot, doneW + (up.some(d => isWorkDay(d)) ? 1 : 0));
    const curDay = up.find(d => isWorkDay(d)) || work.filter(isPast).at(-1);
    const pill = `<b class="sttxt ${TONE[p.status_label] ?? ''}">${esc(stLabel(p.status_label))}</b>`;   // מצב ממאנדי — מידע, לא לחיץ
    const dayTxt = tot ? (doneW >= tot ? (tot === 1 ? 'יום העבודה בוצע' : `${mono(String(tot))} ימי עבודה בוצעו`) : `יום ${mono(String(cur))} מתוך ${mono(String(tot))} ימי עבודה`) : '';
    $('#pjstat', el).innerHTML = `${p.engagement === 'פיילוט' ? '<b class="sttxt pilot">פיילוט</b>' : ''}${pill}
      ${dayTxt ? `<button type="button" class="slink" data-goday="${curDay?.id || ''}">${dayTxt}</button>` : ''}
      ${nx ? `<a class="slink strong" href="#/day/${nx.id}">${nx.day === T0 ? 'היום' : 'הבא: ' + esc(dayLabel(nx.day))}${nx.report_time ? ', יציאה ' + mono(nx.report_time.slice(0, 5)) : ''}</a>` : ''}`;
    const g = $('[data-goday]', el); if (g) g.onclick = () => focusDay(g.dataset.goday);
    const C = counts(), ns = nextStep();
    const cnt = (k, n, t, tone) => n ? `<button type="button" class="cnt ${tone}" data-cnt="${k}"><b>${mono(String(n))}</b><span>${t}</span></button>` : `<div class="cnt zero"><b>${mono('0')}</b><span>${t}</span></div>`;   // 0 = אין מקור ללחוץ אליו → טקסט
    $('#pjcnt', el).innerHTML = `${cnt('issue', C.issueN, C.issueN > C.issue ? `תקלות · ${mono(String(C.issue))} נושאים` : 'תקלות', 'bad')}${cnt('miss', C.miss, 'חוסרים', 'warn')}${cnt('task', C.task, 'משימות', 'blue')}
      ${ns ? (ns.href ? `<a class="btn primary nstep ${ns.tone || ''}" href="${esc(ns.href)}">${esc(ns.t)}</a>` : `<button type="button" class="btn primary nstep ${ns.tone || ''}" id="nstep">${esc(ns.t)}</button>`) : ''}`;
    $$('[data-cnt]', el).forEach(b => b.onclick = () => goOpen(b.dataset.cnt));
    const nb = $('#nstep', el); if (nb && ns?.act) nb.onclick = ns.act;
  }
  function focusDay(did) {
    const r = did && $(`[data-did="${did}"]`, el); if (!r) return $('#pjdays', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    r.closest('details[hidden]')?.removeAttribute('hidden'); const more = $('#tlmore', el); if (more && r.closest('#tlold')) more.click();
    r.scrollIntoView({ behavior: 'smooth', block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1400);
  }
  const refresh = () => { drawStatus(); drawOpen(); drawDays(); cache.set(ck, D).catch(() => {}); };

  // ---- ציר ימי השטח: עבר נפרש במקום ל"סיכום היום", היום/עתיד → יום השטח ----
  const EXP = new Set();
  function drawDays() {
    const box = $('#pjdays', el); if (!box) return;
    const L = live().sort((a, b) => a.day < b.day ? -1 : 1), up = upcoming();
    const legacy = legacyReps().map(r => ({ legacy: r, day: r.report_date, id: 'r' + r.monday_item_id }));
    const rows = [...L, ...legacy].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
    const doneN = L.filter(d => isPast(d) && isWorkDay(d)).length + legacy.length, leftN = up.filter(isWorkDay).length;
    const PL = projPulses(p), out = up.length && PL.length && up.some(d => !PL.some(([f, t]) => d.day >= f && d.day <= t));
    const past = rows.filter(r => r.legacy || isPast(r)), fut = rows.filter(r => !r.legacy && !isPast(r));
    const hideN = past.length > 3 ? past.length - 3 : 0;
    box.innerHTML = `<div class="sh-row"><h2 class="sh">ימי שטח</h2><small class="muted">${[doneN ? doneN + ' בוצעו' : '', leftN ? leftN + ' נותרו' : ''].filter(Boolean).join(' · ')}</small></div>
      ${M && OPENP ? `<div class="row tlact">${PL.length ? `<button type="button" class="slink" id="dates">${PL.length > 1 ? PL.map(pulseLbl).join(' · ') : `${dm(PL[0][0])}–${dm(PL[0][1])}`}</button>` : `<button type="button" class="slink" id="dates">תאריכים</button>`}${out ? '<span class="pill warn">שיבוץ מחוץ לטווח</span>' : ''}<span class="grow"></span><button type="button" class="chip sm" id="schm">${icon('plus', 16)} ${up.length ? 'שיבוץ מחדש' : 'שיבוץ ימים'}</button></div>` : ''}
      ${p.site_id ? '<div id="zprog"></div>' : ''}
      <div class="tl">
        ${hideN ? `<button type="button" class="tlmore" id="tlmore">${hideN} ימים קודמים</button><div id="tlold" hidden>${past.slice(0, hideN).map(dayRow).join('')}</div>` : ''}
        ${past.slice(hideN).map(dayRow).join('')}${fut.map(dayRow).join('')}
        ${!rows.length ? '<div class="empty-line">עוד אין ימי שטח</div>' : ''}
      </div>
      ${(() => { const nx = up[0]; return p.site_id && nx && nx.day <= isoDay(new Date(Date.now() + 5 * 864e5)) ? `<span data-wxcard="${p.site_id}|${nx.day}|תחזית ל${dayLabel(nx.day)}"></span>` : ''; })()}`;
    const mo = $('#tlmore', box); if (mo) mo.onclick = () => { mo.remove(); $('#tlold', box).hidden = false; };
    bindDays(box, rows);
    bindSched(box);
    import('../lib/wx.js').then(m => m.fillWx(box)).catch(() => {});
    if (p.site_id) import('./zones.js').then(m => m.progressCard($('#zprog', box), id, { started: D.days.some(d => ['en_route', 'on_site', 'working', 'issue'].includes(d.status)) })).catch(() => {});   // התקדמות לפי חזית (db/112)
  }
  function bindDays(box, rows) {
    $$('[data-exp]', box).forEach(b => b.onclick = () => { const k = b.dataset.exp; EXP.has(k) ? EXP.delete(k) : EXP.add(k); const r = b.closest('.tday'); r.outerHTML = dayRow(rows.find(x => x.id === k)); bindDays(box, rows); if (EXP.has(k)) fillDay(rows.find(x => x.id === k)); });
    $$('[data-mv]', box).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); import('./dayadmin.js').then(m => m.openDayAdmin(b.dataset.mv, () => reload())); });
    $$('[data-iss]', box).forEach(b => b.onclick = () => { FIL = 'all'; OPENED = b.dataset.iss; drawOpen(); $(`[data-key="${b.dataset.iss}"]`, el)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $$('[data-goopen]', box).forEach(b => b.onclick = () => goOpen(b.dataset.goopen));
  }
  function dayRow(d) {
    if (!d) return '';
    const g = new Date(d.day + 'T12:00').getDay(), today = d.day === T0;
    const dbox = `<span class="datebox ${today ? 'now' : ''}"><b>${+d.day.slice(8)}</b><small>${today ? 'היום' : HE_D1[g]}</small></span>`;
    if (d.legacy) { const r = d.legacy, ex = EXP.has(d.id);
      return `<div class="tday past ${ex ? 'open' : ''}" data-did="${d.id}">${dbox}<div class="tcard"><button type="button" class="thead" data-exp="${d.id}" aria-expanded="${ex}"><span class="grow"><b>${ex ? 'סיכום היום' : 'יום שטח'} · ${dm(r.report_date)}</b><small>${esc(r.crew || '')}</small></span><span class="pill ok">בוצע</span><span class="chev">${icon('chev', 16)}</span></button>
        ${ex ? `<div class="tbody">${kpiRow([[r.hours, 'שעות'], [r.gallons, 'גלון']])}${r.work ? `<p>${esc(r.work)}</p>` : ''}${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}<div class="photos" data-lph="${d.id}"></div></div>` : ''}</div></div>`; }
    if (!isPast(d)) {
      const st = DST[d.status] || DST.planned, crew = d.work_day_crew || [], conf = crew.filter(c => c.confirmed_at).length, cc = cantCome(d).length;
      return `<div class="tday ${today ? 'today' : 'fut'}" data-did="${d.id}">${dbox}<a class="tcard thead" href="#/day/${d.id}"><span class="grow"><b>יום שטח · ${dm(d.day)}${d.is_last_day ? ' · יום אחרון' : ''}${dtTag(d)}${nightTag(d)}</b>
        <small>${[d.report_time ? 'יציאה ' + mono(d.report_time.slice(0, 5)) : '', hrsTxt(d) ? 'באתר ' + mono(hrsTxt(d)) : '', crewTxt(d) || 'לא שובץ צוות'].filter(Boolean).join(' · ')}</small>
        ${crew.length && d.status === 'planned' ? `<small class="${cc ? 'bad' : conf < crew.length ? 'warnt' : 'okt'}">${cc ? `${cc} לא יכולים להגיע · ` : ''}${mono(conf + '/' + crew.length)} אישרו הגעה</small>` : ''}</span>
        <span class="pill ${st[1]}">${today && d.status === 'planned' ? 'היום' : st[0]}</span>${M ? `<button type="button" class="chip sm" data-mv="${d.id}">עריכה</button>` : `<span class="chev">${icon('chev', 16)}</span>`}</a></div>`;
    }
    const ex = EXP.has(d.id), iss = D.issues.filter(i => i.work_day_id === d.id), mi = D.miss.filter(m => m.work_day_id === d.id);
    const tag = [DT_SHORT[d.day_type] && !isWorkDay(d) ? DT_SHORT[d.day_type] : '', isNight(d) ? 'לילה' : '', iss.length ? `${iss.length} תקלות` : '', mi.filter(m => m.status !== 'handled').length ? `${mi.filter(m => m.status !== 'handled').length} חוסרים` : ''].filter(Boolean).join(' · ');
    return `<div class="tday past ${ex ? 'open' : ''}" data-did="${d.id}">${dbox}<div class="tcard"><button type="button" class="thead" data-exp="${d.id}" aria-expanded="${ex}"><span class="grow"><b>${ex ? 'סיכום היום' : 'יום שטח'} · ${dm(d.day)}</b><small>${esc(tag || crewIds(d).map(first).join(' · '))}</small></span><span class="pill ok">בוצע</span><span class="chev">${icon('chev', 16)}</span></button>
      ${ex ? daySummary(d, iss, mi) : ''}</div></div>`;
  }
  // סיכום היום: שעות, צוות ושעות, חזיתות, גלונים, לפני/אחרי, תקלות, חוסרים ומשימות שנשארו
  function daySummary(d, iss, mi) {
    const crew = d.work_day_crew || [], ch = crew.reduce((a, c) => a + Number(c.hours || 0), 0);
    const zd = Array.isArray(d.zones_done) ? d.zones_done.length : 0, tleft = D.tasks.filter(t => t.work_day_id === d.id && !['done', 'dropped'].includes(t.status));
    const phs = D.ph.filter(x => x.work_day_id === d.id), b = phs.filter(x => x.kind === 'before').length, a = phs.filter(x => x.kind === 'after').length;
    const IG = openItems().filter(x => x.type === 'issue' && x.xs.some(i => i.work_day_id === d.id));
    const k = [[hrsTxt(d) ? mono(hrsTxt(d)) : d.site_hours ? mono(nf(d.site_hours)) : '', hrsTxt(d) ? 'שעות באתר' : 'שעות באתר'],
      [ch ? mono(nf(Math.round(ch * 10) / 10)) : '', `שעות צוות${crew.length ? ' · ' + crew.length : ''}`], [zd ? mono(String(zd)) : '', 'חזיתות'],
      [d.gallons != null ? mono(nf(d.gallons) + (d.gallons_planned ? '/' + nf(d.gallons_planned) : '')) : '', 'גלון']];
    return `<div class="tbody">${kpiRow(k)}
      ${crew.length ? `<div class="chips">${crew.map(c => `<span class="tchip">${esc(first(c.user_id))}${c.user_id === d.crew_lead_id ? leadMark() : ''}${c.hours ? ' ' + mono(nf(c.hours)) : ''}</span>`).join('')}</div>` : ''}
      ${phs.length ? `<div class="photos" data-dph="${d.id}">${phs.slice(0, 4).map(() => '<span class="ph sk"></span>').join('')}</div><small class="muted">${[b ? 'לפני ' + b : '', a ? 'אחרי ' + a : ''].filter(Boolean).join(' · ')}</small>` : ''}
      ${d.report_text || d.notes ? `<p class="trep">${esc(d.report_text || d.notes)}</p>` : ''}
      ${IG.length ? `<div class="tsub"><b>תקלות היום</b>${IG.map(x => `<button type="button" class="tline" data-iss="${x.key}"><span class="odot bad"></span><span class="grow">${esc(x.title)}</span>${x.xs.length > 1 ? mono('×' + x.xs.length) : ''}</button>`).join('')}</div>` : iss.length ? `<small class="muted">${iss.length} תקלות טופלו</small>` : ''}
      ${mi.length ? `<div class="tsub"><b>חוסרים מהיציאה</b><div class="chips">${mi.map(m => `<span class="tchip ${m.status === 'handled' ? '' : 'warn'}">${esc(m.item)}</span>`).join('')}</div></div>` : ''}
      ${tleft.length ? `<div class="tsub"><b>משימות שנשארו</b>${tleft.map(t => `<small>${esc(t.title)}</small>`).join('')}</div>` : ''}
      <a class="more" href="#/day/${d.id}">יום השטח המלא</a></div>`;
  }
  async function fillDay(r) {
    if (!r) return;
    if (r.legacy) { const P = (r.legacy.photos || []).filter(Boolean); if (!P.length) return; const u = await signedUrls('media', P).catch(() => ({})); const b = $(`[data-lph="${r.id}"]`, el); if (b) { b.innerHTML = P.filter(x => u[x]).map(x => `<button type="button" class="ph" data-z="${esc(u[x])}"><img src="${esc(u[x])}" alt="" loading="lazy"></button>`).join(''); $$('[data-z]', b).forEach(z => z.onclick = () => zoom(z.dataset.z, '')); } return; }
    const phs = D.ph.filter(x => x.work_day_id === r.id); if (!phs.length) return;
    const pick = [...phs.filter(x => x.kind === 'before').slice(0, 2), ...phs.filter(x => x.kind === 'after').slice(-2)];
    const u = await thumbUrls('field', pick.map(x => x.storage_path)).catch(() => ({})), b = $(`[data-dph="${r.id}"]`, el); if (!b) return;
    b.innerHTML = pick.filter(x => u[x.storage_path]).map(x => `<button type="button" class="ph" data-z="${esc(u[x.storage_path].f)}"><img src="${esc(u[x.storage_path].t)}" alt="" loading="lazy"><span class="q">${x.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join('');
    $$('[data-z]', b).forEach(z => z.onclick = () => zoom(z.dataset.z, ''));
  }
  // שיבוץ מתחיל מטווח מאנדי (או מהתאריך שנבחר בלוח השיבוץ)
  // שיבוץ מחדש: הימים שכבר מתוכננים = הפעימות שלהם (ימי עבודה רצופים מקובצים). אחרת — הפעימות/הטווח של הפרויקט מהיום והלאה
  const openSched = (from = null) => {
    if (!from) {
      const t = isoDay(), pl = D.days.filter(d => d.status === 'planned' && d.day >= t).map(d => d.day);
      const fut = (pl.length ? groupDays(pl) : projPulses(p).filter(r => r[1] >= t).map(([f, e]) => [f < t ? t : f, e]));
      if (fut.length > 1 || pl.length) return scheduleSheet({ pulses: fut });
    }
    const st = from || (p.planned_from && p.planned_from >= isoDay() ? p.planned_from : isoDay()); scheduleSheet({ start: st, end: p.planned_to && p.planned_to >= st ? p.planned_to : undefined }); };
  function bindSched(box) {
    const ds = $('#dates', box); if (ds) ds.onclick = () => sheet(`<h3 class="sh">תאריכי הפרויקט</h3>
      <div id="dpl" class="pulses"></div><div class="small muted" id="dpn"></div>
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="dgo">שמירת התאריכים</button></div>`, (s2, close) => {
      const ed = pulseEditor($('#dpl', s2), projPulses(p), (pl, bad) => { $('#dgo', s2).disabled = bad || !pl.length;
        $('#dpn', s2).textContent = pl.length ? `${pl.length > 1 ? pl.length + ' פעימות · ' : ''}${pulseWd(pl)} ימי עבודה` : ''; });
      $('#dgo', s2).onclick = async e => { const pl = ed.get(); if (ed.bad()) return toast('הסיום לפני ההתחלה'); if (!pl.length) return toast('בחרו תאריך');
        const f = pl[0][0], to = pl.at(-1)[1];
        e.target.disabled = true; const { data: n, error } = pl.length > 1 ? await sb.rpc('set_project_pulses', { p: id, pulses: pl }) : await sb.rpc('set_project_dates', { p: id, d_from: f, d_to: to });
        if (error) { e.target.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
        close(); toast(n ? `התאריכים עודכנו · ${n} ימי שטח הוזזו` : 'התאריכים עודכנו'); reload('o'); };
    });
    const sm = $('#schm', box); if (sm) sm.onclick = () => openSched();
    // עריכה = ניהול היום: שעות (יציאה/הגעה/סיום באתר), יום קדימה לכל הפרויקט, יום פנוי בלחיצה, או תאריך אחר. גם ביום שהתחיל — שעות וצוות
    $$('[data-mv]', box).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); import('./dayadmin.js').then(m => m.openDayAdmin(b.dataset.mv, () => reload('o'))); });
  }
  // ----- מוכנות לביצוע: כל מה שצריך כדי לצאת לשטח, ברשימה אחת. אוטומטי מהנתונים; מה שאין לו מקור (מרחב אווירי, כניסה, מים) — סימון בלחיצה -----
  // סימון ידני תקף לימי השטח שתוכננו כשסומן; שינוי תאריכים = מתאמים מחדש
  // הרשימה מחושבת בשרת (project_readiness, db/095b) — אותו ציון כמו ברשימת הפרויקטים ובסיכום הערב. כאן רק מוסיפים לאן כל שורה מובילה + תחזית חיה
  let wxExtra = null;
  function readyItems() {
    const R = D.ready; if (!M || !R?.items) return null;
    const st = linkedSite(), specHref = () => { const B = st?.buildings || [], sl = st?.slug || p.sites?.slug; return st?.kind === 'lead' && B.length === 1 ? `#/b/${sl}/${B[0].id}` : '#/site/' + sl; };
    const A = { site: () => ({ act: 'site' }), spec: x => ({ href: x.ok ? `#/p/${id}/a` : specHref() }), plan: x => ({ href: x.ok ? `#/plan/${id}` : `#/p/${id}/t` }), sched: () => ({ act: 'sched' }) };
    const out = R.items.map(x => ({ ...x, ...(A[x.k]?.(x) || {}), ...(x.day ? { act: 'day:' + x.day } : {}), ...(x.tog ? { tog: x.k } : {}) }));
    if (wxExtra && !out.some(x => x.k === 'wx')) out.splice(out.findIndex(x => x.k === 'drone') + 1 || out.length, 0, wxExtra);
    return { out, up: R.up || [] };
  }
  // תחזית ליום השטח הבא: "לא לטוס" נכנס לרשימה גם לפני שהשרת שלח התראה
  async function readyWx(box) {
    const R = D.ready, sid = p.site_id, nid = R?.items?.find(x => x.k === 'drone')?.day;
    if (!R?.next || !sid || !nid || R.items.some(x => x.k === 'wx') || !(p.sites?.lat || p.lat)) return;
    const { siteDays } = await import('../lib/wx.js');
    const x = (await siteDays([{ id: sid, lat: p.sites?.lat || p.lat, lng: p.sites?.lng || p.lng }]))[sid]?.[R.next];
    if (!x || x.L < 2) return;
    wxExtra = { k: 'wx', ok: false, bad: true, t: 'תחזית לא לטוס', s: `${dayLabel(R.next)} · משבים ${Math.round(x.g)} קמ״ש${x.r >= 2 ? ` · גשם ${x.r.toFixed(1)}` : ''}`, act: 'day:' + nid };
    const sec = $('#ready', box); if (sec) { sec.outerHTML = readySection(); bindReady(box); }
  }
  function readySection() {
    const r = readyItems(); if (!r) return '';
    const okN = r.out.filter(x => x.ok).length, all = okN === r.out.length;
    const row = (x, i) => { const tag = x.tog || x.act ? 'button' : x.href ? 'a' : 'div';
      return `<${tag} class="rdy ${x.ok ? 'on' : x.bad ? 'bad' : ''}" ${tag === 'a' ? `href="${esc(x.href)}"` : tag === 'button' ? `type="button" data-rdy="${i}"` : ''}><span class="rbox">${x.ok ? icon('check', 16) : x.bad ? '!' : ''}</span>
        <span class="grow"><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</span>${x.tog ? `<span class="rtog">${x.ok ? 'ביטול' : 'תואם'}</span>` : tag !== 'div' ? `<span class="chev">${icon('chev', 16)}</span>` : ''}</${tag}>`; };
    return `<section id="ready" class="${all ? 'allok' : ''}"><div class="sh-row"><h3 class="sh">${all ? 'מוכנים לשטח' : 'מוכנות לביצוע'}</h3><span class="count ${all ? 'ok' : ''}">${okN}/${r.out.length}</span></div>
      <div class="rdylist">${all ? `<button type="button" class="rdy on" id="rdyall"><span class="rbox">${icon('check', 16)}</span><span class="grow"><b>הכל מוכן</b><small>${r.out.map(x => x.t).join(' · ')}</small></span><span class="chev">${icon('chev', 16)}</span></button><div hidden id="rdyrows">${r.out.map(row).join('')}</div>` : r.out.map(row).join('')}</div></section>`;
  }
  function bindReady(box) {
    const r = readyItems(); if (!r) return;
    const all = $('#rdyall', box); if (all) all.onclick = () => { all.remove(); $('#rdyrows', box).hidden = false; };
    $$('[data-rdy]', box).forEach(b => b.onclick = async e => {
      e.preventDefault(); const x = r.out[+b.dataset.rdy]; if (!x || b.disabled) return;
      if (x.act === 'site') return siteSheet();
      if (x.act === 'sched') return openSched();
      if (x.act?.startsWith('day:')) return import('./dayadmin.js').then(m => m.openDayAdmin(x.act.slice(4), () => reload('o')));
      if (x.tog) { b.disabled = true;
        const { data, error } = await sb.rpc('set_readiness', { p: id, k: x.tog, on_: !x.ok, days: r.up });
        if (error) { b.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
        p.readiness = data || {}; D.ready = (await sb.rpc('project_readiness', { p: id })).data || D.ready; cache.set(ck, D).catch(() => {}); toast(x.ok ? `${x.t} — בוטל` : `${x.t} — תואם`, 1600, x.ok ? 'light' : 'success');
        const sec = $('#ready', box); if (sec) { sec.outerHTML = readySection(); bindReady(box); } }
    });
  }
  // ----- פרטים: לקוח, היקף, אתר, דגשים לצוות, אנשי קשר, ניווט, קישור התקדמות ללקוח -----
  function infoBox(box) {
    const f = D.fin, s = p.sites;
    const kv = (ic, label, val, act = '') => `<div class="lrow kv" ${act ? `data-act="${act}" role="button" tabindex="0"` : ''}><span class="mic">${icon(ic, 19)}</span><span class="grow"><small>${label}</small><b>${val}</b></span>${act ? `<span class="chev">${icon('chev', 18)}</span>` : ''}</div>`;
    box.innerHTML = `<div class="menu">
        ${M && p.client_id ? `<a class="lrow kv" href="#/client/${p.client_id}"><span class="mic">${icon('users', 19)}</span><span class="grow"><small>לקוח</small><b>${esc(p.client_name || '')}</b></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
        ${p.scope ? kv('report', 'היקף', esc(noMoney$(p.scope))) : ''}
        ${kv('pin', 'אתר', s ? esc(s.name) + (s.address ? ` <span class="muted small">· ${esc(s.address)}</span>` : '') : '<span class="muted">לא משויך</span>', M ? 'site' : '')}
        ${M && p.site_id ? '<button class="lrow kv" type="button" id="sban" hidden></button>' : ''}
        ${p.work_notes ? kv('clipboard', 'דגשים לצוות', esc(noMoney$(p.work_notes)).replace(/\n/g, '<br>'), M ? 'notes' : '') : M ? `<div class="lrow kv" data-act="notes" role="button" tabindex="0"><span class="mic">${icon('plus', 19)}</span><span class="grow"><span class="muted">הוספת דגשים לצוות</span></span></div>` : ''}
        ${p.summary ? kv('chat', 'תמונת ביצוע', esc(p.summary)) : ''}
        ${ADMIN() && f ? kv('shield', 'כספים', `${f.price_net ? '₪' + nf(f.price_net) + ' נטו' : '—'}${f.gross_pct ? ` · רווח ${nf(f.gross_pct)}%` : ''}${f.payment_status ? ' · ' + esc(f.payment_status) : ''}`) : ''}
        ${M ? `<button class="lrow kv" id="share" type="button"><span class="mic">${icon('send', 19)}</span><span class="grow"><b>קישור התקדמות ללקוח</b></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
      </div>
      <div id="pjcontacts"></div>
      ${s?.lat || p.lat ? navButtons(s?.lat || p.lat, s?.lng || p.lng) : ''}
      ${M ? '<div class="sigline" id="sig"></div>' : ''}`;
    if (M) import('../lib/audit.js').then(m => m.signature($('#sig', box), { project_id: id }));
    $$('[data-act]', box).forEach(r => r.onclick = () => r.dataset.act === 'site' ? siteSheet() : notesSheet());
    if (p.site_id) import('../lib/contacts.js').then(m => m.renderContacts($('#pjcontacts', box), { siteId: p.site_id, clientId: p.client_id, org: p.client_name || p.sites?.name, title: 'אנשי קשר באתר', empty: p.sites?.contact_name ? contactCard(p.sites.contact_name, p.sites.contact_phone) : '' }));
    const sh = $('#share', box); if (sh) sh.onclick = shareSheet;
    const sbn = $('#sban', box); if (sbn) import('./compliance.js').then(m => m.banRow(sbn, p.site_id, s?.name || '', D.team)).catch(() => {});   // לא לשבץ באתר הזה (db/122)
    bindCopy(box);
  }
  // ----- שעות עבודה מהנוכחות + מ״ר לשעה (מנהלים). עלויות — רק admin -----
  function hoursBox(box) {
    box.innerHTML = `<div id="zrate"></div><div id="labor"></div><div id="costx"></div>`;
    import('./zones.js').then(m => m.projectRate($('#zrate', box), id)).catch(() => {});   // מ״ר לשעה (db/112)
    laborBlock();
    if (ADMIN()) import('./costs.js').then(m => m.projectCost($('#costx', box), id)).catch(() => {});   // עלות בפועל — admin בלבד (db/129)
  }
  function drawMain() {
    drawStatus(); drawOpen(); drawDays();
    const rb = $('#pjready', el); if (rb) { rb.innerHTML = upcoming().length ? readySection() : ''; bindReady(rb); readyWx(rb).catch(() => {}); }
    // סיכומי השורות המקופלות
    const nums = [...new Set([...D.tasks.filter(t => t.phase !== 'מעקב' && t.day_no).map(t => t.day_no), ...D.pdays.map(r => r.day_no)])];
    const pm = $('#fplanm', el); if (pm) pm.textContent = nums.length ? `${nums.length} ימים` : '';
    if (!nums.length && !M && !D.tasks.some(t => t.phase !== 'מעקב')) $('#fplan', el)?.setAttribute('hidden', '');
  }
  async function shareSheet() {
    const { data: list } = await sb.from('project_shares').select('*').eq('project_id', id).eq('revoked', false).order('created_at', { ascending: false });
    const url = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?t=' + t;
    const active = (list || []).filter(x => new Date(x.expires_at) > new Date());
    sheet(`<h3>קישור התקדמות ללקוח</h3>
      ${active.map(x => `<div class="lrow"><span class="grow"><b dir="ltr" class="url">${esc(url(x.token))}</b><small>נפתח ${x.views} פעמים · בתוקף עד ${new Date(x.expires_at).toLocaleDateString('he-IL')}</small></span>
        <span class="stack tight"><button class="chip" data-cp="${x.token}">העתקה</button><button class="chip" data-rv="${x.token}">ביטול</button></span></div>`).join('')}
      <div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="mk">${active.length ? 'קישור חדש' : 'יצירת קישור'}</button></div>`, (s2, close) => {
      const copy = async t => { try { if (navigator.share) await navigator.share({ title: p.name, url: url(t) }); else { await navigator.clipboard.writeText(url(t)); toast('הקישור הועתק'); } } catch { } };
      $$('[data-cp]', s2).forEach(b => b.onclick = () => copy(b.dataset.cp));
      $$('[data-rv]', s2).forEach(b => b.onclick = async () => { await sb.from('project_shares').update({ revoked: true }).eq('token', b.dataset.rv); close(); toast('הקישור בוטל'); });
      $('#mk', s2).onclick = async () => { const { data, error } = await sb.from('project_shares').insert({ project_id: id, created_by: state.user.id }).select().single(); if (error) return toast(errText(error, 'הקישור לא נוצר — נסו שוב')); close(); copy(data.token); shareSheet(); };
    });
  }
  function siteSheet() {
    sheet(`<h3>שיוך לאתר</h3>
      <div class="list">${D.sites.map(x => `<button class="lrow" data-s="${x.id}"><span class="grow"><b>${esc(x.name)}</b></span>${x.id === p.site_id ? '<span class="pill lime">משויך</span>' : ''}</button>`).join('')}</div>
      <button class="btn ghost block" data-close>ביטול</button>`, (sh, close) => {
      $$('[data-s]', sh).forEach(b => b.onclick = async () => { const { error } = await sb.from('projects').update({ site_id: b.dataset.s }).eq('id', id); if (error) return toast(errText(error, 'השיוך לא נשמר — נסו שוב')); close(); toast('שויך לאתר'); reload('o'); });
    });
  }
  function notesSheet() {
    sheet(`<h3>דגשים לצוות</h3>
      <textarea id="wn" rows="5">${esc(p.work_notes || '')}</textarea>
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="wns">שמירה</button></div>`, (sh, close) => {
      $('#wns', sh).onclick = async () => { const v = $('#wn', sh).value.trim() || null; await enqueue({ kind: 'update', table: 'projects', rowId: id, patch: { work_notes: v } }); p.work_notes = v; close(); toast('נשמר'); const ib = $('#pjinfo', el); if (ib) infoBox(ib); };
    });
  }
  async function closeIssue(iid, redraw) {
    const r = await ask('איך טופל?', { multiline: true, placeholder: 'מה נעשה כדי לפתור', ok: 'סגירת התקלה' }); if (r == null) return;
    const i = D.issues.find(x => x.id === iid); Object.assign(i, { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: new Date().toISOString() });
    await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: i.closed_at } }); redraw();
  }

  // ----- תכנית עבודה -----
  // בונים תכנית רק מאפיון שהושלם עם ימים; אחרת — שורה שמובילה לאפיון החסר
  const linkedSite = () => D.sites.find(x => x.id === p.site_id);
  const specOf = b => Array.isArray(b.specs) ? b.specs[0] : b.specs;
  const specReady = () => { const st = linkedSite(); return !st || (st.buildings || []).some(b => specOf(b)?.status === 'done' && Number(specOf(b)?.days_expected) > 0); };
  const specMissing = () => { const st = linkedSite(), B = st.buildings || [], sl = st.slug || p.sites?.slug;
    const href = st.kind === 'lead' && B.length === 1 && B[0].id && specOf(B[0])?.status !== 'done' ? `#/b/${sl}/${B[0].id}` : '#/site/' + sl;
    return `<div class="list"><a class="lrow" href="${esc(href)}"><span class="mic">${icon('clipboard', 19)}</span><span class="grow"><b>אפיון חסר</b></span><span class="chev">${icon('chev', 18)}</span></a></div>`; };
  // ----- תכנית עבודה (נפרדת מהאפיון, אביחי 18/10): החלוקה לימים, המבנים/החזיתות לכל יום ושיטת העבודה. המקור: #/plan + המשימות לפי יום -----
  function planBox(box) {
    const all = D.tasks; D.tasks = all.filter(t => t.phase !== 'מעקב');   // משימות ימי העבודה; פריטי מעקב — ב"פתוח"
    const by = new Map(); D.tasks.forEach(t => { const k = t.day_no ?? 0; if (!by.has(k)) by.set(k, []); by.get(k).push(t); });
    const dayOf = n => D.days.find(d => D.tasks.some(t => t.day_no === n && t.work_day_id === d.id));
    const tot = D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const blocked = D.tasks.filter(t => t.status === 'blocked');
    const R = new Map(D.pdays.map(r => [r.day_no, r]));
    const nums = [...new Set([...[...by.keys()].filter(Boolean), ...R.keys()])].sort((a, b) => a - b);
    const line = n => { const ts = by.get(n) || [], ex = ts.filter(t => t.phase === 'ביצוע');
      const txt = [...new Set((ex.length ? ex : ts).map(t => t.title))].slice(0, 2).join(' · ') || (R.get(n)?.body || '').split('\n')[0].replace(/^[•\-\s]+/, '');
      const wd = dayOf(n), dn = ts.filter(t => t.status === 'done').length;
      return `<a class="lrow" href="#/plan/${id}"><span class="datebox"><b>${n}</b><small>יום</small></span><span class="grow"><b>${esc(txt || 'יום ' + n)}</b><small>${wd ? esc(dayLabel(wd.day)) : 'עוד לא שובץ'}${ts.length ? ` · ${mono(dn + '/' + ts.length)}` : ''}</small></span><span class="chev">${icon('chev', 16)}</span></a>`; };
    box.innerHTML = `${nums.length ? `<div class="list">${nums.map(line).join('')}</div>` : M ? '<div class="empty-line">אין תכנית עבודה</div>' : ''}
      <a class="btn ghost block" href="#/plan/${id}">${icon('report', 18)} התכנית המלאה ושיטת העבודה</a>
      ${M && p.site_id ? (specReady() ? `<button class="btn ${D.tasks.length ? 'ghost' : 'primary'} block" id="gen">${D.tasks.length ? 'בנייה מחדש מהאפיון' : 'בניית תכנית עבודה מהאפיון'}</button>` : specMissing()) : ''}
      ${D.tasks.length ? `<details class="fold sub"><summary><span class="sh">משימות לפי יום</span><span class="count">${tot}</span></summary><div class="stack">
        ${tot ? `<div class="card row"><div class="ring" style="--p:${Math.round(done / tot * 100)}"><b>${Math.round(done / tot * 100)}%</b></div><div class="grow"><b>${done} מתוך ${tot} משימות</b><div class="small muted">${by.size} ימי עבודה בתכנית${blocked.length ? ` · ${blocked.length} נתקעו` : ''}</div></div></div>` : ''}
        ${blocked.length ? `<div class="stack tight"><h3>נתקעו</h3>${blocked.map(taskRow).join('')}</div>` : ''}
        ${[...by.entries()].sort((a, b) => a[0] - b[0]).map(([n, ts]) => { const wd = dayOf(n); const dn = ts.filter(t => t.status === 'done').length;
          return `<div class="stack tight"><div class="row"><h3 class="grow">${n ? 'יום ' + n : 'בלי יום'}${wd ? ` · ${dayLabel(wd.day)}` : ''}</h3><span class="pill ${dn === ts.length ? 'ok' : ''}">${dn}/${ts.length}</span></div>${dayBrief(wd, ts)}${ts.map(taskRow).join('')}</div>`; }).join('')}
      </div></details>` : ''}`;
    const g = $('#gen', box); if (g) g.onclick = async () => {
      if (D.tasks.length && !(await confirmBox('לבנות את התכנית מחדש?', { body: 'משימות שכבר התחילו או בוצעו נשארות כמו שהן.', ok: 'בנייה מחדש' }))) return;
      g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: id }); if (error) { g.disabled = false; return toast(errText(error, 'התכנית לא נבנתה — נסו שוב'), 4000); }
      toast(`נבנתה תכנית ל-${data} ימי עבודה`); location.hash = `#/plan/${id}`;
    };
    bindTasks(box, () => { D.tasks = all; planBox(box); refresh(); });
    D.tasks = all;
  }
  // תקציר יום: סדר חזיתות לפי השמש (כשיש תאריך), חומר וכמות, לוגיסטיקה מהאפיון
  function dayBrief(wd, ts) {
    const exec = ts.filter(t => t.phase === 'ביצוע' && t.status !== 'done');
    const out = [];
    const night = isNight(wd) || (wd?.site_arrival && (+wd.site_arrival.slice(0, 2) >= 18 || +wd.site_arrival.slice(0, 2) < 5));
    if (night) out.push(`<small><b>עבודת לילה</b> · ${esc(isNight(wd) ? nightRange(wd) : 'באתר ' + wd.site_arrival.slice(0, 5))}</small>`);
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
    return `<button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? icon('check', 16) : t.status === 'blocked' ? icon('alert', 14) : ''}</span><span class="t"><b>${esc(t.title)}</b>
      <small>${esc([t.phase, t.review === 'pending' ? 'ממתין לאישור' : T_STATUS[t.status]?.[0], t.status_note].filter(Boolean).join(' · '))}</small>${t.risk && t.status !== 'done' ? `<small class="issue">${esc(t.risk)}</small>` : ''}</span></button>`;
  }
  function bindTasks(box, redraw) {
    $$('[data-t]', box).forEach(b => {
      let timer, long = false; const t = D.tasks.find(x => x.id === b.dataset.t);
      b.onpointerdown = () => { long = false; timer = setTimeout(async () => { long = true; const note = await ask('מה תקוע?', { value: t.status_note || '', placeholder: 'למשל: מחכים למפתח לגג', ok: 'סימון כנתקע' }); if (note == null) return; Object.assign(t, { status: 'blocked', status_note: note }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: { status: 'blocked', status_note: note } }); redraw(); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = async () => { if (long) return; t.status = NEXT[t.status]; const patch = { status: t.status }; if (t.status === 'done') Object.assign(patch, { done_by: state.user.id, done_at: new Date().toISOString() }); await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch }); redraw(); };
    });
  }

  async function scheduleSheet(pre = {}) {
    const { data: teams } = await sb.from('teams').select('id,name,pilot_id,operator_id,lead_id').eq('active', true).order('sort');
    const maxDay = Math.max(0, ...D.tasks.map(t => t.day_no || 0)) || Number(p.field_days_planned) || 1;
    // תאריך סיום ← מספר ימי עבודה (בלי שבת, ושישי רק אם סומן). הפוך: התחלה + n ימי עבודה ← תאריך סיום
    const workday = (d, fri) => { const g = new Date(d + 'T12:00').getDay(); return g !== 6 && (g !== 5 || fri); };
    const endOf = (st, n) => { let d = st, k = 0; for (let g = 0; g < 90; g++) { if (workday(d, false) && ++k >= n) return d; const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + 1); d = isoDay(x); } return d; };
    let start = pre.start || (() => { const d = new Date(Date.now() + 864e5); while ([5, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return isoDay(d); })();
    // שיבוץ מחדש: אותו צוות, רחפן ושעות כמו בימים שכבר מתוכננים. ראש צוות ברירת מחדל = ראש צוות לפי תפקיד
    const prev = D.days.filter(d => d.status === 'planned' && d.day >= isoDay()).sort((a, b) => a.day < b.day ? -1 : 1)[0];
    const leads = [...D.team].sort((a, b) => (b.role === 'crew_lead') - (a.role === 'crew_lead'));   // אביחי 12/10: כל אחד מהצוות יכול להיות ראש צוות
    const leadDef = prev?.crew_lead_id || leads[0]?.id, crewDef = new Set((prev?.work_day_crew || []).map(c => c.user_id).filter(u => u !== prev.crew_lead_id));
    const droneDef = D.drones.find(x => x.id === prev?.drone_id && x.health !== 'grounded')?.id;
    const dTag = x => x.health === 'grounded' ? ' — מקורקע' : x.health === 'warning' ? ' — במעקב' : '';
    sheet(`<h3>שיבוץ ימי שטח</h3>
      <div id="spl" class="pulses"></div>
      <input type="hidden" id="sn" value="${pre.n || maxDay}"><div class="small muted" id="snn"></div>
      ${(teams || []).length ? `<div class="field">צוות<div class="chips">${teams.map(t => `<button type="button" class="chip" data-team="${t.id}" aria-pressed="false">${esc(t.name)}</button>`).join('')}</div></div>` : ''}
      <label class="field">ראש צוות<select id="sl">${leads.map(x => `<option value="${x.id}" data-n="${esc(x.full_name)}" ${x.id === leadDef ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
      <div class="field">צוות<div class="chips">${D.team.map(x => `<button class="chip" data-u="${x.id}" aria-pressed="${crewDef.has(x.id)}"><span>${esc(x.full_name)}</span><small class="why"></small></button>`).join('')}</div></div>
      <label class="field">רחפן<select id="sdr"><option value="">בלי רחפן</option>${D.drones.map(x => `<option value="${x.id}" data-n="${esc(x.name)}" data-w="${dTag(x)}" ${x.health === 'grounded' ? 'disabled' : x.id === droneDef ? 'selected' : ''}>${esc(x.name)}${dTag(x)}</option>`).join('')}</select></label>
      ${dtPickHtml('sdt', 'work')}
      ${nightToggleHtml('snt', isNight(prev))}
      <div class="row"><label class="field grow" id="lsa">הגעה לאתר<input type="time" id="sa" value="${(prev?.site_arrival || '07:00').slice(0, 5)}"></label><label class="field grow" id="lse">סיום באתר<input type="time" id="se" value="${(prev?.site_end || '').slice(0, 5)}"></label></div>
      <label class="field">יציאה מהמשרד<small id="sthint">מחשב לפי מרחק…</small><input type="time" id="st" value="${(prev?.report_time || '06:00').slice(0, 5)}"></label>
      <label class="tog"><span>כולל שישי</span><span class="sw"><input type="checkbox" id="sfr"><i></i></span></label>
      <div class="field">תחזית<div id="wxs" class="wxs"><div class="small muted">בודק תחזית…</div></div></div>
      ${D.days.some(d => d.status === 'planned') ? '<div class="note">ימים מתוכננים יוחלפו</div>' : ''}
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="sgo">שיבוץ</button></div>`, (s, close) => {
      // ראש הצוות מסומן בצוות בכוכב; לחיצה כפולה על אדם = הופך לראש צוות (הבחירה הרגילה — ברשימה למעלה)
      const markLead = () => { const L = $('#sl', s).value; $$('[data-u]', s).forEach(c => { const me = c.dataset.u === L; c.classList.toggle('islead', me); if (me) c.setAttribute('aria-pressed', 'true'); }); };
      $$('[data-u]', s).forEach(c => { c.onclick = () => { if (c.dataset.u === $('#sl', s).value) return; c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'); };
        c.ondblclick = () => { const sl = $('#sl', s), o = [...sl.options].find(x => x.value === c.dataset.u); if (o && !o.disabled) { sl.value = c.dataset.u; markLead(); } }; });
      $('#sl', s).onchange = markLead; markLead();
      $$('[data-team]', s).forEach(c => c.onclick = () => {
        const t = teams.find(x => x.id === c.dataset.team); $$('[data-team]', s).forEach(x => x.setAttribute('aria-pressed', x === c));
        const sel = $('#sl', s); if (t.lead_id && [...sel.options].some(o => o.value === t.lead_id && !o.disabled)) sel.value = t.lead_id;
        $$('[data-u]', s).forEach(x => x.setAttribute('aria-pressed', !x.disabled && [t.pilot_id, t.operator_id].includes(x.dataset.u) && x.dataset.u !== sel.value));
        markLead();
      });
      // זמינות בטווח שנבחר: חופש / לא יכול להגיע / משובץ בפרויקט אחר → לא ניתן לבחירה, עם הסיבה
      let avSeq = 0;
      const applyAv = async () => {
        // זמינות לכל פעימה בנפרד (לא לחסום מישהו שתפוס רק בהפסקה שבין הפעימות), ואיחוד: חוסם בפעימה אחת = חוסם
        const PLx = curPl(); if (!PLx.length) return;
        const my = ++avSeq, avs = await Promise.all(PLx.map(([a, b]) => availability(a, b, { project: id, drones: D.drones, night: !!$('#snt', s)?.checked }).catch(() => null))); if (avs.some(x => !x) || my !== avSeq) return;
        const first = k => v => avs.map(x => x[k]?.(v) || '').find(Boolean) || '';
        const av = { person: first('person'), drone: first('drone') }; av.warn = u => av.person(u) ? '' : first('warn')(u); av.droneWarn = v => av.drone(v) ? '' : first('droneWarn')(v);
        $$('[data-u]', s).forEach(c => { const why = av.person(c.dataset.u), wn = av.warn?.(c.dataset.u) || ''; c.disabled = !!why; if (why) c.setAttribute('aria-pressed', 'false'); $('.why', c).textContent = why || wn; c.classList.toggle('cwarn', !why && !!wn); });
        const sl = $('#sl', s); [...sl.options].forEach(o => { const why = av.person(o.value), wn = av.warn?.(o.value) || ''; o.disabled = !!why; o.textContent = o.dataset.n + (why ? ' — ' + why : wn ? ' · ⚠ ' + wn : ''); });
        if (sl.selectedOptions[0]?.disabled) { const ok = [...sl.options].find(o => !o.disabled); if (ok) sl.value = ok.value; }
        markLead();
        const dr = $('#sdr', s); [...dr.options].forEach(o => { if (!o.value) return; const why = av.drone(o.value), wn = av.droneWarn?.(o.value) || ''; o.disabled = !!why; o.textContent = o.dataset.n + (why ? ' — ' + why : o.dataset.w + (wn ? ' · ⚠ ' + wn : '')); });
        if (dr.selectedOptions[0]?.disabled) dr.value = '';
        if (!dr.value && !drTouched) { const ok = [...dr.options].find(o => o.value && !o.disabled); if (ok) dr.value = ok.value; }   // ברירת מחדל: הרחפן הראשון שפנוי בכל הטווח
      };
      let drTouched = false; $('#sdr', s).addEventListener('change', () => { drTouched = true; });
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
      // ימי העבודה בכל הפעימות; יום שמדולג בגלל תחזית נדחה לסוף הפעימה האחרונה (כמו בטווח אחד)
      const plan = () => {
        const n = +$('#sn', s).value || 1, out = [], PLx = curPl(); if (!PLx.length) return out;
        const fri = $('#sfr', s).checked, okDay = d => { const g = new Date(d + 'T12:00').getDay(); return g !== 6 && (g !== 5 || fri); };
        const push = d => { const w = wxFor(d), bad = w && (w.g >= 35 || w.w >= 25 || w.r >= 2); out.push({ d, w, bad, skip: manual.has(d) ? manual.get(d) : !!bad }); };
        for (const [f, t] of PLx) for (let d = f; d <= t && out.length < 120; d = add1(d)) if (okDay(d)) push(d);
        for (let d = add1(PLx.at(-1)[1]), guard = 0; out.filter(x => !x.skip).length < n && guard < 60; guard++, d = add1(d)) if (okDay(d)) push(d);
        return out;
      };
      const drawWx = () => {
        const list = plan();
        $('#wxs', s).innerHTML = (lat ? '' : '<div class="small muted">אין מיקום לאתר</div>')
          + list.map(x => `<button type="button" class="wxday ${x.skip ? 'skip' : ''} ${x.bad ? 'bad' : ''}" data-wd="${x.d}"><b>${dayLabel(x.d)}</b><small>${x.w ? `משבים ${Math.round(x.w.g)}${x.w.r >= 0.5 ? ` · גשם ${x.w.r.toFixed(1)}` : ''}` : 'אין תחזית עדיין'}</small><small>${x.skip ? 'מדולג' : 'עבודה'}</small></button>`).join('');
        $$('[data-wd]', s).forEach(b => b.onclick = () => { const x = list.find(y => y.d === b.dataset.wd); manual.set(x.d, !x.skip); drawWx(); });
      };
      let PLcur = [], PLbad = false; const curPl = () => PLcur;
      const syncN = () => { $('#sgo', s).disabled = PLbad || !PLcur.length; if (!PLcur.length) { $('#snn', s).textContent = ''; return; }
        const n = pulseWd(PLcur, $('#sfr', s).checked);
        $('#sn', s).value = n || 1; $('#snn', s).textContent = `${PLcur.length > 1 ? PLcur.length + ' פעימות · ' : ''}${n || 1} ימי שטח`; drawWx(); applyAv(); };
      pulseEditor($('#spl', s), pre.pulses?.length ? pre.pulses : [[start, pre.end || endOf(start, pre.n || maxDay)]], (pl, bad) => { PLcur = pl; PLbad = bad; syncN(); });
      $('#sfr', s).onchange = syncN; $('#se', s).onchange = drawWx;
      // יציאה מהמשרד = הגעה − נסיעה (כביש × מקדם תנועה) − העמסה. המנהל יכול לשנות ידנית
      let travelMin = null, touched = !!prev?.report_time; const Dp = { office: [31.2203, 34.8041], office_name: 'המשרד', load_min: 20, traffic_factor: 1.15 };
      const recalc = () => {
        const a = hr('#sa'); if (a == null) return;
        const tot = (travelMin ?? 0) + Dp.load_min, dep = ((a * 60 - tot) % 1440 + 1440) % 1440, r5 = Math.floor(dep / 5) * 5;
        if (!touched) $('#st', s).value = `${String(Math.floor(r5 / 60)).padStart(2, '0')}:${String(r5 % 60).padStart(2, '0')}`;
        $('#sthint', s).textContent = travelMin != null ? `מומלץ: נסיעה ${Math.floor(travelMin / 60)}:${String(travelMin % 60).padStart(2, '0')} מ${Dp.office_name} + ${Dp.load_min} דק׳ העמסה` : lat ? 'מחשב מרחק…' : `${Dp.load_min} דק׳ העמסה`;
      };
      $('#sa', s).onchange = () => { recalc(); drawWx(); }; $('#st', s).oninput = () => { touched = true; };
      // עבודת לילה: ההגעה בערב, הסיום למחרת. היציאה מחושבת אחורה מההגעה (recalc), התחזית — על שעות הלילה (wxFor)
      const nightOn = bindNight(s, { tog: '#snt', arr: '#sa', end: '#se', lblA: '#lsa', lblE: '#lse' });
      const dtOf = bindDtPick(s, 'sdt');   // סוג היום — לכל הימים שמשובצים עכשיו (db/138)
      $('#snt', s).addEventListener('change', () => { if ($('#snt', s).checked) touched = false; recalc(); applyAv(); });   // לילה ↔ יום: אזהרת 'אחרי לילה' משתנה
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
        const crew = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u).filter(u => u !== $('#sl', s).value);
        if (PLbad) return toast('הסיום לפני ההתחלה');
        const days = plan().filter(x => !x.skip).map(x => x.d), PLx = curPl();
        // פעימה אחרונה שהתארכה בגלל דילוג תחזית — נשמרת עם היום האחרון בפועל
        const pulses = PLx.map(r => [...r]); if (days.length && pulses.length && days.at(-1) > pulses.at(-1)[1]) pulses.at(-1)[1] = days.at(-1);
        if (nightOn() && !$('#se', s).value) $('#se', s).value = '06:00';
        if (!nightOn() && $('#se', s).value && $('#sa', s).value && $('#se', s).value < $('#sa', s).value) return toast('הסיום לפני ההגעה — עבודת לילה?');
        const args = { p: id, days, lead: $('#sl', s).value, crew, drone: $('#sdr', s).value || null, report: $('#st', s).value || '06:00',
          arrive: $('#sa', s).value || null, shift_end: $('#se', s).value || null, pulses };
        if (!days.length || !args.lead || $('#sl', s).selectedOptions[0]?.disabled) return toast(days.length ? 'אין ראש צוות פנוי בתאריכים האלה' : 'חסר תאריך');
        const go = $('#sgo', s); go.disabled = true;
        const { data, error } = await sb.rpc('schedule_work_days_multi', args); if (error) { go.disabled = false; return toast(errText(error, 'השיבוץ לא נשמר — נסו שוב'), 4000); }
        if (dtOf() !== 'work') { const { error: e2 } = await sb.rpc('set_day_type', { t: dtOf(), p: id, days }); if (e2) toast(errText(e2, 'סוג היום לא נשמר'), 3000); }
        const np = mergePulses(pulses).length;
        close(); toast(np > 1 ? `שובצו ${data} ימי שטח ב-${np} פעימות` : `שובצו ${data} ימי שטח`); reload('o');
      };
    });
  }

  // ----- צ׳אט צוות (אחד, עם תתי-השיחות) -----
  async function chat(box) {
    box.innerHTML = `<div id="cx"></div>`;
    (await import('./chat.js')).renderWorkChat($('#cx', box), { project: p });
    const b = $('#fchatb', el); if (b) b.innerHTML = '';
  }

  // ----- סגירה: ימים נסגרו → חתימת לקוח (סוגרת את הפרויקט) → דוח ללקוח. הצעד הבא תמיד בולט -----
  function closeFlow(SG, cs, crq) {
    const lead = state.profile.role === 'crew_lead'; if (!M && !lead) return '';
    const open = D.days.filter(d => d.status !== 'done'), live = D.days.find(d => !['done', 'planned', 'cancelled'].includes(d.status));
    const daysOk = (D.days.length || D.reps.length) && !open.length;
    const doneN = D.days.length - open.length;
    const step = (n, ok, t, s, href, next) => `<a class="rdy rstep ${ok ? 'on' : next ? 'next' : ''}" ${href ? `href="${esc(href)}"` : ''}><span class="rbox">${ok ? icon('check', 16) : n}</span><span class="grow"><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span>${href ? `<span class="chev">${icon('chev', 16)}</span>` : ''}</a>`;
    const pilot = p.engagement === 'פיילוט';
    const rows = [
      step(1, daysOk, 'ימי השטח נסגרו', D.days.length ? `${doneN}/${D.days.length}${live ? ' · יום פתוח עכשיו' : open.length ? ` · הבא ${dm(open[0].day)}` : ''}` : D.reps.length ? `${D.reps.length} דוחות יומיים` : 'עוד אין ימי שטח', live ? `#/day/${live.id}` : '', false),
      step(2, !!SG.length, 'חתימת לקוח', SG.length ? esc(`${SG[0].name || ''}${SG[0].at ? ' · ' + dm(isoDay(new Date(SG[0].at))) : ''}`) : '', cs && !SG.length ? '' : `#/signoff/${id}`, daysOk && !SG.length),
      M ? step(3, !!SG.length, 'דוח ללקוח', SG.length ? 'מוכן · שיתוף ללקוח או PDF' : 'נבנה לבד מהחתימה · PDF · קולאז׳ לפני/אחרי', `#/client-report/${id}`, !!cs) : '',
      M ? step(4, false, 'סיכום פנימי', 'איכות, תקלות ולקחים — לפעם הבאה', `#/summary/${id}`, !!SG.length).replace('class="rdy rstep', 'id="sumstep" class="rdy rstep') : '',
    ];
    // דוח מוכן (יש חתימה) → שיתוף בלחיצה מכאן, בלי להיכנס לדוח (אותו קישור לקוח פעיל, או חדש)
    const shareBtn = M && SG.length ? `<button class="btn primary block" id="crshare">${icon('send', 18)} שיתוף הדוח ללקוח</button>` : '';
    const closeBtn = M && !cs && (pilot || (state.profile.role === 'admin' && !SG.length)) ? `<button class="btn ghost block" id="cls">${pilot ? 'סיום הפיילוט' : 'סגירה בלי חתימת לקוח'}</button>`
      // מנהל תפעול: בקשה לסגירה בלי חתימה — לאישור ההנהלה (db/143)
      : M && !cs && !pilot && !SG.length && crq?.status !== 'pending' ? `<button class="btn ghost block" id="clsreq">בקשה לסגירה בלי חתימת לקוח</button>` : '';
    return `<section><h3 class="sh">${cs ? 'אחרי הסגירה' : 'סגירת הפרויקט'}</h3><div class="rdylist">${rows.join('')}</div></section>${shareBtn}${closeBtn}`;
  }
  // ----- סיכום -----
  // ----- תיק הפרויקט: חתימת לקוח, דוח ללקוח, סיכום פנימי, סגירה, קבצים, ביקורים, לפני/אחרי -----
  async function fileBox(box) {
    const done = D.days.filter(d => d.status === 'done');
    const hrs = done.reduce((s, d) => s + (d.work_day_crew || []).reduce((a, c) => a + Number(c.hours || 0), 0), 0);
    const gal = done.reduce((s, d) => s + Number(d.gallons || 0), 0);
    const { data: sos } = await sb.from('project_signoffs').select('id,signer_name,signer_role,full_ok,rating,notes,signature_path,created_at,include,work_day_id').eq('project_id', id).order('created_at');
    // חתימות הלקוח: מהטבלה (כולל אילו ימים נכללו); חתימה ישנה שנשמרה רק על היום — כגיבוי
    const legacy = [...D.days].reverse().find(d => d.signoff)?.signoff;
    const SG = (sos || []).length ? sos.map(x => ({ name: x.signer_name, role: x.signer_role, ok: x.full_ok, rating: x.rating, notes: x.notes, path: x.signature_path, at: x.created_at,
      days: x.include?.days?.length ? x.include.days : x.work_day_id ? [D.days.find(d => d.id === x.work_day_id)?.day].filter(Boolean) : [] }))
      : legacy ? [{ name: legacy.name, role: legacy.role, ok: legacy.satisfied, notes: legacy.notes, path: legacy.signature_path, at: legacy.at, days: [] }] : [];
    const daysTxt = ds => { const x = [...ds].sort(); return !x.length ? '' : x.length === 1 ? dm(x[0]) : x.length <= 4 ? x.map(dm).join(', ') : `${x.length} ימים · ${dm(x[0])}–${dm(x.at(-1))}`; };
    const cs = p.closed_summary;
    const CR = M ? await import('./closereq.js') : null, crq = CR ? await CR.lastRequest(id) : null;
    // שני הדוחות בראש התיק (אפיון v2): דוח ראשי — מנהלים; דוח ללקוח — כמו היום (מנהלים וראש צוות)
    const reps = M || LEAD ? `<div class="row-btns pjrep">${M ? `<a class="btn primary" href="#/master-report/${id}">${icon('report', 18)} דוח ראשי</a>` : ''}<a class="btn ghost" href="#/client-report/${id}">${icon('send', 18)} דוח ללקוח</a></div>` : '';
    box.innerHTML = `${reps}${cs ? `<div class="card row"><span class="dot ok"></span><b class="grow">הפרויקט נסגר ${new Date(cs.closed_at).toLocaleDateString('he-IL')}</b></div>` : ''}
      ${kpiRow([[hrs && nf(hrs), 'שעות צוות'], [gal && nf(gal), 'גלונים'], [D.issues.length, 'תקלות', 'issue'], [D.tasks.filter(t => t.is_extra).length, 'תוספות מהלקוח']])}
      ${M ? '<div id="wkup"></div>' : ''}
      ${SG.length ? `<section><h3 class="sh">${SG.length > 1 ? 'חתימות הלקוח' : 'חתימת הלקוח'}</h3>${SG.map((g, i) => `<div class="card stack tight"><div class="row"><b class="grow">${esc(g.name || '')}${g.role ? ' · ' + esc(g.role) : ''}</b><span class="pill ${g.ok ? 'ok' : 'warn'}">${g.ok ? 'אושר' : 'עם הערות'}</span></div>
        <small class="muted">${[g.at ? new Date(g.at).toLocaleDateString('he-IL') : '', g.days.length ? 'ימים: ' + daysTxt(g.days) : '', g.rating ? `שביעות רצון ${g.rating}/5` : ''].filter(Boolean).join(' · ')}</small>
        ${g.notes ? `<small>${esc(g.notes)}</small>` : ''}<div data-sg="${i}"></div></div>`).join('')}</section>` : ''}
      <section id="galsec" hidden><h3 class="sh">לפני / אחרי</h3><div class="photos" id="gal"></div></section>
      ${CR ? CR.statusCard(crq) : ''}
      ${closeFlow(SG, cs, crq)}
      ${M ? '<div id="pfiles"></div><section id="pjvis" class="stack tight"></section>' : ''}`;
    if (SG.length && !SIGNED) { SIGNED = true; drawStatus(); }
    $$('[data-cnt]', box).forEach(b => b.onclick = () => goOpen(b.dataset.cnt));   // תקלות / תוספות → 'פתוח' מסונן
    if (M) import('./pfiles.js').then(m => m.filesSection($('#pfiles', box), p)).catch(() => {});   // קבצי הפרויקט — מנהל תפעול ומעלה (db/144)
    if (M) visitsBox($('#pjvis', box));
    if (M) import('./clientreport.js').then(m => m.weeklyCard($('#wkup', box), p, D.days)).catch(() => {});   // עדכון שבועי ללקוח (פרויקט ארוך)
    const { data: ph } = await sb.from('photos').select('kind,storage_path,work_day_id').eq('project_id', id).in('kind', ['before', 'after']).order('created_at');
    const urls = await signedUrls('field', [...(ph || []).map(x => x.storage_path), ...SG.map(g => g.path).filter(Boolean)]);
    const tu = await thumbUrls('field', (ph || []).map(x => x.storage_path));
    if ((ph || []).length) { $('#gal').innerHTML = ph.map(x => `<button class="ph" data-z="${esc(urls[x.storage_path])}"><img src="${esc(tu[x.storage_path].t)}" data-full="${esc(urls[x.storage_path])}" alt="" loading="lazy"><span class="q">${x.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join(''); $('#galsec').hidden = false; }
    SG.forEach((g, i) => { const b = $(`[data-sg="${i}"]`, box); if (b && g.path && urls[g.path]) b.innerHTML = `<img src="${esc(urls[g.path])}" alt="חתימה" class="sigimg">`; });
    $$('[data-z]', box).forEach(b => b.onclick = () => zoom(b.dataset.z, ''));
    const ss = $('#sumstep'); if (ss) sb.from('project_summaries').select('project_id').eq('project_id', id).maybeSingle().then(({ data }) => {
      if (data && ss.isConnected) { ss.classList.remove('next'); ss.classList.add('on'); $('.rbox', ss).innerHTML = icon('check', 16); } }, () => {});
    const cr = $('#crshare'); if (cr) cr.onclick = async () => {
      if (cr.disabled) return; cr.disabled = true;
      try {
        let { data: x } = await sb.from('project_shares').select('token').eq('project_id', id).eq('revoked', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!x) ({ data: x } = await sb.from('project_shares').insert({ project_id: id, created_by: state.user.id }).select('token').single());
        if (!x?.token) { toast('הקישור לא נוצר — נסו שוב'); return; }
        const u = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?t=' + x.token;
        try { if (navigator.share) await navigator.share({ title: `E-Drone · ${p.sites?.name || p.name}`, url: u }); else { await navigator.clipboard.writeText(u); toast('הקישור הועתק'); } } catch { /* בוטל */ }
      } finally { cr.disabled = false; }
    };
    const cq = $('#clsreq'); if (cq) cq.onclick = async () => { if (await CR.requestClose(id)) reload('s'); };
    const c = $('#cls'); if (c) c.onclick = async () => {
      // פיילוט: האפליקציה רק מדווחת שבוצע. ההחלטה אם להמשיך להצעה — ניהולית, במאנדי (הליד עובר ל"פיילוט בוצע — ממתין להצעה")
      if (p.engagement === 'פיילוט') { if (!(await confirmBox('סיום הפיילוט?', { ok: 'סיום הפיילוט' }))) return;
        const { error } = await sb.rpc('close_pilot', { p: id, ok: true }); if (error) return toast(errText(error, 'לא נסגר — נסו שוב')); toast('הפיילוט הסתיים'); return reload('s'); }
      const openDays = D.days.some(d => d.status !== 'done');
      // בלי חתימת לקוח — רק הנהלה (admin), עם סיבה שנשמרת (אביחי 13/10, db/142)
      const reason = await ask('סגירה בלי חתימת לקוח — למה?', { placeholder: openDays ? 'יש ימים שלא נסגרו · למשל: הלקוח אישר בטלפון' : 'למשל: הלקוח אישר בטלפון / במייל', ok: 'סגירת פרויקט' });
      if (reason == null) return; if (!reason.trim()) return toast('חובה לכתוב סיבה');
      const { error } = await sb.rpc('close_project', { p: id, reason }); if (error) return toast(errText(error, 'הפרויקט לא נסגר — נסו שוב'));
      toast('הפרויקט נסגר'); reload('s');
    };
  }

  // ביקורים (ביקורת צוות, סיור עם לקוח, בקרת איכות) — מנהלים
  async function visitsBox(box) {
    if (!box) return;
    const VK = { crew_check: 'ביקורת צוות', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור' };
    const { data: vis } = await sb.from('project_visits').select('id,kind,visit_date,findings,profiles:visitor_id(full_name)').eq('project_id', id).order('visit_date', { ascending: false }).then(r => r, () => ({ data: [] }));
    if (!box.isConnected) return;
    box.innerHTML = `<div class="sh-row"><h3 class="sh">ביקורים</h3>${(vis || []).length ? `<span class="count">${vis.length}</span>` : ''}</div>
      <div class="list">${(vis || []).map(v => { const fx = (v.findings || []).filter(x => x.sev === 'fix').length;
        return `<a class="lrow" href="#/visit/${v.id}"><span class="mic">${icon('users', 19)}</span><span class="grow"><b>${esc(VK[v.kind] || 'ביקור')} · ${dm(v.visit_date)}</b><small>${esc(v.profiles?.full_name || '')} · ${(v.findings || []).length} ממצאים</small></span>${fx ? `<span class="pill bad">${fx} לתיקון</span>` : ''}<span class="chev">${icon('chev', 16)}</span></a>`; }).join('')}
        <a class="addrow" href="#/visit/new/${id}">${icon('plus', 18)} ביקור חדש</a></div>`;
  }
  // ---------- שעות ועלות עבודה מהנוכחות (מנהלים; כסף רק עם הרשאת כספים) ----------
  async function laborBlock() {
    const box = $('#labor'); if (!box) return;
    const { data: rows } = await sb.from('project_labor_days').select('user_id,day,work_h,travel_h,ot_h,profiles(full_name)').eq('project_id', id).order('day');
    const ex = ADMIN() ? Number(D.fin?.expenses_actual || 0) : 0;
    if (!(rows || []).length) { box.innerHTML = `${ex ? `<div class="card row"><b class="grow">הוצאות שטח שאושרו</b><b>₪${nf(ex)}</b></div>` : ''}`; return; }
    const h = x => { const m = Math.round(x * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
    const W = rows.reduce((t, r) => t + Number(r.work_h), 0), T = rows.reduce((t, r) => t + Number(r.travel_h), 0), O = rows.reduce((t, r) => t + Number(r.ot_h), 0);
    const by = {}; rows.forEach(r => { const k = r.profiles?.full_name || ''; (by[k] ||= { w: 0, t: 0, o: 0, d: new Set() }); by[k].w += +r.work_h; by[k].t += +r.travel_h; by[k].o += +r.ot_h; by[k].d.add(r.day); });
    const cost = ADMIN() ? D.fin?.labor_cost_actual : null;
    box.innerHTML = `<section><h3 class="sh">שעות עבודה מהנוכחות</h3>
      <div class="kpis plain"><div class="kpi"><b>${h(W)}</b><span>באתר</span></div><div class="kpi"><b>${h(T)}</b><span>נסיעה</span></div><div class="kpi"><b>${cost != null ? '₪' + nf(Math.round(cost)) : h(O)}</b><span>${cost != null ? 'עלות שכר בפועל' : 'שעות נוספות'}</span></div></div>
      <div class="split"><i style="flex:${W}"></i><i class="tr" style="flex:${T}"></i></div><div class="small muted">${Math.round(T / (W + T) * 100)}% מהזמן בנסיעה${cost != null ? ` · מתוכן ${h(O)} שעות נוספות` : ''}</div>
      ${ex ? `<div class="card row"><b class="grow">הוצאות שטח שאושרו</b><b>₪${nf(ex)}</b></div>` : ''}
      <div class="menu">${Object.entries(by).map(([n, v]) => `<div class="lrow kv"><span class="grow"><small>${esc(n)} · ${v.d.size === 1 ? "יום אחד" : v.d.size + " ימים"}</small><b>באתר ${h(v.w)} · נסיעה ${h(v.t)}${v.o ? ` · נוספות ${h(v.o)}` : ''}</b></span></div>`).join('')}</div></section>`;
  }

  drawMain();
  // חתימת לקוח קיימת? (לצעד הבא — "חסרה חתימת לקוח")
  if (!SIGNED) sb.from('project_signoffs').select('id').eq('project_id', id).limit(1).then(({ data }) => { if ((data || []).length && el.isConnected) { SIGNED = true; drawStatus(); } }, () => {});
  // קישורים ישנים ללשוניות (#/p/<id>/a|c|s|t|d|i) → הסעיף המתאים במסך האחד
  const F = { a: 'fspec', c: 'fchat', s: 'ffile', t: 'fplan' }[tab];
  if (F) { const f = $('#' + F, el); if (f && !f.hidden) { f.open = true; requestAnimationFrame(() => f.scrollIntoView({ block: 'start' })); } }
  else if (tab === 'd') requestAnimationFrame(() => $('#pjdays', el)?.scrollIntoView({ block: 'start' }));
  else if (tab === 'i') goOpen('issue');
  // הגעה מלוח השיבוץ / "לשבץ צוות": נפתח ישר גיליון השיבוץ
  if (tab === 'sch') { const d0 = location.hash.split('/')[4] || ''; replaceHash(`#/p/${id}`, false); if (M) openSched(/^\d{4}-\d\d-\d\d$/.test(d0) ? d0 : null); }
  else if (tab !== 'o' && location.hash.startsWith('#/p/')) replaceHash(`#/p/${id}`, false);
}
