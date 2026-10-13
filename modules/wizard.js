// הקוסם (#/wizard/<יום ראשון>) — הצעת שיבוץ לשבוע למנהלים. מה צריך ימי שטח (טווח מאנדי, ימים צפויים מהאפיון פחות מה שבוצע),
// מי פנוי (avail.js + כללי השרת דרך wizard_context, db/123), רחפן תקין ופנוי, תחזית (אותם ספים כמו wx.js), מרחק מהמשרד,
// רציפות צוות באותו פרויקט, מי שכבר עבד באתר, ופיזור עומס. חמדני + סבב שיפור (החלפות באותו יום) — כל בחירה עם הסיבות.
// עריכה (החלפת אדם/רחפן/שעה, הוספה/הסרה של יום) = נעילה של התא והרצה מחדש סביב הנעילות. "החלת השיבוץ" — דרך
// wizard_apply (db/128: schedule_work_days / assign_day הקיימים, הודעה אחת לכל עובד לשבוע; יום רחפן בלי מטיס — לא מוחל). בלי כסף.
import { sb, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, toast, sheet, backBtn, replaceHash, isOpenProject, shortName, leadMark } from '../lib/core.js';
import { errText } from '../lib/audit.js';
import { availability } from '../lib/avail.js';
import { siteDays } from '../lib/wx.js';
import { isNight, nightTag, nightToggleHtml, bindNight, wxKey } from '../lib/night.js';
import { dtTag, dtPickHtml, bindDtPick } from '../lib/daytype.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const sunday = s => addDays(s, -new Date(s + 'T12:00:00').getDay());
const dow = d => new Date(d + 'T12:00').getDay();
const sd = d => `${HE_D1[dow(d)]} ${dm(d)}`;
const first = n => String(n || '').split(' ')[0];
const pname = n => shortName(n).split(/\s[—–(]/)[0].trim();
const LOCK = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z';
const hm = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const mins = t => t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null;
const km = (a, b) => { if (!a || !b) return null; const R = 6371, r = x => x * Math.PI / 180, dl = r(b[0] - a[0]), dn = r(b[1] - a[1]);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, put: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };

let W = null;   // המסך הפתוח

export async function renderWizard(el, start) {
  if (!isManager()) { el.innerHTML = `<header class="phead">${backBtn('#/')}</header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>למנהל תפעול ומעלה</b></span></div>`; return; }
  start = sunday(/^\d{4}-\d\d-\d\d$/.test(start || '') ? start : addDays(isoDay(), dow(isoDay()) >= 4 ? 7 : 0));   // מחמישי — השבוע הבא
  const saved = store.get('wz:' + start) || {};
  W = { el, start, fri: !!saved.fri, P: saved.P || {}, locks: saved.locks || {}, extra: saved.extra || [], out: saved.out || [] };
  el.innerHTML = `<div class="wz">
    <header class="wzh">${backBtn(innerWidth >= 768 ? '#/desk' : '#/dispatch/' + start)}<h1 class="grow"><span class="wzmark">${icon('star', 20)}</span>הקוסם</h1>
      <div class="dkwk" role="group" aria-label="שבוע"><button type="button" class="dkic" id="wzprev" aria-label="שבוע קודם">‹</button><b class="dkwl">${dm(start)} – ${dm(addDays(start, 5))}</b><button type="button" class="dkic" id="wznext" aria-label="שבוע הבא">›</button></div>
      <label class="tog wzfri"><span>שישי</span><span class="sw"><input type="checkbox" id="wzfri" ${W.fri ? 'checked' : ''}><i></i></span></label>
      <button type="button" class="btn ghost sm" id="wzrun">${icon('sync', 16)} הרצה מחדש</button>
      <button type="button" class="btn primary sm" id="wzapply" disabled>החלת השיבוץ</button></header>
    <div id="wzb"><div class="wzload"><span class="wzmark spin">${icon('star', 26)}</span><b>הקוסם בודק זמינות, רחפנים ותחזית…</b></div></div></div>`;
  $('#wzprev', el).onclick = () => replaceHash('#/wizard/' + addDays(start, -7));
  $('#wznext', el).onclick = () => replaceHash('#/wizard/' + addDays(start, 7));
  $('#wzfri', el).onchange = e => { W.fri = e.target.checked; solve(); };
  $('#wzrun', el).onclick = () => { W.locks = {}; solve(); toast('הוצעה מחדש — בלי נעילות', 1800); };
  $('#wzapply', el).onclick = apply;
  try { await load(); } catch (e) { $('#wzb', el).innerHTML = `<div class="empty-card"><span class="ei">${icon('alert', 26)}</span><span><b>הנתונים לא נטענו</b><small>${esc(errText(e, 'נסו שוב'))}</small></span></div>`; return; }
  if (W?.el !== el) return;
  solve();
}

// ---------- טעינה ----------
async function load() {
  const my = W, a = W.start, b = addDays(a, 5), today = isoDay(), q = p => p.then(r => r, () => ({ data: null }));
  const [{ data: people }, { data: lic }, { data: projs, error: pe }, { data: drones }, { data: teams }, { data: ctx }, { data: rd }, { data: disp }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true).in('role', ['crew', 'crew_lead', 'ops_manager']).order('full_name'),
    q(sb.rpc('profiles_full').select('id,pilot_license_expiry')),
    sb.from('projects').select('id,name,site_id,planned_from,planned_to,pulses,field_days_planned,status_label,engagement,service,monday_item_id,monday_group,closed_summary,lat,lng,sites(name,lat,lng,buildings(specs(status,days_expected)))').or('monday_group.is.null,monday_group.neq.group_mm5052gw'),
    sb.from('equipment').select('id,name,health,insurance_until,service_state').eq('kind', 'drone').order('name'),
    q(sb.from('teams').select('lead_id,pilot_id,operator_id,active')),
    q(sb.rpc('wizard_context', { d1: a, d2: b })),
    q(sb.rpc('readiness_list')),
    q(sb.from('app_settings').select('value').eq('key', 'dispatch').maybeSingle()),
  ]);
  if (pe) throw pe;
  const open = (projs || []).filter(isOpenProject);
  const ids = open.map(p => p.id);
  const Dp = { office: [31.2203, 34.8041], office_name: 'המשרד', load_min: 20, traffic_factor: 1.15, ...(disp?.value || {}) };
  const geo = p => { const la = p.sites?.lat ?? p.lat, ln = p.sites?.lng ?? p.lng; return la != null && ln != null ? [+la, +ln] : null; };
  const uniqS = [...new Map(open.filter(p => p.site_id && geo(p)).map(p => [p.site_id, { id: p.site_id, lat: geo(p)[0], lng: geo(p)[1] }])).values()];
  // תחזית ונסיעה — במקביל לשאר, עם תקרת זמן (בלי תחזית — לא מדלגים)
  const extP = Promise.all([Promise.race([siteDays(uniqS), new Promise(r => setTimeout(() => r({}), 4500))]).catch(() => ({})), travel(uniqS, Dp)]);
  const [{ data: wds }, { data: bans }, { data: week }] = await Promise.all([
    ids.length ? sb.from('work_days').select('id,day,status,kind,project_id,crew_lead_id,drone_id,report_time,site_arrival,site_end,night,day_type,created_at,work_day_crew(user_id,cant_come_at)').in('project_id', ids).neq('status', 'cancelled').order('day') : { data: [] },
    q(sb.from('site_bans').select('site_id,user_id,reason')),
    sb.from('work_days').select('day,crew_lead_id,project_id,projects(name,site_id,lat,lng,sites(lat,lng)),work_day_crew(user_id,cant_come_at)').gte('day', addDays(a, -1)).lte('day', b).neq('status', 'cancelled'),
  ]);
  // אותו יום — כל העבודות של כולם (גם פרויקטים שלא ברשימה): מי ומה תפוס
  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(a, i));
  const av1 = d => availability(d, d, { drones: drones || [] });
  const AV = Object.fromEntries(await Promise.all(days.map(async d => [d, await av1(d).catch(() => av1(d)).catch(() => null)])));
  if (!ctx || days.some(d => !AV[d])) toast('חלק מבדיקות הזמינות לא נטענו — השרת יבדוק שוב בהחלה', 3500);
  const LIC = new Map((lic || []).map(x => [x.id, x.pilot_license_expiry]));
  const BL = new Map(); (ctx?.blocks || []).forEach(x => BL.set(x.u + '|' + x.d, x.why));
  const WN = new Map(); (ctx?.warns || []).forEach(x => WN.set(x.u + '|' + x.d, x.why));   // אחרי לילה (db/139) — אזהרה בלבד
  const BAN = new Map(); (bans || []).forEach(x => BAN.set(x.site_id + '|' + x.user_id, x.reason));
  const RD = new Map((rd || []).map(r => [r.project_id, r]));
  const byP = new Map(); (wds || []).forEach(w => { if (!byP.has(w.project_id)) byP.set(w.project_id, []); byP.get(w.project_id).push(w); });
  // רצף ימים: נסיעה מאתר לאתר (ראש צוות שעבד אתמול באתר אחר) — טבלת OSRM אחת בין כל האתרים של השבוע
  const wkS = (week || []).filter(w => w.projects?.site_id).map(w => { const g = geo(w.projects); return g ? { id: w.projects.site_id, lat: g[0], lng: g[1] } : null; }).filter(Boolean);
  const allS = [...new Map([...uniqS, ...wkS].map(x => [x.id, x])).values()];
  const [[WX, TR], TT] = await Promise.all([extP, between(allS, Dp)]);
  if (my !== W) return;
  Object.assign(W, { wdsAll: (week || []).filter(w => w.day >= a), wdsPrev: week || [], TT, siteName: new Map((week || []).map(w => [w.project_id, w.projects?.name || ''])), geoP: new Map(open.map(p => [p.id, geo(p)])), people: people || [], LIC, drones: drones || [], teams: (teams || []).filter(t => t.active !== false), AV, BL, WN, BAN, RD, WX, TR, Dp, days, today, hist: ctx?.hist || {}, wds: wds || [], byP, geo,
    projects: open.map(p => prepProject(p, byP.get(p.id) || [], days, today)) });
  W.PM = new Map(W.projects.map(p => [p.id, p]));
}

