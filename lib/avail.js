// זמינות לשיבוץ: מי בחופש / אמר שלא יגיע / משובץ בפרויקט אחר, ואיזה רחפן מקורקע או תפוס — בטווח תאריכים.
import { sb, dm, shortName } from './core.js';

const ABS = { vacation: 'בחופש', sick: 'במחלה', reserve: 'במילואים', unpaid: 'בחופש', other: 'בהיעדרות' };

// project: הימים המתוכננים של הפרויקט עצמו לא נחשבים תפוסים (שיבוץ מחדש מחליף אותם). exceptDay: היום שעורכים
export async function availability(from, to, { project = null, exceptDay = null, drones = [] } = {}) {
  to = to || from;
  const [{ data: abs }, { data: wds }] = await Promise.all([
    sb.from('absences').select('user_id,kind,date_from,date_to,status').in('status', ['pending', 'approved']).lte('date_from', to).gte('date_to', from),
    sb.from('work_days').select('id,day,status,project_id,crew_lead_id,drone_id,projects(name),work_day_crew(user_id,cant_come_at)').gte('day', from).lte('day', to).neq('status', 'cancelled'),
  ]);
  const one = from === to, at = d => one ? '' : ' ' + dm(d);
  const P = new Map(), Dr = new Map(), put = (m, k, v) => { if (k && !m.has(k)) m.set(k, v); };
  (abs || []).filter(a => a.status === 'approved').forEach(a => put(P, a.user_id, (ABS[a.kind] || 'בהיעדרות') + at(a.date_from < from ? from : a.date_from)));
  (abs || []).filter(a => a.status === 'pending').forEach(a => put(P, a.user_id, 'ביקש חופש' + at(a.date_from < from ? from : a.date_from)));
  for (const w of wds || []) { if (w.id === exceptDay) continue;
    (w.work_day_crew || []).filter(c => c.cant_come_at).forEach(c => put(P, c.user_id, 'לא יכול להגיע' + at(w.day)));
  }
  for (const w of wds || []) {
    if (w.id === exceptDay || (project && w.project_id === project && w.status === 'planned')) continue;
    const where = 'משובץ ב' + shortName(w.projects?.name || '').split(/[—–(-]/)[0].trim().slice(0, 18) + at(w.day);
    [w.crew_lead_id, ...(w.work_day_crew || []).filter(c => !c.cant_come_at).map(c => c.user_id)].forEach(u => put(P, u, where));
    put(Dr, w.drone_id, where);
  }
  drones.filter(d => d.health === 'grounded').forEach(d => Dr.set(d.id, 'מקורקע'));
  return { person: u => P.get(u) || '', drone: id => Dr.get(id) || '' };
}
