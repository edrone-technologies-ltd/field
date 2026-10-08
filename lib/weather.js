// מזג אוויר באתרים (מסך הבית של התפעול): רוח, משבים וגשם לפי המיקום של כל אתר פעיל + מדד Kp (סערה גיאומגנטית — משפיע על GPS ומצפן).
// אתרים שעובדים בהם היום — ראשונים. ספים כמו בשיבוץ: משבים ≥35 / רוח ≥25 קמ"ש / גשם ≥2 מ"מ. Kp ≥5 = סערה.
import { sb, esc, icon, dm } from './core.js';

const ARCH = 'group_mm5052gw';
const cacheGet = k => { try { const x = JSON.parse(localStorage.getItem(k) || 'null'); return x && Date.now() - x.t < 20 * 6e4 ? x.v : null; } catch { return null; } };
const cachePut = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch { /* */ } };

async function kp() {
  const c = cacheGet('wx-kp'); if (c) return c;
  try {
    const rows = await (await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')).json();
    const data = rows.map(r => Array.isArray(r) ? { t: new Date(r[0] + 'Z'), kp: Number(r[1]) } : { t: new Date(r.time_tag + 'Z'), kp: Number(r.kp) }).filter(x => !isNaN(x.kp));
    const now = Date.now(), past = data.filter(x => +x.t <= now), next = data.filter(x => +x.t > now && +x.t < now + 24 * 36e5);
    const r1 = n => Math.round(n * 10) / 10;
    const v = { now: past.length ? r1(past.at(-1).kp) : null, max24: next.length ? r1(Math.max(...next.map(x => x.kp))) : null };
    cachePut('wx-kp', v); return v;
  } catch { return null; }
}

export async function renderSiteWeather(box, { todayIds = [] } = {}) {
  if (!box) return;
  const { data: ps } = await sb.from('projects').select('id,name,status_label,monday_group,planned_from,planned_to,site_id,sites(id,slug,name,lat,lng)').not('site_id', 'is', null);
  const today = new Date().toLocaleDateString('en-CA');
  const live = (ps || []).filter(p => p.sites?.lat && p.monday_group !== ARCH && !String(p.status_label || '').startsWith('הסתיים') && p.status_label !== 'שולם ✓');
  // אתר אחד לשורה (גם אם יש בו כמה פרויקטים); היום בשטח למעלה, אחריו לפי התאריך הקרוב
  const bySite = new Map();
  for (const p of live) {
    const s = p.sites, cur = bySite.get(s.id) || { s, ps: [], today: false, next: null };
    cur.ps.push(p); if (todayIds.includes(p.id)) cur.today = true;
    const f = p.planned_from; if (f && f >= today && (!cur.next || f < cur.next)) cur.next = f;
    bySite.set(s.id, cur);
  }
  const S = [...bySite.values()].sort((a, b) => (b.today - a.today) || ((a.next || '9') < (b.next || '9') ? -1 : 1)).slice(0, 12);
  if (!S.length) { box.innerHTML = ''; return; }
  const key = 'wx-sites:' + S.map(x => x.s.id).join(',');
  let W = cacheGet(key);
  if (!W) try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${S.map(x => x.s.lat.toFixed(4)).join(',')}&longitude=${S.map(x => x.s.lng.toFixed(4)).join(',')}&current=wind_speed_10m,wind_gusts_10m,precipitation&hourly=wind_speed_10m,wind_gusts_10m,precipitation&timezone=Asia%2FJerusalem&forecast_days=3`;
    const j = await (await fetch(u)).json(); W = Array.isArray(j) ? j : [j]; cachePut(key, W);
  } catch { W = null; }
  const K = await kp();
  const r = n => n == null ? '—' : Math.round(n);
  const kpTone = v => v == null ? '' : v >= 5 ? 'bad' : v >= 4 ? 'warn' : 'ok';
  const rows = S.map((x, i) => {
    const w = W?.[i]; if (!w) return '';
    const c = w.current || {}, H = w.hourly || {};
    const win = day => { const idx = (H.time || []).map((t, k) => [t, k]).filter(([t]) => t.slice(0, 10) === day && +t.slice(11, 13) >= 6 && +t.slice(11, 13) < 17).map(([, k]) => k);
      return idx.length ? { g: Math.max(...idx.map(k => H.wind_gusts_10m[k])), w: Math.max(...idx.map(k => H.wind_speed_10m[k])), r: idx.reduce((t, k) => t + (H.precipitation[k] || 0), 0) } : null; };
    // אחרי 17:00 יום העבודה נגמר — המספר הראשי הוא של מחר, והשורה הקטנה של מחרתיים
    const eve = new Date().getHours() >= 17, d0 = eve ? new Date(Date.now() + 864e5).toLocaleDateString('en-CA') : today, d1 = new Date(Date.now() + (eve ? 2 : 1) * 864e5).toLocaleDateString('en-CA');
    const A = win(d0), B = win(d1);
    const dg = A?.g, rn = A?.r, dg2 = B?.g, rn2 = B?.r;
    const bad = (dg ?? 0) >= 35 || (A?.w ?? 0) >= 25 || (rn ?? 0) >= 2;
    return `<a class="wxrow ${bad ? 'bad' : ''} ${x.today ? 'today' : ''}" href="#/site/${esc(x.s.slug)}">
      <span class="grow"><b>${esc(x.s.name)}</b><small>${x.today ? 'בשטח היום' : x.next ? 'הבא ' + dm(x.next) : ''}${dg2 != null ? ` · ${eve ? 'מחרתיים' : 'מחר'} משבים ${r(dg2)}${rn2 >= 0.5 ? `, גשם ${rn2.toFixed(1)}` : ''}` : ''}</small></span>
      <span class="wxn"><b>${r(c.wind_speed_10m)}/${r(c.wind_gusts_10m)}</b><small>רוח/משבים</small></span>
      <span class="wxn"><b>${r(dg)}</b><small>${eve ? 'מחר' : 'היום'} 6–17</small></span>
      <span class="wxn ${(rn ?? 0) >= 2 ? 'b' : ''}"><b>${rn == null ? '—' : rn.toFixed(rn >= 10 ? 0 : 1)}</b><small>גשם מ"מ</small></span></a>`;
  }).join('');
  box.innerHTML = `<section><div class="sh-row"><h3 class="sh">מזג אוויר באתרים</h3>
      ${K ? `<span class="pill ${kpTone(Math.max(K.now ?? 0, K.max24 ?? 0))}" title="מדד גיאומגנטי — משפיע על GPS ומצפן">Kp ${K.now ?? '—'}${K.max24 != null && K.max24 > (K.now ?? 0) ? ` → ${K.max24}` : ''}</span>` : ''}</div>
    ${W ? `<div class="wxlist">${rows}</div><div class="small muted">קמ"ש · ספי עצירה: משבים 35, רוח 25, גשם 2 מ"מ · Kp 5 ומעלה = הפרעות GPS</div>` : '<div class="small muted">אין נתוני מזג אוויר כרגע (קליטה)</div>'}</section>`;
}