// נסיעה מהמשרד לכל אתר: OSRM בקריאה אחת (טבלה), ואם נכשל — קו אווירי × 1.3 ב-70 קמ״ש
async function travel(sites, Dp) {
  const out = {}, o = Dp.office;
  sites.forEach(s => { const k = km(o, [s.lat, s.lng]); out[s.id] = { min: k == null ? null : Math.round(k * 1.3 / 70 * 60 * Dp.traffic_factor), km: k == null ? null : Math.round(k * 1.3), est: true }; });
  if (!sites.length) return out;
  const key = 'wz-tr:' + sites.map(s => s.id).sort().join(',').slice(0, 400), c = store.get(key);
  if (c && Date.now() - c.t < 864e5) return { ...out, ...c.v };
  try {
    const url = `https://router.project-osrm.org/table/v1/driving/${[[o[1], o[0]], ...sites.map(s => [s.lng, s.lat])].map(x => x.join(',')).join(';')}?sources=0&annotations=duration,distance`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const j = await (await fetch(url, { signal: ctl.signal })).json(); clearTimeout(t);
    if (j.code === 'Ok') { const v = {}; sites.forEach((s, i) => { const du = j.durations[0][i + 1], di = j.distances?.[0]?.[i + 1]; if (du != null) v[s.id] = { min: Math.ceil(du / 60 * Dp.traffic_factor), km: di != null ? Math.round(di / 1000) : out[s.id].km }; });
      store.put(key, { t: Date.now(), v }); return { ...out, ...v }; }
  } catch { /* קו אווירי */ }
  return out;
}

// נסיעה בין אתרים (a|b → דקות): OSRM טבלה מלאה, ואם נכשל — קו אווירי × 1.3 ב-70 קמ״ש
async function between(sites, Dp) {
  const out = {};
  sites.forEach(a => sites.forEach(b => { if (a.id !== b.id) { const k = km([a.lat, a.lng], [b.lat, b.lng]); out[a.id + '|' + b.id] = { min: Math.round(k * 1.3 / 70 * 60 * Dp.traffic_factor), km: Math.round(k * 1.3), est: true }; } }));
  if (sites.length < 2 || sites.length > 60) return out;
  const key = 'wz-tt:' + sites.map(s => s.id).sort().join(',').slice(0, 400), c = store.get(key);
  if (c && Date.now() - c.t < 864e5) return { ...out, ...c.v };
  try {
    const url = `https://router.project-osrm.org/table/v1/driving/${sites.map(s => [s.lng, s.lat].join(',')).join(';')}?annotations=duration,distance`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const j = await (await fetch(url, { signal: ctl.signal })).json(); clearTimeout(t);
    if (j.code === 'Ok') { const v = {}; sites.forEach((a, i) => sites.forEach((b, k) => { const du = j.durations[i][k]; if (i !== k && du != null) v[a.id + '|' + b.id] = { min: Math.ceil(du / 60 * Dp.traffic_factor), km: j.distances?.[i]?.[k] != null ? Math.round(j.distances[i][k] / 1000) : null }; }));
      store.put(key, { t: Date.now(), v }); return { ...out, ...v }; }
  } catch { /* קו אווירי */ }
  return out;
}

