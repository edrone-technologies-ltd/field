// הערכת שכר חודשית לפי סוג ההעסקה. לא תלוש — את התלוש מכינה הנהלת החשבונות. משמש גם לעלות פרויקטים.
// שעתי: תעריף × (רגיל + 125% + 150% + שבת/חג).
// חודשי: משכורת קבועה מכסה שעות רגילות; שעות נוספות משולמות לפי שכר שעתי = משכורת/182.
// גלובלי: משכורת + רכיב גלובלי קבוע. אם ערך השעות הנוספות בפועל עולה על הגלובלי — העובד זכאי להפרש (התראה).
export const HOURS_MONTH = 182;
export const PAY_TYPES = { hourly: 'שעתי', monthly: 'חודשי', global: 'גלובלי' };
const otValue = (T, h) => h * (T.ot125 * 1.25 + T.ot150 * 1.5 + (T.rest150 + T.hol150) * 1.5 + (T.rest175 + T.hol175) * 1.75 + (T.rest200 + T.hol200) * 2);
export function estimatePay(T, pay) {
  if (!pay) return null;
  const type = pay.pay_type || (pay.hourly_rate ? 'hourly' : 'monthly');
  const travel = Number(pay.travel_per_day || 0) * (T.days || 0);
  if (type === 'hourly') {
    const h = Number(pay.hourly_rate || 0); if (!h) return null;
    const base = h * T.reg, ot = otValue(T, h);
    return { type, hourly: h, base, ot, global: 0, travel, total: base + ot + travel, notes: [] };
  }
  const salary = Number(pay.monthly_salary || 0); if (!salary) return null;
  const h = salary / HOURS_MONTH, actualOt = otValue(T, h);
  if (type === 'monthly') return { type, hourly: h, base: salary, ot: actualOt, global: 0, travel, total: salary + actualOt + travel, notes: [] };
  const g = Number(pay.global_ot_amount || 0), gh = Number(pay.global_ot_hours || 0), otH = T.ot125 + T.ot150;
  const notes = [];
  if (actualOt > g) notes.push(`השעות הנוספות בפועל שוות ₪${Math.round(actualOt).toLocaleString('he-IL')} — יותר מהגלובלי (₪${Math.round(g).toLocaleString('he-IL')}). העובד זכאי להפרש ₪${Math.round(actualOt - g).toLocaleString('he-IL')}.`);
  if (gh && otH > gh) notes.push(`${Math.round(otH * 10) / 10} שעות נוספות בפועל מול ${gh} שמכוסות בגלובלי.`);
  return { type, hourly: h, base: salary, ot: Math.max(actualOt, g), global: g, travel, total: salary + Math.max(actualOt, g) + travel, notes, actualOt };
}
