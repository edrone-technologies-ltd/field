// מנוע סיווג שעות לפי דיני העבודה (docs/labor-law-il.md §1.10). מסווג שעות לקטגוריות בלבד — את הכסף מחשבת חשבת השכר.
// כללים: קודם יומי, אחר כך שבועי (42); 2 ש"נ ראשונות 125%, משם 150%; לילה (2+ ש' בין 22:00-06:00) → תקן 7;
// שישי = יום פנוי (נבדק שבועית); שבת לפי שקיעה; חג 150% (175/200 בנוספות). הפסקה מנוכה רק אם העובד היה חופשי לעזוב.

export const DEFAULTS = { week_hours: 42, day_norm: 8.4, night_norm: 7, ot1_hours: 2, max_day: 12, max_week_ot: 15, shabbat_in_min: 30, shabbat_out_min: 40 };
// 9 ימי החג בתשלום (התאריך האזרחי של היום עצמו). [לאמת מול לוח שנה כל שנה — ניתן לעדכן ב-app_settings.holidays]
export const HOLIDAYS = {
  '2026-04-02': 'פסח', '2026-04-08': 'שביעי של פסח', '2026-04-22': 'יום העצמאות', '2026-05-22': 'שבועות',
  '2026-09-12': 'ראש השנה', '2026-09-13': 'ראש השנה', '2026-09-21': 'יום כיפור', '2026-09-26': 'סוכות', '2026-10-03': 'שמחת תורה',
  '2027-04-22': 'פסח', '2027-04-28': 'שביעי של פסח', '2027-05-12': 'יום העצמאות', '2027-06-11': 'שבועות',
  '2027-10-02': 'ראש השנה', '2027-10-03': 'ראש השנה', '2027-10-11': 'יום כיפור', '2027-10-16': 'סוכות', '2027-10-23': 'שמחת תורה',
};

const TZ = 'Asia/Jerusalem';
export const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hourOf = d => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).split(':'); return +p[0] + p[1] / 60; };
const dow = s => new Date(s + 'T12:00:00Z').getUTCDay();
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const r2 = x => Math.round(x * 100) / 100;

// שקיעה (אלגוריתם NOAA מקוצר), ברירת מחדל מרכז הארץ. דיוק של דקות — מספיק לחלון שבת עם מרווח.
export function sunset(dateStr, lat = 31.9, lng = 34.9) {
  const d = new Date(dateStr + 'T12:00:00Z'), rad = Math.PI / 180;
  const n = Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const minUtc = 720 - 4 * (lng - ha) - eq;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + minUtc * 6e4);
}
// חלון השבת שמכיל/סמוך לתאריך: שישי שקיעה−X עד שבת שקיעה+Y
export function shabbatWindow(dateStr, S = DEFAULTS) {
  const back = (dow(dateStr) + 2) % 7;               // ימים אחורה עד שישי האחרון (שישי=0, שבת=1, ראשון=2…)
  const fri = addDays(dateStr, -back), sat = addDays(fri, 1);
  return { start: new Date(sunset(fri) - S.shabbat_in_min * 6e4), end: new Date(+sunset(sat) + S.shabbat_out_min * 6e4) };
}
export function inShabbat(t = new Date(), S = DEFAULTS) { const w = shabbatWindow(ymd(t), S); return t >= w.start && t < w.end ? w : null; }

const overlapMin = (a1, a2, b1, b2) => Math.max(0, (Math.min(a2, b2) - Math.max(a1, b1)) / 6e4);
function nightMinutes(s, e) {   // דקות בין 22:00 ל-06:00 (שעון ישראל)
  let m = 0; for (let t = +s; t < +e; t += 6e4 * 5) { const h = hourOf(new Date(t)); if (h >= 22 || h < 6) m += 5; } return m;
}