// כמה ימים הפרויקט צריך השבוע: ימים בטווח מאנדי (בלי יום קיים), מוגבל ביתרה = צפוי (תמחור/אפיון) − בוצע − מתוכנן
function prepProject(p, ws, days, today) {
  const real = ws.filter(w => w.kind !== 'report');
  const done = real.filter(w => w.status === 'done').length, planned = real.filter(w => w.status !== 'done' && w.day >= today).length;
  const specDays = (p.sites?.buildings || []).reduce((t, b) => { const s = Array.isArray(b.specs) ? b.specs[0] : b.specs; return t + (s?.status === 'done' ? Number(s.days_expected || 0) : 0); }, 0);
  const expected = Number(p.field_days_planned) || specDays || null;
  const rem = expected != null ? Math.max(0, Math.ceil(expected - done - planned)) : null;
  // פעימות (db/127): הימים שבין הפעימות לא "צריכים שיבוץ"
  const inRange = d => Array.isArray(p.pulses) && p.pulses.length > 1 ? p.pulses.some(([f, t]) => f <= d && d <= t) : p.planned_from && p.planned_from <= d && (p.planned_to || p.planned_from) >= d;
  const taken = new Set(ws.filter(w => w.status !== 'cancelled').map(w => w.day));
  const rangeDays = days.filter(d => d > today && dow(d) < 5 && inRange(d) && !taken.has(d));
  const last = [...real].reverse().find(w => w.crew_lead_id);
  const team = last ? [...new Set([last.crew_lead_id, ...(last.work_day_crew || []).filter(c => !c.cant_come_at).map(c => c.user_id)].filter(Boolean))] : [];
  const lastDrone = [...real].reverse().find(w => w.drone_id)?.drone_id || null;
  return { id: p.id, name: p.name, site: p.site_id, siteName: p.sites?.name || '', monday: !!p.monday_item_id, status: p.status_label || '', pilot: p.engagement === 'פיילוט',
    from: p.planned_from, to: p.planned_to, inR: inRange, expected, done, planned, rem, rangeDays, taken, team, lastDrone, lastArr: last?.site_arrival || null, lastEnd: last?.site_end || (isNight(last) ? '06:00' : null), lastRep: last?.report_time || null,
    fresh: !ws.length, ws, needDrone: real.length ? real.some(w => w.drone_id) || !real.some(w => w.status === 'done') : true,
    defWant: rangeDays.length ? (rem == null ? rangeDays.length : Math.min(rangeDays.length, rem)) : 0 };
}

// ---------- הצעה ----------
const cfg = p => ({ want: p.defWant, size: Math.max(2, Math.min(4, p.team.length || 2)), ...(W.P[p.id] || {}) });
const inPlan = p => W.extra.includes(p.id) || p.ws.some(w => w.day >= W.start && w.day <= W.days.at(-1) && w.kind !== 'report') || (p.rangeDays.length > 0 && cfg(p).want > 0) || Object.keys(W.locks).some(k => k.startsWith(p.id + '|'));
const candDays = p => W.days.filter(d => d > W.today && dow(d) !== 6 && (dow(d) !== 5 || W.fri) && !p.taken.has(d) && !W.out.includes(p.id + '|' + d));
const slotNight = s => !!s && isNight({ site_arrival: s.arr, site_end: s.end });   // עבודת לילה בתא: הסיום למחרת
const wxOf = (p, d, s) => p.site ? W.WX?.[p.site]?.[slotNight(s) ? wxKey({ day: d, site_arrival: s.arr, site_end: s.end }) : d] || null : null;
const licOk = (u, d) => { const x = W.people.find(y => y.id === u); if (!x?.is_pilot) return false; const e = W.LIC.get(u); return !e || e >= d; };
const NM = u => W.people.find(x => x.id === u)?.full_name || '';
const DRN = id => W.drones.find(x => x.id === id)?.name || '';

function hard(u, d, p) {   // למה אי אפשר (ריק = אפשר)
  return W.AV[d]?.person(u) || W.BL.get(u + '|' + d) || (p.site && W.BAN.has(p.site + '|' + u) ? 'לא לשבץ באתר' : '');
}
function droneHard(id, d) {
  const x = W.drones.find(y => y.id === id); if (!x) return 'לא נמצא';
  if (x.health === 'grounded') return 'מקורקע';
  if (x.insurance_until && x.insurance_until < d) return 'ביטוח פג';
  return W.AV[d]?.drone(id) || '';
}

// אחרי לילה: עבד לילה שנגמר הבוקר (קיים — avail.js, או מוצע אתמול בקוסם) ומשובץ למשמרת יום — אזהרה, לא חסימה
function restWarn(u, slot, S) {
  if (slotNight(slot)) return '';
  const z = S.find(x => x.d === addDays(slot.d, -1) && slotNight(x) && [x.lead, ...x.crew].includes(u));
  return W.AV[slot.d]?.rest?.(u) || W.WN?.get(u + '|' + slot.d) || (z ? `סיים לילה ב-${(z.end || '06:00').slice(0, 5)}` : '');
}
// ציון אדם בתא + הסיבות. role: lead | crew
function personScore(u, slot, role, S) {
  const p = W.PM.get(slot.pid), d = slot.d, R = []; let s = 0;
  const prev = S.filter(x => x.pid === slot.pid && x.d < d).sort((a, b) => a.d < b.d ? 1 : -1)[0];
  if (prev && [prev.lead, ...prev.crew].includes(u)) { s += 30; R.push(prev.d === addDays(d, -1) ? 'המשך מאתמול' : 'המשך מ' + sd(prev.d)); }
  else if (p.team.includes(u)) { s += 20; R.push('עבד בפרויקט'); }
  const h = (W.hist[p.site] || []).find(x => x.u === u);
  if (h) { s += Math.min(15, 5 * h.n); R.push(`מכיר את האתר · ${h.n} ימים`); }
  const ppl = role === 'lead' ? [] : [slot.lead];
  if (ppl[0] && W.teams.some(t => [t.lead_id, t.pilot_id, t.operator_id].includes(ppl[0]) && [t.lead_id, t.pilot_id, t.operator_id].includes(u))) { s += 10; R.push('צוות קבוע עם ' + first(NM(ppl[0]))); }
  const load = loadOf(u, S, slot);
  if (load) { s -= 7 * load; R.push(`עוד ${load} ימים השבוע`); }
  const x = W.people.find(y => y.id === u);
  if (role === 'lead') { if (x?.role === 'crew_lead') { s += 12; R.push('ראש צוות'); } else if (x?.role === 'ops_manager') s += 2; else s -= 4; }
  else {
    if (x?.role === 'ops_manager') s -= 6;
    if (licOk(u, d) && [slot.lead, ...slot.crew].some(v => v && v !== u && licOk(v, d))) { s -= 12; R.push('מטיס נוסף — עדיף לצוות אחר'); }
  }
  // קרוב לאתר של אתמול (מי שעבד אתמול באתר אחר)
  const y = S.find(z => z.d === addDays(d, -1) && z.pid !== slot.pid && [z.lead, ...z.crew].includes(u));
  if (y) { const a = W.geoP.get(y.pid), b = W.geoP.get(slot.pid), k = km(a, b); if (k != null && k < 25) { s += 4; R.push('קרוב לאתר של אתמול'); } }
  const rw = restWarn(u, slot, S), ow = W.AV[d]?.warn(u), wn = rw || (ow && ow === W.AV[d]?.rest?.(u) ? '' : ow);   // תא לילה — לילה של אתמול לא מתנגש
  if (wn) { s -= rw ? 8 : 3; R.push('⚠ ' + wn); }
  return { s, R };
}
function loadOf(u, S, except) {   // ימים השבוע: קיימים + מוצעים (בלי התא עצמו)
  const ex = W.days.filter(d => W.wdsAll.some(w => w.day === d && (w.crew_lead_id === u || (w.work_day_crew || []).some(c => c.user_id === u && !c.cant_come_at)))).length;
  return ex + S.filter(x => x !== except && [x.lead, ...x.crew].includes(u)).length;
}
function droneScore(id, slot, S) {
  const p = W.PM.get(slot.pid), R = []; let s = 0;
  const prev = S.filter(x => x.pid === slot.pid && x.d < slot.d && x.drone).sort((a, b) => a.d < b.d ? 1 : -1)[0];
  if (prev?.drone === id) { s += 20; R.push('אותו רחפן כמו ב' + sd(prev.d)); } else if (p.lastDrone === id) { s += 10; R.push('הרחפן של הפרויקט'); }
  const wn = W.AV[slot.d]?.droneWarn(id); if (wn) { s -= 5; R.push('⚠ ' + wn); }
  const n = S.filter(x => x !== slot && x.drone === id).length; s -= 2 * n;
  return { s, R };
}
const usedOn = (S, d, except) => new Set(S.filter(x => x.d === d && x !== except).flatMap(x => [x.lead, ...x.crew]).filter(Boolean));
const droneUsed = (S, d, except) => new Set(S.filter(x => x.d === d && x !== except).map(x => x.drone).filter(Boolean));

