// יום שטח: בוקר ← העמסה ← באתר ← בעבודה ← סיום. השלב נגזר ממה שכבר נשמר, כל פעולה נכנסת לתור ונשלחת כשיש קליטה.
import { coverArt, icon, navButtons, thumbUrls } from '../lib/core.js';
import { sunPlan, sunAdvice, facadeOrder } from '../lib/sun.js';
import { sb, state, cache, enqueue, pendingPhotos, signedUrls, addFieldPhoto, sheet, uid, isManager, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm, ask, confirmBox } from '../lib/core.js';

const STEPS = ['בוקר', 'העמסה', 'באתר', 'בעבודה', 'סיום'];
const ISSUE_KIND = { 'רחפן': 'equipment', 'ציוד': 'equipment', 'בטיחות': 'safety', 'כמעט תאונה': 'near_miss', 'אתר': 'site', 'לקוח': 'site', 'אחר': 'other' };
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'in_progress', dropped: 'todo' };
const hhmm = t => (t || '').slice(0, 5);
const DAY_SEL = '*, projects(id,name,client_name,work_notes,site_id,cover_path,lat,lng,sites(name,address,contact_name,contact_phone,access_notes,lat,lng,map_path)), work_day_crew(user_id,role,hours,clock_in,profiles(full_name,phone)), drone:equipment!work_days_drone_id_fkey(id,name,health,health_detail)';

