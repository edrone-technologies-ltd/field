// מתכנן שמש לשטיפה: חזית שבשמש ישירה מתייבשת מהר מדי ומשאירה סימנים. מחשבים לכל שעה איפה השמש,
// ולכל כיוון חזית — מתי היא בצל. אלגוריתם NOAA למיקום השמש (דיוק של מעלות — מספיק לתכנון).
const rad = Math.PI / 180, deg = 180 / Math.PI;
export function sunPos(date, lat, lng) {
  const jd = date / 864e5 + 2440587.5, n = jd - 2451545;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const ha = ((gmst + lng) * rad - ra);
  const la = lat * rad;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  let az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha)) * deg;
  return { az: (az + 360) % 360, el: el * deg };
}
export const FACADES = [['צפון', 0], ['מזרח', 90], ['דרום', 180], ['מערב', 270]];
// לכל חזית: בכל שעת עבודה — שמש ישירה (זווית בין השמש לניצב לחזית < 75°, והשמש מעל 8°) או צל
export function sunPlan(dayStr, lat = 31.9, lng = 34.9, from = 6, to = 17) {
  const hours = [];
  for (let h = from; h <= to; h++) {
    const t = new Date(`${dayStr}T${String(h).padStart(2, '0')}:00:00`);
    hours.push({ h, ...sunPos(t, lat, lng) });
  }
  const plan = FACADES.map(([name, normal]) => {
    const lit = hours.map(x => { const diff = Math.abs(((x.az - normal + 540) % 360) - 180); return x.el > 8 && diff < 75; });
    const shade = hours.filter((_, i) => !lit[i]).map(x => x.h);
    return { name, normal, lit, shadeHours: shade.length, windows: ranges(shade) };
  });
  // סדר מומלץ: קודם החזיתות שהצל שלהן נגמר הכי מוקדם (מערב בבוקר), אחר כך מי שנכנסת לצל מאוחר (מזרח אחה"צ)
  const firstSun = p => { const i = p.lit.indexOf(true); return i < 0 ? 99 : i; };
  const order = [...plan].sort((a, b) => (a.shadeHours === hours.length) - (b.shadeHours === hours.length) || firstSun(a) - firstSun(b));
  return { hours, plan, order };
}
function ranges(list) {
  const out = []; let s = null, p = null;
  for (const h of list) { if (s == null) s = h; else if (h !== p + 1) { out.push([s, p + 1]); s = h; } p = h; }
  if (s != null) out.push([s, p + 1]);
  return out;
}
export const fmtWin = w => w.map(([a, b]) => `${String(a).padStart(2, '0')}:00–${String(b).padStart(2, '0')}:00`).join(', ');

// המלצה בשפה פשוטה: לכל חזית חלון הצל הארוך ביותר בשעות העבודה (07–17)
export function sunAdvice(plan) {
  const recs = plan.plan.map(f => {
    const w = f.windows.map(([a, b]) => [Math.max(a, 7), Math.min(b, 17)]).filter(([a, b]) => b - a >= 1).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
    return { name: f.name, win: w || null, allDay: w && w[0] <= 7 && w[1] >= 17 };
  });
  const timed = recs.filter(r => r.win && !r.allDay).sort((a, b) => a.win[0] - b.win[0]);
  const flex = recs.filter(r => r.allDay), sunny = recs.filter(r => !r.win);
  return { timed, flex, sunny };
}

// סדר חזיתות ליום מסוים, רק לחזיתות שבעבודה: קודם מי שהצל שלה בבוקר, אחר כך מי שבצל כל היום, ובסוף מי שנכנסת לצל אחה"צ
export function facadeOrder(dayStr, lat, lng, facades) {
  const adv = sunAdvice(sunPlan(dayStr, lat || 31.9, lng || 34.9));
  const want = r => !facades?.length || facades.includes(r.name);
  const hh = h => String(h).padStart(2, '0') + ':00';
  const timed = adv.timed.filter(want).map(r => ({ name: r.name, when: `${hh(r.win[0])}–${hh(r.win[1])}`, start: r.win[0] }));
  return [...timed.filter(r => r.start < 11), ...adv.flex.filter(want).map(r => ({ name: r.name, when: 'בצל כל היום' })),
    ...timed.filter(r => r.start >= 11), ...adv.sunny.filter(want).map(r => ({ name: r.name, when: 'בשמש כל היום — מוקדם ככל האפשר' }))];
}