function fill(slot, S) {   // ראש צוות → מטיס (אם צריך) → שאר הצוות → רחפן. קשיח קודם, ציון אחר כך
  const p = W.PM.get(slot.pid), c = cfg(p), d = slot.d, used = usedOn(S, d, slot);
  const ok = u => !used.has(u) && !hard(u, d, p) && u !== slot.lead && !slot.crew.includes(u);
  const best = (pool, role) => pool.filter(ok).map(u => ({ u, ...personScore(u, slot, role, S) })).sort((a, b) => b.s - a.s || NM(a.u).localeCompare(NM(b.u)))[0];
  const all = W.people.map(x => x.id);
  slot.lead = null; slot.crew = [];
  // ראש צוות: אם אין מטיס אחר פנוי — ראש הצוות חייב להיות מטיס
  const pilotsFree = all.filter(u => ok(u) && licOk(u, d));
  let L = best(all, 'lead');
  if (L && p.needDrone && !licOk(L.u, d) && (pilotsFree.filter(u => u !== L.u).length === 0 || c.size < 2)) L = best(pilotsFree, 'lead') || L;
  if (!L) return slot;
  slot.lead = L.u;
  if (p.needDrone && !licOk(slot.lead, d)) { const P = best(all.filter(u => licOk(u, d)), 'crew'); if (P) slot.crew.push(P.u); }
  while (1 + slot.crew.length < c.size) { const x = best(all, 'crew'); if (!x) break; slot.crew.push(x.u); }
  if (p.needDrone) {
    const du = droneUsed(S, d, slot);
    slot.drone = W.drones.filter(x => !du.has(x.id) && !droneHard(x.id, d)).map(x => ({ id: x.id, ...droneScore(x.id, slot, S) })).sort((a, b) => b.s - a.s)[0]?.id || null;
  } else slot.drone = null;
  return slot;
}

function times(slot, S = W.S || []) {   // יציאה = הגעה − נסיעה − העמסה (עיגול ל-5 דק׳ למטה). נסיעה מהמשרד, או מהאתר של אתמול אם ראש הצוות היה שם
  const p = W.PM.get(slot.pid); let tr = p.site ? W.TR[p.site] : null;
  const y = addDays(slot.d, -1);
  if (slot.lead && p.site) {
    const ps = S.find(z => z !== slot && z.d === y && z.lead === slot.lead && z.pid !== slot.pid);
    const pw = ps ? null : (W.wdsPrev || []).find(w => w.day === y && w.crew_lead_id === slot.lead && w.project_id !== slot.pid);
    const fromSite = ps ? W.PM.get(ps.pid)?.site : pw?.projects?.site_id, x = fromSite && fromSite !== p.site ? W.TT?.[fromSite + '|' + p.site] : null;
    if (x?.min != null) tr = { ...x, from: pname(ps ? W.PM.get(ps.pid).name : pw.projects?.name || '') };
  }
  const arr = mins(slot.arr || p.lastArr || '07:00');
  const dep = tr?.min != null ? Math.floor((arr - tr.min - W.Dp.load_min) / 5) * 5 : mins(p.lastRep || '06:00');
  return { arr: hm(arr), dep: hm(dep), tr };
}

// איכות תא 0–100: מה חסר פוגע, מה טוב מוסבר
function grade(slot, S) {
  const p = W.PM.get(slot.pid), c = cfg(p), d = slot.d, bad = [], warn = []; let g = 100;
  if (!slot.lead) { bad.push('אין ראש צוות פנוי'); g -= 60; }
  if (p.needDrone && ![slot.lead, ...slot.crew].some(u => u && licOk(u, d))) { bad.push('אין מטיס עם רישיון בתוקף'); g -= 40; }
  if (p.needDrone && !slot.drone) { bad.push('אין רחפן פנוי'); g -= 30; }
  const short = c.size - (slot.lead ? 1 : 0) - slot.crew.length; if (slot.lead && short > 0) { warn.push(`חסר ${short} בצוות`); g -= 15 * short; }
  const x = wxOf(p, d); if (x?.L === 2) { bad.push(`לא לטוס · משבים ${Math.round(x.g)}`); g -= 40; } else if (x?.L === 1) { warn.push(`גבולי · משבים ${Math.round(x.g)}`); g -= 10; }
  if (p.from && !(p.from <= d && (p.to || p.from) >= d)) { warn.push('מחוץ לטווח מאנדי'); g -= 5; }
  [slot.lead, ...slot.crew].filter(Boolean).forEach(u => { const rw = restWarn(u, slot, S); if (rw) { warn.push(first(NM(u)) + ': ' + rw); g -= 5; } });
  if (slot.drone && W.AV[d]?.droneWarn(slot.drone)) warn.push(DRN(slot.drone) + ': ' + W.AV[d].droneWarn(slot.drone));
  const sc = [slot.lead && personScore(slot.lead, slot, 'lead', S).s, ...slot.crew.map(u => personScore(u, slot, 'crew', S).s)].filter(v => v !== false);
  const fit = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0;
  g += Math.max(-10, Math.min(10, Math.round(fit / 4)));
  return { g: Math.max(0, Math.min(100, Math.round(g))), bad, warn };
}

