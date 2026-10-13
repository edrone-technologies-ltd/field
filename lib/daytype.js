// סוג יום שטח (db/138): עבודה / טסטים / תיאום / הכנה. כולם = ביצוע (נספרים בטווח). רק יום עבודה נמדד בהתקדמות
import { $$, esc } from './core.js';

export const DAY_TYPES = [['work', 'יום עבודה'], ['test', 'יום טסטים'], ['coordination', 'תיאום / סיור באתר'], ['prep', 'יום הכנה']];
export const SHORT = { test: 'טסטים', coordination: 'תיאום', prep: 'הכנה' };
export const dtLabel = t => (DAY_TYPES.find(x => x[0] === t) || DAY_TYPES[0])[1];
export const isWorkDay = w => !w?.day_type || w.day_type === 'work';
// בדיקה לפני התחלה: גם ביום טסטים (הרחפן טס), לא ביום תיאום
export const needsPreflight = w => w?.day_type !== 'coordination';
// יום תיאום / סיור: בלי העמסה, בלי שמש, בלי חומר וגלונים — מהבוקר ישר לאתר
export const isCoord = w => w?.day_type === 'coordination';
export const dtTag = (w, cls = '') => isWorkDay(w) ? '' : `<span class="dttag dt-${esc(w.day_type)} ${cls}" title="${esc(dtLabel(w.day_type))}">${SHORT[w.day_type] || ''}</span>`;
// בורר "סוג היום" — שבבים קומפקטיים. id = מזהה הקבוצה; הערך הנבחר: dtValue(root, id)
export const dtPickHtml = (id, cur = 'work') => `<div class="field">סוג היום<div class="chips dtpick" id="${id}" role="radiogroup">${DAY_TYPES.map(([k, l]) => `<button type="button" class="chip" role="radio" data-dt="${k}" aria-pressed="${k === (cur || 'work')}" aria-checked="${k === (cur || 'work')}">${l}</button>`).join('')}</div></div>`;
export function bindDtPick(root, id, onChange) {
  const g = root.querySelector('#' + id); if (!g) return () => 'work';
  $$('[data-dt]', g).forEach(b => b.onclick = () => {
    $$('[data-dt]', g).forEach(x => { const on = x === b; x.setAttribute('aria-pressed', on); x.setAttribute('aria-checked', on); });
    onChange?.(b.dataset.dt);
  });
  return () => g.querySelector('[data-dt][aria-pressed="true"]')?.dataset.dt || 'work';
}
