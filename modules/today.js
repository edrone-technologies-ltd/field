// יום שטח: בוקר ← העמסה ← באתר ← בעבודה ← סיום. השלב נגזר ממה שכבר נשמר, כל פעולה נכנסת לתור ונשלחת כשיש קליטה.
import { coverArt, icon, leadMark, navButtons, thumbUrls } from '../lib/core.js';
import { sunPlan, sunAdvice, facadeOrder } from '../lib/sun.js';
import { isNight, nightRange, nightTag, isCurrent, wxKey } from '../lib/night.js';
import { dtTag, isWorkDay, needsPreflight, isCoord } from '../lib/daytype.js';
import { loadZones, dayZones, zonePrefill, zonesHtml, bindZones, zonesPayload, zkey } from './zones.js';
import { terms, serviceOf, workChoices } from '../lib/service.js';
import { SEC, needsDrone, pulseRoles, mySection, decideSheet, afterDecide } from './prestart.js';
import { sb, state, cache, enqueue, sendsLabel, pendingPhotos, signedUrls, addFieldPhoto, sheet, uid, isManager, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, isoDay, dayLabel, dm, ask, confirmBox, haptic } from '../lib/core.js';

const STEPS = ['בוקר', 'העמסה', 'באתר', 'בעבודה', 'סיום'];
const ISSUE_KIND = { 'רחפן': 'equipment', 'ציוד': 'equipment', 'בטיחות': 'safety', 'כמעט תאונה': 'near_miss', 'אתר': 'site', 'לקוח': 'site', 'אחר': 'other' };
const T_STATUS = { todo: ['לביצוע', ''], in_progress: ['בעבודה', 'lime'], done: ['בוצע', 'ok'], blocked: ['נתקע', 'bad'], dropped: ['בוטל', ''] };
const NEXT = { todo: 'done', in_progress: 'done', done: 'todo', blocked: 'done', dropped: 'todo' };   // הקשה אחת = בוצע (ושוב = ביטול)
const hhmm = t => (t || '').slice(0, 5);
const DAY_SEL = '*, projects(id,name,client_name,work_notes,site_id,cover_path,lat,lng,service,engagement,sites(name,address,contact_name,contact_phone,access_notes,access_auto,lat,lng,map_path,service)), work_day_crew(user_id,role,hours,clock_in,confirmed_at,cant_come_at,profiles(full_name,phone,is_pilot,field_role)), drone:equipment!work_days_drone_id_fkey(id,name,health,health_detail)';

function statusPill(d) {
  const m = { planned: ['מתוכנן', ''], en_route: ['בדרך', 'warn'], on_site: ['באתר', 'lime'], working: ['בעבודה', 'lime'], issue: ['תקלה', 'bad'], done: ['נסגר', 'ok'] }[d.status] || ['', ''];
  return `<span class="pill ${m[1]}">${m[0]}${d.is_last_day && d.status !== 'done' ? ' · יום אחרון' : ''}</span>`;
}