function solve() {
  if (!W?.projects) return;
  const S = [], skipped = [], unfilled = [];
  const plan = W.projects.filter(inPlan);
  // 1. נעילות קודם — כמו שהמנהל קבע
  for (const [k, v] of Object.entries(W.locks)) { const [pid, d] = k.split('|'); const p = W.PM.get(pid); if (!p || !candDays(p).includes(d)) continue;
    S.push({ pid, d, lead: v.lead || null, crew: [...(v.crew || [])], drone: v.drone || null, arr: v.arr || null, end: v.end || null, dep: v.dep || null, dt: v.dt || 'work', locked: true }); }
  // 2. בחירת ימים לכל פרויקט: טווח מאנדי קודם, יום "לא לטוס" מדולג (אלא אם ננעל), עד הכמות שצריך
  const order = [...plan].sort((a, b) => ((b.rangeDays.length ? 1 : 0) - (a.rangeDays.length ? 1 : 0)) || ((a.to || '9') < (b.to || '9') ? -1 : (a.to || '9') > (b.to || '9') ? 1 : 0) || (a.id < b.id ? -1 : 1));
  for (const p of order) {
    const c = cfg(p), have = S.filter(x => x.pid === p.id).length, need = Math.max(0, c.want - have);
    const pool = candDays(p).filter(d => !S.some(x => x.pid === p.id && x.d === d));
    const pref = [...pool].sort((a, b) => ((p.rangeDays.includes(b) ? 1 : 0) - (p.rangeDays.includes(a) ? 1 : 0)) || ((wxOf(p, a)?.L || 0) - (wxOf(p, b)?.L || 0)) || (a < b ? -1 : 1));
    const pick = [];
    for (const d of pref) { if (pick.length >= need) break; const x = wxOf(p, d); if (x?.L === 2) { skipped.push({ pid: p.id, d, why: `לא לטוס · משבים ${Math.round(x.g)}` }); continue; }
      if (p.from && !p.inR(d) && !W.extra.includes(p.id)) continue;   // לא יוצאים מטווח מאנדי בלי שהמנהל ביקש
      pick.push(d); }
    pick.sort().forEach(d => S.push({ pid: p.id, d, lead: null, crew: [], drone: null, locked: false }));
    const sk = skipped.filter(x => x.pid === p.id);
    if (pick.length < need) unfilled.push({ pid: p.id, why: `חסרים ${need - pick.length} ימים${sk.length ? ` · ${sk.map(x => sd(x.d)).join(', ')} לא לטוס` : p.rangeDays.length ? ' בטווח מאנדי' : ''}` });
  }
  // 3. מילוי חמדני: פרויקטים קשים (פחות ימים פנויים) קודם, ובתוך פרויקט — לפי סדר הימים (רציפות)
  const free = S.filter(x => !x.locked);
  const hardness = pid => candDays(W.PM.get(pid)).length;
  free.sort((a, b) => hardness(a.pid) - hardness(b.pid) || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0) || (a.d < b.d ? -1 : 1));
  for (const s of free) fill(s, S);
  // 4. סבב שיפור: החלפת שני אנשים באותו תפקיד בין שני פרויקטים באותו יום, או אדם פנוי במקום מישהו — אם הציון הכולל עולה
  improve(S);
  // 5. ציון וסיבות
  for (const s of S) { Object.assign(s, grade(s, S)); const t = times(s, S); if (!s.arr && !s.end) s.end = W.PM.get(s.pid)?.lastEnd || null; s.arr = s.arr || t.arr;   // לילה ממשיך כמו הימים הקודמים
    s.depAuto = t.dep; s.tr = t.tr; }
  W.S = S; W.skipped = skipped; W.unfilled = unfilled;
  store.put('wz:' + W.start, { fri: W.fri, P: W.P, locks: W.locks, extra: W.extra, out: W.out });
  draw();
}

function total(S) { return S.reduce((t, s) => { const p = W.PM.get(s.pid);
  return t + (s.lead ? personScore(s.lead, s, 'lead', S).s : -100) + s.crew.reduce((a, u) => a + personScore(u, s, 'crew', S).s, 0)
    + (p.needDrone && ![s.lead, ...s.crew].some(u => u && licOk(u, s.d)) ? -80 : 0); }, 0); }
function ok2(s) { const p = W.PM.get(s.pid); return ![s.lead, ...s.crew].some(u => u && hard(u, s.d, p)); }
function improve(S) {
  let base = total(S);
  for (let round = 0; round < 3; round++) {
    let better = false;
    for (const d of W.days) {
      const day = S.filter(x => x.d === d && !x.locked && x.lead);
      for (let i = 0; i < day.length; i++) for (let j = i + 1; j < day.length; j++) {
        const A = day[i], B = day[j];
        for (const k of ['lead', ...A.crew.map((_, n) => n)]) for (const m of ['lead', ...B.crew.map((_, n) => n)]) {
          if ((k === 'lead') !== (m === 'lead')) continue;
          const get = (X, q) => q === 'lead' ? X.lead : X.crew[q], set = (X, q, v) => { if (q === 'lead') X.lead = v; else X.crew[q] = v; };
          const a = get(A, k), b = get(B, m); set(A, k, b); set(B, m, a);
          const t = ok2(A) && ok2(B) ? total(S) : -Infinity;
          if (t > base + 0.5) { base = t; better = true; } else { set(A, k, a); set(B, m, b); }
        }
      }
      // אדם פנוי (לא משובץ באותו יום) במקום חבר צוות
      for (const s of day) for (const q of s.crew.map((_, n) => n)) {
        const used = usedOn(S, d, null), cur = s.crew[q];
        for (const u of W.people.map(x => x.id).filter(u => !used.has(u))) {
          s.crew[q] = u; const t = ok2(s) ? total(S) : -Infinity;
          if (t > base + 0.5) { base = t; better = true; break; } s.crew[q] = cur;
        }
      }
    }
    if (!better) break;
  }
}

// ---------- תצוגה ----------
function draw() {
  const el = $('#wzb', W.el); if (!el) return;
  const S = W.S, plan = W.projects.filter(inPlan), cols = W.days.filter(d => dow(d) !== 5 || W.fri);
  const people = [...new Set(S.flatMap(s => [s.lead, ...s.crew]).filter(Boolean))];
  const avg = S.length ? Math.round(S.reduce((t, s) => t + s.g, 0) / S.length) : 0;
  const issues = [...S.filter(s => s.bad.length).map(s => ({ pid: s.pid, d: s.d, why: s.bad.join(' · '), bad: 1 })), ...W.unfilled];
  const others = W.projects.filter(p => !inPlan(p) && (p.rem == null || p.rem > 0));
  $('#wzapply', W.el).disabled = !S.some(s => s.lead);
  $('#wzapply', W.el).textContent = S.some(s => s.lead) ? `החלת השיבוץ · ${S.filter(s => s.lead).length} ימים` : 'החלת השיבוץ';
  const tone = g => g >= 80 ? 'ok' : g >= 55 ? 'mid' : 'bad';
  el.innerHTML = `
    <div class="wzk">
      <div class="wzkpi ${tone(avg)}"><b>${S.length ? avg : '—'}</b><span>ציון השבוע</span></div>
      <div class="wzkpi"><b>${S.filter(s => s.lead).length}<small>/${S.length}</small></b><span>ימי שטח מוצעים</span></div>
      <div class="wzkpi"><b>${people.length}</b><span>עובדים</span></div>
      <button type="button" class="wzkpi ${issues.length ? 'bad' : 'ok'}" id="wzgo"><b>${issues.length}</b><span>${issues.length ? 'לטיפול' : 'הכל מסודר'}</span></button>
    </div>
    ${plan.length ? `<div class="wzgrid" style="--wzc:${cols.length}">
      <div class="wzhd wzcorner"></div>${cols.map(d => `<div class="wzhd ${d === W.today ? 'today' : ''} ${d <= W.today ? 'past' : ''}"><b>${HE_D1[dow(d)]}</b><small>${dm(d)}</small></div>`).join('')}
      ${plan.map(p => row(p, cols)).join('')}
    </div>` : `<div class="empty-card"><span class="ei">${icon('calendar', 26)}</span><span><b>אין השבוע ימי שטח לשבץ</b><small>${others.length ? 'אפשר להוסיף פרויקט מלמטה' : ''}</small></span></div>`}
    ${loadStrip()}
    ${issues.length ? `<section class="wzsec" id="wziss"><h3 class="sh">לטיפול</h3><div class="wzissues">${issues.map(x => { const p = W.PM.get(x.pid);
      return `<button type="button" class="arow ${x.bad ? 'bad' : 'warn'} card-like wziss" data-iss="${x.pid}|${x.d || ''}"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(pname(p?.name))}${x.d ? ' · ' + sd(x.d) : ''}</b><small>${esc(x.why)}</small></span></button>`; }).join('')}</div></section>` : ''}
    ${others.length ? `<section class="wzsec"><h3 class="sh">עוד פרויקטים פתוחים</h3><div class="chips">${others.map(p => `<button type="button" class="chip" data-addp="${p.id}">${icon('plus', 14)}<span>${esc(pname(p.name))}</span><small class="why">${p.rem != null ? `${p.rem} ימים` : p.from ? dm(p.from) : ''}</small></button>`).join('')}</div></section>` : ''}`;
  bind(el);
}