// ---------- רשימת הימים שלי ----------
export async function renderToday(el) {
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/'">→ בית</button></div>
    <div><div class="eyebrow">יום שטח</div><h1>הימים שלי</h1></div><div id="tl" class="stack"><div class="skel"></div></div>`;
  const t = isoDay(), until = isoDay(new Date(Date.now() + 10 * 864e5)), from = isoDay(new Date(Date.now() - 3 * 864e5));
  let days;
  try {
    let q = sb.from('work_days').select('id,day,status,report_time,site_arrival,day_goal,is_last_day,project_id,crew_lead_id,projects(name,client_name),work_day_crew(user_id)').gte('day', from).lte('day', until).order('day').order('report_time');
    const { data, error } = await q; if (error) throw error;
    days = (data || []).filter(d => isManager() || d.crew_lead_id === state.user.id || d.work_day_crew.some(c => c.user_id === state.user.id));
    await cache.set('mydays', days);
  } catch { days = (await cache.get('mydays')) || []; }
  const open = days.filter(d => d.day >= t || d.status !== 'done');
  const box = $('#tl'); if (!box) return;
  if (!open.length) { box.innerHTML = `<div class="empty">אין ימי שטח משובצים לך בימים הקרובים.<br>השיבוץ נעשה מתוך הפרויקט.</div>`; return; }
  const by = {}; open.forEach(d => (by[d.day] ||= []).push(d));
  box.innerHTML = Object.entries(by).map(([day, ds]) => `<div class="group-h">${dayLabel(day)}</div>${ds.map(d => `<a class="item" href="#/day/${d.id}">
      <span class="t"><b>${esc(d.projects?.name || '')}</b><small>${d.report_time ? 'יציאה ' + hhmm(d.report_time) + ' · ' : ''}${d.site_arrival ? 'באתר ' + hhmm(d.site_arrival) + ' · ' : ''}${esc(d.day_goal || d.projects?.client_name || '')}</small></span>
      ${statusPill(d)}</a>`).join('')}`).join('');
}
function statusPill(d) {
  const m = { planned: ['מתוכנן', ''], en_route: ['בדרך', 'warn'], on_site: ['באתר', 'lime'], working: ['בעבודה', 'lime'], issue: ['תקלה', 'bad'], done: ['נסגר', 'ok'] }[d.status] || ['', ''];
  return `<span class="pill ${m[1]}">${m[0]}${d.is_last_day && d.status !== 'done' ? ' · יום אחרון' : ''}</span>`;
}

// ---------- יום אחד ----------
export async function renderDay(el, id) {
  el.innerHTML = `<div class="skel"></div>`;
  const ck = 'day:' + id;
  let D;
  try {
    const [{ data: day, error }, { data: tasks }, { data: checks }, { data: photos }, { data: issues }, { data: missing }, { data: settings }, { data: team }] = await Promise.all([
      sb.from('work_days').select(DAY_SEL).eq('id', id).single(),
      sb.from('tasks').select('*').eq('work_day_id', id).order('seq'),
      sb.from('safety_checks').select('*').eq('work_day_id', id),
      sb.from('photos').select('id,kind,storage_path').eq('work_day_id', id).order('created_at'),
      sb.from('issues').select('*').eq('work_day_id', id).order('created_at'),
      sb.from('missing_items').select('*').eq('work_day_id', id).order('created_at'),
      sb.from('app_settings').select('*'),
      sb.from('profiles').select('id,full_name,phone,role').eq('is_active', true),
    ]);
    if (error) throw error;
    let allTasks = tasks || [];
    if (day.kind === 'report') {   // דוח יומי: אפשר לסמן כל משימה פתוחה של הפרויקט
      const { data: open } = await sb.from('tasks').select('*').eq('project_id', day.project_id).in('status', ['todo', 'in_progress', 'blocked']).order('day_no', { nullsFirst: false }).order('seq');
      allTasks = allTasks.concat((open || []).filter(t => !allTasks.some(x => x.id === t.id)));
    }
    D = { day, tasks: allTasks, checks: checks || [], photos: photos || [], issues: issues || [], missing: missing || [], S: Object.fromEntries((settings || []).map(s => [s.key, s.value])), team: team || [] };
    await cache.set(ck, D);
  } catch { D = await cache.get(ck); }
  if (!D) { el.innerHTML = `<div class="empty">היום לא נמצא, או שאין קליטה ועוד לא נפתח בטלפון הזה.</div>`; return; }
  // תמונות שעוד בתור (צולמו בלי קליטה) נספרות ומוצגות
  try { const pend = await pendingPhotos(m => m.work_day_id === id); D.photos = D.photos.filter(p => !p.url && !pend.some(x => x.photoId === p.id)).concat(pend.map(x => ({ id: x.photoId, kind: x.meta.kind, storage_path: x.path, url: URL.createObjectURL(x.blob) }))); } catch {}
  D.local = (await cache.get(ck + ':local')) || { stage: null, checks: {}, loaded: null };
  const keep = () => cache.set(ck, D).then(() => cache.set(ck + ':local', D.local));
  const save = async (table, patch, rowId = D.day.id) => { if (table === 'work_days') Object.assign(D.day, patch); await enqueue({ kind: 'update', table, rowId, patch }); await keep(); };
  const insert = async (table, row) => { await enqueue({ kind: 'insert', table, row }); await keep(); };
  const go = () => draw();

  const REPORT = D.day.kind === 'report';
  function stage() {
    const d = D.day;
    if (d.status === 'done') return 5;
    if (REPORT) return 4;
    if (D.local.stage === 4 || d.finished_at) return 4;
    if (['working', 'issue'].includes(d.status)) return 3;
    if (d.arrived_at || d.status === 'on_site' || d.departed_at) return 2;
    return D.local.stage === 1 ? 1 : 0;
  }
  const P = D.day.projects || {}, site = P.sites || {};
  const photoUrls = {};
  async function loadUrls() {
    const paths = D.photos.filter(p => !p.url).map(p => p.storage_path);
    if (paths.length) Object.assign(photoUrls, await thumbUrls('field', paths));
  }
  await loadUrls().catch(() => {});
  let coverUrl = null;
  if (P.cover_path) try { coverUrl = (await signedUrls('media', [P.cover_path]))[P.cover_path]; } catch {}

  function header() {
    const s = stage();
    return `<div class="phero sm"><span class="img" style="background-image:url('${coverUrl || coverArt(P.name || '')}')"></span>
        <a class="back glass" href="#/" aria-label="חזרה">${icon('back', 20)}</a>
        <span class="ph-bottom"><span class="row" style="gap:6px"><span class="chip-dark">${REPORT ? 'דוח יומי · ' : ''}${dayLabel(D.day.day)}${D.day.is_last_day ? ' · יום אחרון' : ''}</span>${statusPill(D.day)}</span>
        <b>${esc(P.name || '')}</b>${D.day.day_goal ? `<small>${esc(D.day.day_goal)}</small>` : ''}</span></div>
      ${REPORT ? '' : `<ol class="steps">${STEPS.map((t, i) => `<li class="${i < s ? 'done' : i === s ? 'now' : ''}"><i>${i < s ? '✓' : i + 1}</i><span>${t}</span></li>`).join('')}</ol>`}`;
  }
  function photoStrip(kind, label, min = 0) {
    const mine = D.photos.filter(p => p.kind === kind);
    return `<div class="stack" style="gap:8px"><div class="row"><b class="grow">${label}</b>${min ? `<span class="pill ${mine.length >= min ? 'ok' : 'warn'}">${mine.length}/${min}+</span>` : ''}</div>
      <div class="photos">${mine.map(p => `<button class="ph" data-z="${esc(p.url || photoUrls[p.storage_path]?.f || '')}"><img src="${esc(p.url || photoUrls[p.storage_path]?.t || '')}" data-full="${esc(p.url || photoUrls[p.storage_path]?.f || '')}" alt="">${p.url ? '<span class="q">בתור</span>' : ''}</button>`).join('')}
        <label class="addph">צילום<input type="file" accept="image/*" capture="environment" multiple data-kind="${kind}"></label></div></div>`;
  }
  function bindPhotos(root) {
    $$('input[data-kind]', root).forEach(inp => inp.onchange = async () => {
      for (const f of inp.files) { const ph = await addFieldPhoto(f, { kind: inp.dataset.kind, work_day_id: D.day.id, project_id: D.day.project_id }); D.photos.push({ id: ph.id, kind: ph.kind, storage_path: ph.path, url: ph.url }); }
      await keep(); toast('התמונה נשמרה'); draw();
    });
    $$('[data-z]', root).forEach(b => b.onclick = () => b.dataset.z && zoom(b.dataset.z, ''));
  }

  // ---------- שלבים ----------
  function sMorning() {
    const crew = D.day.work_day_crew.map(c => (c.profiles?.full_name || '') + (c.role === 'lead' ? ' ★' : '')).filter(x => x.trim());
    const nTasks = D.tasks.filter(t => t.phase !== 'הכנה').length;
    // סדר המסך = סדר הבוקר: מתי ולאן → מה המשרד ביקש → מה לקחת → מה עושים היום → איך (שמש) → מי ואיפה (איש קשר, מפה)
    return `<div class="card stack" style="gap:10px">
        <div class="kpis"><div class="kpi"><b>${hhmm(D.day.report_time) || '—'}</b><span>יציאה מהמשרד</span></div>
          ${D.day.site_arrival ? `<div class="kpi"><b><bdi dir="ltr">${hhmm(D.day.site_arrival)}${D.day.site_end ? '–' + hhmm(D.day.site_end) : ''}</bdi></b><span>באתר</span></div>` : `<div class="kpi"><b>${nTasks}</b><span>משימות היום</span></div>`}
          <div class="kpi"><b>${D.day.gallons_planned ? nf(D.day.gallons_planned) : '—'}</b><span>גלון ${esc(D.day.material_planned || '')}</span></div></div>
        ${countdown()}
        ${D.day.gust_max != null ? `<div class="wx ${D.day.weather_alerted ? 'bad' : ''}">${D.day.weather_alerted ? '⚠ ' : ''}תחזית לשעות העבודה: רוח עד ${D.day.wind_max} קמ"ש · משבים ${D.day.gust_max}${D.day.rain_mm ? ` · גשם ${D.day.rain_mm} מ"מ` : ''}</div>` : ''}
        <div class="small muted">צוות: ${esc(crew.join(' · ') || '—')}${D.day.drone ? ` · כלי: ${esc(D.day.drone.name)}` : ''}</div>
        ${navButtons(site.lat || P.lat, site.lng || P.lng, D.day.address || site.address || site.name || P.name)}${site.lat || P.lat ? '' : '<div class="small muted">אין מיקום שמור לאתר — הניווט לפי כתובת</div>'}
      </div>
      ${P.work_notes ? `<div class="note"><b>דגשים מהמשרד:</b> ${esc(P.work_notes)}</div>` : ''}
      ${site.access_notes ? `<div class="note">${esc(site.access_notes)}</div>` : ''}
      ${D.day.logistics?.length ? `<div class="card stack" style="gap:6px"><b>לפני היציאה</b>${D.day.logistics.map(l => `<div class="small">• ${esc(l)}</div>`).join('')}</div>` : ''}
      ${D.tasks.length ? `<div class="stack" style="gap:6px"><h3>בתכנית היום</h3>${D.tasks.map(t => `<div class="feed"><span class="pill">${esc(t.phase || '')}</span><span class="grow"><b>${esc(t.title)}</b>${t.risk ? `<small class="issue">${esc(t.risk)}</small>` : ''}${t.instructions ? `<small>${esc(t.instructions)}</small>` : ''}</span></div>`).join('')}</div>` : ''}
      ${sunCard()}
      ${contactCard(site.contact_name, site.contact_phone)}
      ${site.map_path ? '<div class="card sitemap compact" id="daymap"></div>' : ''}`;
  }
  // תכנון שמש: באיזה שעות כל חזית בצל — כדי לא לשטוף בשמש ישירה (מתייבש מהר ומשאיר סימנים)
  // כשהתכנית יודעת אילו חזיתות היום — רק הסדר שלהן. הטבלה המלאה מקופלת ל"פירוט"
  function sunCard() {
    const lat = site.lat || P.lat, lng = site.lng || P.lng;
    const a = D.day.site_arrival ? +D.day.site_arrival.slice(0, 2) : null;
    if (a != null && (a >= 18 || a < 5)) return '';  // משמרת לילה — אין שיקול שמש
    const pl = sunPlan(D.day.day, lat || 31.9, lng || 34.9), adv = sunAdvice(pl), hrs = pl.hours.filter(h => h.h >= 7 && h.h < 17);
    const hh = h => String(h).padStart(2, '0') + ':00';
    const fac = [...new Set(D.tasks.filter(t => t.phase === 'ביצוע').flatMap(t => t.facades || []))];
    const ord = fac.length ? facadeOrder(D.day.day, lat, lng, fac) : [];
    const grid = `<div class="sungrid"><span></span>${hrs.map(h => `<small>${h.h}</small>`).join('')}${pl.plan.map(f => `<b>${f.name}</b>${f.lit.filter((_, i) => pl.hours[i].h >= 7 && pl.hours[i].h < 17).map(l => `<i class="${l ? 'lit' : ''}"></i>`).join('')}`).join('')}</div>`;
    const list = `<ol class="sunlist">${adv.timed.map(r => `<li><b>${r.name}</b> · <bdi dir="ltr">${hh(r.win[0])}–${hh(r.win[1])}</bdi></li>`).join('')}${adv.flex.length ? `<li><b>${adv.flex.map(r => r.name).join(', ')}</b> · בצל כל היום — לשבץ בין לבין</li>` : ''}${adv.sunny.map(r => `<li><b>${r.name}</b> · בשמש כמעט כל היום — עדיף מוקדם בבוקר או ביום מעונן</li>`).join('')}</ol>`;
    return `<div class="card sun"><div class="row"><b class="grow">סדר שטיפה לפי השמש</b><small class="muted">${lat ? '' : 'מיקום משוער'}</small></div>
      ${ord.length ? `<div class="sunorder">${ord.map((o, i) => `<span><b>${i + 1}. ${esc(o.name)}</b><small>${esc(o.when)}</small></span>`).join('')}</div><details class="sunmore"><summary>פירוט לכל החזיתות</summary>${grid}${list}</details>` : grid + list}</div>`;
  }
  function countdown() {
    if (!D.day.report_time || D.day.day !== isoDay()) return '';
    const [h, m] = D.day.report_time.split(':').map(Number); const at = new Date(); at.setHours(h, m, 0, 0);
    const min = Math.round((at - Date.now()) / 6e4);
    return min > 0 ? `<div class="row"><span class="dot ok"></span><b>עוד ${min >= 60 ? Math.floor(min / 60) + ' ש׳ ' : ''}${min % 60} דק׳ ליציאה מהמשרד</b></div>` : '';
  }
  function droneGate() {
    const dr = D.day.drone; if (!dr) return '';
    if (dr.health === 'grounded') return `<div class="alert bad"><span class="dot"></span><span class="grow"><b>הכלי מקורקע — לא יוצאים</b><small>${esc((dr.health_detail || '').split('\n')[0])}</small></span></div>
      <a class="btn ghost block" href="tel:+972525397575">חיוג לטל</a>`;
    if (dr.health === 'warning') return `<div class="alert warn"><span class="dot"></span><span class="grow"><b>הכלי במעקב</b><small>${esc((dr.health_detail || '').split('\n')[0])}</small></span></div>
      <label class="tog"><span>קראתי ואני מאשר יציאה עם הכלי</span><span class="sw"><input type="checkbox" id="ack" ${D.day.drone_ack ? 'checked' : ''}><i></i></span></label>`;
    return `<div class="alert"><span class="dot ok"></span><span class="grow"><b>${esc(dr.name)} תקין</b></span></div>`;
  }
  function sLoad() {
    const req = D.day.equip_required?.length ? D.day.equip_required : (D.S.equip_default || []);
    D.local.loaded ||= [...(D.day.equip_loaded || [])];
    const n = D.local.loaded.filter(x => req.includes(x)).length;
    return `${droneGate()}
      <div class="row"><h3 class="grow">ציוד להעמסה</h3><span class="pill ${n === req.length ? 'ok' : 'warn'}">${n}/${req.length}</span></div>
      <div class="progress"><i style="width:${req.length ? Math.round(n / req.length * 100) : 0}%"></i></div>
      <div class="eqgrid">${req.map(x => `<button class="eqb" aria-pressed="${D.local.loaded.includes(x)}" data-eq="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  }
  function sSite() {
    const items = (D.S.safety_checks || []).concat(D.day.drone_id || D.day.method === 'רחפן' ? (D.S.preflight_checks || []) : []);
    const before = D.photos.filter(p => p.kind === 'before').length;
    return `${!D.day.arrived_at ? `<button class="btn primary block" id="arrive">הגענו לאתר</button>` : `<div class="small muted">הגעתם ב-${new Date(D.day.arrived_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>`}
      <div class="sec"><h3>בדיקות בטיחות</h3>${items.map((t, i) => `<label class="tog"><span>${esc(t)}</span><span class="sw"><input type="checkbox" data-chk="${i}" ${D.local.checks[i] || D.checks.some(c => c.item === t && c.ok) ? 'checked' : ''}><i></i></span></label>`).join('')}</div>
      <div class="sec">${photoStrip('before', 'תמונות "לפני"', 1)}</div>
      ${contactCard(site.contact_name, site.contact_phone)}
      <div class="small muted" id="why">${!before ? 'חסרה לפחות תמונת "לפני" אחת' : ''}</div>`;
  }
  function sWork() {
    const done = D.tasks.filter(t => t.status === 'done').length, tot = D.tasks.filter(t => t.status !== 'dropped').length;
    // סדר החזיתות לפי השמש — בשורה אחת מעל המשימות, כי בזמן העבודה זה מה שקובע מאיפה מתחילים
    const fac = [...new Set(D.tasks.filter(t => t.phase === 'ביצוע' && t.status !== 'done').flatMap(t => t.facades || []))];
    const a0 = D.day.site_arrival ? +D.day.site_arrival.slice(0, 2) : 7, night = a0 >= 18 || a0 < 5;
    const ord = fac.length > 1 && !night ? facadeOrder(D.day.day, site.lat || P.lat, site.lng || P.lng, fac) : [];
    return `${ord.length ? `<div class="sunline">${icon('sun', 16)}<span>${ord.map(o => `<b>${esc(o.name)}</b> <small>${esc(o.when)}</small>`).join(' ← ')}</span></div>` : ''}
      <div class="row"><h3 class="grow">משימות היום</h3><span class="pill ${done === tot && tot ? 'ok' : 'lime'}">${done}/${tot}</span></div>
      <div class="progress"><i style="width:${tot ? Math.round(done / tot * 100) : 0}%"></i></div>
      <div class="list">${D.tasks.map(t => `<button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? '✓' : t.status === 'blocked' ? '!' : ''}</span>
        <span class="t"><b>${esc(t.title)}</b><small>${esc(T_STATUS[t.status]?.[0] || '')}${t.status === 'done' && t.done_by ? ' · ' + esc((D.team.find(u => u.id === t.done_by)?.full_name || '').split(' ')[0]) + (t.done_at ? ' ' + new Date(t.done_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '') : ''}${t.status_note ? ' · ' + esc(t.status_note) : ''}${t.risk && t.status !== 'done' ? ' · ' + esc(t.risk) : ''}</small></span></button>`).join('') || '<div class="empty">אין משימות משובצות להיום.</div>'}</div>
      <div class="small muted">הקשה = הסטטוס הבא. לחיצה ארוכה = נתקע (עם הערה).</div>
      <button class="btn ghost block" id="addtask">+ משימה שהלקוח ביקש בשטח</button>
      ${D.issues.length ? `<div class="stack" style="gap:6px"><h3>תקלות היום</h3>${D.issues.map(i => `<div class="feed"><span class="pill ${i.severity === 'critical' ? 'bad' : 'warn'}">${esc(kindHe(i.kind))}</span><span class="grow"><b>${esc(i.body)}</b></span></div>`).join('')}</div>` : ''}
      ${D.missing.length ? `<div class="stack" style="gap:6px"><h3>חסר בשטח</h3>${D.missing.map(m => `<div class="feed"><span class="pill warn">חסר</span><span class="grow"><b>${esc(m.item)}${m.qty > 1 ? ' ×' + m.qty : ''}</b></span></div>`).join('')}</div>` : ''}
      <div class="sec">${photoStrip('general', 'תמונות מהעבודה')}</div>`;
  }
  function sClose() {
    D.local.close ||= {
      material: D.day.material_used || D.day.material_planned || 'Assert Lemon', gallons: D.day.gallons ?? D.day.gallons_planned ?? 0,
      work: D.day.work_types?.length ? D.day.work_types : ['ניקוי חזיתות'], equipment_ok: D.day.equipment_ok ?? true, quality: D.day.quality || 0,
      notes: D.day.notes || '', weather: D.day.weather_stop, hours: Object.fromEntries(D.day.work_day_crew.map(c => [c.user_id, c.hours ?? defHours()])),
      tomorrow: D.day.tomorrow ?? D.tasks.filter(t => !['done', 'dropped'].includes(t.status)).map(t => t.title).join(' · '),
      sign: { name: site.contact_name || '', role: '', satisfied: true, notes: '' },
      start: D.day.arrived_at ? hm(D.day.arrived_at) : '07:00', end: D.day.finished_at ? hm(D.day.finished_at) : (D.day.day === isoDay() ? hm(new Date().toISOString()) : '15:00'),
      crew: D.day.work_day_crew.map(c => c.user_id),
    };
    const C = D.local.close, done = D.tasks.filter(t => t.status === 'done').length, tot = D.tasks.filter(t => t.status !== 'dropped').length;
    const chips = (key, list, multi) => `<div class="chips">${list.map(x => `<button class="chip" data-c="${key}" data-v="${esc(x)}" data-m="${multi ? 1 : ''}" aria-pressed="${multi ? C[key].includes(x) : C[key] === x}">${esc(x)}</button>`).join('')}</div>`;
    const reportTop = !REPORT ? '' : `<div class="sec"><h3>מתי ומי</h3>
        <div class="row"><label class="field grow">התחלה<input type="time" id="rs" value="${C.start}"></label><label class="field grow">סיום<input type="time" id="re" value="${C.end}"></label></div>
        <b>מי עבד</b><div class="chips">${D.team.filter(u => ['crew_lead', 'crew', 'ops_manager', 'admin'].includes(u.role)).map(u => `<button class="chip" data-crew="${u.id}" aria-pressed="${C.crew.includes(u.id)}" ${u.id === D.day.crew_lead_id ? 'disabled' : ''}>${esc(u.full_name)}</button>`).join('')}</div></div>
      ${D.tasks.length ? `<div class="sec"><h3>מה בוצע מהתכנית</h3><div class="list">${D.tasks.map(t => `<button class="task ${t.status}" data-rt="${t.id}"><span class="tick">${t.status === 'done' ? '✓' : ''}</span><span class="t"><b>${esc(t.title)}</b><small>${esc(t.phase || '')}</small></span></button>`).join('')}</div></div>` : ''}
      <div class="sec">${photoStrip('before', 'תמונות "לפני"')}</div>`;
    return reportTop + (REPORT ? '' : `<div class="card row"><div class="ring" style="--p:${tot ? Math.round(done / tot * 100) : 0}"><b>${done}/${tot}</b></div><div class="grow"><b>משימות שבוצעו היום</b><div class="small muted">${tot - done ? `${tot - done} עוברות למחר` : 'הכל בוצע'}</div></div></div>`) + `
      <div class="sec"><b>חומר</b>${chips('material', D.S.materials || ['Assert Lemon', 'Topax', 'מים בלבד', 'אחר'])}
        <b>גלונים</b><div class="stepper"><button type="button" data-g="-0.5">−</button><input class="days grow" id="gal" type="number" inputmode="decimal" step="0.5" min="0" value="${C.gallons}"><button type="button" data-g="0.5">+</button></div>
        ${D.day.gallons_planned ? `<div class="small muted">מתוכנן: ${nf(D.day.gallons_planned)}</div>` : ''}
        <b>סוג העבודה</b>${chips('work', D.S.work_types || [], true)}</div>
      <div class="sec">${photoStrip('after', 'תמונות "אחרי"', 1)}</div>
      <div class="sec"><h3>שעות צוות</h3>${crewRows().map(c => `<div class="row"><span class="grow">${esc(c.profiles?.full_name || '')}</span><input type="number" inputmode="decimal" step="0.5" min="0" class="hrs" data-u="${c.user_id}" value="${C.hours[c.user_id] ?? ''}" style="width:96px;text-align:center"></div>`).join('')}</div>
      <div class="sec">
        ${D.day.drone_id || D.day.method === 'רחפן' ? `<div class="row"><label class="field grow">מספר טיסות<input type="number" inputmode="numeric" min="0" id="fl" value="${C.flights ?? ''}"></label><label class="field grow">דקות אוויר<input type="number" inputmode="numeric" min="0" id="am" value="${C.air ?? ''}"></label></div>` : ''}
        <label class="tog"><span>הציוד חזר תקין</span><span class="sw"><input type="checkbox" id="eqok" ${C.equipment_ok ? 'checked' : ''}><i></i></span></label>
        <label class="tog"><span>עצירה בגלל מזג אוויר</span><span class="sw"><input type="checkbox" id="wth" ${C.weather ? 'checked' : ''}><i></i></span></label>
        <b>איכות העבודה היום</b><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${C.quality >= n}">★</button>`).join('')}</div>
        <label class="field">מה נשאר למחר<textarea id="tmr">${esc(C.tomorrow)}</textarea></label>
        <label class="field">הערות למשרד<textarea id="nts" placeholder="מה חשוב שהמשרד ידע">${esc(C.notes)}</textarea></label></div>
      ${D.day.is_last_day ? `<div class="sec"><h3>החתמת לקוח</h3>
        <label class="field">שם החותם<input type="text" id="sn" value="${esc(C.sign.name)}"></label>
        <label class="field">תפקיד<input type="text" id="sr" value="${esc(C.sign.role)}" placeholder="מנהל אחזקה, מנהל אתר…"></label>
        <label class="tog"><span>הלקוח מרוצה מהעבודה</span><span class="sw"><input type="checkbox" id="ss" ${C.sign.satisfied ? 'checked' : ''}><i></i></span></label>
        <label class="field">הערות הלקוח<textarea id="snt">${esc(C.sign.notes)}</textarea></label>
        <div class="row"><b class="grow">חתימה</b><button class="chip" id="sclr" type="button">ניקוי</button></div>
        <canvas id="sig" class="sig"></canvas></div>` : ''}`;
  }
  function crewRows() {
    if (!REPORT) return D.day.work_day_crew;
    const C = D.local.close;
    return C.crew.map(u => D.day.work_day_crew.find(c => c.user_id === u) || { user_id: u, role: 'crew', profiles: { full_name: D.team.find(x => x.id === u)?.full_name || '' } });
  }
  function sDone() {
    const d = D.day, hrs = d.work_day_crew.reduce((s, c) => s + Number(c.hours || 0), 0);
    return `<div class="card stack" style="text-align:center;gap:6px"><div class="big-ok">✓</div><h2>${REPORT ? 'הדוח נשלח' : 'היום נסגר'}</h2>
        <div class="muted">${d.monday_item_id ? 'הדוח התקבל במשרד' : 'הדוח נשלח למשרד'}</div></div>
      <div class="kpis"><div class="kpi"><b>${D.tasks.filter(t => t.status === 'done').length}/${D.tasks.length}</b><span>משימות</span></div><div class="kpi"><b>${d.gallons != null ? nf(d.gallons) : '—'}</b><span>גלונים</span></div><div class="kpi"><b>${hrs ? nf(hrs) : '—'}</b><span>שעות צוות</span></div></div>
      ${d.tomorrow ? `<div class="note"><b>למחר:</b> ${esc(d.tomorrow)}</div>` : ''}
      ${d.signoff ? `<div class="card"><div class="eyebrow">חתימת לקוח</div><b>${esc(d.signoff.name || '')}</b> ${d.signoff.role ? '· ' + esc(d.signoff.role) : ''}<div class="small muted">${d.signoff.satisfied ? 'מרוצה' : 'לא מרוצה'}${d.signoff.notes ? ' · ' + esc(d.signoff.notes) : ''}</div></div>` : ''}
      <div class="photos">${D.photos.filter(p => ['before', 'after'].includes(p.kind)).map(p => `<button class="ph" data-z="${esc(p.url || photoUrls[p.storage_path]?.f || '')}"><img src="${esc(p.url || photoUrls[p.storage_path]?.t || '')}" data-full="${esc(p.url || photoUrls[p.storage_path]?.f || '')}" alt=""><span class="q">${p.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join('')}</div>
      <a class="btn ghost block" href="#/p/${d.project_id}">לפרויקט</a>`;
  }
  const defHours = () => { const st = D.day.departed_at || D.day.arrived_at; return st ? Math.max(0.5, Math.round((Date.now() - new Date(st)) / 18e5) / 2) : null; };

  // ---------- ציור + פעולות ----------
  function draw() {
    document.querySelectorAll('.bar,.fabs').forEach(x => x.remove());
    const s = stage();
    el.innerHTML = header() + `<div class="stack" id="body">${[sMorning, sLoad, sSite, sWork, sClose, sDone][s]()}</div>`;
    bindCopy(el); bindPhotos(el);
    if (isManager()) { let sg = $('#daysig', el); if (!sg) { sg = document.createElement('div'); sg.className = 'sigline'; sg.id = 'daysig'; el.appendChild(sg); }
      import('../lib/audit.js').then(m => m.signature(sg, { work_day_id: D.day.id })); }
    const dm0 = $('#daymap', el);
    if (dm0) signedUrls('plans', [site.map_path]).then(u => { const url = u[site.map_path]; if (!url) { dm0.remove(); return; }
      dm0.innerHTML = `<button class="smimg" type="button"><img src="${esc(url)}" alt="מפת האתר"></button><b>מפת האתר</b>`; $('.smimg', dm0).onclick = () => zoom(url, 'מפת האתר'); });
    const bar = document.createElement('div'); bar.className = 'bar';
    if (s === 0) { bar.innerHTML = `<button class="btn primary" id="nx">מתחילים העמסה</button>`; bar.querySelector('#nx').onclick = () => { D.local.stage = 1; keep(); draw(); }; }
    if (s === 1) bindLoad(bar);
    if (s === 2) bindSite(bar);
    if (s === 3) bindWork(bar);
    if (s === 4) bindClose(bar);
    if (s < 5) document.body.appendChild(bar);
    if (s >= 2 && s <= 4) fabs();
  }
  function bindLoad(bar) {
    $$('[data-eq]').forEach(b => b.onclick = () => { const x = b.dataset.eq, L = D.local.loaded; L.includes(x) ? L.splice(L.indexOf(x), 1) : L.push(x); keep(); draw(); });
    const ack = $('#ack'); if (ack) ack.onchange = () => { D.day.drone_ack = ack.checked; keep(); draw(); };
    const dr = D.day.drone, blocked = dr?.health === 'grounded' || (dr?.health === 'warning' && !D.day.drone_ack);
    bar.innerHTML = `<button class="btn ghost" id="bk">חזרה</button><button class="btn primary" id="out" ${blocked ? 'disabled' : ''}>יוצאים לאתר</button>`;
    bar.querySelector('#bk').onclick = () => { D.local.stage = 0; keep(); draw(); };
    bar.querySelector('#out').onclick = async () => {
      const req = D.day.equip_required?.length ? D.day.equip_required : (D.S.equip_default || []);
      const miss = req.filter(x => !D.local.loaded.includes(x));
      if (miss.length && !(await confirmBox(`יוצאים בלי ${miss.length} פריטים?`, { body: miss.join(' · ') + ' — יירשם כחוסר ויעבור למשרד', ok: 'יוצאים' }))) return;
      for (const m of miss) { const row = { id: uid(), work_day_id: D.day.id, item: m, qty: 1, reported_by: state.user.id }; D.missing.push(row); await insert('missing_items', row); }
      const now = new Date().toISOString();
      await save('work_days', { departed_at: now, status: 'en_route', equip_loaded: D.local.loaded, drone_ack: !!D.day.drone_ack });
      for (const c of D.day.work_day_crew) if (!c.clock_in) c.clock_in = now;
      await enqueue({ kind: 'rpc', fn: 'crew_depart', args: { d: D.day.id, t: now } });
      toast('נסיעה טובה'); draw();
    };
  }
  function bindSite(bar) {
    const a = $('#arrive'); if (a) a.onclick = async () => { await save('work_days', { arrived_at: new Date().toISOString(), status: 'on_site' }); draw(); };
    $$('[data-chk]').forEach(c => c.onchange = () => { D.local.checks[c.dataset.chk] = c.checked; keep(); draw(); });
    const items = (D.S.safety_checks || []).concat(D.day.drone_id || D.day.method === 'רחפן' ? (D.S.preflight_checks || []) : []);
    const allOk = items.every((t, i) => D.local.checks[i] || D.checks.some(c => c.item === t && c.ok));
    const before = D.photos.some(p => p.kind === 'before');
    bar.innerHTML = `<button class="btn primary" id="start" ${D.day.arrived_at && allOk && before ? '' : 'disabled'}>מתחילים לעבוד</button>`;
    if (!allOk && $('#why')) $('#why').textContent = [!D.day.arrived_at && 'לסמן הגעה', !allOk && 'להשלים בדיקות בטיחות', !before && 'לצלם "לפני"'].filter(Boolean).join(' · ');
    bar.querySelector('#start').onclick = async () => {
      for (const [i, t] of items.entries()) if (!D.checks.some(c => c.item === t)) { const row = { id: uid(), work_day_id: D.day.id, item: t, ok: true, checked_by: state.user.id }; D.checks.push(row); await insert('safety_checks', row); }
      await save('work_days', { status: 'working', opened_at: D.day.opened_at || new Date().toISOString() });
      toast('עבודה בטוחה'); draw();
    };
  }
  function bindWork(bar) {
    $$('[data-t]').forEach(b => {
      let timer, long = false;
      b.onpointerdown = () => { long = false; timer = setTimeout(async () => { long = true; const t = D.tasks.find(x => x.id === b.dataset.t); const note = await ask('מה תקוע?', { value: t.status_note || '', placeholder: 'למשל: מחכים למפתח לגג', ok: 'סימון כנתקע' }); if (note == null) return; t.status = 'blocked'; t.status_note = note; await save('tasks', { status: 'blocked', status_note: note }, t.id); draw(); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = async () => {
        if (long) return; const t = D.tasks.find(x => x.id === b.dataset.t), prev = t.status;
        t.status = NEXT[prev]; const patch = { status: t.status };
        if (t.status === 'done') { patch.done_by = state.user.id; patch.done_at = new Date().toISOString(); }
        await save('tasks', patch, t.id); draw();
        undo(`${t.title}: ${T_STATUS[t.status][0]}`, async () => { t.status = prev; await save('tasks', { status: prev }, t.id); draw(); });
      };
    });
    $('#addtask').onclick = async () => {
      const title = await ask('מה הלקוח ביקש?', { placeholder: 'למשל: ניקוי שלט הכניסה', hint: 'נרשם כתוספת בפרויקט ועובר למשרד', ok: 'הוספה' }); if (!title) return;
      const row = { id: uid(), project_id: D.day.project_id, work_day_id: D.day.id, title, phase: 'תוספת', is_extra: true, status: 'todo', seq: 999, planned_date: D.day.day };
      D.tasks.push(row); await insert('tasks', row); draw();
    };
    bar.innerHTML = `<button class="btn primary" id="fin">סיום יום</button>`;
    bar.querySelector('#fin').onclick = () => { D.local.stage = 4; keep(); draw(); };
  }
  function bindClose(bar) {
    const C = D.local.close;
    $$('[data-c]').forEach(b => b.onclick = () => { const k = b.dataset.c, v = b.dataset.v; if (b.dataset.m) { C[k].includes(v) ? C[k].splice(C[k].indexOf(v), 1) : C[k].push(v); } else C[k] = v; keep(); draw(); });
    const gal = $('#gal'); gal.oninput = () => { C.gallons = gal.value === '' ? null : Number(gal.value); keep(); };
    $$('[data-g]').forEach(b => b.onclick = () => { gal.value = Math.max(0, (Number(gal.value) || 0) + Number(b.dataset.g)); gal.oninput(); });
    $$('.hrs').forEach(i => i.oninput = () => { C.hours[i.dataset.u] = i.value === '' ? null : Number(i.value); keep(); });
    $('#eqok').onchange = e => { C.equipment_ok = e.target.checked; keep(); };
    const fl = $('#fl'), am = $('#am'); if (fl) { fl.oninput = () => { C.flights = fl.value === '' ? null : +fl.value; keep(); }; am.oninput = () => { C.air = am.value === '' ? null : +am.value; keep(); }; }
    $('#wth').onchange = e => { C.weather = e.target.checked; keep(); };
    $$('[data-q]').forEach(b => b.onclick = () => { C.quality = Number(b.dataset.q); keep(); draw(); });
    $('#tmr').oninput = e => { C.tomorrow = e.target.value; keep(); };
    $('#nts').oninput = e => { C.notes = e.target.value; keep(); };
    if (REPORT) {
      const span = () => { const [a, b] = [C.start, C.end].map(x => x.split(':').map(Number)); const h = Math.max(0, (b[0] * 60 + b[1] - a[0] * 60 - a[1]) / 60); return Math.round(h * 2) / 2; };
      const setAll = () => { C.crew.forEach(u => C.hours[u] = span()); keep(); draw(); };
      $('#rs').onchange = e => { C.start = e.target.value; setAll(); };
      $('#re').onchange = e => { C.end = e.target.value; setAll(); };
      $$('[data-crew]').forEach(b => b.onclick = () => { const u = b.dataset.crew; if (C.crew.includes(u)) C.crew.splice(C.crew.indexOf(u), 1); else { C.crew.push(u); C.hours[u] = span(); } keep(); draw(); });
      $$('[data-rt]').forEach(b => b.onclick = async () => { const t = D.tasks.find(x => x.id === b.dataset.rt); const on = t.status !== 'done';
        t.status = on ? 'done' : 'todo'; await save('tasks', on ? { status: 'done', work_day_id: D.day.id, done_by: state.user.id, done_at: new Date().toISOString() } : { status: 'todo' }, t.id); draw(); });
    }
    let sig;
    if (D.day.is_last_day) {
      ['sn', 'sr', 'snt'].forEach(k => $('#' + k).oninput = e => { C.sign[{ sn: 'name', sr: 'role', snt: 'notes' }[k]] = e.target.value; keep(); });
      $('#ss').onchange = e => { C.sign.satisfied = e.target.checked; keep(); };
      sig = pad($('#sig'), C.sign.img, url => { C.sign.img = url; keep(); }); $('#sclr').onclick = () => { sig.clear(); C.sign.img = null; keep(); };
    }
    bar.innerHTML = REPORT ? `<button class="btn primary" id="close">שליחת הדוח</button>` : `<button class="btn ghost" id="bk">חזרה לעבודה</button><button class="btn primary" id="close">סגירת יום ושליחה</button>`;
    if (!REPORT) bar.querySelector('#bk').onclick = () => { D.local.stage = null; keep(); draw(); };
    bar.querySelector('#close').onclick = async () => {
      if (!D.photos.some(p => p.kind === 'after')) return toast('חסרה לפחות תמונת "אחרי" אחת');
      if (C.gallons == null) return toast('חסר: כמות גלונים');
      if (REPORT && C.start >= C.end) return toast('שעת הסיום לפני שעת ההתחלה');
      if (crewRows().some(c => C.hours[c.user_id] == null)) return toast('חסרות שעות לחלק מהצוות');
      let signoff = null;
      if (D.day.is_last_day) {
        if (!C.sign.name.trim()) return toast('חסר: שם החותם');
        if (sig.empty()) return toast('חסרה חתימת הלקוח');
        const path = `${state.user.id}/${D.day.id}/signature.png`;
        await enqueue({ kind: 'file', path, blob: await sig.blob(), type: 'image/png' });
        const { img, ...sg } = C.sign; signoff = { ...sg, signature_path: path, at: new Date().toISOString() };
      }
      const b = bar.querySelector('#close'); b.disabled = true; b.textContent = 'שולח…';
      const now = new Date().toISOString();
      const extra = {};
      if (REPORT) {
        await enqueue({ kind: 'rpc', fn: 'set_day_crew', args: { d: D.day.id, users: C.crew.filter(u => u !== D.day.crew_lead_id) } });
        D.day.work_day_crew = crewRows();
        extra.arrived_at = new Date(`${D.day.day}T${C.start}`).toISOString(); extra.finished_at = new Date(`${D.day.day}T${C.end}`).toISOString();
      }
      D.day.work_day_crew.forEach(c => c.hours = C.hours[c.user_id]);
      await enqueue({ kind: 'rpc', fn: 'set_day_hours', args: { d: D.day.id, rows: D.day.work_day_crew.map(c => ({ user_id: c.user_id, role: c.role, hours: c.hours })) } });
      await save('work_days', { status: 'done', finished_at: now, ...extra, closed_at: now, material_used: C.material, gallons: C.gallons, work_types: C.work, equipment_ok: C.equipment_ok,
        weather_stop: !!C.weather, quality: C.quality || null, flights: C.flights ?? null, air_minutes: C.air ?? null, notes: C.notes || null, tomorrow: C.tomorrow || null, signoff });
      D.local = { stage: null, checks: {}, loaded: null }; await keep();
      celebrate(); draw();
    };
  }
  function fabs() {
    const f = document.createElement('div'); f.className = 'fabs';
    f.innerHTML = `<button class="fab bad" id="fiss">תקלה</button><button class="fab" id="fmis">חסר לי</button>`;
    document.body.appendChild(f);
    $('#fiss').onclick = () => {
      let kind = 'רחפן', crit = false, ph = null;
      sheet(`<h3>דיווח תקלה</h3><div class="chips">${(D.S.issue_types || Object.keys(ISSUE_KIND)).map(k => `<button class="chip" data-k="${esc(k)}" aria-pressed="${k === kind}">${esc(k)}</button>`).join('')}</div>
        <textarea id="ib" placeholder="מה קרה?"></textarea>
        <label class="tog"><span>קריטי — העבודה נעצרה</span><span class="sw"><input type="checkbox" id="ic"><i></i></span></label>
        <label class="btn ghost block" style="position:relative">צילום התקלה<input type="file" accept="image/*" capture="environment" id="ip" style="position:absolute;inset:0;opacity:0"></label><div id="ipn" class="small muted"></div>
        <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="isend">שליחה</button></div>`, (s, close) => {
        $$('[data-k]', s).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); });
        $('#ic', s).onchange = e => crit = e.target.checked;
        $('#ip', s).onchange = e => { ph = e.target.files[0]; $('#ipn', s).textContent = ph ? 'התמונה תצורף' : ''; };
        $('#isend', s).onclick = async () => {
          const body = $('#ib', s).value.trim(); if (!body) return toast('כתבו מה קרה');
          const row = { id: uid(), project_id: D.day.project_id, work_day_id: D.day.id, kind: ISSUE_KIND[kind] || 'other', severity: crit ? 'critical' : 'normal',
            body: kind === 'רחפן' || kind === 'לקוח' ? `${kind}: ${body}` : body, opened_by: state.user.id, equipment_id: kind === 'רחפן' ? D.day.drone_id : null };
          D.issues.push(row); await insert('issues', row);
          if (ph) await addFieldPhoto(ph, { kind: 'issue', work_day_id: D.day.id, project_id: D.day.project_id, issue_id: row.id });
          if (crit) await save('work_days', { status: 'issue' });
          close(); toast('התקלה דווחה למשרד'); draw();
        };
      });
    };
    $('#fmis').onclick = () => sheet(`<h3>חסר לי</h3><input type="text" id="mi" placeholder="מה חסר?"><div class="stepper"><button type="button" id="mq-">−</button><input class="days grow" id="mq" type="number" value="1" min="1"><button type="button" id="mq+">+</button></div>
        <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="msend">שליחה</button></div>`, (s, close) => {
      $('[id="mq-"]', s).onclick = () => $('#mq', s).value = Math.max(1, +$('#mq', s).value - 1);
      $('[id="mq+"]', s).onclick = () => $('#mq', s).value = +$('#mq', s).value + 1;
      $('#msend', s).onclick = async () => {
        const item = $('#mi', s).value.trim(); if (!item) return toast('מה חסר?');
        const row = { id: uid(), work_day_id: D.day.id, item, qty: +$('#mq', s).value || 1, reported_by: state.user.id };
        D.missing.push(row); await insert('missing_items', row); close(); toast('נרשם ונשלח למשרד'); draw();
      };
    });
  }
  function undo(text, fn) {
    const e = $('#toast'); e.innerHTML = `${esc(text)} <button class="undo">ביטול</button>`; e.hidden = false;
    e.querySelector('.undo').onclick = () => { e.hidden = true; fn(); };
    clearTimeout(undo.h); undo.h = setTimeout(() => e.hidden = true, 5000);
  }
  draw();
}

const hm = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const kindHe = k => ({ equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' }[k] || k);

// חתימת אצבע
export function pad(cv, initial, onSave) {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#111';
  let drawing = false, used = false;
  if (initial) { const im = new Image(); im.onload = () => { x.drawImage(im, 0, 0, r.width, r.height); used = true; }; im.src = initial; }
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { drawing = true; used = true; cv.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...pt(e)); };
  cv.onpointermove = e => { if (!drawing) return; x.lineTo(...pt(e)); x.stroke(); };
  cv.onpointerup = () => { drawing = false; onSave && onSave(cv.toDataURL('image/png')); };
  return { clear: () => { x.clearRect(0, 0, cv.width, cv.height); used = false; }, empty: () => !used, blob: () => new Promise(r => cv.toBlob(r, 'image/png')) };
}
function celebrate() {
  const c = document.createElement('div'); c.className = 'confetti';
  c.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="--x:${Math.random() * 100}vw;--d:${0.8 + Math.random()}s;--c:${['#b5e04a', '#6fd49a', '#f0b35a', '#7fb2ff'][i % 4]}"></i>`).join('');
  document.body.appendChild(c); setTimeout(() => c.remove(), 2200);
}
