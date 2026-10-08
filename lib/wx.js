// מזג אוויר לפי מיקום — רכיב משותף: תחזית שעתית (open-meteo), Kp (NOAA), ספים ופסק טיסה. משמש את מסך "מזג אוויר וטיסה"
// ואת פעולות התפעול: פרויקט, לוח שיבוץ, היום בשטח, יום השטח של הצוות.
import { esc, isManager } from './core.js';

export const ARCH = 'group_mm5052gw';
// ספים: [גבולי, עצירה]
export const T = { w: [18, 25], g: [28, 35], r: [0.3, 2], p: [30, 60], kp: [4, 5] };
export const lvl = (v, [a, b]) => v == null ? 0 : v >= b ? 2 : v >= a ? 1 : 0;
export const VERDICT = ['טוב לטיסה', 'גבולי — לשים לב', 'לא לטוס'];
const cacheGet = (k, min = 20) => { try { const x = JSON.parse(localStorage.getItem(k) || 'null'); return x && Date.now() - x.t < min * 6e4 ? x.v : null; } catch { return null; } };
const cachePut = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch { /* */ } };

export async function kpSeries() {
  const c = cacheGet('wx2-kp', 60); if (c) return c;
  try {
    const rows = await (await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')).json();
    const v = rows.map(r => Array.isArray(r) ? [r[0], +r[1]] : [r.time_tag, +r.kp]).filter(x => !isNaN(x[1])).map(([t, k]) => [Date.parse(t + 'Z'), Math.round(k * 10) / 10]);
    cachePut('wx2-kp', v); return v;
  } catch { return []; }
}
export const kpAt = (K, ms) => { let v = null; for (const [t, k] of K) { if (t <= ms) v = k; else break; } return v; };   // Kp תקף ל-3 שעות מתחילת הבלוק

export async function forecast(sites) {
  const key = 'wx2:' + sites.map(s => s.id).join(','); const c = cacheGet(key); if (c) return c;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${sites.map(s => (+s.lat).toFixed(4)).join(',')}&longitude=${sites.map(s => (+s.lng).toFixed(4)).join(',')}`
    + '&hourly=wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability&timezone=Asia%2FJerusalem&forecast_days=7';
  const j = await (await fetch(u)).json(); const v = Array.isArray(j) ? j : [j]; cachePut(key, v); return v;
}
// שעה → נתונים + רמה כוללת
export function hourData(F, K, i) {
  const H = F.hourly, t = H.time[i], ms = Date.parse(t);   // זמן מקומי — שעון ישראל כולל מעבר שעון
  const d = { t, w: H.wind_speed_10m[i], g: H.wind_gusts_10m[i], r: H.precipitation[i], p: H.precipitation_probability?.[i], kp: kpAt(K, ms) };
  d.lv = { w: lvl(d.w, T.w), g: lvl(d.g, T.g), r: lvl(d.r, T.r), p: lvl(d.p, T.p), kp: lvl(d.kp, T.kp) };
  d.L = Math.max(...Object.values(d.lv)); return d;
}
// רמת היום בשעות העבודה 06–17 (לצביעת המפה ולבחירת יום)
export const dayLevel = (F, K, day) => Math.max(0, ...F.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.slice(0, 10) === day && +t.slice(11, 13) >= 6 && +t.slice(11, 13) < 17).map(([, i]) => hourData(F, K, i).L));


// סיכום יום לאתר בשעות העבודה 06–17: רמה + הערכים הגבוהים
export function daySummary(F, K, day) {
  const hs = F.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.slice(0, 10) === day && +t.slice(11, 13) >= 6 && +t.slice(11, 13) < 17).map(([, i]) => hourData(F, K, i));
  if (!hs.length) return null;
  const mx = k => { const v = hs.map(h => h[k]).filter(x => x != null); return v.length ? Math.max(...v) : null; };
  return { L: Math.max(...hs.map(h => h.L)), w: mx('w'), g: mx('g'), p: mx('p'), kp: mx('kp'), r: hs.reduce((t, h) => t + (h.r || 0), 0) };
}
// תחזית לרשימת אתרים ולתאריכים: { [siteId]: { [day]: summary } }
export async function siteDays(sites) {
  const S = sites.filter(s => s?.lat); if (!S.length) return {};
  try {
    const [FF, K] = await Promise.all([forecast(S), kpSeries()]);
    return Object.fromEntries(S.map((s, i) => [s.id, new Proxy({}, { get: (_, day) => daySummary(FF[i], K, day) })]));
  } catch { return {}; }
}
const DOT = ['ok', 'mid', 'bad'], WORD = ['טוב לטיסה', 'גבולי', 'לא לטוס'];
// שבב קטן: נקודת צבע + משבים, לחיצה → פירוט שעות
export const wxChip = (x, siteId) => x ? `<span class="wxchip ${DOT[x.L]}" title="${WORD[x.L]} · משבים ${Math.round(x.g)} קמ״ש"><i></i>${Math.round(x.g)}${x.kp >= 5 ? ' · Kp' + x.kp : ''}</span>` : '';
// מרחב אווירי (מנהל תפעול ומעלה בלבד): אין לרת״א שכבות פתוחות — מפנים לאפליקציה הרשמית DronesIL (אייפון: דף האפליקציה ← "פתח"; אנדרואיד: חיפוש בחנות)
export const AIR_URL = /android/i.test(navigator.userAgent) ? 'https://play.google.com/store/search?q=DronesIL%20CAAI&c=apps' : 'https://apps.apple.com/app/id6475662325';
export const airBtn = (cls = '') => !isManager() ? '' : `<a class="wxair ${cls}" href="${AIR_URL}" target="_blank" rel="noopener"><span class="grow"><b>מרחב אווירי</b><small>אזורים אסורים ומוגבלים — באפליקציית רת״א DronesIL</small></span><span class="chev">‹</span></a>`;
// כרטיס תחזית לפעולה (פרויקט / יום שטח)
export const wxCard = (x, siteId, label) => x ? `<a class="wxcard ${DOT[x.L]}" href="#/weather/${siteId}"><span class="grow"><b>${WORD[x.L]}</b><small>${esc(label)}</small></span>
  <span class="wxn"><b>${Math.round(x.w)}/${Math.round(x.g)}</b><small>רוח/משבים</small></span><span class="wxn"><b>${x.p ?? '—'}%</b><small>גשם ${x.r.toFixed(1)}</small></span><span class="wxn"><b>${x.kp ?? '—'}</b><small>Kp</small></span></a>${airBtn('sm')}` : '';

// ממלא מקומות שסומנו במסכי התפעול: data-wx="siteId|day" (שבב) / data-wxcard="siteId|day|תווית" (כרטיס).
// כל המסכים — אותה תחזית ואותם ספים. אתר בלי מיקום — לא מוצג כלום.
export async function fillWx(root = document) {
  const els = [...root.querySelectorAll('[data-wx],[data-wxcard]')]; if (!els.length) return;
  const ids = [...new Set(els.map(e => (e.dataset.wx || e.dataset.wxcard).split('|')[0]).filter(Boolean))];
  const { sb } = await import('./core.js');
  const { data: ss } = await sb.from('sites').select('id,lat,lng').in('id', ids);
  const D = await siteDays((ss || []).filter(s => s.lat));
  for (const e of els) {
    const [sid, day, label] = (e.dataset.wx || e.dataset.wxcard).split('|'); const x = D[sid]?.[day];
    if (!x) { e.remove(); continue; }
    e.outerHTML = e.dataset.wx ? wxChip(x, sid) : wxCard(x, sid, label || '');
  }
}