function row(p, cols) {
  const c = cfg(p), S = W.S.filter(s => s.pid === p.id), r = W.RD.get(p.id);
  const meta = [p.from ? `מאנדי ${dm(p.from)}${p.to && p.to !== p.from ? '–' + dm(p.to) : ''}` : 'בלי תאריך במאנדי', p.expected != null ? `נשארו ${p.rem}` : null, r ? `מוכנות ${r.ok}/${r.n}` : null].filter(Boolean).join(' · ');
  return `<div class="wzph"><a href="#/p/${p.id}" class="wzpn">${esc(pname(p.name))}${p.pilot ? ' <span class="pill lime">פיילוט</span>' : ''}</a><small>${esc(meta)}</small>
      <div class="wzctl"><span class="wzstep" title="ימים השבוע"><button type="button" data-want="${p.id}|-1" aria-label="פחות ימים">−</button><b>${c.want}</b><small>ימים</small><button type="button" data-want="${p.id}|1" aria-label="עוד יום">+</button></span>
      <span class="wzstep" title="גודל צוות"><button type="button" data-size="${p.id}|-1" aria-label="צוות קטן יותר">−</button><b>${c.size}</b><small>בצוות</small><button type="button" data-size="${p.id}|1" aria-label="צוות גדול יותר">+</button></span></div></div>
    ${cols.map(d => cell(p, d, S.find(s => s.d === d))).join('')}`;
}

function cell(p, d, s) {
  const ex = p.ws.filter(w => w.day === d && w.status !== 'cancelled');
  if (ex.length) return `<div class="wzc ex">${ex.map(w => `<a class="wzex" href="#/day/${w.id}"><small>קיים${dtTag(w)}${nightTag(w)}</small><b>${esc(first(NM(w.crew_lead_id)) || '—')}${leadMark()}</b><small>${(w.work_day_crew || []).filter(c => c.user_id !== w.crew_lead_id).map(c => esc(first(NM(c.user_id)))).join(' · ')}</small></a>`).join('')}</div>`;
  const x = wxOf(p, d), canAdd = d > W.today && (dow(d) !== 5 || W.fri);
  const inR = p.from && p.from <= d && (p.to || p.from) >= d;
  if (!s) return `<div class="wzc empty ${inR && canAdd ? 'inr' : ''} ${x?.L === 2 ? 'nofly' : ''}">${canAdd ? `<button type="button" class="wzadd" data-addd="${p.id}|${d}" aria-label="הוספת יום">${x?.L ? `<small class="${x.L === 2 ? 'bad' : 'mid'}">${x.L === 2 ? 'לא לטוס' : 'גבולי'} · ${Math.round(x.g)}</small>` : icon('plus', 16)}</button>` : ''}</div>`;
  const tone = s.g >= 80 ? 'ok' : s.g >= 55 ? 'mid' : 'bad';
  return `<div class="wzc"><button type="button" class="wzcard ${tone} ${s.locked ? 'locked' : ''}" data-wslot="${p.id}|${d}">
    <span class="wztop"><b>${s.dep || s.depAuto}</b>${dtTag({ day_type: s.dt })}${slotNight(s) ? nightTag({ day: d, site_arrival: s.arr, site_end: s.end }) : ''}${s.locked ? `<span class="wzlock" aria-label="נעול">${icon(LOCK, 13)}</span>` : ''}<span class="grow"></span><span class="wzg">${s.g}</span></span>
    ${s.lead ? `<span class="wzlead">${esc(first(NM(s.lead)))}${leadMark()}</span>` : '<span class="wzlead bad">אין ראש צוות</span>'}
    ${s.crew.length ? `<small class="wzcrew">${s.crew.map(u => esc(first(NM(u))) + (licOk(u, d) ? ' <i class="wzpl">מטיס</i>' : '')).join(' · ')}</small>` : ''}
    ${W.PM.get(s.pid).needDrone ? `<small class="wzdr ${s.drone ? '' : 'bad'}">${icon('drone', 12)} ${s.drone ? esc(DRN(s.drone).split('(')[0].trim()) : 'בלי רחפן'}</small>` : ''}
    ${s.bad.length ? `<span class="pill bad">${esc(s.bad[0])}</span>` : s.warn.length ? `<span class="pill warn">${esc(s.warn[0])}</span>` : ''}
  </button></div>`;
}

function loadStrip() {
  const S = W.S, ppl = W.people.filter(x => x.role !== 'ops_manager' || S.some(s => [s.lead, ...s.crew].includes(x.id)));
  if (!ppl.length) return '';
  const n = u => loadOf(u, S, null), max = Math.max(1, ...ppl.map(x => n(x.id)));
  return `<section class="wzsec"><h3 class="sh">עומס השבוע</h3><div class="wzload2">${ppl.sort((a, b) => n(b.id) - n(a.id)).map(x => `<span class="wzbar"><b>${esc(first(x.full_name))}</b><i style="--v:${n(x.id) / max}"></i><small>${n(x.id)}</small></span>`).join('')}</div></section>`;
}