// ---------- יום אחד ----------
// טעינת יום מהשרת לתוך המטמון ('day:<id>') — גם מראש מהבית, כדי שהיום ייפתח בשטח בלי קליטה
export async function loadDay(id) {
  const n0 = state.storedN;
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
  const q = p => p.then(r => r.data || []).catch(() => []);
  const [open, sp, ch, fixes, plan, ops, prep, zones] = await Promise.all([
    day.kind === 'report' ? q(sb.from('tasks').select('*').eq('project_id', day.project_id).in('status', ['todo', 'in_progress', 'blocked']).order('day_no', { nullsFirst: false }).order('seq')) : [],   // דוח יומי: אפשר לסמן כל משימה פתוחה של הפרויקט
    // תמונות האפיון של האתר = ה"לפני" המקורי. מוצגות כרפרנס לזווית הצילום (שרשרת אפיון → ביצוע → דוח)
    day.projects?.site_id ? q(sb.from('photos').select('storage_path').eq('site_id', day.projects.site_id).in('kind', ['facade', 'site']).order('created_at').limit(12)) : [],
    // שעות מהשעון — מילוי מראש של סגירת היום (כל מי שבצוות היום; null = לא ידוע)
    sb.rpc('day_shift_hours', { d: id }).then(r => r.error ? null : r.data || []).catch(() => null),
    // תיקונים מדוח ביקור של אותו פרויקט — מבוצעים בזמן יום השטח
    q(sb.from('tasks').select('id,title,instructions,status,project_id,photos,assignee_id').eq('project_id', day.project_id).eq('phase', 'מעקב').like('instructions', 'מדוח ביקור%').not('status', 'in', '(done,dropped)').or('review.is.null,review.neq.pending')),   // ממתין לאישור — כבר לא לטיפול
    day.kind === 'report' ? null : import('./plan.js').then(m => m.dayPlan(day)).catch(() => undefined),
    // שטח ולוגיסטיקה מהאפיון (מים, חשמל, גישה, המראה, תיאומים, סיכונים, מרחב אווירי) + משימות ההכנה הפתוחות של הפרויקט
    day.projects?.site_id ? q(sb.from('buildings').select('name,specs(site_ops,hydrants,power)').eq('site_id', day.projects.site_id)) : [],
    q(sb.from('tasks').select('id,title,status,work_day_id').eq('project_id', day.project_id).eq('phase', 'הכנה').not('status', 'in', '(done,dropped)').or(`work_day_id.is.null,work_day_id.eq.${id}`).order('seq')),   // הכנות של היום + כלליות (של יום אחר — ביום ההוא)
    loadZones(day.project_id).catch(() => null),   // אזורים מהאפיון (חזיתות + מ״ר) — לסגירת היום
  ]);
  const allTasks = (tasks || []).concat(open.filter(t => !(tasks || []).some(x => x.id === t.id)));
  const D = { zones, ops: siteOps(ops), prep, at: Date.now(), clockH: ch ? Object.fromEntries(ch.map(r => [r.user_id, Number(r.hours)])) : null, specPh: sp, fixes, plan, day, tasks: allTasks, checks: checks || [], photos: photos || [], issues: issues || [], missing: missing || [], S: Object.fromEntries((settings || []).map(s => [s.key, s.value])), team: team || [] };
  // רשימת ההעמסה לפי האפיון (רק כשלא נקבעה ידנית ליום): ברז/הידרנט → המתאם, שקע באתר → בלי גנרטור, חומר הניקוי בשמו, גג → רתמות
  const def = D.S.equip_default || [], req = day.equip_required || [];
  if (Object.keys(D.ops).length && (!req.length || (req.length === def.length && req.every(x => def.includes(x))))) day.equip_required = tailorEquip(def, D.ops, day.material_planned);
  // חלק מהתשובות הגיעו מהעותק בטלפון (בלי קליטה / קליטה חלשה) — היום השמור מקומית (כולל מה שעשינו בו) עדכני יותר: לא דורסים אותו
  if (state.storedN > n0) { const c = await cache.get('day:' + id).catch(() => null); if (c?.day) return c; }
  await cache.set('day:' + id, D);
  return D;
}
function tailorEquip(base, o, mat) {
  let L = [...base]; const has = (k, v) => String(o[k] || '').split(' / ').includes(v), swap = (a, b) => { const i = L.indexOf(a); if (i >= 0) { if (b) L[i] = b; else L.splice(i, 1); } else if (b) L.push(b); };
  if (has('water', 'הידרנט')) swap(null, 'מתאם הידרנט'); else if (has('water', 'ברז באתר')) swap(null, 'מחבר לברז');   // מכלית — משימת הכנה, לא פריט להעמסה
  if (has('power', 'שקע באתר') && !has('power', 'גנרטור')) { swap('גנרטור', null); if (!L.includes('כבל מאריך')) L.push('כבל מאריך'); }
  if (mat === 'מים בלבד') swap('חומר ניקוי', null); else if (mat && mat !== 'אחר') swap('חומר ניקוי', 'חומר ניקוי · ' + mat);
  if (has('launch', 'גג') && !L.some(x => /רתמ/.test(x))) L.push('רתמות לעבודה מהגג');
  return [...new Set(L)];
}
export async function renderDay(el, id) {
  el.innerHTML = `<div class="skel"></div>`;
  const ck = 'day:' + id;
  let D;
  try { D = await loadDay(id); } catch { D = await cache.get(ck); }
  if (!D) { el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">יום שטח</h1></header><div class="empty-line">היום לא נמצא או שאין קליטה</div>`; return; }
  // תמונות שעוד בתור (צולמו בלי קליטה) נספרות ומוצגות. תמונה שכבר עלתה (קישור מקומי ישן) נשארת ברשימה בלי הקישור — לא נעלמת
  try { const pend = await pendingPhotos(m => m.work_day_id === id); D.photos = D.photos.filter(p => !pend.some(x => x.photoId === p.id)).map(p => p.url ? { id: p.id, kind: p.kind, storage_path: p.storage_path } : p).concat(pend.map(x => ({ id: x.photoId, kind: x.meta.kind, storage_path: x.path, url: URL.createObjectURL(x.blob) }))); } catch {}
  // מה שעוד בתור גובר על מה שהשרת (או העותק השמור ממנו) אומר — אחרת אחרי פתיחה מחדש בלי קליטה היום "חוזר לבוקר" ועושים הכל פעמיים
  await overlayPending(D).catch(() => {});
  D.local = (await cache.get(ck + ':local')) || { stage: null, checks: {}, loaded: null };
  // שלב/טופס קודם (קטן), אחר כך היום כולו. כישלון שמירה (טלפון מלא) לא עוצר את המסך — מה שבתור נשמר בנפרד
  const keep = () => cache.set(ck + ':local', D.local).then(() => cache.set(ck, D)).catch(() => {});
  const save = async (table, patch, rowId = D.day.id) => { if (table === 'work_days') Object.assign(D.day, patch); await enqueue({ kind: 'update', table, rowId, patch }); await keep(); };
  const insert = async (table, row) => { await enqueue({ kind: 'insert', table, row }); await keep(); };
  const go = () => draw();

  const REPORT = D.day.kind === 'report';
  // סגירת היום = ראש הצוות (או מנהל). שאר הצוות ממשיכים לעבוד ורואים שראש הצוות סוגר
  const canClose = () => isManager() || !D.day.crew_lead_id || D.day.crew_lead_id === state.user.id;
  const leadName = () => (D.day.work_day_crew.find(c => c.user_id === D.day.crew_lead_id)?.profiles?.full_name || '').split(' ')[0];
  function stage() {
    const d = D.day;
    if (d.status === 'done') return 5;
    if (REPORT) return 4;
    if ((D.local.stage === 4 && canClose()) || d.finished_at) return 4;
    if (d.status === 'working' || (d.status === 'issue' && d.opened_at)) return 3;   // הופסק לפני שהתחילו (דופק לפני עבודה) — נשארים ב"באתר"
    if (d.arrived_at || d.status === 'on_site' || d.departed_at) return 2;
    return D.local.stage === 1 && !isCoord(d) ? 1 : 0;   // יום תיאום — בלי שלב העמסה
  }
  const P = D.day.projects || {}, site = P.sites || {}, TT = terms(serviceOf(P));   // שפת השירות: פנלים → "מערך", ברירת מחדל "שטיפת פנלים סולאריים"
  const photoUrls = {};
  async function loadUrls() {
    const paths = D.photos.filter(p => !p.url).map(p => p.storage_path);
    if (paths.length) Object.assign(photoUrls, await thumbUrls('field', paths));
    const sp = (D.specPh || []).map(p => p.storage_path);
    if (sp.length) { const u = await thumbUrls('field', sp); sp.forEach(x => photoUrls['spec:' + x] = u[x]); }
  }
  await loadUrls().catch(() => {});
  let coverUrl = null;
  if (P.cover_path) try { coverUrl = (await signedUrls('media', [P.cover_path]))[P.cover_path]; } catch {}

  function header() {
    const s = stage();
    return `<div class="phero sm"><span class="img" style="background-image:url('${coverUrl || coverArt(P.name || '')}')"></span>
        <a class="back glass" href="#/" aria-label="חזרה">${icon('back', 20)}</a>
        <span class="ph-bottom"><span class="row"><span class="chip-dark">${REPORT ? 'דוח יומי · ' : ''}${isNight(D.day) ? nightTag(D.day) + ' ' + esc(nightRange(D.day)) : dayLabel(D.day.day)}${dtTag(D.day)}</span>${statusPill(D.day)}</span>
        <b>${esc(P.name || '')}</b>${D.day.day_goal ? `<small>${esc(D.day.day_goal)}</small>` : ''}</span></div>
      ${REPORT ? '' : `<ol class="steps">${STEPS.map((t, i) => [t, i]).filter(([, i]) => i !== 1 || !isCoord(D.day)).map(([t, i], n) => `<li class="${i < s ? 'done' : i === s ? 'now' : ''}"><i>${i < s ? icon('check', 16) : n + 1}</i><span>${t}</span></li>`).join('')}</ol>`}`;
  }
  function photoStrip(kind, label, min = 0) {
    const mine = D.photos.filter(p => p.kind === kind);
    return `<div class="stack"><div class="row"><b class="grow">${label}</b>${min ? `<span class="pill ${mine.length >= min ? 'ok' : 'warn'}">${mine.length}/${min}+</span>` : ''}</div>
      <div class="photos">${mine.map(p => `<button class="ph" data-z="${esc(p.url || photoUrls[p.storage_path]?.f || '')}"><img src="${esc(p.url || photoUrls[p.storage_path]?.t || '')}" data-full="${esc(p.url || photoUrls[p.storage_path]?.f || '')}" alt="">${p.url ? '<span class="q">בתור</span>' : ''}</button>`).join('')}
        <label class="addph">צילום<input type="file" accept="image/*" capture="environment" multiple data-kind="${kind}"></label></div></div>`;
  }
  // תיעוד לפני / אחרי — אותו בלוק בכל מקום: שורת לפני, שורת אחרי, ורפרנס מהאפיון
  function baBlock({ after = true, need = 1 } = {}) {
    const ref = (D.specPh || []).map(p => photoUrls['spec:' + p.storage_path]).filter(Boolean);
    return `<div class="sec ba2"><h3>תיעוד לפני / אחרי</h3>
      ${ref.length ? `<div class="stack"><b class="small">מהאפיון</b><div class="photos ref">${ref.map(u => `<button class="ph" data-z="${esc(u.f)}"><img src="${esc(u.t)}" data-full="${esc(u.f)}" alt=""></button>`).join('')}</div></div>` : ''}
      ${photoStrip('before', 'לפני', need)}${after ? photoStrip('after', 'אחרי', need) : ''}</div>`;
  }
  function bindPhotos(root) {
    $$('input[data-kind]', root).forEach(inp => inp.onchange = async () => {
      // כל תמונה נשמרת לבד: תמונה אחת שנכשלה (פורמט לא נתמך / הטלפון מלא) לא מפילה את השאר, והעובד יודע
      let ok = 0, bad = 0, why = null;
      for (const f of [...inp.files]) try { const ph = await addFieldPhoto(f, { kind: inp.dataset.kind, work_day_id: D.day.id, project_id: D.day.project_id }); D.photos.push({ id: ph.id, kind: ph.kind, storage_path: ph.path, url: ph.url }); ok++; } catch (e) { bad++; why = e; }
      inp.value = '';
      await keep(); draw();
      if (bad) toast(why?.quota ? 'אין מקום בטלפון — התמונה לא נשמרה' : ok ? `${ok} תמונות נשמרו · ${bad} לא נשמרו` : 'התמונה לא נשמרה — נסו שוב', 4500, 'error'); else toast(ok > 1 ? `${ok} תמונות נשמרו` : 'התמונה נשמרה');
    });
    $$('[data-z]', root).forEach(b => b.onclick = () => b.dataset.z && zoom(b.dataset.z, ''));
  }

  // ---------- שלבים ----------
  function sMorning() {
    const crew = D.day.work_day_crew.map(c => ({ n: (c.profiles?.full_name || '').trim(), lead: c.user_id === D.day.crew_lead_id, st: c.cant_come_at ? 'off' : c.confirmed_at || c.clock_in ? 'on' : '', ph: c.user_id !== state.user.id ? String(c.profiles?.phone || '').replace(/\D/g, '').replace(/^972/, '0') : '' })).filter(x => x.n);
    const nTasks = D.tasks.filter(t => t.phase !== 'הכנה').length;
    // סדר המסך = סדר הבוקר: מתי ולאן → מה המשרד ביקש → מה לקחת → מה עושים היום → איך (שמש) → מי ואיפה (איש קשר, מפה)
    return `<div class="card stack">
        <div class="kpis dayk"><div class="kpi"><b>${hhmm(D.day.report_time) || '—'}</b><span>יציאה מהמשרד</span></div>
          ${D.day.site_arrival ? `<div class="kpi"${isManager() && D.day.status !== 'done' ? ' data-dadm role="button" tabindex="0" aria-label="שינוי שעות היום"' : ''}><b><bdi dir="ltr">${hhmm(D.day.site_arrival)}${D.day.site_end ? `<small class="kend">–${hhmm(D.day.site_end)}</small>` : ''}</bdi></b><span>${isNight(D.day) ? 'באתר · לילה' : 'באתר'}</span></div>` : `<div class="kpi"><b>${nTasks}</b><span>משימות היום</span></div>`}
          ${isCoord(D.day) ? '' : `<div class="kpi"><b>${D.day.gallons_planned ? nf(D.day.gallons_planned) : '—'}</b><span>גלונים</span></div>`}</div>
        ${countdown()}
        ${D.day.gust_max != null && !P.site_id ? `<div class="alert ${D.day.weather_alerted ? 'bad' : ''}"><span class="dot ${D.day.weather_alerted ? '' : 'ok'}"></span><span class="grow"><b>רוח עד ${D.day.wind_max} קמ״ש · משבים ${D.day.gust_max}${D.day.rain_mm ? ` · גשם ${D.day.rain_mm} מ״מ` : ''}</b><small>תחזית לשעות העבודה</small></span></div>` : ''}
        <div class="opcrew">${isManager() && D.day.status !== 'done' ? `<button type="button" class="opc" onclick="import('./modules/dayadmin.js').then(m => m.openDayAdmin('${D.day.id}', () => dispatchEvent(new HashChangeEvent('hashchange'))))" aria-label="שינוי צוות ושעות">✎ צוות ושעות</button>` : ''}${crew.map(c => c.ph ? `<a class="opc ${c.st}" href="tel:${esc(c.ph)}" aria-label="חיוג ל${esc(c.n)}"><i></i>${esc(c.n)}${c.lead ? leadMark() : ''}</a>` : `<span class="opc ${c.st}"><i></i>${esc(c.n)}${c.lead ? leadMark() : ''}</span>`).join('')}${D.day.drone ? `<span class="opc">${icon('drone', 14)} ${esc(D.day.drone.name)}</span>` : ''}</div>
        ${navButtons(site.lat || P.lat, site.lng || P.lng, D.day.address || site.address || site.name || P.name)}
      </div>
      ${opsStrip()}
      ${P.work_notes ? `<div class="note"><b>דגשים מהמשרד:</b> ${esc(P.work_notes)}</div>` : ''}
      ${site.access_notes && !(site.access_notes === site.access_auto && opsStrip()) ? `<div class="note">${esc(site.access_notes)}</div>` : ''}
      ${logi().length && !opsStrip() ? `<section><h3 class="sh">לפני היציאה</h3><div class="list">${logi().map(l => `<div class="lrow"><span class="grow">${esc(l)}</span></div>`).join('')}</div></section>` : ''}
      ${dayList().length ? `<section><h3 class="sh">משימות היום</h3><div class="list">${dayList().map(t => `<div class="lrow"><span class="grow"><b>${esc(t.title)}</b>${t.risk ? `<small class="issue">${esc(t.risk)}</small>` : ''}${t.instructions ? `<small>${esc(t.instructions)}</small>` : ''}</span>${t.phase ? `<span class="pill">${esc(t.phase)}</span>` : ''}</div>`).join('')}</div></section>` : ''}
      ${canClose() && !isCoord(D.day) && TT.sun ? sunCard() : ''}
      ${contactCard(site.contact_name, site.contact_phone)}
      ${site.map_path ? '<div class="card sitemap compact" id="daymap"></div>' : ''}`;
  }
  // משימות היום בסקירה — בלי ההכנות שכבר מופיעות לסימון ב"לפני היציאה"
  function dayList() { const P = new Set((D.prep || []).map(t => t.id)); return D.tasks.filter(t => !P.has(t.id) && t.phase !== 'הכנה'); }
  // שורות לוגיסטיקה מהשיבוץ (work_days.logistics) — בלי מה שכבר מופיע מהאפיון (מים/חשמל), כדי שלא יופיע פעמיים
  function logi(o = D.ops || {}) {
    return (D.day.logistics || []).filter(l => !(o.water && /מים|הידרנט/.test(l)) && !(o.power && /חשמל|גנרטור/.test(l)));
  }
  // לפני היציאה / באתר: מה האפיון אמר על השטח + משימות ההכנה (סימון בלחיצה). onSite = רק מה שרלוונטי באתר
  function opsStrip(onSite = false) {
    const o = D.ops || {}, prep = D.prep || [];   // כולל הכנות של היום — מסמנים בבוקר, לפני היציאה
    const items = [['water', 'מים'], ['power', 'חשמל'], ['access', 'גישה'], ['launch', 'המראה'], ['air', 'מרחב אווירי']].filter(([k]) => o[k]).filter(([k]) => !onSite || k !== 'access').filter(([k]) => !isCoord(D.day) || !['water', 'power'].includes(k));   // תיאום — לא שוטפים: בלי מים/חשמל
    if (!items.length && !o.hazards?.length && !o.permits?.length && !prep.length) return '';
    const L = onSite ? [] : logi(o).filter(l => !isCoord(D.day) || !/מים|הידרנט|חשמל|גנרטור|חומר|גלון/.test(l));
    const warn = { water: 'מכלית', power: 'גנרטור', air: ['נדרש תיאום', 'מוגבל'], access: 'רחוק — סחיבה' };
    const bad = (k, v) => [].concat(warn[k] || []).includes(v);
    return `<div class="card stack opsx"><b>${onSite ? 'באתר' : 'לפני היציאה'}</b>
      ${items.length ? `<div class="opsg">${items.map(([k, l]) => `<span class="${bad(k, o[k]) ? 'w' : ''}"><small>${l}</small><b>${esc(o[k])}</b></span>`).join('')}</div>` : ''}
      ${o.hazards?.length ? `<div class="chips">${o.hazards.map(h => `<span class="pill bad">${esc(h)}</span>`).join('')}</div>` : ''}
      ${!onSite && o.permits?.length && !prep.length ? `<div class="small muted">לתאם מראש: ${esc(o.permits.join(' · '))}</div>` : ''}
      ${L.length ? `<div class="small muted">${L.map(esc).join(' · ')}</div>` : ''}
      ${prep.length ? `<div class="list">${prep.map(t => `<button class="task ${t.status}" data-prep="${t.id}"><span class="tick">${t.status === 'done' ? icon('check', 16) : ''}</span><span class="t"><b>${esc(t.title)}</b></span></button>`).join('')}</div>` : ''}</div>`;
  }
  function bindOps(root) {
    $$('[data-prep]', root).forEach(b => b.onclick = async () => { const t = D.prep.find(x => x.id === b.dataset.prep); const on = t.status !== 'done';
      const patch = on ? { status: 'done', done_by: state.user.id, done_at: new Date().toISOString() } : { status: 'todo', done_by: null, done_at: null };
      Object.assign(t, patch); haptic('tap'); await save('tasks', patch, t.id); draw(); });
  }
  // תכנון שמש: באיזה שעות כל חזית בצל — כדי לא לשטוף בשמש ישירה (מתייבש מהר ומשאיר סימנים)
  // כשהתכנית יודעת אילו חזיתות היום — רק הסדר שלהן. הטבלה המלאה מקופלת ל"פירוט"
  function sunCard() {
    const lat = site.lat || P.lat, lng = site.lng || P.lng;
    const a = D.day.site_arrival ? +D.day.site_arrival.slice(0, 2) : null;
    if (isNight(D.day) || (a != null && (a >= 18 || a < 5))) return '';  // משמרת לילה — אין שיקול שמש
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
      ${n < req.length ? `<button class="btn ghost block eqall" id="eqall">${icon('check', 18)} הכל בפנים</button>` : ''}
      <div class="eqgrid">${req.map(x => `<button class="eqb" aria-pressed="${D.local.loaded.includes(x)}" data-eq="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  }
  // ---------- דופק לפני עבודה (אביחי 12/10) ----------
  // בדיקת רחפן = המטיס · בדיקת בטיחות = מפעיל הקרקע. "הכל תקין ✓" בלחיצה; "לא תקין" בפריט = תקלה קריטית שמחכה להחלטת מנהל התפעול
  // יום תיאום / סיור (db/138) — בלי בדיקה לפני התחלה. יום טסטים — כן (הרחפן טס)
  const secs = () => !needsPreflight(D.day) ? [] : needsDrone(D.day) ? ['drone', 'safety'] : ['safety'];
  const ZD = () => isWorkDay(D.day) ? dayZones(D.zones, D.tasks, D.day.id) : [];   // טסטים/תיאום/הכנה — בלי חזיתות ובלי מ״ר
  const secItems = k => D.S[SEC[k].key] || [];
  const roles = () => pulseRoles(D.day);
  const fname = u => (D.team.find(x => x.id === u)?.full_name || roles().name(u) || '').split(' ')[0];
  const grd = i => i.decision === 'grounded' && (!i.equipment_id || i.equipment_id === D.day.drone_id);
  function secState(k) {
    const items = secItems(k), rows = items.map(t => D.checks.find(c => c.item === t && (!c.section || c.section === k)));
    // חריג שעוד רלוונטי: ממתין · הופסק · רחפן שהושבת ועדיין משובץ · "כשיר" שהפריט שלו עוד ברשימה (אחרי החלפת רחפן — נעלם)
    const iss = D.issues.filter(i => i.prestart === k && ((!i.decision && i.status !== 'closed') || i.decision === 'stopped' || grd(i) || (i.decision === 'cleared' && rows.some(r => r && !r.ok))));
    const S = { items, rows, iss, n: rows.filter(Boolean).length, signed: rows.every(Boolean),
      pend: iss.some(i => !i.decision), stopped: iss.some(i => i.decision === 'stopped'), grounded: iss.some(grd) };
    S.halt = S.pend || S.stopped || S.grounded;
    S.last = rows.filter(Boolean).sort((x, y) => String(x.checked_at || '').localeCompare(String(y.checked_at || ''))).at(-1);
    return S;
  }
  function pulseCard(k) {
    const S = secState(k), R = roles(), resp = k === 'drone' ? R.pilot : R.ground, mine = mySection(R, k), can = mine || isManager();
    if (k === 'drone' && !R.pilot) return `<div class="card stack prest bad" id="pulse-drone"><div class="row"><span class="pic">${icon(SEC[k].ic, 20)}</span><span class="grow"><b>${SEC[k].t}</b><small>אין מטיס בצוות</small></span><span class="pill bad">חסום</span></div>
      <div class="alert bad"><span class="dot"></span><span class="grow"><b>בלי מטיס אין רחפן</b><small>להוסיף מטיס לצוות או להוריד את הרחפן מהיום</small></span></div>
      ${isManager() ? `<button class="btn ghost block" type="button" onclick="import('./modules/dayadmin.js').then(m => m.openDayAdmin('${D.day.id}', () => dispatchEvent(new HashChangeEvent('hashchange'))))">ניהול הצוות והרחפן</button>` : ''}</div>`;   // אביחי 13/10
    const pill = S.pend ? '<span class="pill bad">ממתין להחלטה</span>' : S.stopped ? '<span class="pill bad">הופסק</span>' : S.grounded ? '<span class="pill bad">הושבת</span>'
      : S.signed ? `<span class="pill ok">${icon('check', 14)} ${S.iss.length ? 'כשיר' : 'תקין'}</span>` : `<span class="pill">${S.n}/${S.items.length}</span>`;
    const open = (D.local.popen || []).includes(k) || (can && S.n > 0 && !S.signed);
    return `<div class="card stack prest ${S.halt ? 'bad' : S.signed ? 'ok' : ''}" id="pulse-${k}">
      <div class="row"><span class="pic">${icon(SEC[k].ic, 20)}</span><span class="grow"><b>${SEC[k].t}</b><small>${SEC[k].who}: ${esc(R.name(resp) || '—')}${resp === state.user.id ? ' (את/ה)' : ''}</small></span>${pill}</div>
      ${S.iss.map(i => `<div class="alert ${i.decision === 'cleared' ? '' : 'bad'}"><span class="dot ${i.decision === 'cleared' ? 'ok' : ''}"></span><span class="grow"><b>${esc(String(i.body || '').replace(/^[^·]*·\s*/, ''))}</b><small>${!i.decision ? 'ממתין להחלטת מנהל התפעול' : esc(i.resolution || '')}</small></span>${!isManager() || i.decision === 'cleared' ? '' : grd(i) ? `<button class="btn sm primary" type="button" data-dadm>רחפן חלופי</button>` : `<button class="btn sm primary" type="button" data-dec="${i.id}">${i.decision ? 'שינוי' : 'החלטה'}</button>`}</div>`).join('')}
      ${S.last && S.signed ? `<small class="muted">אישר ${esc(fname(S.last.checked_by))}${S.last.on_behalf ? ` בשם ${esc(R.name(resp))}` : ''} · ${S.last.checked_at ? hm(S.last.checked_at) : ''}</small>` : ''}
      ${!S.signed && can ? `<button class="btn primary block pall" type="button" data-pall="${k}">${S.n ? 'השאר תקין ✓' : 'הכל תקין ✓'}${mine ? '' : `<small>בשם ${esc(R.name(resp) || SEC[k].who)}</small>`}</button>`
        : !S.signed ? `<small class="muted">ממתין ל${esc(R.name(resp) || SEC[k].who)}</small>` : ''}
      <details class="pdet" data-sec="${k}" ${open ? 'open' : ''}><summary>פירוט</summary><div class="list">${S.items.map((t, i) => { const r = S.rows[i];
        return `<div class="lrow"><span class="grow">${esc(t)}${r?.note ? `<small>${esc(r.note)}</small>` : ''}</span>${r ? (r.ok ? `<span class="pill ok">${icon('check', 14)}</span>` : '<span class="pill bad">לא תקין</span>') : can ? `<button class="chip" type="button" data-pbad="${k}|${i}">לא תקין</button>` : ''}</div>`; }).join('')}</div></details></div>`;
  }
  async function signSection(k) {
    const now = new Date().toISOString(), R = roles(), behalf = !mySection(R, k);
    for (const t of secItems(k)) if (!D.checks.some(c => c.item === t && (!c.section || c.section === k))) {
      const row = { id: uid(), work_day_id: D.day.id, item: t, ok: true, section: k, checked_by: state.user.id, checked_at: now, on_behalf: behalf };
      D.checks.push(row); await insert('safety_checks', row); }
  }
  // פריט לא תקין: כמה מילים + תמונה (לא חובה) → תקלה קריטית מקושרת ליום ולרחפן; מנהל התפעול מקבל התראה ומחליט
  function failItem(k, t) {
    let ph = null;
    sheet(`<h3>${esc(t)}</h3><textarea id="pbn" placeholder="מה לא תקין?"></textarea>
      <label class="btn ghost block">${icon('photo', 18)} צילום<input type="file" accept="image/*" capture="environment" id="pbp" hidden></label><div id="pbpn" class="small muted"></div>
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn danger grow" id="pbsend">לא תקין</button></div>`, (s, close) => {
      $('#pbp', s).onchange = e => { ph = e.target.files[0] || null; $('#pbpn', s).textContent = ph ? 'התמונה תצורף' : ''; };
      $('#pbsend', s).onclick = async e => { if (e.currentTarget.disabled) return; e.currentTarget.disabled = true;
        const note = $('#pbn', s).value.trim(), now = new Date().toISOString();
        const iss = { id: uid(), project_id: D.day.project_id, work_day_id: D.day.id, kind: k === 'drone' ? 'equipment' : 'safety', severity: 'critical', prestart: k,
          body: `${SEC[k].t} · ${t}${note ? ' — ' + note : ''}`, opened_by: state.user.id, equipment_id: k === 'drone' ? D.day.drone_id || null : null, created_at: now };
        D.issues.push(iss); await insert('issues', iss);
        const row = { id: uid(), work_day_id: D.day.id, item: t, ok: false, section: k, note: note || null, issue_id: iss.id, checked_by: state.user.id, checked_at: now, on_behalf: !mySection(roles(), k) };
        D.checks.push(row); await insert('safety_checks', row);
        let phErr = false; if (ph) try { await addFieldPhoto(ph, { kind: 'issue', work_day_id: D.day.id, project_id: D.day.project_id, issue_id: iss.id }); } catch { phErr = true; }
        haptic('warn'); close(); toast(phErr ? 'נשלח למנהל התפעול · התמונה לא נשמרה' : 'נשלח למנהל התפעול', 3000, phErr ? 'warn' : undefined); draw(); };
    });
  }
  function sSite() {
    return `${!D.day.arrived_at ? `<button class="btn primary block" id="arrive">הגענו לאתר</button>` : `<div class="small muted">הגעתם ב-${new Date(D.day.arrived_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>`}
      ${secs().map(pulseCard).join('')}
      ${opsStrip(true)}
      ${isWorkDay(D.day) ? baBlock({ after: false }) : ''}
      ${contactCard(site.contact_name, site.contact_phone)}`;
  }
  function sWork() {
    const L = dayList(), done = L.filter(t => t.status === 'done').length, tot = L.filter(t => t.status !== 'dropped').length;
    // סדר החזיתות לפי השמש — בשורה אחת מעל המשימות, כי בזמן העבודה זה מה שקובע מאיפה מתחילים
    const fac = [...new Set(D.tasks.filter(t => t.phase === 'ביצוע' && t.status !== 'done').flatMap(t => t.facades || []))];
    const a0 = D.day.site_arrival ? +D.day.site_arrival.slice(0, 2) : 7, night = isNight(D.day) || a0 >= 18 || a0 < 5;
    const ord = fac.length > 1 && !night ? facadeOrder(D.day.day, site.lat || P.lat, site.lng || P.lng, fac) : [];
    return `${ord.length ? `<div class="lrow">${icon('sun', 20)}<span class="grow"><b>סדר לפי השמש</b><small>${ord.map(o => `${esc(o.name)} ${esc(o.when)}`).join(' · ')}</small></span></div>` : ''}
      <div class="row"><h3 class="grow">משימות היום</h3><span class="pill ${done === tot && tot ? 'ok' : 'lime'}">${done}/${tot}</span></div>
      <div class="list">${L.map(t => `<div class="row"><button class="task ${t.status}" data-t="${t.id}"><span class="tick">${t.status === 'done' ? icon('check', 16) : t.status === 'blocked' ? icon('alert', 14) : ''}</span>
        <span class="t"><b>${esc(t.title)}</b><small>${esc(T_STATUS[t.status]?.[0] || '')}${t.status === 'done' && t.done_by ? ' · ' + esc((D.team.find(u => u.id === t.done_by)?.full_name || '').split(' ')[0]) + (t.done_at ? ' ' + new Date(t.done_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '') : ''}${t.status_note ? ' · ' + esc(t.status_note) : ''}${t.risk && t.status !== 'done' ? ' · ' + esc(t.risk) : ''}</small></span></button>${t.status !== 'done' ? `<button class="hbtn" type="button" data-stuck="${t.id}" aria-label="נתקע">${icon('alert', 18)}</button>` : ''}</div>`).join('') || '<div class="empty-line">אין משימות להיום</div>'}</div>
      <button class="btn ghost block" id="addtask">${icon('plus', 18)} משימה שהלקוח ביקש</button>
      ${(D.fixes || []).length ? `<section><div class="sh-row"><h3 class="sh">תיקונים מדוח ביקור</h3><span class="count">${D.fixes.length}</span></div><div class="list">${D.fixes.map(f => `<button class="lrow" type="button" data-fix="${f.id}"><span class="grow"><b>${esc(f.title)}</b>${f.photos?.before?.length ? `<small>${f.photos.before.length} תמונות לפני</small>` : ''}</span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div></section>` : ''}
      ${D.issues.length ? `<section><h3 class="sh">תקלות היום</h3><div class="list">${D.issues.map(i => `<div class="lrow"><span class="grow"><b>${esc(i.body)}</b></span><span class="pill ${i.severity === 'critical' ? 'bad' : 'warn'}">${esc(kindHe(i.kind))}</span></div>`).join('')}</div></section>` : ''}
      ${D.missing.length ? `<section><div class="sh-row"><h3 class="sh">חסר בשטח</h3><span class="count">${D.missing.length}</span></div><div class="chips">${D.missing.map(m => `<span class="pill warn">${esc(m.item)}${m.qty > 1 ? ` ×${m.qty}` : ''}</span>`).join('')}</div></section>` : ''}
      <div class="sec">${photoStrip('general', 'תמונות מהעבודה')}</div>`;
  }
  // סגירת יום: ערכים נגזרים מחושבים מחדש בכל כניסה (שעון, משימות, שעות); נשמר רק מה שהמשתמש שינה (D.local.close)
  let C = null;
  function closeVals() {
    if (D.local.close && !D.local.close._v) D.local.close = null;   // מבנה ישן (שמר גם ערכים נגזרים) — מתחילים נקי
    const O = D.local.close ||= { _v: 2 }, base = {
      material: D.day.material_used || D.day.material_planned || (isWorkDay(D.day) ? 'Assert Lemon' : null), gallons: D.day.gallons ?? (D.day.gallons_planned != null ? Number(D.day.gallons_planned) : null),   // ברירת מחדל = המתוכנן; משנים רק בחריג
      work: D.day.work_types?.length ? D.day.work_types : isWorkDay(D.day) ? [TT.day] : [], equipment_ok: D.day.equipment_ok ?? !D.issues.some(i => i.kind === 'equipment' && i.status !== 'closed'),   // דווחה היום תקלת ציוד → לא מסמנים "חזר תקין" לבד quality: D.day.quality || 0,
      notes: D.day.notes || '', weather: D.day.weather_stop, flights: D.day.flights ?? null, air: D.day.air_minutes ?? null,
      // שעות: מה שנשמר ביום, אחרת מהשעון. בלי משמרת בשעון — ריק (לא מנחשים שעות למי שאולי לא הגיע)
      hours: Object.fromEntries(D.day.work_day_crew.map(c => [c.user_id, c.hours ?? D.clockH?.[c.user_id] ?? null])),
      tomorrow: D.day.tomorrow ?? D.tasks.filter(t => !['done', 'dropped'].includes(t.status) && t.phase !== 'הכנה').map(t => t.title).join(' · '),   // הכנות לפני יציאה אינן "עבודה למחר"
      sign: { name: site.contact_name || '', role: '', satisfied: true, notes: '' },
      start: D.day.arrived_at ? hm(D.day.arrived_at) : isNight(D.day) ? (D.day.site_arrival || '22:00').slice(0, 5) : '07:00', end: D.day.finished_at ? hm(D.day.finished_at) : (isCurrent(D.day) ? hm(new Date().toISOString()) : isNight(D.day) ? '06:00' : '15:00'),
      crew: D.day.work_day_crew.map(c => c.user_id),
      zones: zonePrefill(D.zones, D.tasks, D.day.id),   // אילו חזיתות הושלמו היום — לפי המשימות שבוצעו
    };
    C = { ...base, ...O, sign: { ...base.sign, ...(O.sign || {}) } };
    if (REPORT) { const [a, b] = [C.start, C.end].map(x => x.split(':').map(Number)), sp = Math.round(Math.max(0, (b[0] * 60 + b[1] - a[0] * 60 - a[1]) / 60) * 2) / 2;   // דוח ידני: לפי שעות ההתחלה/סיום
      C.crew.forEach(u => base.hours[u] ??= sp); }
    C.hours = { ...base.hours, ...(O.hours || {}) };
    return C;
  }
  // שינוי של המשתמש: נשמר בדריסות (ולא נדרס בכניסה הבאה)
  const setC = (k, v, sub) => { const O = D.local.close ||= { _v: 2 }; if (sub) { C[k][sub] = v; (O[k] ||= {})[sub] = v; } else { C[k] = v; O[k] = v; } keep(); };
  // מה חסר לשליחה — שורת תגיות כמו בשלב "באתר" + סימון השדות
  function closeMissing() {
    const m = [];
    // יום טסטים/תיאום/הכנה: סגירה פשוטה — בלי תמונת אחרי וגלונים (שעות וחתימה — כרגיל)
    if (isWorkDay(D.day) && !D.photos.some(p => p.kind === 'after')) m.push(['תמונת אחרי', 'label.addph:has(input[data-kind="after"])']);
    if (isWorkDay(D.day) && C.gallons == null) m.push(['גלונים', '#gal']);
    if (REPORT && C.start >= C.end) m.push(['שעות התחלה/סיום', '#re']);
    const noH = crewRows().filter(c => C.hours[c.user_id] == null);
    if (noH.length) m.push([noH.length === 1 ? `שעות · ${(noH[0].profiles?.full_name || '').split(' ')[0]}` : 'שעות צוות', noH.map(c => `.hrs[data-u="${c.user_id}"]`).join(',')]);
    if (D.day.is_last_day && !(C.sign.name || '').trim()) m.push(['שם החותם', '#sn']);
    if (D.day.is_last_day && !C.sign.img) m.push(['חתימת הלקוח', '#sig']);
    return m;
  }
  function sClose() {
    closeVals();
    // ראש צוות בלבד: עובד שנכנס לכאן רואה רק "סוגרים" + יציאה מהמשמרת (לא טופס שאי אפשר לשלוח)
    if (!canClose()) return `<div class="card stack center dayfin"><div class="big-ok">${icon('clock', 30)}</div><h2>${leadName() ? esc(leadName()) + ' סוגר את היום' : 'ראש הצוות סוגר את היום'}</h2></div><div id="dshift"></div>`;
    const chips = (key, list, multi) => `<div class="chips">${list.map(x => `<button class="chip" data-c="${key}" data-v="${esc(x)}" data-m="${multi ? 1 : ''}" aria-pressed="${multi ? C[key].includes(x) : C[key] === x}">${esc(x)}</button>`).join('')}</div>`;
    const dh = defHours(), miss = closeMissing();
    const reportTop = !REPORT ? '' : `<div class="sec"><h3>מתי ומי</h3>
        <div class="row"><label class="field grow">התחלה<input type="time" id="rs" value="${C.start}"></label><label class="field grow">סיום<input type="time" id="re" value="${C.end}"></label></div>
        <b>מי עבד</b><div class="chips">${D.team.filter(u => ['crew_lead', 'crew', 'ops_manager', 'admin'].includes(u.role)).map(u => `<button class="chip" data-crew="${u.id}" aria-pressed="${C.crew.includes(u.id)}" ${u.id === D.day.crew_lead_id ? 'disabled' : ''}>${esc(u.full_name)}</button>`).join('')}</div></div>
      ${D.tasks.length ? `<div class="sec"><h3>מה בוצע מהתכנית</h3><div class="list">${D.tasks.map(t => `<button class="task ${t.status}" data-rt="${t.id}"><span class="tick">${t.status === 'done' ? icon('check', 16) : ''}</span><span class="t"><b>${esc(t.title)}</b><small>${esc(t.phase || '')}</small></span></button>`).join('')}</div></div>` : ''}
      ${baBlock()}`;
    // הכל ממולא מראש (שעון, תכנית, משימות) — העריכה מקופלת, ונפתחת לבד כשחסר בה משהו
    const inEdit = miss.some(([, s]) => s === '#gal' || s.includes('.hrs'));
    const fly = D.day.drone_id || D.day.method === 'רחפן';
    const edit = `<details class="cmore cedit" id="cedit" ${D.local.edit || inEdit ? 'open' : ''}><summary><span class="grow">${icon('pen', 18)} עריכה</span></summary>
        <div class="sec">${isCoord(D.day) ? '' : `<b>חומר</b>${chips('material', D.S.materials || ['Assert Lemon', 'Topax', 'מים בלבד', 'אחר'])}
          <b>גלונים</b><div class="stepper"><button type="button" data-g="-0.5">−</button><input class="days grow" id="gal" type="number" inputmode="decimal" step="0.5" min="0" value="${C.gallons ?? ''}" placeholder="${D.day.gallons_planned ? nf(D.day.gallons_planned) : ''}"><button type="button" data-g="0.5">+</button></div>
          ${D.day.gallons_planned ? `<div class="chips"><button type="button" class="chip" id="galp" aria-pressed="${C.gallons != null && +C.gallons === +D.day.gallons_planned}">כמתוכנן · ${nf(D.day.gallons_planned)}</button></div>` : ''}`}
          <b>סוג העבודה</b>${chips('work', workChoices(D.S.work_types, TT), true)}</div>
        <div class="sec"><h3>שעות צוות</h3>${crewRows().map(c => { const v = C.hours[c.user_id], clk = D.clockH?.[c.user_id];
          return `<div class="row hrow"><span class="grow"><b>${esc(c.profiles?.full_name || '')}</b>${clk != null ? `<small class="muted">מהשעון ${nf(clk)}</small>` : ''}</span>
          ${clk == null && !REPORT ? `<button type="button" class="chip sm" data-h0="${c.user_id}" aria-pressed="${v === 0}">לא הגיע</button>${dh && v == null ? `<button type="button" class="chip sm" data-hd="${c.user_id}">${nf(dh)} ש׳</button>` : ''}` : ''}
          <input type="number" inputmode="decimal" step="0.5" min="0" class="hrs" data-u="${c.user_id}" value="${v ?? ''}"></div>`; }).join('')}</div>
        <div class="sec">
          ${fly ? `<div class="row"><label class="field grow">טיסות<input type="number" inputmode="numeric" min="0" id="fl" value="${C.flights ?? ''}"></label><label class="field grow">דקות אוויר<input type="number" inputmode="numeric" min="0" id="am" value="${C.air ?? ''}"></label></div>` : ''}
          <label class="tog"><span>הציוד חזר תקין</span><span class="sw"><input type="checkbox" id="eqok" ${C.equipment_ok ? 'checked' : ''}><i></i></span></label>
          <label class="tog"><span>עצירה בגלל מזג אוויר</span><span class="sw"><input type="checkbox" id="wth" ${C.weather ? 'checked' : ''}><i></i></span></label>
          <b>איכות העבודה</b><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${C.quality >= n}">★</button>`).join('')}</div>
          <label class="field">${D.day.is_last_day ? 'מה נשאר פתוח' : 'מה נשאר למחר'}<textarea id="tmr">${esc(C.tomorrow)}</textarea></label></div>
      </details>`;
    return reportTop + zonesHtml(ZD(), C.zones, TT.zone) + (REPORT || !isWorkDay(D.day) ? '' : baBlock()) + edit +
      (D.day.is_last_day ? `<div class="sec"><h3>החתמת לקוח</h3>
        <label class="field">שם החותם<input type="text" id="sn" value="${esc(C.sign.name)}"></label>
        <label class="field">תפקיד<input type="text" id="sr" value="${esc(C.sign.role)}" placeholder="מנהל אחזקה, מנהל אתר…"></label>
        <label class="tog"><span>הלקוח מרוצה מהעבודה</span><span class="sw"><input type="checkbox" id="ss" ${C.sign.satisfied ? 'checked' : ''}><i></i></span></label>
        <label class="field">הערות הלקוח<textarea id="snt">${esc(C.sign.notes)}</textarea></label>
        <div class="row"><b class="grow">חתימה</b><button class="chip" id="sclr" type="button">ניקוי</button></div>
        <canvas id="sig" class="sig"></canvas></div>` : '') + `
      <label class="field">הערה למשרד<textarea id="nts" rows="2" placeholder="לא חובה">${esc(C.notes)}</textarea></label>
      ${previewHtml()}
      <div class="chips" id="why">${miss.map(([x]) => `<span class="pill warn">${esc(x)}</span>`).join('')}</div>`;
  }
  // הדוח היומי מורכב לבד מנתוני היום — ראש הצוות רק מוסיף הערה (לא חובה). אותו טקסט נשמר (report_text) ונשלח למאנדי
  function reportLines() {
    const L = [], nm = c => (c.profiles?.full_name || '').split(' ')[0];
    if ((C.notes || '').trim()) L.push(['pen', C.notes.trim()]);
    const ZL = ZD(), Z = ZL.filter(z => C.zones.includes(zkey(z)));
    if (Z.length) { const multi = new Set(ZL.map(z => z.b)).size > 1, m2 = Z.reduce((s, z) => s + Number(z.m2 || 0), 0);
      L.push(['check', `הושלם: ${Z.map(z => multi ? z.bn + ' · ' + TT.zone(z.t) : TT.zone(z.t)).join(', ')}${m2 ? ` (${nf(Math.round(m2))} מ״ר)` : ''}`]); }
    const T = (REPORT ? D.tasks.filter(t => t.work_day_id === D.day.id) : dayList()).filter(t => t.status !== 'dropped');
    const done = T.filter(t => t.status === 'done'), open = T.filter(t => t.status !== 'done');
    if (T.length) L.push(['clipboard', `בוצע ${done.length}/${T.length}${done.length ? ': ' + done.map(t => t.title).join(' · ') : ''}`]);
    if ((C.tomorrow || '').trim()) L.push(['calendar', `${D.day.is_last_day ? 'נשאר פתוח' : 'למחר'}: ${C.tomorrow.trim()}`]);
    else if (open.length && !REPORT) L.push(['calendar', `נשאר: ${open.map(t => t.title).join(' · ')}`]);
    const n = k => D.photos.filter(p => p.kind === k).length, ph = [[n('before'), 'לפני'], [n('after'), 'אחרי'], [n('general'), 'מהעבודה']].filter(([x]) => x);
    if (ph.length) L.push(['photo', 'תמונות: ' + ph.map(([x, l]) => `${x} ${l}`).join(' · ')]);
    if (D.issues.length) { const cl = D.issues.filter(i => i.status === 'closed').length;
      L.push(['alert', `${D.issues.length > 1 ? D.issues.length + ' תקלות' : 'תקלה'}: ${D.issues.map(i => i.body || kindHe(i.kind)).join(' · ')}${cl ? ` (${cl === D.issues.length ? (cl > 1 ? 'טופלו' : 'טופלה') : cl + ' טופלו'})` : ''}`]); }
    if (D.missing.length) L.push(['cart', `חסר: ${D.missing.map(m => m.item + (m.qty > 1 ? ' ×' + m.qty : '')).join(', ')}`]);
    if (C.material || C.gallons != null) L.push(['report', [C.material, C.gallons != null ? `${nf(C.gallons)} גלונים` : ''].filter(Boolean).join(' · ')]);
    if (C.flights != null || C.air != null) L.push(['drone', [C.flights != null ? `${C.flights} טיסות` : '', C.air != null ? `${C.air} דק׳ אוויר` : ''].filter(Boolean).join(' · ')]);
    if (C.weather) L.push(['sun', 'עצירה בגלל מזג אוויר']);
    if (!C.equipment_ok) L.push(['wrench', 'הציוד לא חזר תקין']);
    const R = crewRows(), H = R.filter(c => Number(C.hours[c.user_id]) > 0), H0 = R.filter(c => C.hours[c.user_id] === 0);
    if (H.length) { const tot = H.reduce((s, c) => s + Number(C.hours[c.user_id]), 0);
      L.push(['clock', `שעות: ${H.map(c => `${nm(c)} ${nf(C.hours[c.user_id])}`).join(' · ')}${H.length > 1 ? ` · סה״כ ${nf(tot)}` : ''}${H0.length ? ` · לא הגיע: ${H0.map(nm).join(', ')}` : ''}`]); }
    if (D.day.is_last_day && (C.sign.name || '').trim()) L.push(['pen', `אישור לקוח: ${C.sign.name.trim()}${C.sign.role ? ' · ' + C.sign.role : ''}${C.sign.satisfied ? '' : ' · לא מרוצה'}`]);
    return L;
  }
  // תצוגה מקדימה: מה שיגיע למשרד, עם זוג לפני/אחרי. מתעדכנת תוך כדי מילוי
  function previewHtml() {
    const L = reportLines(), u = p => p && (p.url || photoUrls[p.storage_path]?.t);
    const b = D.photos.find(p => p.kind === 'before' && u(p)), a = D.photos.filter(p => p.kind === 'after' && u(p)).pop();
    const T = REPORT ? [] : dayList().filter(t => t.status !== 'dropped'), dn = T.filter(t => t.status === 'done').length;
    return `<div class="card rprev" id="rprev"><div class="row">${T.length ? `<div class="ring sm" style="--p:${Math.round(dn / T.length * 100)}"><b>${dn}/${T.length}</b></div>` : ''}<b class="grow">הדוח למשרד</b>${icon('send', 18)}</div>
      ${b || a ? `<div class="rpair">${[[b, 'לפני'], [a, 'אחרי']].filter(([p]) => p).map(([p, l]) => `<span><img src="${esc(u(p))}" alt=""><small>${l}</small></span>`).join('')}</div>` : ''}
      <ul class="rlines">${L.map(([ic, t]) => `<li>${icon(ic, 16)}<span>${esc(t)}</span></li>`).join('')}</ul></div>`;
  }
  function crewRows() {
    if (!REPORT) return D.day.work_day_crew;
    return C.crew.map(u => D.day.work_day_crew.find(c => c.user_id === u) || { user_id: u, role: 'crew', profiles: { full_name: D.team.find(x => x.id === u)?.full_name || '' } });
  }
  function sDone() {
    const d = D.day, hrs = d.work_day_crew.reduce((s, c) => s + Number(c.hours || 0), 0);
    const onSite = d.arrived_at && d.finished_at ? Math.max(0, (new Date(d.finished_at) - new Date(d.arrived_at)) / 36e5) : null;
    const nPh = D.photos.length, nT = dayList().filter(t => t.status !== 'dropped').length, nD = dayList().filter(t => t.status === 'done').length;
    return `<div class="card stack center dayfin"><div class="big-ok pop">${icon('check', 32)}</div><h2>${REPORT ? 'הדוח נשלח' : nT && nD === nT ? 'יום מושלם — הכל בוצע' : 'היום נסגר'}</h2>
        <div class="muted" id="dsent">${d.monday_item_id ? 'הדוח התקבל במשרד' : ''}</div>
        ${d.arrived_at && d.finished_at ? `<div class="small muted"><bdi dir="ltr">${hm(d.arrived_at)}–${hm(d.finished_at)}</bdi> באתר${onSite >= 0.5 ? ` · ${nf(Math.round(onSite * 2) / 2)} ש׳` : ''}</div>` : ''}</div>
      <div id="dshift"></div>
      <div class="kpis opk"><div class="kpi"><b>${nD}/${nT}</b><span>משימות</span></div><div class="kpi"><b>${d.gallons != null ? nf(d.gallons) : '—'}</b><span>גלונים</span></div><div class="kpi"><b>${nPh || '—'}</b><span>תמונות</span></div><div class="kpi"><b>${hrs ? nf(hrs) : '—'}</b><span>שעות צוות</span></div></div>
      <div id="dnext"></div>
      ${d.report_text ? `<details class="fold"><summary><span class="sh">הדוח שנשלח</span></summary><div class="note rsent">${esc(d.report_text).replace(/\n/g, '<br>')}</div></details>` : d.tomorrow ? `<div class="note"><b>${d.is_last_day ? 'נשאר פתוח:' : 'למחר:'}</b> ${esc(d.tomorrow)}</div>` : ''}
      ${d.is_last_day && !d.signoff && isManager() && state.profile.role !== 'admin' ? '<div id="dnsreq"></div>' : ''}
      ${d.signoff ? `<div class="card"><div class="eyebrow">חתימת לקוח</div><b>${esc(d.signoff.name || '')}</b> ${d.signoff.role ? '· ' + esc(d.signoff.role) : ''}<div class="small muted">${d.signoff.satisfied ? 'מרוצה' : 'לא מרוצה'}${d.signoff.notes ? ' · ' + esc(d.signoff.notes) : ''}</div></div>` : ''}
      <div class="photos">${D.photos.filter(p => ['before', 'after'].includes(p.kind)).map(p => `<button class="ph" data-z="${esc(p.url || photoUrls[p.storage_path]?.f || '')}"><img src="${esc(p.url || photoUrls[p.storage_path]?.t || '')}" data-full="${esc(p.url || photoUrls[p.storage_path]?.f || '')}" alt=""><span class="q">${p.kind === 'before' ? 'לפני' : 'אחרי'}</span></button>`).join('')}</div>
      <a class="btn ghost block" href="#/p/${d.project_id}">לפרויקט</a>`;
  }
  const defHours = () => { const st = D.day.departed_at || D.day.arrived_at; return st ? Math.max(0.5, Math.round((Date.now() - new Date(st)) / 18e5) / 2) : null; };
  // מסך סיום: מצב שליחה אמיתי (התור) + יציאה מהמשמרת בלחיצה
  const mineQ = x => x.rowId === D.day.id || x.args?.d === D.day.id || x.row?.work_day_id === D.day.id || x.meta?.work_day_id === D.day.id || (x.table === 'tasks' && D.tasks.some(t => t.id === x.rowId));
  async function doneState() {
    const box = $('#dsent', el); if (!box) return;
    // התור קובע: כל עוד משהו מהיום הזה בטלפון — "ממתין", גם אם השרת כבר ראה חלק
    { const { outbox } = await import('../lib/store.js');
      const tick = async () => { if (!box.isConnected) return; const n = (await outbox.all()).filter(mineQ).length;
        box.textContent = n ? `ממתין לקליטה · ${n} פריטים — ${sendsLabel()}` : D.day.monday_item_id && D.day.monday_item_id !== 'none' ? 'הדוח התקבל במשרד' : 'נשלח למשרד'; if (n) setTimeout(tick, 4000); };
      tick(); }
    nextUp(); shiftOut(); noSignReq();
  }
  // יום אחרון בלי חתימת לקוח (מנהל תפעול): בקשה לסגירה בלי חתימה — לאישור ההנהלה (db/143)
  async function noSignReq() {
    const box = $('#dnsreq', el); if (!box) return;
    const CR = await import('./closereq.js'), r = await CR.lastRequest(D.day.project_id); if (!box.isConnected) return;
    if (r?.status === 'approved') return box.remove();
    box.innerHTML = r?.status === 'pending' ? CR.pendingPill() : `<div class="stack tight"><a class="btn primary block" href="#/signoff/${D.day.project_id}/${D.day.id}">להחתמת הלקוח</a><button class="btn ghost block" id="nsreq">בקשה לסגירה בלי חתימת לקוח</button></div>`;
    const b = $('#nsreq', box); if (b) b.onclick = async () => { if (await CR.requestClose(D.day.project_id, D.day.id)) noSignReq(); };
  }
  // יציאה מהמשמרת בלחיצה (סוף היום לצוות) — רק כשיש משמרת פתוחה
  async function shiftOut() {
    const sb0 = $('#dshift', el); if (!sb0) return;
    const { myOpenShift, clockOutNow } = await import('./attendance.js');
    const open = await myOpenShift().catch(() => null); if (!open || !sb0.isConnected) return;
    sb0.innerHTML = `<button class="btn primary block nxgo" id="dout">יציאה מהמשמרת</button>`;
    $('#dout', sb0).onclick = async e => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.textContent = 'מאתר מיקום…';
      await clockOutNow(open); sb0.innerHTML = ''; };
  }

  // אחרי הסגירה: מה הבא שלי (יום השטח הבא) — שהסוף יוביל להמשך
  async function nextUp() {
    const box = $('#dnext', el); if (!box) return;
    const me = state.user.id, sel = 'id,day,report_time,site_arrival,projects(name)';
    let w = null;
    try {
      const [a, b] = await Promise.all([
        sb.from('work_days').select(sel + ',work_day_crew!inner(user_id)').eq('work_day_crew.user_id', me).gt('day', D.day.day).neq('status', 'done').order('day').limit(1),
        sb.from('work_days').select(sel).eq('crew_lead_id', me).gt('day', D.day.day).neq('status', 'done').order('day').limit(1)]);
      w = [...(a.data || []), ...(b.data || [])].sort((x, y) => x.day < y.day ? -1 : 1)[0] || null;
    } catch { const h = await cache.get('home2').catch(() => null); w = (h?.wdays || []).filter(x => x.day > D.day.day && (x.crew_lead_id === me || (x.work_day_crew || []).some(c => c.user_id === me))).sort((x, y) => x.day < y.day ? -1 : 1)[0] || null;
      if (w) w.projects = { name: (h.projects || []).find(p => p.id === w.project_id)?.name || '' }; }
    if (!w || !box.isConnected) return;
    box.innerHTML = `<a class="lrow nextup" href="#/day/${w.id}"><span class="datebox"><b>${+w.day.slice(8)}</b><small>${esc(dayLabel(w.day).replace(/ \d.*$/, '').replace('יום ', ''))}</small></span><span class="grow"><small>הבא שלך · ${esc(dayLabel(w.day))}</small><b>${esc(w.projects?.name || '')}</b><small>${w.report_time ? 'יציאה ' + hhmm(w.report_time) : ''}${w.site_arrival ? ' · באתר ' + hhmm(w.site_arrival) : ''}</small></span><span class="chev">${icon('chev', 18)}</span></a>`;
  }

  // ---------- ציור + פעולות ----------
  // מבנה קבוע: כותרת · תכנית + תחזית (נטענות פעם אחת, לא קופצות) · גוף השלב. כל לחיצה מציירת מחדש רק את הכותרת והגוף
  function frame() {
    el.innerHTML = `<div id="dhead" style="display:contents"></div><div class="stack" id="body"><div class="stack" id="dtop" hidden></div><div class="stack" id="dstage"></div></div>`;
    if (!REPORT) {
      const top = $('#dtop', el), pb = document.createElement('div'); pb.id = 'dayplan'; top.appendChild(pb);
      import('./plan.js').then(m => m.planForDay(pb, D.day, D.plan)).then(r => { if (r !== undefined && r !== D.plan) { D.plan = r; keep(); } }).catch(() => {});   // תכנית היום: טקסט + תמונות מהאפיון
      if (D.day.projects?.site_id) { const wb = document.createElement('div'); wb.id = 'daywx'; wb.innerHTML = `<span data-wxcard="${D.day.projects.site_id}|${wxKey(D.day)}|${isNight(D.day) ? 'תחזית לשעות הלילה' : 'תחזית לשעות העבודה'}"></span>`; top.appendChild(wb); import('../lib/wx.js').then(m => m.fillWx(wb)).catch(() => {}); }
    }
    if (isManager()) { const sg = document.createElement('div'); sg.className = 'sigline'; sg.id = 'daysig'; el.appendChild(sg);
      import('../lib/audit.js').then(m => m.signature(sg, { work_day_id: D.day.id })); }
  }
  function draw() {
    document.querySelectorAll('.bar,.fabs').forEach(x => x.remove());
    stopGeo();
    const s = stage();
    if (!$('#dstage', el)) frame();
    $('#dhead', el).innerHTML = header();
    $('#dtop', el).hidden = REPORT || ![0, 2, 3].includes(s);
    const body = $('#dstage', el); body.innerHTML = [sMorning, sLoad, sSite, sWork, sClose, sDone][s]();
    bindCopy(body); bindPhotos(body); bindOps(body);
    $$('[data-dadm]', body).forEach(b => b.onclick = () => import('./dayadmin.js').then(m => m.openDayAdmin(D.day.id, () => dispatchEvent(new HashChangeEvent('hashchange')))));   // מנהל: לחיצה על 'באתר' = שינוי שעות היום (db/134)
    const dm0 = $('#daymap', el);
    if (dm0) signedUrls('plans', [site.map_path]).then(u => { const url = u[site.map_path]; if (!url) { dm0.remove(); return; }
      dm0.innerHTML = `<button class="smimg" type="button"><img src="${esc(url)}" alt="מפת האתר"></button><b>מפת האתר</b>`; $('.smimg', dm0).onclick = () => zoom(url, 'מפת האתר'); }).catch(() => dm0.remove());
    const bar = document.createElement('div'); bar.className = 'bar';
    if (s === 0 && D.day.day > isoDay() && !isManager()) futureBar(bar);   // יום עתידי: לא מתחילים העמסה — רק אישור הגעה
    else if (s === 0 && isCoord(D.day)) { bar.innerHTML = `<button class="btn primary" id="out">יוצאים לאתר</button>`; bar.querySelector('#out').onclick = e => depart(e.currentTarget, []); }   // תיאום / סיור — בלי העמסה
    else if (s === 0) { bar.innerHTML = `<button class="btn primary" id="nx">מתחילים העמסה</button>`; bar.querySelector('#nx').onclick = () => { D.local.stage = 1; keep(); draw(); }; }
    if (s === 1) bindLoad(bar);
    if (s === 2) bindSite(bar);
    if (s === 3) bindWork(bar);
    if (s === 4) bindClose(bar);
    if (s === 5) doneState();
    if (s < 5) document.body.appendChild(bar);
    if (s >= 2 && s <= 3) fabs(bar);   // תקלה / חסר — בתוך הפס התחתון (לא מרחפים מעל מתגים ותוכן)
    if (s >= 2 && s <= 4 && !REPORT) clockNudge();
  }
  // הצוות יצא לדרך (ראש הצוות לחץ "יוצאים") ואני עוד לא במשמרת → "להיכנס למשמרת?" בראש המסך, כניסה בלחיצה אחת לפרויקט של היום
  let nudged = null;
  async function clockNudge() {
    if (!D.day.work_day_crew.some(c => c.user_id === state.user.id) || nudged === false) return;
    const A = await import('./attendance.js');
    if (await A.myOpenShift().catch(() => true)) { nudged = false; return; }
    if (nudged == null && navigator.onLine) try {   // כבר נכנס ויצא היום (למשל עזב מוקדם) — לא שואלים שוב
      const { data } = await sb.from('shifts').select('id').eq('user_id', state.user.id).gte('start_at', new Date(D.day.day + 'T00:00:00').toISOString()).limit(1);
      if (data?.length) { nudged = false; return; } } catch { /* */ }
    nudged = true; const st = $('#dstage', el); if (!st || $('#clockcard', st)) return;
    A.clockCard(st, () => { nudged = false; $('#clockcard', el)?.remove(); }, { label: D.day.status === 'en_route' ? 'הצוות בדרך לאתר' : 'הצוות באתר', project_id: D.day.project_id });
  }
  function futureBar(bar) {
    const me = D.day.work_day_crew.find(c => c.user_id === state.user.id);
    if (!me || me.confirmed_at || me.cant_come_at) { bar.innerHTML = `<button class="btn ghost" type="button" disabled>${me?.cant_come_at ? 'עדכנת: לא אגיע' : me?.confirmed_at ? 'אישרת הגעה ✓ · נפתח ביום השטח' : 'נפתח ביום השטח'}</button>`; return; }
    bar.innerHTML = `<button class="btn ghost" id="fcant">לא אוכל</button><button class="btn primary" id="fok">אגיע ✓</button>`;
    bar.querySelector('#fok').onclick = async e => { if (e.currentTarget.disabled) return; e.currentTarget.disabled = true;
      await enqueue({ kind: 'rpc', fn: 'confirm_day', args: { d: D.day.id } }); me.confirmed_at = new Date().toISOString(); await keep(); haptic('success'); toast('אישרת הגעה'); draw(); };
    bar.querySelector('#fcant').onclick = async () => { const why = await ask('לא אוכל להגיע', { placeholder: 'סיבה (לא חובה)', ok: 'עדכון המנהל', optional: true }); if (why == null) return;
      await enqueue({ kind: 'rpc', fn: 'cant_come', args: { d: D.day.id, reason: why.trim() || null } }); me.cant_come_at = new Date().toISOString(); await keep(); toast('המנהל עודכן'); draw(); };
  }
  function bindLoad(bar) {
    $$('[data-eq]').forEach(b => b.onclick = () => { const x = b.dataset.eq, L = D.local.loaded; L.includes(x) ? L.splice(L.indexOf(x), 1) : L.push(x); haptic('tap'); keep(); draw(); });
    const all = $('#eqall'); if (all) all.onclick = () => { const req = D.day.equip_required?.length ? D.day.equip_required : (D.S.equip_default || []); req.forEach(x => D.local.loaded.includes(x) || D.local.loaded.push(x)); haptic('success'); keep(); draw(); };
    const ack = $('#ack'); if (ack) ack.onchange = () => { D.day.drone_ack = ack.checked; keep(); draw(); };
    const dr = D.day.drone, blocked = dr?.health === 'grounded' || (dr?.health === 'warning' && !D.day.drone_ack);
    bar.innerHTML = `<button class="btn ghost" id="bk">חזרה</button><button class="btn primary" id="out" ${blocked ? 'disabled' : ''}>יוצאים לאתר</button>`;
    bar.querySelector('#bk').onclick = () => { D.local.stage = 0; keep(); draw(); };
    bar.querySelector('#out').onclick = async e => {
      const ob = e.currentTarget; if (ob.disabled) return;
      const req = D.day.equip_required?.length ? D.day.equip_required : (D.S.equip_default || []);
      const miss = req.filter(x => !D.local.loaded.includes(x));
      if (miss.length && !(await confirmBox(`יוצאים בלי ${miss.length} פריטים?`, { body: miss.join(' · ') + ' — יירשם כחוסר ויעבור למשרד', ok: 'יוצאים' }))) return;
      depart(ob, miss);
    };
  }
  async function depart(ob, miss) {
      if (ob.disabled) return; ob.disabled = true;
      for (const m of miss) { const row = { id: uid(), work_day_id: D.day.id, item: m, qty: 1, reported_by: state.user.id }; D.missing.push(row); await insert('missing_items', row); }
      const now = new Date().toISOString();
      await save('work_days', { departed_at: now, status: 'en_route', equip_loaded: D.local.loaded || [], drone_ack: !!D.day.drone_ack });
      for (const c of D.day.work_day_crew) if (!c.clock_in) c.clock_in = now;
      await enqueue({ kind: 'rpc', fn: 'crew_depart', args: { d: D.day.id, t: now } });
      nudged = false; toast('נסיעה טובה'); draw();
      // יציאה לאתר = גם כניסה למשמרת (אם עוד לא נכנס) — פעולה אחת במקום שתיים
      try { const A = await import('./attendance.js'); if (!(await A.myOpenShift())) await A.clockIn(null, { project_id: D.day.project_id }); } catch { /* */ }
      nudged = null; if (here()) clockNudge();   // ויתר על ההסכמה ("לא עכשיו") — יקבל את ההצעה בלחיצה
  }
  function bindSite(bar) {
    const a = $('#arrive'); if (a) a.onclick = async () => { if (a.disabled) return; a.disabled = true; stopGeo(); await save('work_days', { arrived_at: new Date().toISOString(), status: 'on_site' }); haptic('success'); draw(); };
    if (a) arrivalWatch(a);
    $$('[data-pall]').forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true; await signSection(b.dataset.pall); haptic('success'); toast(SEC[b.dataset.pall].t + ' · אושר'); draw(); });
    $$('[data-pbad]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.pbad.split('|'); failItem(k, secItems(k)[+i]); });
    $$('details.pdet').forEach(d => d.ontoggle = () => { const L = D.local.popen ||= [], k = d.dataset.sec; if (d.open && !L.includes(k)) L.push(k); if (!d.open && L.includes(k)) L.splice(L.indexOf(k), 1); keep(); });
    $$('[data-dec]').forEach(b => b.onclick = () => { const i = D.issues.find(x => x.id === b.dataset.dec); if (i) decideSheet(i, { who: fname(i.opened_by), after: r => afterDecide(r, () => dispatchEvent(new HashChangeEvent('hashchange'))) }); });
    $$('[data-dadm]').forEach(b => b.onclick = () => import('./dayadmin.js').then(m => m.openDayAdmin(D.day.id, () => dispatchEvent(new HashChangeEvent('hashchange')))));
    const P0 = secs().map(k => [k, secState(k)]), halt = P0.find(([, S]) => S.stopped || S.grounded);
    const before = !isWorkDay(D.day) || D.photos.some(p => p.kind === 'before');   // יום שאינו יום עבודה — בלי חובת תמונת לפני
    const need = [!D.day.arrived_at && 'הגעה', ...P0.filter(([, S]) => !S.signed).map(([k]) => SEC[k].t), P0.some(([, S]) => S.pend) && 'החלטת מנהל', !before && 'תמונת לפני'].filter(Boolean);
    pulsePoll();
    if (halt && !isManager()) { bar.innerHTML = `<button class="btn ghost" type="button" disabled>${halt[1].grounded ? 'הרחפן הושבת · ממתינים לרחפן חלופי' : 'העבודה הופסקה · ממתינים למנהל התפעול'}</button>`; return; }
    bar.innerHTML = `<button class="btn primary ${need.length ? 'needs' : ''}" id="start">${need.length ? `<span class="need">חסר: ${need.join(' · ')}</span>` : 'מתחילים לעבוד'}</button>`;
    bar.querySelector('#start').onclick = async e => {
      // עוד חסר משהו → הלחיצה לוקחת אליו (הגעה / הבדיקה שלא אושרה / ההחלטה / מצלמה לתמונת לפני)
      if (need.length) { haptic('warn');
        if (!D.day.arrived_at) return $('#arrive', el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const open = P0.find(([, S]) => !S.signed || S.pend); if (open) return $('#pulse-' + open[0], el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return $('input[data-kind="before"]', el)?.click(); }
      if (e.currentTarget.disabled) return; e.currentTarget.disabled = true;
      await save('work_days', { status: 'working', opened_at: D.day.opened_at || new Date().toISOString() });
      toast('עבודה בטוחה'); draw();
    };
  }
  // בשלב "באתר": מה שקרה בטלפונים האחרים (המטיס אישר, מפעיל הקרקע סימן חריג, מנהל התפעול החליט, הרחפן הוחלף) — מגיע לבד
  let pp = null;
  function pulsePoll() {
    if (pp) return;
    pp = setInterval(async () => {
      if (!here() || stage() !== 2) { clearInterval(pp); pp = null; return; }
      if (document.hidden || !navigator.onLine) return;
      try {
        const [{ data: ch }, { data: is }, { data: wd }] = await Promise.all([
          sb.from('safety_checks').select('*').eq('work_day_id', D.day.id),
          sb.from('issues').select('*').eq('work_day_id', D.day.id).order('created_at'),
          sb.from('work_days').select('status,opened_at,drone_id,drone:equipment!work_days_drone_id_fkey(id,name,health,health_detail)').eq('id', D.day.id).maybeSingle()]);
        if (!ch || !is || !here()) return;
        const { outbox } = await import('../lib/store.js'); const q = await outbox.all();
        const merge = (srv, t) => srv.concat(q.filter(x => x.kind === 'insert' && x.table === t && x.row?.work_day_id === D.day.id && !srv.some(r => r.id === x.row.id)).map(x => x.row));
        const nc = merge(ch, 'safety_checks'), ni = merge(is, 'issues'), sig = (c, i, w) => JSON.stringify([c.map(r => r.id + r.ok).sort(), i.map(r => r.id + r.decision + r.status), w?.drone_id, w?.status, w?.drone?.health]);
        const dayQ = q.some(x => x.kind === 'update' && x.table === 'work_days' && x.rowId === D.day.id);
        if (sig(nc, ni, dayQ ? D.day : wd) === sig(D.checks, D.issues, D.day)) return;
        D.checks = nc; D.issues = ni; if (wd && !dayQ) Object.assign(D.day, wd);
        await keep(); draw();
      } catch { /* בלי קליטה — בפעם הבאה */ }
    }, 15000);
  }
  // הגעה לפי GPS: כשהטלפון בתוך גדר האתר — הכפתור "הגענו" הופך לבקשה בולטת "הגעתי ✓" (עם רטט). לא מסמנים לבד:
  // מעבר ליד האתר בכביש / קפיצת GPS לא ירשמו הגעה. רק אם כבר יש הרשאת מיקום (לא מקפיצים בקשה), החישוב בטלפון — עובד בלי קליטה
  let geoW = null;
  function stopGeo() { if (geoW != null) { navigator.geolocation.clearWatch(geoW); geoW = null; } }
  async function arrivalWatch(btn) {
    stopGeo();
    const la = +(site.lat ?? P.lat ?? D.day.lat), ln = +(site.lng ?? P.lng ?? D.day.lng);
    if (!la || !ln || !navigator.geolocation) return;
    try { if ((await navigator.permissions?.query({ name: 'geolocation' }))?.state !== 'granted') return; } catch { return; }
    const R = Math.max(150, Number(D.S.attendance?.geofence_m) || 500);
    const dist = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371e3; };
    geoW = navigator.geolocation.watchPosition(pos => {
      if (!btn.isConnected || D.day.arrived_at) return stopGeo();
      const d = dist({ lat: la, lng: ln }, { lat: pos.coords.latitude, lng: pos.coords.longitude }), near = d <= R + Math.min(pos.coords.accuracy || 0, 200);
      if (near && !btn.classList.contains('near')) haptic('success');
      btn.classList.toggle('near', near);
      btn.innerHTML = near ? `${icon('pin', 22)} הגעתי ✓<small>${d < 1000 ? Math.round(d / 10) * 10 + ' מ׳' : (d / 1000).toFixed(1) + ' ק״מ'} מהאתר</small>` : `הגענו לאתר<small>עוד ${d < 1000 ? Math.round(d / 10) * 10 + ' מ׳' : (d / 1000).toFixed(d < 1e4 ? 1 : 0) + ' ק״מ'}</small>`;
    }, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 });
  }
  function bindWork(bar) {
    // נתקע: לחיצה ארוכה על המשימה, או כפתור ההתראה שלידה (נוח עם כפפות)
    const stuck = async t => { const note = await ask('מה תקוע?', { value: t.status_note || '', placeholder: 'למשל: מחכים למפתח לגג', ok: 'סימון כנתקע' }); if (note == null) return; t.status = 'blocked'; t.status_note = note; await save('tasks', { status: 'blocked', status_note: note }, t.id); draw(); };
    $$('[data-stuck]').forEach(b => b.onclick = () => stuck(D.tasks.find(x => x.id === b.dataset.stuck)));
    $$('button[data-t]', el).forEach(b => {   // רק כפתורי המשימות (גם #sheet נושא data-t)
      let timer, long = false;
      b.onpointerdown = () => { long = false; timer = setTimeout(() => { long = true; stuck(D.tasks.find(x => x.id === b.dataset.t)); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = async () => {
        if (long) return; const t = D.tasks.find(x => x.id === b.dataset.t), prev = { status: t.status, done_by: t.done_by ?? null, done_at: t.done_at ?? null };
        t.status = NEXT[prev.status];
        const patch = t.status === 'done' ? { status: 'done', done_by: state.user.id, done_at: new Date().toISOString() } : { status: t.status, done_by: null, done_at: null };
        Object.assign(t, patch); await save('tasks', patch, t.id); draw();
        undo(`${t.title}: ${T_STATUS[t.status][0]}`, async () => { Object.assign(t, prev); await save('tasks', prev, t.id); draw(); });
      };
    });
    $$('[data-fix]').forEach(b => b.onclick = async () => { const f = D.fixes.find(x => x.id === b.dataset.fix);
      (await import('./tasks.js')).completeTask(f, () => { D.fixes = D.fixes.filter(x => x.id !== f.id); keep(); draw(); }, { work_day_id: D.day.id }); });
    $('#addtask').onclick = async () => {
      const title = await ask('מה הלקוח ביקש?', { placeholder: 'למשל: ניקוי שלט הכניסה', ok: 'הוספת משימה' }); if (!title) return;
      toast('המשימה נוספה');
      const row = { id: uid(), project_id: D.day.project_id, work_day_id: D.day.id, title, phase: 'תוספת', is_extra: true, status: 'todo', seq: 999, planned_date: D.day.day };
      D.tasks.push(row); await insert('tasks', row); draw();
    };
    // עובד: בפס התחתון — צילום מהעבודה בלחיצה (ראש הצוות סוגר את היום)
    if (!canClose()) { bar.innerHTML = `<label class="btn primary">${icon('photo', 18)} צילום מהעבודה<input type="file" accept="image/*" capture="environment" multiple data-kind="general" hidden></label>`; bindPhotos(bar);
      return; }
    const left = dayList().filter(t => !['done', 'dropped'].includes(t.status)).length;
    bar.innerHTML = `<button class="btn primary" id="fin">סיום יום${left ? ` · ${left} פתוחות` : ' ✓'}</button>`;
    bar.querySelector('#fin').onclick = async e => { if (e.currentTarget.disabled) return; e.currentTarget.disabled = true;
      // שעות מהשעון עכשיו (המשמרות נפתחו אחרי שהיום נטען) — כדי ששעות הצוות יתמלאו לבד
      if (navigator.onLine) try { const { data, error } = await sb.rpc('day_shift_hours', { d: D.day.id }); if (!error && data) D.clockH = Object.fromEntries(data.map(r => [r.user_id, Number(r.hours)])); } catch { /* */ }
      D.local.stage = 4; keep(); draw(); };
  }
  function bindClose(bar) {
    const body = $('#body', el);
    if (!canClose()) { bar.innerHTML = `<button class="btn ghost" type="button" disabled>ראש הצוות סוגר${leadName() ? ' · ' + esc(leadName()) : ''}</button>`; shiftOut(); return; }
    const rp = () => { const b = $('#rprev', body); if (b) b.outerHTML = previewHtml(); };
    body.oninput = body.onchange = rp;   // כל שינוי בטופס (גם בתוך "עריכה") — התצוגה המקדימה מתעדכנת
    // שורת "מה חסר" מתעדכנת תוך כדי מילוי; אחרי ניסיון שליחה — גם השדות החסרים מסומנים
    const why = () => { const m = closeMissing(), w = $('#why', body); if (w) w.innerHTML = m.map(([x]) => `<span class="pill warn">${esc(x)}</span>`).join('');
      $$('[aria-invalid]', body).forEach(x => x.removeAttribute('aria-invalid'));
      if (D.tried) m.forEach(([, sel]) => $$(sel, body).forEach(x => x.setAttribute('aria-invalid', 'true')));
      return m; };
    $$('[data-c]').forEach(b => b.onclick = () => { const k = b.dataset.c, v = b.dataset.v; if (b.dataset.m) { const L = [...C[k]]; L.includes(v) ? L.splice(L.indexOf(v), 1) : L.push(v); setC(k, L); } else setC(k, v); draw(); });
    const gal = $('#gal'); gal.oninput = () => { setC('gallons', gal.value === '' ? null : Number(gal.value)); const p = $('#galp'); if (p) p.setAttribute('aria-pressed', C.gallons != null && +C.gallons === +D.day.gallons_planned); why(); };
    $$('[data-g]').forEach(b => b.onclick = () => { gal.value = Math.max(0, (gal.value === '' ? Number(D.day.gallons_planned) || 0 : Number(gal.value)) + Number(b.dataset.g)); gal.oninput(); });
    const gp = $('#galp'); if (gp) gp.onclick = () => { gal.value = D.day.gallons_planned; gal.oninput(); };
    $$('.hrs').forEach(i => i.oninput = () => { setC('hours', i.value === '' ? null : Number(i.value), i.dataset.u); why(); });
    $$('[data-h0]').forEach(b => b.onclick = () => { setC('hours', 0, b.dataset.h0); draw(); });
    $$('[data-hd]').forEach(b => b.onclick = () => { setC('hours', defHours(), b.dataset.hd); draw(); });
    $('#eqok').onchange = e => setC('equipment_ok', e.target.checked);
    const fl = $('#fl'), am = $('#am'); if (fl) { fl.oninput = () => setC('flights', fl.value === '' ? null : +fl.value); am.oninput = () => setC('air', am.value === '' ? null : +am.value); }
    $('#wth').onchange = e => setC('weather', e.target.checked);
    const cm = $('#cedit'); if (cm) cm.ontoggle = () => { D.local.edit = cm.open; keep(); };
    $$('[data-q]').forEach(b => b.onclick = () => { setC('quality', Number(b.dataset.q)); draw(); });
    $('#tmr').oninput = e => setC('tomorrow', e.target.value);
    $('#nts').oninput = e => setC('notes', e.target.value);
    bindZones(body, ZD(), () => C.zones, L => { setC('zones', L); rp(); });
    if (REPORT) {
      const span = () => { const [a, b] = [C.start, C.end].map(x => x.split(':').map(Number)); const h = Math.max(0, (b[0] * 60 + b[1] - a[0] * 60 - a[1]) / 60); return Math.round(h * 2) / 2; };
      const setAll = () => { C.crew.forEach(u => setC('hours', span(), u)); draw(); };
      $('#rs').onchange = e => { setC('start', e.target.value); setAll(); };
      $('#re').onchange = e => { setC('end', e.target.value); setAll(); };
      $$('[data-crew]').forEach(b => b.onclick = () => { const u = b.dataset.crew, L = [...C.crew]; if (L.includes(u)) L.splice(L.indexOf(u), 1); else { L.push(u); setC('hours', span(), u); } setC('crew', L); draw(); });
      $$('[data-rt]').forEach(b => b.onclick = async () => { const t = D.tasks.find(x => x.id === b.dataset.rt); const on = t.status !== 'done';
        const patch = on ? { status: 'done', work_day_id: D.day.id, done_by: state.user.id, done_at: new Date().toISOString() } : { status: 'todo', done_by: null, done_at: null };
        Object.assign(t, patch); await save('tasks', patch, t.id); draw(); });
    }
    let sig;
    if (D.day.is_last_day) {
      ['sn', 'sr', 'snt'].forEach(k => $('#' + k).oninput = e => { setC('sign', e.target.value, { sn: 'name', sr: 'role', snt: 'notes' }[k]); if (k === 'sn') why(); });
      $('#ss').onchange = e => setC('sign', e.target.checked, 'satisfied');
      sig = pad($('#sig'), C.sign.img, url => { setC('sign', url, 'img'); why(); }); $('#sclr').onclick = () => { sig.clear(); setC('sign', null, 'img'); why(); };
    }
    why();
    bar.innerHTML = REPORT ? `<button class="btn primary" id="close">שליחת הדוח</button>` : `<button class="btn ghost bk" id="bk">חזרה</button><button class="btn primary" id="close">סגירה ושליחה ✓</button>`;
    if (!REPORT) bar.querySelector('#bk').onclick = () => { D.local.stage = null; keep(); draw(); };
    bar.querySelector('#close').onclick = async () => {
      D.tried = true; const m = why();
      if (m.length) { haptic('warn'); const ce = $('#cedit', body), sel = m[0][1].split(',')[0];
        if (ce && ce.querySelector(sel)) ce.open = true;   // השדה החסר בתוך "עריכה" — פותחים
        $(sel, body)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      let signoff = null;
      if (D.day.is_last_day) {
        if (sig.empty()) { $('#sig', body)?.setAttribute('aria-invalid', 'true'); return; }
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
        weather_stop: !!C.weather, quality: C.quality || null, flights: C.flights ?? null, air_minutes: C.air ?? null, notes: C.notes || null, tomorrow: C.tomorrow || null, signoff,
        report_text: reportLines().map(x => x[1]).join('\n') || null,   // בדיוק מה שהוצג בתצוגה המקדימה — זה מה שמגיע למאנדי
        ...(ZD().length ? { zones_done: zonesPayload(C.zones) } : {}) });
      (D.prep || []).forEach(t => { if (!t.work_day_id || t.work_day_id === D.day.id) t.status = 'done'; });   // השרת סוגר את ההכנות עם היום (db/109) — גם כאן, שלא יופיעו מחר
      D.local = { stage: null, checks: {}, loaded: null }; D.tried = false; await keep();
      haptic('success'); celebrate(); draw();
    };
  }
  function fabs(bar) {
    bar.insertAdjacentHTML('afterbegin', `<button class="bsq bad" type="button" id="fiss">${icon('alert', 20)}<small>תקלה</small></button><button class="bsq" type="button" id="fmis">${icon('cart', 20)}<small>חסר לי</small></button>`);
    $('#fiss').onclick = () => {
      // מספיק אחד מהשלושה: סוג (בלחיצה), מילים או תמונה — לא חובה לכתוב
      let kind = null, crit = false, ph = null, orig = null;
      sheet(`<h3>דיווח תקלה</h3><div class="chips" id="ikc">${(D.S.issue_types || Object.keys(ISSUE_KIND)).map((k, i) => `<button class="chip${i ? '' : ' sugg'}" data-k="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join('')}</div>
        <textarea id="ib" placeholder="מה קרה?"></textarea>
        <label class="tog"><span>קריטי — העבודה נעצרה</span><span class="sw"><input type="checkbox" id="ic"><i></i></span></label>
        <label class="btn ghost block">${icon('photo', 18)} צילום התקלה<input type="file" accept="image/*" capture="environment" id="ip" hidden></label><div id="ipn" class="small muted"></div>
        <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="isend">דיווח תקלה</button></div>`, (s, close) => {
        $$('[data-k]', s).forEach(b => b.onclick = () => { kind = kind === b.dataset.k ? null : b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x.dataset.k === kind)); });
        $('#ic', s).onchange = e => crit = e.target.checked;
        // אחרי הצילום: סימון על התמונה (עיגול / חץ / תווית) — המקור נשמר גם הוא
        $('#ip', s).onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
          const r = await import('../lib/viewer.js').then(m => m.markupFile(f)).catch(() => ({ blob: f, marked: false })); if (!r) return;
          ph = r.blob; orig = r.marked ? f : null; $('#ipn', s).textContent = r.marked ? 'התמונה המסומנת תצורף' : 'התמונה תצורף'; };
        $('#isend', s).onclick = async () => {
          const text = $('#ib', s).value.trim();
          if (!kind) { const c = $('#ikc', s); c.classList.remove('need'); void c.offsetWidth; c.classList.add('need'); return toast('מה סוג התקלה?'); }   // סיווג חובה — בלי "אחר" שקט
          if ($('#isend', s).disabled) return; $('#isend', s).disabled = true;
          const body = text ? (kind === 'רחפן' || kind === 'לקוח' ? `${kind}: ${text}` : text) : ph && kind === 'אחר' ? 'תקלה (בתמונה)' : kind;
          const row = { id: uid(), project_id: D.day.project_id, work_day_id: D.day.id, kind: ISSUE_KIND[kind] || 'other', severity: crit ? 'critical' : 'normal',
            body, opened_by: state.user.id, equipment_id: kind === 'רחפן' ? D.day.drone_id : null };
          D.issues.push(row); await insert('issues', row);
          let phErr = false; if (ph) try { await addFieldPhoto(ph, { kind: 'issue', work_day_id: D.day.id, project_id: D.day.project_id, issue_id: row.id, ...(orig ? { caption: 'מסומן' } : {}) });
            if (orig) await addFieldPhoto(orig, { kind: 'issue', work_day_id: D.day.id, project_id: D.day.project_id, issue_id: row.id, caption: 'מקור' }); } catch { phErr = true; }
          if (crit) await save('work_days', { status: 'issue' });
          close(); phErr ? toast('התקלה דווחה · התמונה לא נשמרה', 4000, 'warn') : toast('התקלה דווחה למשרד'); draw();
        };
      });
    };
    // חסר לי: הציוד של היום בלחיצה (כמה פריטים יחד) + טקסט חופשי
    $('#fmis').onclick = () => {
      const eq = D.day.equip_required?.length ? D.day.equip_required : (D.S.equip_default || []), sel = new Set();
      sheet(`<h3>חסר לי</h3>${eq.length ? `<div class="chips">${eq.map(x => `<button type="button" class="chip" data-mi="${esc(x)}" aria-pressed="false">${esc(x)}</button>`).join('')}</div>` : ''}
        <input type="text" id="mi" placeholder="${eq.length ? 'משהו אחר?' : 'מה חסר?'}"><div class="stepper"><button type="button" id="mq-">−</button><input class="days grow" id="mq" type="number" value="1" min="1"><button type="button" id="mq+">+</button></div>
        <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="msend">שליחה למשרד</button></div>`, (s, close) => {
        $$('[data-mi]', s).forEach(b => b.onclick = () => { const x = b.dataset.mi; sel.has(x) ? sel.delete(x) : sel.add(x); b.setAttribute('aria-pressed', sel.has(x)); });
        $('[id="mq-"]', s).onclick = () => $('#mq', s).value = Math.max(1, +$('#mq', s).value - 1);
        $('[id="mq+"]', s).onclick = () => $('#mq', s).value = +$('#mq', s).value + 1;
        $('#msend', s).onclick = async () => {
          const text = $('#mi', s).value.trim(), q = +$('#mq', s).value || 1, items = [...sel].map(item => ({ item, qty: !text && sel.size === 1 ? q : 1 })).concat(text ? [{ item: text, qty: q }] : []);
          if (!items.length) { $('#mi', s).focus(); return toast('מה חסר?'); }
          if ($('#msend', s).disabled) return; $('#msend', s).disabled = true;
          for (const x of items) { const row = { id: uid(), work_day_id: D.day.id, ...x, reported_by: state.user.id }; D.missing.push(row); await insert('missing_items', row); }
          close(); toast('נרשם ונשלח למשרד'); draw();
        };
      });
    };
  }
  function undo(text, fn) {
    const e = $('#toast'); e.innerHTML = `${esc(text)} <button class="undo">ביטול</button>`; e.hidden = false;
    e.querySelector('.undo').onclick = () => { e.hidden = true; fn(); };
    clearTimeout(undo.h); undo.h = setTimeout(() => e.hidden = true, 5000);
  }
  // שני טלפונים על אותו יום: מה שקרה בטלפון השני (יצאו, הגיעו, ראש הצוות סגר) מגיע לבד — בלי רענון ידני
  const SYNC = ['status', 'departed_at', 'arrived_at', 'opened_at', 'finished_at', 'closed_at', 'monday_item_id', 'signoff', 'crew_lead_id'];
  const tok = el.dataset.dayView = uid();
  const here = () => el.isConnected && el.dataset.dayView === tok && location.hash.includes(D.day.id) && $('#dstage', el);   // עברו למסך אחר (או נפתח שוב) — מפסיקים
  const poll = setInterval(async () => {
    if (!here() || stage() === 5) return clearInterval(poll);
    if (document.hidden || !navigator.onLine || (stage() === 4 && canClose())) return;   // באמצע טופס הסגירה — לא נוגעים
    try {
      const { data } = await sb.from('work_days').select(SYNC.join(',')).eq('id', D.day.id).maybeSingle(); if (!data || !here()) return;
      const { outbox } = await import('../lib/store.js'); if ((await outbox.all()).some(mineQ)) return;   // שינויים שלי עוד בתור — הם הקובעים
      const same = (a, b) => a === b || (a && b && typeof a === 'string' && +new Date(a) === +new Date(b)) || JSON.stringify(a) === JSON.stringify(b);
      if (SYNC.every(k => same(data[k], D.day[k]))) return;
      const before = stage(); Object.assign(D.day, data); await keep();
      if (stage() !== before) draw(); else $('#dhead', el).innerHTML = header();
    } catch { /* בלי קליטה — בפעם הבאה */ }
  }, 45000);
  draw();
}

// פעולות שבתור (לפי הסדר) מוחלות על היום שנטען: עדכוני יום/משימות, רשומות חדשות, יציאה/שעות/אישור הגעה
async function overlayPending(D) {
  const { outbox } = await import('../lib/store.js');
  const id = D.day.id, crew = D.day.work_day_crew || [];
  const lists = { issues: D.issues, missing_items: D.missing, safety_checks: D.checks, tasks: D.tasks };
  for (const x of await outbox.all()) {
    if (x.kind === 'update' && x.table === 'work_days' && x.rowId === id) Object.assign(D.day, x.patch);
    else if (x.kind === 'update' && x.table === 'tasks') [D.tasks, D.prep || [], D.fixes || []].forEach(L => { const t = L.find(t => t.id === x.rowId); if (t) Object.assign(t, x.patch); });
    else if (x.kind === 'insert' && lists[x.table] && (x.row?.work_day_id === id)) { const L = lists[x.table]; if (!L.some(r => r.id === x.row.id)) L.push(x.row); }
    else if (x.kind === 'rpc' && x.args?.d === id) {
      const me = crew.find(c => c.user_id === state.user.id);
      if (x.fn === 'crew_depart') crew.forEach(c => { c.clock_in ||= x.args.t; });
      else if (x.fn === 'set_day_hours') (x.args.rows || []).forEach(r => { const c = crew.find(c => c.user_id === r.user_id); if (c) c.hours = r.hours; });
      else if (x.fn === 'confirm_day' && me) { me.confirmed_at ||= new Date(x.at).toISOString(); me.cant_come_at = null; }
      else if (x.fn === 'cant_come' && me) me.cant_come_at ||= new Date(x.at).toISOString();
    }
  }
}

// site_ops של כל המבנים באתר → תמונה אחת (ערכים שונים מחוברים, רשימות מאוחדות). hydrants/power ישנים = ברירת מחדל
function siteOps(rows) {
  const o = {}, add = (k, v) => { if (!v) return; o[k] = o[k] && !o[k].split(' / ').includes(v) ? o[k] + ' / ' + v : (o[k] || v); };
  for (const b of rows || []) for (const sp of [].concat(b.specs || [])) { const x = sp.site_ops || {};
    ['water', 'power', 'access', 'launch', 'air'].forEach(k => add(k, x[k]));
    if (!x.water && sp.hydrants) add('water', 'הידרנט'); if (!x.power && sp.power) add('power', 'שקע באתר');
    ['hazards', 'permits'].forEach(k => { if (Array.isArray(x[k]) && x[k].length) o[k] = [...new Set([...(o[k] || []), ...x[k]])]; }); }
  return o;
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
  c.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="--x:${Math.random() * 100}vw;--d:${0.8 + Math.random()}s;--c:${['var(--lime)', 'var(--ok)', 'var(--warn)', 'var(--blue)'][i % 4]}"></i>`).join('');
  document.body.appendChild(c); setTimeout(() => c.remove(), 2200);
}
