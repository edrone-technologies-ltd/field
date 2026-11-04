// שרשרת החזית (ADR 0007): סימון ביצוע לכל חזית ביום שטח — טבלת facade_progress, PK (work_day_id, building_id, facade_key).
// כותב יחיד מהטלפון, דרך התור (אופליין, לפי סדר יצירה, upsert אידמפוטנטי). zones_done ו-tasks.status מתעדכנים ממנה בשרת (טריגר).
import { sb, state, enqueue, esc } from './core.js';

export const FACADE_MARKS = true;
export const FP_REASONS = { weather: 'מזג אוויר', access: 'גישה', equipment: 'ציוד', client: 'לקוח', other: 'אחר' };
export const FP_SEL = 'work_day_id,building_id,facade_key,status,reason,label,marked_by,marked_at';
export const fpZ = x => x.building_id + '|' + x.facade_key;
// הסימונים של הפרויקט. null = הטבלה לא קיימת עדיין (או שאין הרשאה) — המסך נשאר כמו לפני
export async function loadFacadeProgress(pid) {
  const { data, error } = await sb.from('facade_progress').select(FP_SEL + ',work_days(day)').eq('project_id', pid);
  if (error) return null;
  return (data || []).map(({ work_days, ...x }) => ({ ...x, day: work_days?.day || null }));
}
// מקור יחיד לכל סימון (כרטיס החזית וסגירת היום). fp = רשימת הסימונים המקומית — מתעדכנת מיד (המסך לא מחכה לשרת)
// status: done | partial | skipped (skipped דורש reason). del = ביטול הסימון של היום
export async function saveFacadeMark({ day, keys, status, reason = null, label = '', del = false, fp = null }) {
  if (!keys?.length) return;
  if (!del && !['done', 'partial', 'skipped'].includes(status)) throw new Error('status');
  if (status === 'skipped' && !del && !FP_REASONS[reason]) throw new Error('reason');
  const now = new Date().toISOString(), me = state.user.id;
  for (const z of keys) {
    const [b, ...r] = z.split('|'), k = r.join('|'), match = { work_day_id: day.id, building_id: b, facade_key: k }, qk = 'facade_progress:' + day.id + '|' + z;
    const row = { ...match, project_id: day.project_id, status, reason: status === 'skipped' ? reason : null, label: String(label || '').slice(0, 120) || null, marked_by: me, marked_at: now };
    // אותו מפתח בתור (qk) = סימון ואחריו ביטול נשלחים לפי הסדר, וביטול לא עוקף סימון שנכשל
    await enqueue(del ? { kind: 'delete', table: 'facade_progress', match, qk } : { kind: 'insert', table: 'facade_progress', row, qk });
    if (fp) { const i = fp.findIndex(x => x.work_day_id === day.id && fpZ(x) === z); if (i >= 0) fp.splice(i, 1); if (!del) fp.push({ ...row, day: day.day }); }
  }
}
// סימון "בוצע" לפי מקום המקטע בתכנית: מקטע שאינו האחרון של חזית רב-יומית = partial (העובד לא בוחר)
export const doneStatus = f => f && f.m > 1 && f.i < f.m ? 'partial' : 'done';
export const facName = f => [f.bn, f.t].filter(Boolean).join(' · ');
// רצפים לטיניים/מספריים בשם חזית ("מבנה A") — מבודדים. מפצלים את הטקסט הגולמי ורק אז מבריחים
export const bidi = t => String(t ?? '').split(/([A-Za-z0-9][A-Za-z0-9.\/:+-]*)/).map((x, i) => i % 2 ? `<bdi dir="ltr">${esc(x)}</bdi>` : esc(x)).join('');
