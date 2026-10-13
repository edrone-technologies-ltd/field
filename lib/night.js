// עבודת לילה (db/136): יום שמתחיל בערב ומסתיים למחרת. work_days.day = תאריך ההתחלה, night = דגל (נגזר גם מהשעות: סיום < הגעה)
import { $, HE_D1, dm, isoDay } from './core.js';

const t5 = t => t ? String(t).slice(0, 5) : '';
export const add1 = (d, n = 1) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return isoDay(x); };
export const isNight = w => !!w && (w.night === true || (!!w.site_arrival && !!w.site_end && t5(w.site_end) < t5(w.site_arrival)));
export const endDay = w => isNight(w) ? add1(w.day) : w.day;
const dd = d => `${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}`;
// "ב׳ 14.10 22:00 ← ג׳ 15.10 06:00" (חץ לפי כיוון הקריאה בעברית)
export const nightRange = w => `${dd(w.day)}${w.site_arrival ? ' ' + t5(w.site_arrival) : ''} ← ${dd(endDay(w))}${w.site_end ? ' ' + t5(w.site_end) : ''}`;
const at = (d, t) => new Date(`${d}T${t5(t)}:00`);
export const startAt = w => at(w.day, w.site_arrival || w.report_time || (isNight(w) ? '20:00' : '07:00'));
export const endAt = w => w.site_end ? at(endDay(w), w.site_end) : isNight(w) ? at(add1(w.day), '06:00') : new Date(+startAt(w) + 9 * 36e5);
// יום לילה שהתחיל אתמול ועדיין פתוח (או סמוך לסיום) = "היום" של הצוות אחרי חצות
export const carryNight = (w, t = isoDay()) => isNight(w) && w.day === add1(t, -1) && !['done', 'cancelled'].includes(w.status) && Date.now() < +endAt(w) + 6 * 36e5;
export const isCurrent = (w, t = isoDay()) => w.day === t || carryNight(w, t);
// מפתח תחזית (lib/wx.js daySummary): יום לילה — שעות המשמרת בפועל, גם אחרי חצות
export const wxKey = w => {
  if (!isNight(w)) return w.day;
  const a = w.site_arrival ? +t5(w.site_arrival).slice(0, 2) : 20, e = w.site_end ? +t5(w.site_end).slice(0, 2) + (+t5(w.site_end).slice(3) ? 1 : 0) : 6;
  return `${w.day}~${a}~${e}`;
};
const MOON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
export const moon = MOON;
export const nightTag = (w, cls = '') => isNight(w) ? `<span class="ntag ${cls}" title="${nightRange(w)}">${MOON}לילה</span>` : '';

// מתג "עבודת לילה" בטפסי שיבוץ: מציג תאריך התחלה + סיום (למחרת) ליד שדות השעה. ids: tog / arr / end / labels
export const nightToggleHtml = (id, on) => `<label class="tog ntog"><span>${MOON} עבודת לילה</span><span class="sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></span></label>`;
export function bindNight(root, { tog, arr, end, lblA, lblE, day }) {
  const T = $(tog, root), A = $(arr, root), E = $(end, root), LA = lblA && $(lblA, root), LE = lblE && $(lblE, root);
  if (!T || !A || !E) return () => false;
  const base = { a: LA?.firstChild?.textContent, e: LE?.firstChild?.textContent };
  const paint = () => {
    const on = T.checked, d = day?.();
    if (LA?.firstChild) LA.firstChild.textContent = on ? `התחלה${d ? ' · ' + dd(d) : ''}` : base.a;
    if (LE?.firstChild) LE.firstChild.textContent = on ? `סיום${d ? ' · ' + dd(add1(d)) : ' · למחרת'}` : base.e;
    root.classList?.toggle('isnight', on);
  };
  T.addEventListener('change', () => {
    if (T.checked) { if (!A.value || A.value < '16:00') A.value = '22:00'; if (!E.value || E.value >= A.value) E.value = '06:00'; }
    else if (E.value && A.value && E.value < A.value) E.value = '';
    A.dispatchEvent(new Event('change')); E.dispatchEvent(new Event('change')); paint();
  });
  // שעות שחוצות חצות → המתג נדלק לבד; שעות של יום → כבה
  const auto = () => { const w = !!A.value && !!E.value && E.value < A.value; if (w !== T.checked && (w || E.value)) { T.checked = w; paint(); } };
  A.addEventListener('change', auto); E.addEventListener('change', auto);
  paint();
  const on = () => T.checked; on.paint = paint; return on;
}