function bind(el) {
  const setP = (pid, k, dv, lo, hi) => { const p = W.PM.get(pid), c = cfg(p); W.P[pid] = { ...(W.P[pid] || {}), want: c.want, size: c.size, [k]: Math.max(lo, Math.min(hi, c[k] + dv)) };
    if (k === 'want' && W.P[pid].want === 0) { W.extra = W.extra.filter(x => x !== pid); Object.keys(W.locks).filter(x => x.startsWith(pid + '|')).forEach(x => delete W.locks[x]); }
    solve(); };
  $$('[data-want]', el).forEach(b => b.onclick = () => { const [pid, v] = b.dataset.want.split('|'); setP(pid, 'want', +v, 0, 6); });
  $$('[data-size]', el).forEach(b => b.onclick = () => { const [pid, v] = b.dataset.size.split('|'); setP(pid, 'size', +v, 1, 5); });
  $$('[data-addp]', el).forEach(b => b.onclick = () => { const pid = b.dataset.addp, p = W.PM.get(pid); W.extra.push(pid); W.P[pid] = { ...(W.P[pid] || {}), want: Math.max(1, Math.min(p.rem ?? 1, candDays(p).length)) }; solve(); });
  $$('[data-addd]', el).forEach(b => b.onclick = () => { const [pid, d] = b.dataset.addd.split('|'), p = W.PM.get(pid), c = cfg(p);
    W.out = W.out.filter(x => x !== pid + '|' + d); if (!inPlan(p)) W.extra.push(pid);
    const s = { pid, d, lead: null, crew: [], drone: null }; fill(s, W.S); W.locks[pid + '|' + d] = { lead: s.lead, crew: s.crew, drone: s.drone };
    W.P[pid] = { ...(W.P[pid] || {}), want: c.want + 1, size: c.size }; solve(); });
  $$('[data-wslot]', el).forEach(b => b.onclick = () => openSlot(...b.dataset.wslot.split('|')));
  $$('[data-iss]', el).forEach(b => b.onclick = () => { const [pid, d] = b.dataset.iss.split('|'); const t = $(`[data-wslot="${pid}|${d}"]`, el) || $(`[data-addd="${pid}|${d}"]`, el); if (t) { t.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); t.classList.add('wzflash'); setTimeout(() => t.classList.remove('wzflash'), 1400); } });
  const go = $('#wzgo', el); if (go) go.onclick = () => $('#wziss', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- עריכת תא: החלפת אדם / רחפן / שעה, נעילה, הסרה ----------
function openSlot(pid, d) {
  const s = W.S.find(x => x.pid === pid && x.d === d); if (!s) return;
  const p = W.PM.get(pid), others = W.S.filter(x => x.d === d && x !== s);
  const where = u => { const o = others.find(x => [x.lead, ...x.crew].includes(u)); return o ? pname(W.PM.get(o.pid).name) : ''; };
  const why = (u, role) => personScore(u, s, role, W.S).R.join(' · ');
  const opts = (role, cur) => W.people.filter(x => x.id === cur || !hard(x.id, d, p)).map(x => ({ x, sc: personScore(x.id, s, role, W.S).s })).sort((a, b) => b.sc - a.sc)
    .map(({ x }) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.full_name)}${licOk(x.id, d) ? ' · מטיס' : ''}${where(x.id) ? ' · עובר מ' + esc(where(x.id)) : ''}</option>`).join('');
  const blocked = W.people.filter(x => hard(x.id, d, p)).map(x => `${first(x.full_name)} — ${hard(x.id, d, p)}`);
  const x = wxOf(p, d, s), tr = s.tr;
  sheet(`<h3>${esc(pname(p.name))} · ${sd(d)}</h3>
    <div class="wzwhy">${[s.g + ' · ' + (s.g >= 80 ? 'התאמה טובה' : s.g >= 55 ? 'סביר' : 'בעייתי'), x ? (x.L === 2 ? 'לא לטוס' : x.L === 1 ? 'גבולי' : 'טוב לטיסה') + ` · משבים ${Math.round(x.g)}` : 'אין תחזית עדיין',
      tr?.min != null ? `נסיעה${tr.from ? ' מ' + tr.from : ''} ${Math.floor(tr.min / 60)}:${String(tr.min % 60).padStart(2, '0')}${tr.km ? ` · ${tr.km} ק״מ` : ''}${tr.est ? ' (הערכה)' : ''}` : null, ...s.bad, ...s.warn].filter(Boolean).map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>
    <label class="field">ראש צוות<small>${esc(s.lead ? why(s.lead, 'lead') : '')}</small><select id="wl"><option value="">—</option>${opts('lead', s.lead)}</select></label>
    ${s.crew.map((u, i) => `<label class="field">צוות<small>${esc(why(u, 'crew'))}</small><select data-cr="${i}"><option value="">הסרה</option>${opts('crew', u)}</select></label>`).join('')}
    <label class="field">הוספה לצוות<select id="wadd"><option value="">—</option>${opts('crew', null)}</select></label>
    ${p.needDrone ? `<label class="field">רחפן<small>${esc(s.drone ? droneScore(s.drone, s, W.S).R.join(' · ') : '')}</small><select id="wdr"><option value="">בלי רחפן</option>${W.drones.map(x2 => { const w = droneHard(x2.id, d), o = others.find(y => y.drone === x2.id);
      return `<option value="${x2.id}" ${x2.id === s.drone ? 'selected' : ''} ${w && x2.id !== s.drone ? 'disabled' : ''}>${esc(x2.name)}${w ? ' — ' + esc(w) : o ? ' · עובר מ' + esc(pname(W.PM.get(o.pid).name)) : ''}</option>`; }).join('')}</select></label>` : ''}
    ${dtPickHtml('wdt', s.dt || 'work').replace('chips dtpick', 'chips dtpick mini')}
    ${nightToggleHtml('wnt', slotNight(s))}
    <div class="row"><label class="field grow" id="wlsa">הגעה לאתר<input type="time" id="warr" value="${esc(s.arr || '07:00')}"></label><label class="field grow" id="wlse">סיום<input type="time" id="wend" value="${esc(s.end || '')}"></label></div>
    <div class="row"><label class="field grow">יציאה<small>${tr?.min != null ? 'מחושב: ' + s.depAuto : ''}</small><input type="time" id="wdep" value="${esc(s.dep || s.depAuto)}"></label></div>
    ${blocked.length ? `<details class="wzblk"><summary>לא פנויים (${blocked.length})</summary><small>${blocked.map(esc).join('<br>')}</small></details>` : ''}
    <div class="row-btns"><button class="btn ghost" id="wdrop">הסרת היום</button>${s.locked ? '<button class="btn ghost" id="wunl">שחרור נעילה</button>' : ''}<button class="btn primary" id="wok">${s.locked ? 'שמירה' : 'נעילה'}</button></div>`, (sh, close) => {
    const nightOn = bindNight(sh, { tog: '#wnt', arr: '#warr', end: '#wend', lblA: '#wlsa', lblE: '#wlse', day: () => d });
    const dtOf = bindDtPick(sh, 'wdt');
    $('#wdrop', sh).onclick = () => { close(); delete W.locks[pid + '|' + d]; W.out.push(pid + '|' + d); const c = cfg(p); W.P[pid] = { ...(W.P[pid] || {}), want: Math.max(0, c.want - 1), size: c.size }; solve(); toast('היום הוסר', 1500); };
    const un = $('#wunl', sh); if (un) un.onclick = () => { close(); delete W.locks[pid + '|' + d]; solve(); };
    $('#wok', sh).onclick = () => {
      const lead = $('#wl', sh).value || null, crew = [...$$('[data-cr]', sh).map(x2 => x2.value), $('#wadd', sh).value].filter(u => u && u !== lead);
      const drone = $('#wdr', sh)?.value || null, arr = $('#warr', sh).value || null, dep = $('#wdep', sh).value || null;
      if (nightOn() && !$('#wend', sh).value) $('#wend', sh).value = '06:00';
      const end = $('#wend', sh).value || null; if (!nightOn() && end && arr && end < arr) return toast('הסיום לפני ההגעה — עבודת לילה?');
      // מי שעבר מתא אחר באותו יום — יוצא משם (התא ההוא נבנה מחדש, אלא אם הוא נעול)
      const moved = [lead, ...crew].filter(Boolean);
      for (const o of others) { const lk = W.locks[o.pid + '|' + d];
        if (lk) { lk.crew = (lk.crew || []).filter(u => !moved.includes(u)); if (moved.includes(lk.lead)) lk.lead = null; if (drone && lk.drone === drone) lk.drone = null; } }
      W.locks[pid + '|' + d] = { lead, crew: [...new Set(crew)], drone, arr, end, dep: dep !== s.depAuto ? dep : null, dt: dtOf() };
      close(); solve(); toast('ננעל — השאר סודר מחדש סביבו', 1800);
    };
  });
}

// ---------- החלה ----------
async function apply() {
  const S0 = W.S.filter(s => s.lead); if (!S0.length) return;
  // יום רחפן בלי מטיס עם רישיון בתוקף — לא מוחל (גם השרת בודק)
  const noPilot = S0.filter(s => W.PM.get(s.pid).needDrone && ![s.lead, ...s.crew].some(u => u && licOk(u, s.d)));
  const S = S0.filter(s => !noPilot.includes(s));
  const ppl = [...new Set(S.flatMap(s => [s.lead, ...s.crew]))];
  const projs = [...new Set(S.map(s => s.pid))], bad = S.filter(s => s.bad.length);
  const nm = s => `${pname(W.PM.get(s.pid).name)} ${sd(s.d)}`;
  const go = await new Promise(res => sheet(`<h3>החלת השיבוץ</h3>
    <div class="wzsum"><div><b>${S.length}</b><span>ימי שטח</span></div><div><b>${projs.length}</b><span>פרויקטים</span></div><div><b>${ppl.length}</b><span>עובדים</span></div></div>
    ${ppl.length ? `<div class="note">הודעה אחת לכל עובד על כל הימים שלו: ${esc(ppl.map(u => first(NM(u))).join(', '))}</div>` : ''}
    ${noPilot.length ? `<div class="note bad">${noPilot.length === 1 ? 'יום אחד לא יוחל' : `${noPilot.length} ימים לא יוחלו`} — אין מטיס בתוקף: ${esc(noPilot.map(nm).join(' · '))}</div>` : ''}
    ${bad.length ? `<div class="note bad">${bad.length} ימים עם בעיה: ${esc(bad.map(s => `${nm(s)} — ${s.bad[0]}`).join(' · '))}</div>` : ''}
    <div class="list">${projs.map(pid => { const xs = S.filter(s => s.pid === pid); return `<div class="lrow"><span class="grow"><b>${esc(pname(W.PM.get(pid).name))}</b><small>${xs.map(s => `${sd(s.d)} ${s.dep || s.depAuto} · ${first(NM(s.lead))}`).join(' · ')}</small></span></div>`; }).join('')}</div>
    <div class="row-btns"><button class="btn ghost" id="wc">ביטול</button>${S.length ? '<button class="btn primary" id="wy">החלה ושליחה</button>' : ''}</div>`, (sh, close) => {
    $('#wc', sh).onclick = () => { close(); res(false); }; const y = $('#wy', sh); if (y) y.onclick = () => { close(); res(true); };
  }));
  if (!go) return;
  const btn = $('#wzapply', W.el); btn.disabled = true; btn.textContent = 'מחיל…';
  const items = [];
  for (const pid of projs) {
    const p = W.PM.get(pid), xs = S.filter(s => s.pid === pid).sort((a, b) => a.d < b.d ? -1 : 1);
    const k = s => [s.lead, [...s.crew].sort().join(','), s.drone || '', s.dep || s.depAuto, s.arr || '', s.end || ''].join('|');
    // פרויקט בלי אף יום עד עכשיו וצוות זהה בכל הימים → schedule_work_days (תכנית, חומר, לוגיסטיקה); אחרת יום-יום
    if (p.fresh && xs.every(s => k(s) === k(xs[0]))) {
      const s0 = xs[0], skip = []; for (let d = s0.d; d < xs.at(-1).d; d = addDays(d, 1)) if (dow(d) !== 6 && !xs.some(s => s.d === d)) skip.push(d);
      items.push({ kind: 'range', p: pid, start_day: s0.d, lead: s0.lead, crew: s0.crew, drone: s0.drone, report: s0.dep || s0.depAuto, ndays: xs.length, skip,
        arrive: s0.arr || null, ...(s0.end ? { end: s0.end } : {}), fridays: xs.some(s => dow(s.d) === 5), days: xs.map(s => s.d), need_pilot: p.needDrone });
    } else xs.forEach(s => items.push({ kind: 'day', p: pid, d: s.d, lead: s.lead, crew: s.crew, drone: s.drone, report: s.dep || s.depAuto, arrive: s.arr || null, ...(s.end ? { end: s.end } : {}), need_pilot: p.needDrone }));
  }
  const { data: r, error } = await sb.rpc('wizard_apply', { items });
  // סוג יום שאינו "עבודה" (db/138) — אחרי ההחלה, לפי פרויקט+סוג (יום שלא נוצר — לא מושפע)
  if (!error) for (const [k, ds] of Object.entries(S.filter(s => s.dt && s.dt !== 'work').reduce((m, s) => ((m[s.pid + '|' + s.dt] ||= []).push(s.d), m), {}))) {
    const [p, t] = k.split('|'); await sb.rpc('set_day_type', { t, p, days: ds }).then(({ error: e }) => e && toast(errText(e, 'סוג היום לא נשמר'), 3000));
  }
  const fails = error ? [errText(error, 'לא נשמר')] : (r?.fails || []).map(f => `${pname(W.PM.get(f.p)?.name || '')}${f.d ? ' ' + sd(f.d) : ''}: ${errText({ message: f.why }, 'לא נשמר')}`);
  const okN = r?.ok || 0, skipped = noPilot.map(s => `${nm(s)}: אין מטיס בתוקף — לא הוחל`);
  W.locks = {}; W.extra = []; W.out = []; W.P = {};
  store.put('wz:' + W.start, null);
  if (fails.length || skipped.length) sheet(`<h3>הוחלו ${okN} ימים${fails.length + skipped.length ? ` · ${fails.length + skipped.length} לא` : ''}</h3><div class="list">${[...skipped, ...fails].map(f => `<div class="lrow"><span class="grow"><small>${esc(f)}</small></span></div>`).join('')}</div><button class="btn primary block" data-close>סגירה</button>`);
  else toast(`שובצו ${okN} ימי שטח · ${ppl.length} עובדים קיבלו הודעה אחת`, 2600, 'success');
  renderWizard(W.el, W.start);
}
