// ניהול יום שטח מתוכנן (מנהל תפעול ומעלה): כל מה שמתקנים בבעיה של יום — במקום אחד, בלי לעבור למסך הביצוע של העובד.
// העברת תאריך · ראש צוות · רחפן · שעת יציאה · הגעה/סיום באתר (גם ביום שהתחיל — טל 13/10: סיכם עם הלקוח שעה אחרת) · הוספה/הסרה של אנשים · ביטול היום. כל שינוי = התראה לצוות (בצד השרת).
// בלחיצה אחת (סימולציית שבוע של אוריאל, 12/10): מחליף למי שלא יכול להגיע · דחיית כל ימי הפרויקט ביום (מזג אוויר) · הזזה ליום פנוי · רחפן חלופי לכל הימים.
// אחרי שינוי בצוות הגיליון נפתח מחדש מעודכן — ממשיכים לתקן בלי לחפש שוב את היום.
import { sb, isManager, sheet, icon, $, $$, esc, toast, confirmBox, dm, dayLabel, leadMark, HE_D1, isoDay } from '../lib/core.js';
import { errText } from '../lib/audit.js';
import { availability } from '../lib/avail.js';
import { isNight, nightRange, nightTag, nightToggleHtml, bindNight, wxKey } from '../lib/night.js';
import { dtTag, dtPickHtml, bindDtPick, dtLabel } from '../lib/daytype.js';

const RANK = { crew_lead: 0, crew: 1, ops_manager: 2, admin: 3 };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const offDay = d => [5, 6].includes(new Date(d + 'T12:00').getDay());
const nextWork = s => { let d = addDays(s, 1); while (offDay(d)) d = addDays(d, 1); return d; };
const sd = d => `${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}`;
const hm5 = t => (t || '').slice(0, 5);
const mins = v => v ? +v.slice(0, 2) * 60 + +v.slice(3, 5) : null;
const hhmmOf = m => { const r = ((Math.floor(m / 5) * 5) % 1440 + 1440) % 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`; };
// יציאה מומלצת = הגעה − נסיעה מהמשרד (כביש × מקדם תנועה) − העמסה. כמו בשיבוץ ימים (projects.js)
async function travelFrom(lat, lng) {
  const { data } = await sb.from('app_settings').select('value').eq('key', 'dispatch').maybeSingle();
  const Dp = { office: [31.2203, 34.8041], office_name: 'המשרד', load_min: 20, traffic_factor: 1.15, ...(data?.value || {}) };
  let tr = null;
  if (lat) try { const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${Dp.office[1]},${Dp.office[0]};${lng},${lat}?overview=false`)).json(); if (j.routes?.[0]) tr = Math.ceil(j.routes[0].duration / 60 * Dp.traffic_factor); } catch { /* */ }
  return { tr, load: Dp.load_min, from: Dp.office_name };
}