// ---------- חישוב חודש לעובד אחד ----------
export function computeMonth(shifts, monthStr, S0 = {}, holidays = HOLIDAYS) {
  const S = { ...DEFAULTS, ...S0 };
  const days = {}; const flags = [];
  const now = new Date();
  for (const sh of shifts) {
    const s = new Date(sh.start_at), e = sh.end_at ? new Date(sh.end_at) : null;
    const key = ymd(s);
    const d = days[key] ||= { date: key, shifts: [], gross: 0, net: 0, rest: 0, hol: 0, nightMin: 0, breakMin: 0, flags: [] };
    d.shifts.push(sh);
    if (!e) { if (now - s > 14 * 36e5) d.flags.push('משמרת פתוחה מעל 14 שעות — שכחו להחתים יציאה?'); continue; }
    const gross = (e - s) / 6e4, br = Math.min(sh.break_min || 0, gross), net = gross - br;
    const w = shabbatWindow(key, S), w2 = shabbatWindow(ymd(e), S);
    let restMin = overlapMin(s, e, w.start, w.end); if (+w2.start !== +w.start) restMin += overlapMin(s, e, w2.start, w2.end);
    let holMin = 0;
    for (const hd of [key, ymd(e)].filter((x, i, a) => a.indexOf(x) === i)) if (holidays[hd]) {
      holMin += overlapMin(s, e, new Date(hd + 'T00:00:00+03:00'), new Date(addDays(hd, 1) + 'T00:00:00+03:00'));
    }
    const ratio = gross ? net / gross : 1;             // ההפסקה מנוכה יחסית מכל הקטגוריות
    d.gross += gross; d.breakMin += br; d.net += net; d.rest += restMin * ratio; d.hol += Math.max(0, holMin - restMin) * ratio;
    d.nightMin += nightMinutes(s, e);
    if (restMin > 0) d.flags.push('עבודה בשבת — החברה לא עובדת בשבת');
    if (sh.created_at && Math.abs(new Date(sh.created_at) - s) > 20 * 6e4 && sh.source === 'app') d.flags.push('ההחתמה נקלטה מאוחר (בלי קליטה / שעון הטלפון)');
    if (sh.source === 'manager') d.flags.push('הוזן/תוקן ע"י מנהל');
    if (sh.start_lat == null && sh.source === 'app') d.flags.push('כניסה בלי מיקום');
  }
  // רמת היום
  const list = Object.values(days).sort((a, b) => a.date < b.date ? -1 : 1);
  for (const d of list) {
    const net = d.net / 60, rest = d.rest / 60, hol = d.hol / 60, reg = Math.max(0, net - rest - hol);
    d.isNight = d.nightMin >= 120;
    const wd = dow(d.date), norm = d.isNight ? S.night_norm : S.day_norm;
    d.netH = r2(net);
    if (wd <= 4) { d.reg = Math.min(reg, norm); d.ot = reg - d.reg; }
    else { d.reg = Math.min(reg, S.day_norm); d.ot = reg - d.reg; d.free = true; }   // שישי/מוצ"ש: עודף מעל תקן = נוספות (שמרני)
    d.ot125 = Math.min(d.ot, S.ot1_hours); d.ot150 = d.ot - d.ot125;
    const restNorm = norm; const rb = Math.min(rest, restNorm), ro = rest - rb;
    d.rest150 = rb; d.rest175 = Math.min(ro, S.ot1_hours); d.rest200 = ro - d.rest175;
    const hb = Math.min(hol, norm), ho = hol - hb;
    d.hol150 = hb; d.hol175 = Math.min(ho, S.ot1_hours); d.hol200 = ho - d.hol175;
    if (net > S.max_day) d.flags.push(`${hhmm(net)} שעות ביום — מעל המקסימום (${S.max_day})`);
    if (d.gross / 60 >= 6 && d.breakMin < 45 && d.shifts.every(x => x.end_at)) d.flags.push('לא דווחה הפסקה מנוכה (45 דק׳ ביום של 6+ שעות)');
    if (holidays[d.date]) d.holiday = holidays[d.date];
  }
  // רמת השבוע: שעות רגילות מעל 42 → נוספות, מהיום האחרון בשבוע אחורה
  const weeks = {}; list.forEach(d => { const k = addDays(d.date, -dow(d.date)); (weeks[k] ||= []).push(d); });
  for (const [wk, ds] of Object.entries(weeks)) {
    let excess = ds.reduce((t, d) => t + d.reg, 0) - S.week_hours;
    for (const d of [...ds].reverse()) {
      if (excess <= 0) break;
      const move = Math.min(excess, d.reg); d.reg -= move; excess -= move;
      const room125 = Math.max(0, S.ot1_hours - d.ot125); const a = Math.min(move, room125);
      d.ot125 += a; d.ot150 += move - a; d.weeklyOt = r2((d.weeklyOt || 0) + move);
    }
    const wot = ds.reduce((t, d) => t + d.ot125 + d.ot150, 0);
    if (wot > S.max_week_ot) flags.push(`שבוע ${wk.slice(8)}.${wk.slice(5, 7)}: ${r2(wot)} שעות נוספות — מעל המכסה (${S.max_week_ot})`);
  }
  const inMonth = list.filter(d => d.date.slice(0, 7) === monthStr);
  const T = { days: inMonth.filter(d => d.net > 0).length, net: 0, reg: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0, hol150: 0, hol175: 0, hol200: 0, nights: 0 };
  for (const d of inMonth) { for (const k of ['reg', 'ot125', 'ot150', 'rest150', 'rest175', 'rest200', 'hol150', 'hol175', 'hol200']) { d[k] = r2(d[k]); T[k] += d[k]; } T.net += d.netH; if (d.isNight) T.nights++; }
  for (const k of Object.keys(T)) T[k] = r2(T[k]);
  return { days: inMonth, totals: T, flags: flags.concat(...inMonth.flatMap(d => d.flags.map(f => `${+d.date.slice(8)}.${+d.date.slice(5, 7)}: ${f}`))) };
}
export const CATS = [['reg', '100%'], ['ot125', '125%'], ['ot150', '150%'], ['rest150', 'שבת 150%'], ['rest175', 'שבת 175%'], ['rest200', 'שבת 200%'], ['hol150', 'חג 150%'], ['hol175', 'חג 175%'], ['hol200', 'חג 200%']];
export const hhmm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
