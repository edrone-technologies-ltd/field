// זמינות לשיבוץ: מי בחופש / אמר שלא יגיע / משובץ בפרויקט אחר, ואיזה רחפן מקורקע או תפוס — בטווח תאריכים.
import { sb, dm, shortName } from './core.js';
import { isNight, add1 } from './night.js';

const ABS = { vacation: 'בחופש', sick: 'במחלה', reserve: 'במילואים', unpaid: 'בחופש', other: 'בהיעדרות' };

// project: הימים המתוכננים של הפרויקט עצמו לא נחשבים תפוסים (שיבוץ מחדש מחליף אותם). exceptDay: היום שעורכים
// night: משבצים משמרת לילה (אז לילה של אתמול שנגמר בבוקר — לא מתנגש)
export async function availability(from, to, { project = null, exceptDay = null, drones = [], night = false } = {}) {
  to = to || from;
  const q = p => p.then(r => r, () => ({ data: null }));
  const [{ data: abs }, { data: wds }, { data: pro }, { data: docs }, { data: eq }] = await Promise.all([
    sb.from('absences').select('user_id,kind,date_from,date_to,status').in('status', ['pending', 'approved']).lte('date_from', to).gte('date_to', from),
    sb.from('work_days').select('id,day,status,project_id,crew_lead_id,drone_id,night,site_arrival,site_end,projects(name),work_day_crew(user_id,cant_come_at)').gte('day', add1(from, -1)).lte('day', to).neq('status', 'cancelled'),   // גם אתמול — לילה שנגמר בבוקר
    q(sb.rpc('profiles_full').select('id,is_pilot,pilot_license_expiry')),
    q(sb.from('employee_docs').select('user_id,title,expires_on').eq('kind', 'certificate').like('title', '%גובה%')),
    q(sb.from('equipment').select('id,insurance_until,license_until,service_state').eq('kind', 'drone')),
  ]);
  // חסימה באתר: לפי הפרויקט (או הפרויקט של היום שעורכים)
  const pid = project || (wds || []).find(w => w.id === exceptDay)?.project_id || (exceptDay ? (await q(sb.from('work_days').select('project_id').eq('id', exceptDay).maybeSingle())).data?.project_id : null);
  let bans = [];
  if (pid) { const { data: pr } = await q(sb.from('projects').select('site_id').eq('id', pid).maybeSingle());
    if (pr?.site_id) bans = (await q(sb.from('site_bans').select('user_id,reason').eq('site_id', pr.site_id))).data || []; }
  const one = from === to, at = d => one ? '' : ' ' + dm(d);
  const P = new Map(), Dr = new Map(), W = new Map(), DW = new Map(), put = (m, k, v) => { if (k && !m.has(k)) m.set(k, v); };
  const days = d => Math.round((new Date(d + 'T12:00') - new Date(to + 'T12:00')) / 864e5);
  // קשיח קודם: לא לשבץ באתר, רישיון מטיס / תעודת גובה שפגו (כמו בשרת — db/122, 122b). פג בעוד ≤30 יום — אזהרה בלבד
  bans.forEach(b => put(P, b.user_id, 'לא לשבץ באתר' + (b.reason ? ' · ' + b.reason : '')));
  (pro || []).filter(p => p.is_pilot && p.pilot_license_expiry).forEach(p => p.pilot_license_expiry < to ? put(P, p.id, 'רישיון מטיס פג ' + dm(p.pilot_license_expiry)) : days(p.pilot_license_expiry) <= 30 && put(W, p.id, 'רישיון מטיס עד ' + dm(p.pilot_license_expiry)));
  const H = new Map(); (docs || []).filter(d => d.expires_on).forEach(d => { if (!H.has(d.user_id) || H.get(d.user_id) < d.expires_on) H.set(d.user_id, d.expires_on); });
  H.forEach((e, u) => e < to ? put(P, u, 'תעודת גובה פגה ' + dm(e)) : days(e) <= 30 && put(W, u, 'תעודת גובה עד ' + dm(e)));   // פגה = חוסם (כמו staffing_issues, db/122b)
  (eq || []).forEach(e => {
    if (e.insurance_until && e.insurance_until < to) put(Dr, e.id, 'ביטוח פג ' + dm(e.insurance_until));
    else if (e.insurance_until && days(e.insurance_until) <= 30) put(DW, e.id, 'ביטוח עד ' + dm(e.insurance_until));
    if (e.license_until && days(e.license_until) <= 30) put(DW, e.id, e.license_until < to ? 'רישום פג' : 'רישום עד ' + dm(e.license_until));
    if (['due', 'overdue'].includes(e.service_state)) put(DW, e.id, e.service_state === 'overdue' ? 'נדרש טיפול' : 'טיפול מתקרב');
  });
  (abs || []).filter(a => a.status === 'approved').forEach(a => put(P, a.user_id, (ABS[a.kind] || 'בהיעדרות') + at(a.date_from < from ? from : a.date_from)));
  (abs || []).filter(a => a.status === 'pending').forEach(a => put(P, a.user_id, 'ביקש חופש' + at(a.date_from < from ? from : a.date_from)));
  // אחרי לילה: מי שעבד לילה שנגמר הבוקר — אזהרה (לא חסימה) על משמרת יום באותו בוקר
  const NW = new Map();
  if (!night) for (const w of wds || []) {
    if (w.id === exceptDay || !isNight(w) || w.day < add1(from, -1) || w.day >= to) continue;
    const e = String(w.site_end || '06:00').slice(0, 5);
    [w.crew_lead_id, ...(w.work_day_crew || []).filter(c => !c.cant_come_at).map(c => c.user_id)].forEach(u => put(NW, u, `סיים לילה ב-${e}` + at(add1(w.day))));
  }
  for (const w of wds || []) { if (w.id === exceptDay || w.day < from) continue;
    (w.work_day_crew || []).filter(c => c.cant_come_at).forEach(c => put(P, c.user_id, 'לא יכול להגיע' + at(w.day)));
  }
  for (const w of wds || []) {
    if (w.id === exceptDay || w.day < from || (project && w.project_id === project && w.status === 'planned')) continue;
    const where = 'משובץ ב' + shortName(w.projects?.name || '').split(/[—–(-]/)[0].trim().slice(0, 18) + at(w.day);
    [w.crew_lead_id, ...(w.work_day_crew || []).filter(c => !c.cant_come_at).map(c => c.user_id)].forEach(u => put(P, u, where));
    put(Dr, w.drone_id, where);
  }
  drones.filter(d => d.health === 'grounded').forEach(d => Dr.set(d.id, 'מקורקע'));
  // person/drone = חוסם (עם הסיבה) · warn/droneWarn = שבב אזהרה בלבד
  return { person: u => P.get(u) || '', drone: id => Dr.get(id) || '', warn: u => P.has(u) ? '' : NW.get(u) || W.get(u) || '', rest: u => P.has(u) ? '' : NW.get(u) || '', droneWarn: id => Dr.has(id) ? '' : DW.get(id) || '' };
}
