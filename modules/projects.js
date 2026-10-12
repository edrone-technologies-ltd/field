// פרויקטים: מרכז הביצוע. סקירה ממאנדי + אתר ואפיון, תכנית עבודה מהאפיון, שיבוץ ימים, צ׳אט צוות, תקלות וסיכום.
import { navButtons, replaceHash, thumbUrls , stLabel } from '../lib/core.js';
import { availability } from '../lib/avail.js';
import { facadeOrder } from '../lib/sun.js';
import { errText } from '../lib/audit.js';
import { sb, state, can, isManager, cache, enqueue, signedUrls, covers, coverArt, folderGrid, sheet, icon, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm, ask, confirmBox, backBtn, HE_D1, leadMark, coverFor, skeleton } from '../lib/core.js';

const ARCHIVE = 'group_mm5052gw';
const TONE = { 'בביצוע': 'lime', 'תקוע': 'bad', 'הסתיים — ממתין לתשלום': 'ok', 'הסתיים — להוצאת חשבונית': 'ok' };   // שלבי עבודה = אפור
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'in_progress', dropped: 'todo' };
const KIND_HE = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' };
const FIELD_ROLES = ['admin', 'ops_manager', 'crew_lead', 'crew', 'surveyor'];
// שורת מדדים: רק אריחים עם ערך (בלי 0 / ריק); אם הכל ריק — כלום
const kpiRow = xs => { const k = xs.filter(([v]) => v && v !== '—'); return k.length ? `<div class="kpis">${k.map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''; };

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
  };
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
    const [{ data: p, error }, { data: tasks }, { data: days }, { data: issues }, { data: reps }, fin, { data: sites }, { data: team }, { data: drones }, { data: ready }] = await Promise.all([
      sb.from('projects').select('*, sites(id,slug,name,address,contact_name,contact_phone,lat,lng)').eq('id', id).single(),
      sb.from('tasks').select('*, buildings(name,code)').eq('project_id', id).order('day_no', { nullsFirst: false }).order('seq'),
      sb.from('work_days').select('*, work_day_crew(user_id,role,hours,confirmed_at,cant_come_at,profiles(full_name))').eq('project_id', id).order('day'),
      sb.from('issues').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('field_reports').select('*').eq('project_id', id).order('report_date', { ascending: false }),
      can('finance') ? sb.from('project_finance').select('*').eq('project_id', id).maybeSingle() : Promise.resolve({ data: null }),
      isManager() ? sb.from('sites').select('id,name,slug,kind,buildings(id,specs(status,days_expected,hydrants,power,docking))').eq('is_active', true) : Promise.resolve({ data: [] }),
      isManager() ? sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true) : Promise.resolve({ data: [] }),
      sb.from('equipment').select('id,name,health').eq('kind', 'drone'),
      isManager() ? sb.rpc('project_readiness', { p: id }) : Promise.resolve({ data: null }),
    ]);
    if (error) throw error;
    D = { p, tasks: tasks || [], days: days || [], issues: issues || [], reps: reps || [], fin: fin.data, sites: sites || [], team: (team || []).filter(x => FIELD_ROLES.includes(x.role)), drones: drones || [], ready };
    await cache.set(ck, D);
  } catch { D = await cache.get(ck); }
  if (!D) { el.innerHTML = `<div class="empty-line">הפרויקט לא נמצא</div>`; return; }
  const p = D.p, M = isManager();
  // הפרויקט = תיקייה אחת: סקירה · אפיון · תכנית · דוחות · צ׳אט · סיכום
  const TABS = [['o', 'סקירה'], ...(p.site_id && (M || can('specs')) ? [['a', 'אפיון']] : []), ['t', 'משימות'], ['d', 'דוחות'], ['c', "צ׳אט"], ['s', 'סיכום']];
  const openIss = D.issues.filter(i => i.status === 'open').length;

  const coverUrl = p.cover_path ? (await signedUrls('media', [p.cover_path]).catch(() => ({})))[p.cover_path] : null;
  el.innerHTML = `<div class="phero"><span class="img" style="background-image:url('${coverFor(p, coverUrl)}')"></span>
      <a class="back glass" href="#/projects" aria-label="חזרה">${icon('back', 20)}</a>
      <span class="ph-bottom"><span class="row tight">${p.engagement === 'פיילוט' ? '<span class="pill pilot">פיילוט</span>' : ''}<span class="pill ${TONE[p.status_label] ?? ''}">${esc(stLabel(p.status_label))}</span></span><b>${esc(p.name)}</b><small>${esc([p.service, p.client_name].filter(Boolean).join(' · '))}</small></span></div>
    <div class="tabs" id="pt">${TABS.map(([k, t]) => `<button data-t="${k}" aria-selected="${k === tab || (['i', 'sch'].includes(tab) && k === 'o')}">${t}</button>`).join('')}</div>
    <div id="pb" class="stack"></div>`;
  $$('#pt button').forEach(b => b.onclick = () => { replaceHash(`#/p/${id}/${b.dataset.t}`, false); renderTab(b.dataset.t); $$('#pt button').forEach(x => x.setAttribute('aria-selected', x === b)); });
  const reload = t => renderProject(el, id, t);

  function renderTab(t) {
    document.querySelectorAll('.bar,.composer').forEach(x => x.remove());
    const box = $('#pb');
    if (t === 'd') { import('./reports.js').then(m => m.reportsTab(box, D, { reload })); return; }
    ({ o: overview, a: specTab, t: plan, c: chat, s: summary }[t] || overview)(box);
    bindCopy(box);
  }

  // ----- אפיון האתר, בתוך הפרויקט -----
  async function specTab(box) {
    box.innerHTML = '<div class="skel"></div>';
    const { data: st } = await sb.from('sites').select('slug,name,buildings(id,name,sort,facade_area_m2,specs(status,days_expected))').eq('id', p.site_id).maybeSingle();
    if (!st) { box.innerHTML = '<div class="empty-line">אין גישה לאפיון</div>'; return; }
    const B = (st.buildings || []).sort((a, b) => a.sort - b.sort).map(b => ({ ...b, sp: Array.isArray(b.specs) ? b.specs[0] : b.specs }));
    const done = B.filter(b => b.sp?.status === 'done'), days = done.reduce((t, b) => t + Number(b.sp.days_expected || 0), 0);
    const ST = { done: ['ok', 'הושלם'], draft: ['warn', 'טיוטה'] };
    box.innerHTML = `<div class="kpis"><div class="kpi"><b>${done.length}/${B.length}</b><span>מבנים אופיינו</span></div><div class="kpi"><b>${days ? nf(Math.ceil(days - 1e-3)) : '—'}</b><span>ימי עבודה</span></div></div>
      <div class="list">${B.map(b => `<a class="lrow" href="#/b/${esc(st.slug)}/${b.id}"><span class="grow"><b>${esc(b.name)}</b><small>${[b.sp?.days_expected ? nf(b.sp.days_expected) + ' ימים' : null, b.facade_area_m2 ? nf(b.facade_area_m2) + ' מ״ר' : null].filter(Boolean).join(' · ')}</small></span>
        ${ST[b.sp?.status] ? `<span class="pill ${ST[b.sp.status][0]}">${ST[b.sp.status][1]}</span>` : '<span class="pill">לא מולא</span>'}</a>`).join('')}</div>
      <a class="btn ghost block" href="#/site/${esc(st.slug)}">${icon('clipboard', 18)} האפיון המלא</a>`;
  }

  // ----- סקירה -----
  // לו״ז דו-כיווני: מה שמתוכנן במאנדי מול מה ששובץ באפליקציה
  const wdays = (a, b) => { let n = 0; for (let d = new Date(a + 'T12:00'); isoDay(d) <= b; d.setDate(d.getDate() + 1)) if (d.getDay() < 5) n++; return n || 1; };
  // לו״ז הפרויקט: הטווח (מסונכרן עם מאנדי בשני הכיוונים) + ימי השטח. מנהל: שינוי תאריכים, שיבוץ, העברת יום
  function schedSection() {
    const t = isoDay(), up = D.days.filter(d => d.status !== 'done' && d.day >= t).sort((a, b) => a.day < b.day ? -1 : 1), done = D.days.filter(d => d.status === 'done').length;
    const out = up.length && p.planned_from && (up[0].day < p.planned_from || up.at(-1).day > (p.planned_to || p.planned_from));
    if (!M && !up.length) return '';
    const crewOf = d => [...new Map([[d.crew_lead_id, null], ...(d.work_day_crew || []).map(c => [c.user_id, c])]).keys()].filter(Boolean)
      .map(u => { const c = (d.work_day_crew || []).find(x => x.user_id === u); return esc((c?.profiles?.full_name || D.team.find(x => x.id === u)?.full_name || '').split(' ')[0]) + (u === d.crew_lead_id ? leadMark() : ''); }).join(' · ');
    return `<section id="sched"><div class="sh-row"><h3 class="sh">לו״ז</h3>${M ? '<button class="more" id="dates">שינוי תאריכים</button>' : ''}</div>
      <div class="list">
        <div class="lrow"><span class="mic">${icon('calendar', 19)}</span><span class="grow">${p.planned_from ? `<b>${dm(p.planned_from)} – ${dm(p.planned_to || p.planned_from)}</b><small>${(n => n === 1 ? 'יום עבודה אחד' : n + ' ימי עבודה')(wdays(p.planned_from, p.planned_to || p.planned_from))}${done ? ` · ${done} בוצעו` : ''}</small>` : '<b>אין תאריכים</b>'}</span>${out ? '<span class="pill warn">שיבוץ מחוץ לטווח</span>' : p.dates_dirty ? '<span class="pill">מתעדכן במאנדי</span>' : ''}</div>
        ${up.map(d => `<a class="lrow" href="#/day/${d.id}"><span class="datebox ${d.day === t ? 'now' : ''}"><b>${+d.day.slice(8)}</b><small>${d.day === t ? 'היום' : HE_D1[new Date(d.day + 'T12:00').getDay()]}</small></span>
          <span class="grow"><b>${d.report_time ? 'יציאה ' + d.report_time.slice(0, 5) : 'יום שטח'}${d.is_last_day ? ' · יום אחרון' : ''}</b><small>${crewOf(d) || 'לא שובץ צוות'}</small></span>${M && d.status === 'planned' ? `<button class="chip" data-mv="${d.id}" data-day="${d.day}">העברה</button>` : ''}</a>`).join('')}
        ${M ? `<button class="addrow" id="schm">${icon('plus', 18)} ${up.length ? 'שיבוץ מחדש' : 'שיבוץ ימים'}</button>` : ''}
      </div></section>`;
  }
  // שיבוץ מתחיל מטווח מאנדי (או מהתאריך שנבחר בלוח השיבוץ)
  const openSched = (from = null) => { const st = from || (p.planned_from && p.planned_from >= isoDay() ? p.planned_from : isoDay()); scheduleSheet({ start: st, end: p.planned_to && p.planned_to >= st ? p.planned_to : undefined }); };
  function bindSched(box) {
    const ds = $('#dates', box); if (ds) ds.onclick = () => sheet(`<h3 class="sh">תאריכי הפרויקט</h3>
      <div class="row"><label class="field grow">התחלה<input type="date" id="df" value="${p.planned_from || ''}"></label><label class="field grow">סיום<input type="date" id="dt" value="${p.planned_to || p.planned_from || ''}"></label></div>
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="dgo">שמירת התאריכים</button></div>`, (s2, close) => {
      $('#df', s2).onchange = e => { const to = $('#dt', s2); if (!to.value || to.value < e.target.value) to.value = e.target.value; };
      $('#dgo', s2).onclick = async e => { const f = $('#df', s2).value, to = $('#dt', s2).value || f; if (!f) return toast('בחרו תאריך');
        e.target.disabled = true; const { data: n, error } = await sb.rpc('set_project_dates', { p: id, d_from: f, d_to: to });
        if (error) { e.target.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
        close(); toast(n ? `התאריכים עודכנו · ${n} ימי שטח הוזזו` : 'התאריכים עודכנו'); reload('o'); };
    });
    const sm = $('#schm', box); if (sm) sm.onclick = () => openSched();
    // העברה = ניהול היום: יום קדימה לכל הפרויקט, יום פנוי בלחיצה, או תאריך אחר
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
  function overview(box) {
    const tot =D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const dDone = D.days.filter(d => d.status === 'done').length, f = D.fin, s = p.sites;
    const open = D.issues.filter(i => i.status === 'open');
    const range = p.planned_from ? (p.planned_to && p.planned_to !== p.planned_from ? `${dm(p.planned_from)}–${dm(p.planned_to)}` : dm(p.planned_from)) : null;
    const appPlan = tot || D.days.length;
    const fdays = Math.max(Number(p.field_days_actual || 0), new Set(D.reps.map(r => r.report_date)).size);
    const kv = (ic, label, val, act = '') => `<div class="lrow kv" ${act ? `data-act="${act}" role="button" tabindex="0"` : ''}><span class="mic">${icon(ic, 19)}</span><span class="grow"><small>${label}</small><b>${val}</b></span>${act ? `<span class="chev">${icon('chev', 18)}</span>` : ''}</div>`;
    const tel = s?.contact_phone ? s.contact_phone.replace(/\D/g, '').replace(/^0/, '') : '';
    const wxDay = (() => { const t = isoDay(), nx = D.days.filter(d => d.day >= t && d.status !== 'done').map(d => d.day).sort()[0];
      return nx || (p.planned_from && (p.planned_to || p.planned_from) >= t ? (p.planned_from > t ? p.planned_from : t) : null); })();
    box.innerHTML = `${schedSection()}${readySection()}${p.site_id && wxDay ? `<span data-wxcard="${p.site_id}|${wxDay}|תחזית ל${dayLabel(wxDay)}"></span>` : ''}
      ${kpiRow(appPlan
        ? [[done && Math.round(done / tot * 100) + '%', 'מהתכנית בוצע'], [dDone && `${dDone}/${D.days.length}`, 'ימי שטח']]
        : [[range, 'לו״ז'], [fdays && `${fdays}${p.field_days_planned ? '/' + nf(p.field_days_planned) : ''}`, 'ימי שטח'], [D.reps.length, 'דוחות שטח']])}
      ${open.length ? `<section><h3 class="sh">תקלות פתוחות</h3><div class="alist">${open.map(i => `<div class="arow ${i.severity === 'critical' ? 'bad' : 'warn'}"><span class="aic">${icon('alert', 20)}</span><span class="grow"><b>${esc(i.body)}</b><small>${KIND_HE[i.kind] || ''} · ${new Date(i.created_at).toLocaleDateString('he-IL')}</small></span>${M ? `<button class="chip" data-x="${i.id}">טופל</button>` : ''}</div>`).join('')}</div></section>` : ''}
      <div class="menu">
        ${M && p.client_id ? `<a class="lrow kv" href="#/client/${p.client_id}"><span class="mic">${icon('users', 19)}</span><span class="grow"><small>לקוח</small><b>${esc(p.client_name || '')}</b></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
        ${p.scope ? kv('report', 'היקף', esc(p.scope)) : ''}
        ${kv('pin', 'אתר', s ? esc(s.name) + (s.address ? ` <span class="muted small">· ${esc(s.address)}</span>` : '') : '<span class="muted">לא משויך</span>', M ? 'site' : '')}
        ${p.work_notes ? kv('clipboard', 'דגשים לצוות', esc(p.work_notes).replace(/\n/g, '<br>'), M ? 'notes' : '') : M ? `<div class="lrow kv" data-act="notes" role="button" tabindex="0"><span class="mic">${icon('plus', 19)}</span><span class="grow"><span class="muted">הוספת דגשים לצוות</span></span></div>` : ''}
        ${p.summary ? kv('chat', 'תמונת ביצוע', esc(p.summary)) : ''}
        ${f ? kv('shield', 'כספים', `${f.price_net ? '₪' + nf(f.price_net) + ' נטו' : '—'}${f.gross_pct ? ` · רווח ${nf(f.gross_pct)}%` : ''}${f.payment_status ? ' · ' + esc(f.payment_status) : ''}`) : ''}
        ${M ? `<button class="lrow kv" id="share" type="button"><span class="mic">${icon('send', 19)}</span><span class="grow"><b>קישור התקדמות ללקוח</b></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
      </div>
      ${s?.lat || p.lat ? navButtons(s?.lat || p.lat, s?.lng || p.lng) : ''}
      ${D.reps.length || D.days.some(d => d.status === 'done') ? `<button class="lrow" id="toRep" type="button"><span class="mic">${icon('photo', 19)}</span><span class="grow"><b>דוחות ותמונות מהשטח</b><small>${D.reps.length} דוחות${D.reps[0] ? ' · אחרון ' + dm(D.reps[0].report_date) : ''}</small></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
      ${M ? `<div class="row pfoot"><div class="sigline grow" id="sig"></div>${p.monday_item_id ? `<a class="more" href="https://edroneil-force.monday.com/boards/5099780041/pulses/${esc(p.monday_item_id)}" target="_blank" rel="noopener">מאנדי</a>` : ''}</div>` : ''}`;
    if (M) import('../lib/audit.js').then(m => m.signature($('#sig'), { project_id: id }));
    const tr = $('#toRep', box); if (tr) tr.onclick = () => $('#pt [data-t="d"]')?.click();
    $$('[data-x]', box).forEach(b => b.onclick = () => closeIssue(b.dataset.x, () => overview(box)));
    $$('[data-act]', box).forEach(r => r.onclick = () => r.dataset.act === 'site' ? siteSheet() : notesSheet());
    if (p.site_id) { const cb = document.createElement('div'); $('.menu', box)?.after(cb); import('../lib/contacts.js').then(m => m.renderContacts(cb, { siteId: p.site_id, clientId: p.client_id, org: p.client_name || p.sites?.name, title: 'אנשי קשר באתר', empty: p.sites?.contact_name ? contactCard(p.sites.contact_name, p.sites.contact_phone) : '' })); }
    import('../lib/wx.js').then(m => m.fillWx(box)).catch(() => {});
    bindSched(box); bindReady(box); readyWx(box).catch(() => {});
    const sh = $('#share', box); if (sh) sh.onclick = shareSheet;
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
      $('#wns', sh).onclick = async () => { const v = $('#wn', sh).value.trim() || null; await enqueue({ kind: 'update', table: 'projects', rowId: id, patch: { work_notes: v } }); p.work_notes = v; close(); toast('נשמר'); renderTab('o'); };
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
  function plan(box) {
    const all = D.tasks; D.tasks = all.filter(t => t.phase !== 'מעקב');   // התכנית = משימות ימי העבודה; הצ׳קליסט בנפרד למעלה
    const chk = all.filter(t => t.phase === 'מעקב' && t.status !== 'dropped');
    const by = new Map(); D.tasks.forEach(t => { const k = t.day_no ?? 0; if (!by.has(k)) by.set(k, []); by.get(k).push(t); });
    const dayOf = n => D.days.find(d => D.tasks.some(t => t.day_no === n && t.work_day_id === d.id));
    const tot = D.tasks.filter(x => x.status !== 'dropped').length, done = D.tasks.filter(x => x.status === 'done').length;
    const blocked = D.tasks.filter(t => t.status === 'blocked');
    box.innerHTML = `${checklistHtml(chk)}${D.tasks.length || M ? `<a class="plancard" href="#/plan/${id}"><span class="mic">${icon('report', 22)}</span><span class="grow"><b>תכנית העבודה</b>${by.size ? `<small>${[...by.keys()].filter(Boolean).length} ימים</small>` : ''}</span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
      ${D.tasks.length ? `<details class="fold"><summary><span class="sh">משימות לפי יום</span><span class="count">${tot}</span></summary><div class="stack">` : ''}${tot ? `<div class="card row"><div class="ring" style="--p:${Math.round(done / tot * 100)}"><b>${Math.round(done / tot * 100)}%</b></div><div class="grow"><b>${done} מתוך ${tot} משימות</b><div class="small muted">${by.size} ימי עבודה בתכנית${blocked.length ? ` · ${blocked.length} נתקעו` : ''}</div></div></div>` : ''}
      ${!D.tasks.length && M ? `<div class="empty-line">אין תכנית עבודה</div>` : ''}
      ${M && p.site_id ? (specReady() ? `<button class="btn ${D.tasks.length ? 'ghost' : 'primary'} block" id="gen">${D.tasks.length ? 'בנייה מחדש מהאפיון' : 'בניית תכנית עבודה מהאפיון'}</button>` : specMissing()) : ''}
      ${blocked.length ? `<div class="stack tight"><h3>נתקעו</h3>${blocked.map(taskRow).join('')}</div>` : ''}
      ${[...by.entries()].map(([n, ts]) => { const wd = dayOf(n); const dn = ts.filter(t => t.status === 'done').length;
        return `<div class="stack tight"><div class="row"><h3 class="grow">${n ? 'יום ' + n : 'בלי יום'}${wd ? ` · ${dayLabel(wd.day)}` : ''}</h3><span class="pill ${dn === ts.length ? 'ok' : ''}">${dn}/${ts.length}</span></div>${dayBrief(wd, ts)}${ts.map(taskRow).join('')}</div>`; }).join('')}
      ${D.tasks.length ? '</div></details>' : ''}`;
    const g = $('#gen'); if (g) g.onclick = async () => {
      if (D.tasks.length && !(await confirmBox('לבנות את התכנית מחדש?', { body: 'משימות שכבר התחילו או בוצעו נשארות כמו שהן.', ok: 'בנייה מחדש' }))) return;
      g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: id }); if (error) { g.disabled = false; return toast(errText(error, 'התכנית לא נבנתה — נסו שוב'), 4000); }
      toast(`נבנתה תכנית ל-${data} ימי עבודה`); location.hash = `#/plan/${id}`;
    };
    bindTasks(box, () => { D.tasks = all; plan(box); });
    bindChecklist(box, all, () => { D.tasks = all; plan(box); });
    D.tasks = all;
  }
  // ----- צ׳קליסט הפרויקט: כל המשימות הפתוחות של הפרויקט במקום אחד (מדוחות ביקור, מהמשרד, מהשטח) -----
  function checklistHtml(chk) {
    const open = chk.filter(t => t.status !== 'done'), done = chk.filter(t => t.status === 'done');
    const N = u => (D.team.find(x => x.id === u)?.full_name || '').split(' ')[0];
    const meta = t => [t.assignee_id ? N(t.assignee_id) : '', t.due ? 'עד ' + dm(t.due) : ''].filter(Boolean).join(' · ');
    const row = t => `<div class="ck ${t.status === 'done' ? 'on' : ''}"><button class="ckbox" data-ck="${t.id}" aria-label="סימון">${t.status === 'done' ? icon('check', 16) : ''}</button>
      <span class="grow"><b>${esc(t.title)}</b>${meta(t) ? `<small>${esc(meta(t))}</small>` : ''}${t.done_note && t.status === 'done' ? `<small>${esc(t.done_note)}</small>` : ''}</span>${(t.photos?.after?.length || t.photos?.before?.length) ? `<span class="pill">${icon('photo', 14)} ${(t.photos.before?.length || 0) + (t.photos.after?.length || 0)}</span>` : ''}
      ${M && t.status !== 'done' ? `<button class="chip sm" data-who="${t.id}">${t.assignee_id ? 'החלפה' : 'שיוך'}</button>` : ''}</div>`;
    return `<section class="stack cksec"><div class="sh-row"><h3 class="sh">צ׳קליסט</h3>${open.length ? `<span class="count">${open.length}</span>` : ''}</div>
      <div class="cklist">${open.map(row).join('') || '<div class="empty-line">אין פריטים פתוחים</div>'}
        <form class="ckadd" id="ckadd"><input id="ckin" placeholder="פריט חדש" autocomplete="off"><button class="btn primary sm">הוספת פריט</button></form></div>
      ${done.length ? `<details class="fold"><summary><span class="sh">בוצעו</span><span class="count">${done.length}</span></summary><div class="cklist">${done.map(row).join('')}</div></details>` : ''}</section>`;
  }
  function bindChecklist(box, all, redraw) {
    $$('[data-ck]', box).forEach(b => b.onclick = async () => {
      const t = all.find(x => x.id === b.dataset.ck), on = t.status !== 'done';
      if (on && t.project_id && (t.photos?.before?.length || !M)) return (await import('./tasks.js')).completeTask(t, redraw);   // תיעוד בשטח
      Object.assign(t, on ? { status: 'done', done_by: state.user.id, done_at: new Date().toISOString() } : { status: 'todo' });
      await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: on ? { status: 'done', done_by: state.user.id, done_at: t.done_at } : { status: 'todo' } }); redraw();
    });
    const f = $('#ckadd', box); if (f) f.onsubmit = async e => {
      e.preventDefault(); const v = $('#ckin', box).value.trim(); if (!v) return;
      const row = { id: crypto.randomUUID(), project_id: id, title: v, phase: 'מעקב', status: 'todo', is_extra: true, created_by: state.user.id };
      all.push(row); await enqueue({ kind: 'insert', table: 'tasks', row }); redraw(); setTimeout(() => $('#ckin', box)?.focus(), 30);
    };
    $$('[data-who]', box).forEach(b => b.onclick = () => {
      const t = all.find(x => x.id === b.dataset.who);
      sheet(`<h3>למי?</h3><div class="list">${D.team.map(u => `<button class="lrow" data-u="${u.id}"><b class="grow">${esc(u.full_name)}</b>${t.assignee_id === u.id ? `<span class="pill ok">${icon('check', 16)}</span>` : ''}</button>`).join('')}</div>
        <label class="field">עד מתי (לא חובה)<input type="date" id="ckd" value="${t.due || ''}"></label><button class="btn ghost block" data-close>סגירה</button>`, (s, close) => {
        $$('[data-u]', s).forEach(x => x.onclick = async () => { t.assignee_id = x.dataset.u; t.due = $('#ckd', s).value || null;
          await enqueue({ kind: 'update', table: 'tasks', rowId: t.id, patch: { assignee_id: t.assignee_id, due: t.due } }); close(); toast('שויך'); redraw(); });
      });
    });
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
    return `<button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? icon('check', 16) : t.status === 'blocked' ? icon('alert', 14) : ''}</span><span class="t"><b>${esc(t.title)}</b>
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
      <div class="row"><label class="field grow">התחלה<input type="date" id="sd" value="${start}"></label><label class="field grow">סיום<input type="date" id="sde" value="${pre.end || endOf(start, pre.n || maxDay)}"></label></div>
      <input type="hidden" id="sn" value="${pre.n || maxDay}"><div class="small muted" id="snn"></div>
      ${(teams || []).length ? `<div class="field">צוות<div class="chips">${teams.map(t => `<button type="button" class="chip" data-team="${t.id}" aria-pressed="false">${esc(t.name)}</button>`).join('')}</div></div>` : ''}
      <label class="field">ראש צוות<select id="sl">${leads.map(x => `<option value="${x.id}" data-n="${esc(x.full_name)}" ${x.id === leadDef ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>
      <div class="field">צוות<div class="chips">${D.team.map(x => `<button class="chip" data-u="${x.id}" aria-pressed="${crewDef.has(x.id)}"><span>${esc(x.full_name)}</span><small class="why"></small></button>`).join('')}</div></div>
      <label class="field">רחפן<select id="sdr"><option value="">בלי רחפן</option>${D.drones.map(x => `<option value="${x.id}" data-n="${esc(x.name)}" data-w="${dTag(x)}" ${x.health === 'grounded' ? 'disabled' : x.id === droneDef ? 'selected' : ''}>${esc(x.name)}${dTag(x)}</option>`).join('')}</select></label>
      <div class="row"><label class="field grow">הגעה לאתר<input type="time" id="sa" value="${(prev?.site_arrival || '07:00').slice(0, 5)}"></label><label class="field grow">סיום באתר<input type="time" id="se" value="${(prev?.site_end || '').slice(0, 5)}"></label></div>
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
        const a = $('#sd', s).value, b = $('#sde', s).value || a; if (!a) return;
        const my = ++avSeq, av = await availability(a, b, { project: id, drones: D.drones }).catch(() => null); if (!av || my !== avSeq) return;
        $$('[data-u]', s).forEach(c => { const why = av.person(c.dataset.u); c.disabled = !!why; if (why) c.setAttribute('aria-pressed', 'false'); $('.why', c).textContent = why; });
        const sl = $('#sl', s); [...sl.options].forEach(o => { const why = av.person(o.value); o.disabled = !!why; o.textContent = o.dataset.n + (why ? ' — ' + why : ''); });
        if (sl.selectedOptions[0]?.disabled) { const ok = [...sl.options].find(o => !o.disabled); if (ok) sl.value = ok.value; }
        markLead();
        const dr = $('#sdr', s); [...dr.options].forEach(o => { if (!o.value) return; const why = av.drone(o.value); o.disabled = !!why; o.textContent = o.dataset.n + (why ? ' — ' + why : o.dataset.w); });
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
        $('#wxs', s).innerHTML = (lat ? '' : '<div class="small muted">אין מיקום לאתר</div>')
          + list.map(x => `<button type="button" class="wxday ${x.skip ? 'skip' : ''} ${x.bad ? 'bad' : ''}" data-wd="${x.d}"><b>${dayLabel(x.d)}</b><small>${x.w ? `משבים ${Math.round(x.w.g)}${x.w.r >= 0.5 ? ` · גשם ${x.w.r.toFixed(1)}` : ''}` : 'אין תחזית עדיין'}</small><small>${x.skip ? 'מדולג' : 'עבודה'}</small></button>`).join('');
        $$('[data-wd]', s).forEach(b => b.onclick = () => { const x = list.find(y => y.d === b.dataset.wd); manual.set(x.d, !x.skip); drawWx(); });
      };
      const syncN = () => { const a = $('#sd', s), b = $('#sde', s); if (!a.value) return; if (!b.value || b.value < a.value) b.value = a.value;
        let n = 0; for (let d = a.value; d <= b.value; d = add1(d)) if (workday(d, $('#sfr', s).checked)) n++;
        $('#sn', s).value = n || 1; $('#snn', s).textContent = `${n || 1} ימי שטח`; drawWx(); applyAv(); };
      $('#sd', s).onchange = $('#sde', s).onchange = $('#sfr', s).onchange = syncN; $('#se', s).onchange = drawWx; syncN();
      // יציאה מהמשרד = הגעה − נסיעה (כביש × מקדם תנועה) − העמסה. המנהל יכול לשנות ידנית
      let travelMin = null, touched = !!prev?.report_time; const Dp = { office: [31.2524, 34.7908], office_name: 'המשרד', load_min: 20, traffic_factor: 1.15 };
      const recalc = () => {
        const a = hr('#sa'); if (a == null) return;
        const tot = (travelMin ?? 0) + Dp.load_min, dep = ((a * 60 - tot) % 1440 + 1440) % 1440, r5 = Math.floor(dep / 5) * 5;
        if (!touched) $('#st', s).value = `${String(Math.floor(r5 / 60)).padStart(2, '0')}:${String(r5 % 60).padStart(2, '0')}`;
        $('#sthint', s).textContent = travelMin != null ? `מומלץ: נסיעה ${Math.floor(travelMin / 60)}:${String(travelMin % 60).padStart(2, '0')} מ${Dp.office_name} + ${Dp.load_min} דק׳ העמסה` : lat ? 'מחשב מרחק…' : `${Dp.load_min} דק׳ העמסה`;
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
        const crew = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u).filter(u => u !== $('#sl', s).value);
        const args = { p: id, start_day: $('#sd', s).value, lead: $('#sl', s).value, crew, drone: $('#sdr', s).value || null, report: $('#st', s).value || '06:00', ndays: +$('#sn', s).value || null, skip: plan().filter(x => x.skip).map(x => x.d),
          arrive: $('#sa', s).value || null, shift_end: $('#se', s).value || null, fridays: $('#sfr', s).checked };
        if (!args.start_day || !args.lead || $('#sl', s).selectedOptions[0]?.disabled) return toast(args.start_day ? 'אין ראש צוות פנוי בתאריכים האלה' : 'חסר תאריך');
        const { data, error } = await sb.rpc('schedule_work_days', args); if (error) return toast(errText(error, 'השיבוץ לא נשמר — נסו שוב'), 4000);
        close(); toast(`שובצו ${data} ימי שטח`); reload('o');
      };
    });
  }

  // ----- צ׳אט צוות -----
  async function chat(box) {
    box.innerHTML = `<div id="cx"></div>`;
    (await import('./chat.js')).renderChat($('#cx'), { project: p });
  }

  // ----- סגירה: ימים נסגרו → חתימת לקוח (סוגרת את הפרויקט) → דוח ללקוח. הצעד הבא תמיד בולט -----
  function closeFlow(SG, cs) {
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
    const closeBtn = M && !cs && (pilot || (state.profile.role === 'admin' && !SG.length)) ? `<button class="btn ghost block" id="cls">${pilot ? 'סיום הפיילוט' : 'סגירה בלי חתימה'}</button>` : '';
    return `<section><h3 class="sh">${cs ? 'אחרי הסגירה' : 'סגירת הפרויקט'}</h3><div class="rdylist">${rows.join('')}</div></section>${shareBtn}${closeBtn}`;
  }
  // ----- סיכום -----
  async function summary(box) {
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
    box.innerHTML = `${cs ? `<div class="card row"><span class="dot ok"></span><b class="grow">הפרויקט נסגר ${new Date(cs.closed_at).toLocaleDateString('he-IL')}</b></div>` : ''}
      ${kpiRow([[hrs && nf(hrs), 'שעות צוות'], [gal && nf(gal), 'גלונים'], [D.issues.length, 'תקלות'], [D.tasks.filter(t => t.is_extra).length, 'תוספות מהלקוח']])}
      <div id="labor"></div>
      ${SG.length ? `<section><h3 class="sh">${SG.length > 1 ? 'חתימות הלקוח' : 'חתימת הלקוח'}</h3>${SG.map((g, i) => `<div class="card stack tight"><div class="row"><b class="grow">${esc(g.name || '')}${g.role ? ' · ' + esc(g.role) : ''}</b><span class="pill ${g.ok ? 'ok' : 'warn'}">${g.ok ? 'אושר' : 'עם הערות'}</span></div>
        <small class="muted">${[g.at ? new Date(g.at).toLocaleDateString('he-IL') : '', g.days.length ? 'ימים: ' + daysTxt(g.days) : '', g.rating ? `שביעות רצון ${g.rating}/5` : ''].filter(Boolean).join(' · ')}</small>
        ${g.notes ? `<small>${esc(g.notes)}</small>` : ''}<div data-sg="${i}"></div></div>`).join('')}</section>` : ''}
      <section id="galsec" hidden><h3 class="sh">לפני / אחרי</h3><div class="photos" id="gal"></div></section>
      ${closeFlow(SG, cs)}`;
    if (M) laborBlock();
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
    const c = $('#cls'); if (c) c.onclick = async () => {
      // פיילוט: האפליקציה רק מדווחת שבוצע. ההחלטה אם להמשיך להצעה — ניהולית, במאנדי (הליד עובר ל"פיילוט בוצע — ממתין להצעה")
      if (p.engagement === 'פיילוט') { if (!(await confirmBox('סיום הפיילוט?', { ok: 'סיום הפיילוט' }))) return;
        const { error } = await sb.rpc('close_pilot', { p: id, ok: true }); if (error) return toast(errText(error, 'לא נסגר — נסו שוב')); toast('הפיילוט הסתיים'); return reload('s'); }
      const openDays = D.days.some(d => d.status !== 'done');
      if (!(await confirmBox(openDays ? 'יש ימים שלא נסגרו' : 'לסגור את הפרויקט?', { body: openDays ? 'לסגור את הפרויקט בכל זאת?' : '', ok: 'סגירת פרויקט' }))) return;
      const { error } = await sb.rpc('close_project', { p: id }); if (error) return toast(errText(error, 'הפרויקט לא נסגר — נסו שוב'));
      toast('הפרויקט נסגר'); reload('s');
    };
  }

  // ---------- שעות ועלות עבודה מהנוכחות (מנהלים; כסף רק עם הרשאת כספים) ----------
  async function laborBlock() {
    const box = $('#labor'); if (!box) return;
    const { data: rows } = await sb.from('project_labor_days').select('user_id,day,work_h,travel_h,ot_h,profiles(full_name)').eq('project_id', id).order('day');
    const ex = can('finance') ? Number(D.fin?.expenses_actual || 0) : 0;
    if (!(rows || []).length) { box.innerHTML = `${ex ? `<div class="card row"><b class="grow">הוצאות שטח שאושרו</b><b>₪${nf(ex)}</b></div>` : ''}`; return; }
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

  renderTab(tab === 'sch' ? 'o' : tab);
  // הגעה מלוח השיבוץ / "לשבץ צוות": נפתח ישר גיליון השיבוץ
  if (tab === 'sch') { const d0 = location.hash.split('/')[4] || ''; replaceHash(`#/p/${id}/o`, false); if (M) openSched(/^\d{4}-\d\d-\d\d$/.test(d0) ? d0 : null); }
}