export async function openDayAdmin(id, after) {
  if (!isManager()) return;
  const [{ data: w, error }, { data: people }, { data: drones }, { data: pre }] = await Promise.all([
    sb.from('work_days').select('id,day,status,night,day_type,report_time,site_arrival,site_end,crew_lead_id,drone_id,project_id,weather_alerted,gust_max,projects(name,lat,lng,sites(lat,lng)),work_day_crew(user_id,role,cant_come_at,cant_come_reason)').eq('id', id).single(),
    sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true).in('role', ['crew', 'crew_lead', 'ops_manager', 'admin']).order('full_name'),
    sb.from('equipment').select('id,name,health').eq('kind', 'drone').order('name'),
    // חריג בבדיקה לפני עבודה (db/130): ממתין להחלטה · הופסק · רחפן שהושבת ועוד משובץ
    sb.from('issues').select('id,body,prestart,decision,resolution,equipment_id,opened_by,created_at,project_id,work_day_id').eq('work_day_id', id).not('prestart', 'is', null).order('created_at')]);
  if (error || !w) return toast('היום לא נמצא');
  if (w.status === 'done') { location.hash = '#/day/' + id; return; }   // יום שנסגר — מסך הביצוע
  const started = w.status !== 'planned';   // יום שהתחיל: רק צוות וראש צוות (אביחי 12/10 — ראש צוות לא נתקע)
  const [av, { data: pd }] = await Promise.all([
    availability(w.day, w.day, { exceptDay: id, drones: drones || [] }).catch(() => ({ person: () => '', drone: id2 => (drones || []).find(d => d.id === id2)?.health === 'grounded' ? 'מקורקע' : '' })),
    sb.from('work_days').select('id,day,drone_id').eq('project_id', w.project_id).eq('status', 'planned').gte('day', isoDay()).order('day')]);
  const pdays = pd || [], rest = pdays.filter(x => x.day > w.day), taken = new Set(pdays.map(x => x.day));
  const no = u => (w.work_day_crew || []).find(c => c.user_id === u && c.cant_come_at);
  // מי שלא יגיע: אמר שלא יכול, בחופש/מחלה מאושרים, או משובץ במקום אחר באותו יום → מחליף בלחיצה
  const why = u => no(u) ? 'לא יכול להגיע' + (no(u).cant_come_reason ? ' · ' + no(u).cant_come_reason : '') : av.person(u);
  const P = new Map((people || []).map(p => [p.id, p])), nm = u => (P.get(u)?.full_name || '').split(' ')[0];
  const crew = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
  const free = (people || []).filter(p => !crew.includes(p.id)).sort((a, b) => !!av.person(a.id) - !!av.person(b.id));
  // מחליף בלחיצה: מי שפנוי באותו יום — מטיסים קודם כשחסר מטיס, אחר כך אנשי שטח לפני הנהלה. השאר — ברשימה עם הסיבה
  const pilotIn = crew.some(u => !why(u) && P.get(u)?.is_pilot);
  const rank = pilotFirst => (a, b) => (pilotFirst ? (b.is_pilot === true) - (a.is_pilot === true) : 0) || (RANK[a.role] ?? 9) - (RANK[b.role] ?? 9);
  const pool = free.filter(x => !av.person(x.id));
  const quick = pool.slice().sort(rank(!pilotIn)).slice(0, 8);
  const subsFor = u => pool.slice().sort(rank(P.get(u)?.is_pilot && !crew.some(o => o !== u && !why(o) && P.get(o)?.is_pilot))).slice(0, 3);
  // רחפן מקורקע / תפוס → החלופה הראשונה שפנויה בכל הימים של הפרויקט עם אותו רחפן
  const sameDr = w.drone_id ? pdays.filter(x => x.drone_id === w.drone_id) : [];
  const drWhy = w.drone_id ? av.drone(w.drone_id) : '';
  let swapDr = null;
  if (!started && drWhy) {
    const span = sameDr.length > 1 ? await availability(sameDr[0].day, sameDr.at(-1).day, { project: w.project_id, drones: drones || [] }).catch(() => null) : null;
    swapDr = (drones || []).find(d => d.id !== w.drone_id && d.health !== 'grounded' && !av.drone(d.id) && !span?.drone(d.id)) || null;
  }
  const drAll = swapDr && sameDr.length > 1 ? sameDr : [{ id }];
  // הזזה: "כל הימים יום קדימה" כשיש לפרויקט ימים אחרי היום הזה; ושני ימי עבודה פנויים (בלי ימים שכבר תפוסים בפרויקט)
  const cand = []; for (let d = w.day, g = 0; cand.length < 2 && g < 10; g++) { d = nextWork(d); if (!taken.has(d)) cand.push(d); }
  const wx = w.weather_alerted ? `<div class="arow bad"><span class="aic">${icon('sun', 18)}</span><span class="grow"><b>תחזית לא לטוס</b>${w.gust_max != null ? `<small>משבים עד ${w.gust_max} קמ״ש</small>` : ''}</span></div>` : '<div id="da-wx"></div>';
  const preX = (pre || []).filter(i => !i.decision || i.decision === 'stopped' || (i.decision === 'grounded' && i.equipment_id === w.drone_id));
  const preDr = preX.some(i => i.decision === 'grounded') ? (drones || []).filter(d => d.id !== w.drone_id && d.health !== 'grounded' && !av.drone(d.id)).slice(0, 3) : [];
  const preHtml = preX.map(i => `<button type="button" class="arow bad" data-pre="${i.id}"><span class="aic">${icon(i.prestart === 'drone' ? 'drone' : 'alert', 18)}</span><span class="grow"><b>${esc(String(i.body || '').replace(/^[^·]*·\s*/, ''))}</b><small>${!i.decision ? 'ממתין להחלטתך · ' + esc(nm(i.opened_by)) : esc(i.resolution || '')}</small></span><span class="btn ${i.decision ? 'ghost' : 'primary'} sm">${i.decision ? 'שינוי' : 'החלטה'}</span></button>`).join('')
    + (preDr.length ? `<div class="lrow"><span class="mic">${icon('drone', 18)}</span><div class="chips grow">${preDr.map((d, i) => `<button type="button" class="chip ${i ? '' : 'primary'}" data-predr="${d.id}">${esc(d.name)} במקום</button>`).join('')}</div></div>` : '');
  const done = (msg, close) => { close(); toast(msg, 2200, 'success'); after?.(); };
  const again = (msg, close) => { done(msg, close); openDayAdmin(id, after); };   // נשארים בגיליון, מעודכן
  sheet(`<div class="stack tight"><h3 class="sh">${esc(w.projects?.name || '')}<span id="da-dtt">${dtTag(w)}</span></h3><small class="muted">${isNight(w) ? nightTag(w) + ' ' + esc(nightRange(w)) + (w.report_time ? ' · יציאה ' + w.report_time.slice(0, 5) : '') : `${dayLabel(w.day)}${w.report_time ? ' · יציאה ' + w.report_time.slice(0, 5) : ''}${w.site_arrival ? ' · באתר ' + w.site_arrival.slice(0, 5) + (w.site_end ? '–' + w.site_end.slice(0, 5) : '') : ''}`}</small></div>
    ${preHtml}${started ? '' : wx}
    ${dtPickHtml('da-dt', w.day_type).replace('chips dtpick', 'chips dtpick mini')}
    ${started ? '' : `<div class="lrow da-mv"><span class="mic">${icon('calendar', 18)}</span><div class="chips grow">
      ${rest.length ? `<button type="button" class="chip ${w.weather_alerted ? 'primary' : ''}" data-shift="1">כל ${rest.length + 1} הימים · יום קדימה</button>` : ''}
      ${cand.map((d, i) => `<button type="button" class="chip ${w.weather_alerted && !rest.length && !i ? 'primary' : ''}" data-mvd="${d}">${sd(d)}<small class="why" data-wxd="${d}"></small></button>`).join('')}</div></div>`}
    <div class="list">
      ${crew.map(u => `<div class="lrow"><span class="avatar sm">${esc(nm(u).slice(0, 2))}</span><span class="grow"><b>${esc(P.get(u)?.full_name || '')}${u === w.crew_lead_id ? leadMark() : ''}</b>${why(u) ? `<small class="bad">${esc(why(u))}</small>` : P.get(u)?.is_pilot ? '<small>מטיס</small>' : ''}</span>
        ${u !== w.crew_lead_id && !why(u) ? `<button class="chip" data-lead="${u}">ראש צוות</button>` : ''}<button class="chip" data-rm="${u}">הסרה</button></div>
        ${why(u) && subsFor(u).length ? `<div class="lrow"><span class="mic">${icon('users', 18)}</span><div class="chips grow">${subsFor(u).map((x, i) => `<button type="button" class="chip ${i ? '' : 'primary'}" data-swap="${u}|${x.id}">${esc(nm(x.id) || x.full_name)} במקום${x.is_pilot ? ' · מטיס' : ''}</button>`).join('')}</div></div>` : ''}`).join('') || '<div class="empty-line">לא שובץ צוות</div>'}
      ${quick.length ? `<div class="lrow"><span class="mic">${icon('plus', 18)}</span><div class="chips grow">${quick.map(x => `<button type="button" class="chip" data-addu="${x.id}">${esc(nm(x.id) || x.full_name)}${x.is_pilot && !pilotIn ? ' · מטיס' : ''}</button>`).join('')}</div></div>` : ''}
      ${free.length > quick.length ? `<label class="lrow"><span class="mic">${icon('users', 18)}</span><select id="da-add" class="grow"><option value="">${quick.length ? 'עוד…' : 'הוספת אדם…'}</option>${free.map(p => { const why = av.person(p.id), wn = av.warn?.(p.id); return `<option value="${p.id}" ${why ? 'disabled' : ''}>${esc(p.full_name)}${p.is_pilot ? ' · מטיס' : ''}${why ? ' — ' + esc(why) : wn ? ' · ⚠ ' + esc(wn) : ''}</option>`; }).join('')}</select></label>` : ''}
    </div>
    ${swapDr ? `<button type="button" class="arow bad" id="da-dr"><span class="aic">${icon('drone', 18)}</span><span class="grow"><b>${esc((drones || []).find(d => d.id === w.drone_id)?.name || 'הרחפן')} ${esc(drWhy)}</b><small>החלפה ל${esc(swapDr.name)}${drAll.length > 1 ? ` בכל ${drAll.length} הימים` : ''}</small></span><span class="btn primary sm">החלפה</span></button>` : ''}
    ${nightToggleHtml('da-nt', isNight(w))}
    <div class="row"><label class="field grow" id="da-lsa">הגעה לאתר<input type="time" id="da-sa" value="${hm5(w.site_arrival)}"></label><label class="field grow" id="da-lse">סיום באתר<input type="time" id="da-se" value="${hm5(w.site_end)}"></label></div>
    ${started ? `<div class="row-btns"><a class="btn ghost" href="#/day/${id}">מסך היום</a><button class="btn primary" id="da-save">שמירת השעות</button></div>` : `<div class="row"><label class="field grow">תאריך<input type="date" id="da-day" value="${w.day}"></label><label class="field grow">יציאה<small id="da-hint"></small><input type="time" id="da-time" value="${hm5(w.report_time)}"></label></div>
    <label class="field">רחפן<select id="da-drone"><option value="">בלי רחפן</option>${(drones || []).map(d => { const why = av.drone(d.id); return `<option value="${d.id}" ${d.id === w.drone_id ? 'selected' : ''} ${why ? 'disabled' : ''}>${esc(d.name)}${why ? ' — ' + esc(why) : (d.health === 'warning' ? ' — במעקב' : '') + (av.droneWarn?.(d.id) ? ' · ⚠ ' + esc(av.droneWarn(d.id)) : '')}</option>`; }).join('')}</select></label>
    <div class="row-btns"><button class="btn ghost" id="da-cancel">ביטול היום</button><button class="btn primary" id="da-save">שמירת השינויים</button></div>`}`, (s, close) => {
    const busy = b => { b.disabled = true; return () => { b.disabled = false; }; };
    // סוג היום — נשמר בלחיצה (db/138), גם ביום שהתחיל
    bindDtPick(s, 'da-dt', async t => { const { error: e } = await sb.rpc('set_day_type', { t, w: id });
      if (e) return toast(errText(e, 'לא נשמר — נסו שוב'));
      w.day_type = t; $('#da-dtt', s).innerHTML = dtTag(w); toast(dtLabel(t), 1600, 'success'); after?.(); });
    // תחזית לימי ההזזה (וליום עצמו כשהשרת עוד לא סימן): "לא לטוס" מסומן על השבב — לא בוחרים יום גרוע במקרה
    const lat = w.projects?.sites?.lat || w.projects?.lat, lng = w.projects?.sites?.lng || w.projects?.lng;
    if (!started && lat) import('../lib/wx.js').then(async m => { const D = (await m.siteDays([{ id: 'x', lat, lng }])).x; if (!D || !s.isConnected) return;
      $$('[data-wxd]', s).forEach(e => { const x = D[wxKey({ ...w, day: e.dataset.wxd })]; if (x?.L) e.textContent = x.L === 2 ? 'לא לטוס' : 'גבולי'; });
      const t = D[wxKey(w)], box = $('#da-wx', s); if (box && t?.L === 2) box.outerHTML = `<div class="arow bad"><span class="aic">${icon('sun', 18)}</span><span class="grow"><b>תחזית לא לטוס</b><small>משבים ${Math.round(t.g)} קמ״ש</small></span></div>`;
    }).catch(() => {});
    $$('[data-rm]', s).forEach(b => b.onclick = async () => {
      if (!(await confirmBox(`להסיר את ${nm(b.dataset.rm)} מהיום?`, { ok: 'הסרה', danger: true }))) return;
      const un = busy(b); const { error: e } = await sb.rpc('unassign_day', { w: id, u: b.dataset.rm }); if (e) { un(); return toast(errText(e, 'לא נשמר — נסו שוב')); }
      (crew.length > 1 ? again : done)('הוסר · קיבל עדכון', close); });
    $$('[data-swap]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; const [out, inn] = b.dataset.swap.split('|'); $$('[data-swap]', s).forEach(x => x.disabled = true);
      const { error: e } = await sb.rpc('swap_crew', { w: id, out_u: out, in_u: inn }); if (e) { $$('[data-swap]', s).forEach(x => x.disabled = false); return toast(errText(e, 'ההחלפה לא נשמרה — נסו שוב'), 5000); }
      again(`${nm(inn)} במקום ${nm(out)} · שניהם קיבלו עדכון`, close); });
    $$('[data-lead]', s).forEach(b => b.onclick = async () => { const un = busy(b);
      const { error: e } = await sb.from('work_days').update({ crew_lead_id: b.dataset.lead }).eq('id', id); if (e) { un(); return toast(errText(e, 'לא נשמר — נסו שוב')); } again(`${nm(b.dataset.lead)} ראש הצוות`, close); });
    $$('[data-addu]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
      const { error: e } = await sb.rpc('assign_day', { p: w.project_id, d: w.day, u: b.dataset.addu }); if (e) { b.disabled = false; return toast(errText(e, 'השיבוץ לא נשמר — נסו שוב'), 5000); } again(`${nm(b.dataset.addu)} שובץ · קיבל עדכון`, close); });
    const add = $('#da-add', s); if (add) add.onchange = async () => { if (!add.value) return; add.disabled = true;
      const { error: e } = await sb.rpc('assign_day', { p: w.project_id, d: w.day, u: add.value }); if (e) { add.disabled = false; add.value = ''; return toast(errText(e, 'השיבוץ לא נשמר — נסו שוב'), 5000); } again('שובץ · קיבל עדכון', close); };
    const dr = $('#da-dr', s); if (dr) dr.onclick = async () => { if (dr.disabled) return; dr.disabled = true;
      const { error: e } = await sb.from('work_days').update({ drone_id: swapDr.id }).in('id', drAll.map(x => x.id)).eq('status', 'planned'); if (e) { dr.disabled = false; return toast(errText(e, 'לא נשמר — נסו שוב')); }
      again(`${swapDr.name}${drAll.length > 1 ? ` · ${drAll.length} ימים` : ''}`, close); };
    $$('[data-pre]', s).forEach(b => b.onclick = () => { const i = (pre || []).find(x => x.id === b.dataset.pre); close();
      import('./prestart.js').then(m => m.decideSheet({ ...i, projects: w.projects }, { who: nm(i.opened_by), after: () => openDayAdmin(id, after) })); });
    $$('[data-predr]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;   // היום כבר התחיל — רק היום הזה; המטיס בודק את הכלי החדש מההתחלה
      const { error: e } = await sb.from('work_days').update({ drone_id: b.dataset.predr }).eq('id', id); if (e) { b.disabled = false; return toast(errText(e, 'לא נשמר — נסו שוב')); }
      done(`${(drones || []).find(d => d.id === b.dataset.predr)?.name || 'הרחפן'} · המטיס בודק את הכלי החדש`, close); });
    // עבודת לילה: התחלה בתאריך היום, סיום למחרת (התאריך מוצג ליד השעה)
    const nightOn = bindNight(s, { tog: '#da-nt', arr: '#da-sa', end: '#da-se', lblA: '#da-lsa', lblE: '#da-lse', day: () => $('#da-day', s)?.value || w.day });
    $('#da-day', s)?.addEventListener('change', () => nightOn.paint());
    const timesChanged = () => ['site_arrival|#da-sa', 'site_end|#da-se', 'report_time|#da-time'].some(k => { const [f, q] = k.split('|'), el = $(q, s); return el && (el.value || null) !== (hm5(w[f]) || null); });
    const saveTimes = async () => {
      if (nightOn() && !$('#da-se', s).value) $('#da-se', s).value = '06:00';
      if (!nightOn() && $('#da-se', s).value && $('#da-sa', s).value && $('#da-se', s).value < $('#da-sa', s).value) { toast('הסיום לפני ההגעה — עבודת לילה?'); return false; }
      if (!timesChanged()) return true;
      const { error: e } = await sb.rpc('set_day_times', { w: id, dep: $('#da-time', s)?.value || null, arr: $('#da-sa', s).value || null, fin: $('#da-se', s).value || null });
      if (e) { toast(errText(e, 'השעות לא נשמרו — נסו שוב')); return false; } return true; };
    if (started) { $('#da-save', s).onclick = async e => { const un = busy(e.target), ch = timesChanged(); if (!(await saveTimes())) return un(); done(ch ? 'השעות עודכנו' : 'נשמר', close); }; return; }
    // הגעה לאתר זזה → יציאה מומלצת מחושבת מחדש (אלא אם שינו את היציאה ידנית)
    let tv = null, depTouched = false; const dep = $('#da-time', s), hint = $('#da-hint', s);
    const recalc = () => { const a = mins($('#da-sa', s).value); if (!tv || a == null) return; const r = hhmmOf(a - (tv.tr ?? 0) - tv.load);
      hint.textContent = tv.tr != null ? `מומלץ ${r}` : ''; if (!depTouched && $('#da-sa', s).value !== hm5(w.site_arrival)) dep.value = r; };
    dep.oninput = () => { depTouched = true; }; $('#da-sa', s).addEventListener('change', recalc);
    travelFrom(lat, lng).then(x => { tv = x; if (s.isConnected) recalc(); });
    $$('[data-shift]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
      const { data: n, error: e } = await sb.rpc('shift_days', { w: id, n: 1 }); if (e) { b.disabled = false; return toast(errText(e, 'הימים לא הוזזו — נסו שוב'), 6000); }
      done(`${n} ימי שטח זזו יום קדימה · מ${sd(nextWork(w.day))} · הצוות קיבל עדכון`, close); });
    $$('[data-mvd]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
      const { error: e } = await sb.rpc('move_day', { w: id, d: b.dataset.mvd }); if (e) { b.disabled = false; return toast(errText(e, 'היום לא הועבר — נסו שוב'), 5000); }
      done(`הועבר ל${dayLabel(b.dataset.mvd)} · הצוות קיבל עדכון`, close); });
    $('#da-save', s).onclick = async e => {
      const un = busy(e.target), d = $('#da-day', s).value, dr2 = $('#da-drone', s).value || null, ch = timesChanged();
      if (dr2 !== (w.drone_id || null)) {
        const { error: e1 } = await sb.from('work_days').update({ drone_id: dr2 }).eq('id', id); if (e1) { un(); return toast(errText(e1, 'לא נשמר — נסו שוב')); } }
      if (!(await saveTimes())) return un();   // השרת מתריע לצוות "השיבוץ שלך עודכן" (db/134)
      if (d && d !== w.day) { const { error: e2 } = await sb.rpc('move_day', { w: id, d }); if (e2) { un(); return toast(errText(e2, 'היום לא הועבר — נסו שוב'), 5000); } return done(`הועבר ל${dayLabel(d)} · הצוות קיבל עדכון`, close); }
      done(ch && crew.length ? 'נשמר · הצוות קיבל עדכון' : 'נשמר', close);
    };
    $('#da-cancel', s).onclick = async e => {
      if (!(await confirmBox(`לבטל את יום השטח ב-${dm(w.day)}?`, { ok: 'ביטול היום', danger: true }))) return;
      const un = busy(e.target);
      for (const u of crew) { const { error: e3 } = await sb.rpc('unassign_day', { w: id, u }); if (e3) { un(); return toast(errText(e3, 'הביטול לא נשמר — נסו שוב')); } }   // כל אחד מקבל עדכון; היום נמחק כשאין בו אף אחד
      if (!crew.length) await sb.from('work_days').delete().eq('id', id).eq('status', 'planned');
      done('היום בוטל · הצוות קיבל עדכון', close);
    };
  });
}
