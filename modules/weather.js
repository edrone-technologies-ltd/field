// מזג אוויר וטיסה: מפת האתרים הפעילים (כל אתר בצבע הסטטוס שלו), ולכל אתר — פסק טיסה, 5 נתונים (רוח, משבים, גשם, סבירות לגשם, Kp)
// וציר שעות לניתוח היום. בהשראת UAV Forecast. ספים כמו בשיבוץ. הצבעים מבוססי שקיפות — קריאים גם בבהיר וגם בכהה.
import { sb, $, $$, esc, icon, backBtn, dm, HE_D1, replaceHash } from '../lib/core.js';

import { ARCH, T, VERDICT, kpSeries, forecast, hourData, dayLevel } from '../lib/wx.js';

async function sitesList() {
  const { data } = await sb.from('projects').select('id,name,status_label,monday_group,planned_from,site_id,sites(id,slug,name,lat,lng,address)').not('site_id', 'is', null);
  const today = new Date().toLocaleDateString('en-CA'), m = new Map();
  for (const p of data || []) {
    if (!p.sites?.lat || p.monday_group === ARCH || String(p.status_label || '').startsWith('הסתיים') || p.status_label === 'שולם ✓') continue;
    const s = m.get(p.sites.id) || { ...p.sites, next: null, projects: [] }; s.projects.push({ id: p.id, name: p.name, from: p.planned_from });
    if (p.planned_from && p.planned_from >= today && (!s.next || p.planned_from < s.next)) s.next = p.planned_from;
    m.set(s.id, s);
  }
  return [...m.values()].sort((a, b) => ((a.next || '9') < (b.next || '9') ? -1 : 1));
}
let leaflet = null;
async function L() {
  if (window.L) return window.L;
  if (!leaflet) leaflet = new Promise((ok, no) => { const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => ok(window.L); s.onerror = no; document.head.appendChild(s); });
  return leaflet;
}

export async function renderWeather(el, siteId = '') {
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>מזג אוויר וטיסה</h1></header><div class="skel tall"></div>`;
  const S = await sitesList();
  if (!S.length) { el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>מזג אוויר וטיסה</h1></header><div class="empty">אין אתרים פעילים עם מיקום. שומרים מיקום בעמוד האתר.</div>`; return; }
  let FF, K;
  try { [FF, K] = await Promise.all([forecast(S), kpSeries()]); } catch { el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>מזג אוויר וטיסה</h1></header><div class="empty">אין נתוני תחזית כרגע — בדקו קליטה.</div>`; return; }
  let si = Math.max(0, S.findIndex(s => s.id === siteId));
  const days = [...new Set(FF[0].hourly.time.map(t => t.slice(0, 10)))];
  const now = new Date(), nowKey = now.toLocaleDateString('en-CA') + 'T' + String(now.getHours()).padStart(2, '0');
  let day = days[0], hi = Math.max(0, FF[si].hourly.time.findIndex(t => t.startsWith(nowKey)));
  if (now.getHours() >= 18) { day = days[1]; hi = FF[si].hourly.time.findIndex(t => t.startsWith(day + 'T08')); }

  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1 class="grow">מזג אוויר וטיסה</h1></header>
    <div class="stack wxp">
      <div class="wxmap" id="wxmap"></div>
      <div class="chips wxsites">${S.map((s, i) => `<button class="chip" data-s="${i}">${esc(s.name.replace(/^[^—]*—\s*/, '').slice(0, 26) || s.name)}</button>`).join('')}</div>
      <div id="wxbody"></div>
      <div class="small muted">רוח ומשבים בגובה 10 מ׳ · ספי עצירה: רוח 25, משבים 35 קמ״ש, גשם 2 מ״מ לשעה, סבירות 60%, Kp 5 · Kp — NOAA, בבלוקים של 3 שעות</div>
    </div>`;

  // מפה: כל אתר בצבע הרמה שלו ביום הנבחר
  let map, marks = [];
  try {
    const Lf = await L(); map = Lf.map($('#wxmap', el), { zoomControl: false, attributionControl: false });
    Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    marks = S.map((s, i) => Lf.circleMarker([s.lat, s.lng], { radius: 9, weight: 3, color: '#fff', fillOpacity: 1 }).addTo(map).on('click', () => pickSite(i)));
    map.fitBounds(S.map(s => [s.lat, s.lng]), { padding: [26, 26], maxZoom: 11 });
  } catch { $('#wxmap', el).remove(); }
  const COL = ['#3DB24B', '#E3A23B', '#D64532'];

  function draw() {
    const F = FF[si], idx = F.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.slice(0, 10) === day).map(([, i]) => i);
    if (!idx.includes(hi)) hi = idx.find(i => +F.hourly.time[i].slice(11, 13) === 8) ?? idx[0];
    const d = hourData(F, K, hi), s = S[si];
    $$('[data-s]', el).forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === si));
    marks.forEach((m, i) => m.setStyle({ fillColor: COL[dayLevel(FF[i], K, day)], radius: i === si ? 12 : 8 }));
    const tile = (k, label, val, unit) => `<div class="wxt l${d.lv[k]}"><small>${label}</small><b>${val == null ? '—' : val}</b><small>${unit}</small></div>`;
    $('#wxbody', el).innerHTML = `
      <div class="wxv l${d.L}"><b>${VERDICT[d.L]}</b><small>${esc(s.name)} · ${HE_D1[new Date(day + 'T12:00').getDay()]} ${dm(day)} · ${d.t.slice(11, 16)}</small></div>
      <div class="wxproj">${s.projects.map(p => `<a class="chip sm" href="#/p/${p.id}">${esc(p.name.replace(/^[^—]*—\s*/, '').slice(0, 34) || p.name)}${p.from ? ' · ' + dm(p.from) : ''}</a>`).join('')}</div>
      <div class="wxtiles">${tile('w', 'רוח', Math.round(d.w), 'קמ״ש')}${tile('g', 'משבים', Math.round(d.g), 'קמ״ש')}${tile('r', 'גשם', d.r == null ? null : d.r.toFixed(1), 'מ״מ')}${tile('p', 'סבירות לגשם', d.p, '%')}${tile('kp', 'Kp', d.kp, d.kp >= 5 ? 'סערה' : d.kp >= 4 ? 'מוגבר' : 'שקט')}</div>
      <div class="wxhours" id="wxh">${idx.map(i => { const h = hourData(F, K, i); return `<button class="wxh l${h.L} ${i === hi ? 'on' : ''}" data-h="${i}"><small>${h.t.slice(11, 13)}</small><i style="height:${Math.min(100, Math.round(h.g / 50 * 100))}%"></i><b>${Math.round(h.g)}</b></button>`; }).join('')}</div>
      <div class="small muted wxhint">גובה העמודה = משבים · הצבע = המצב הכולל באותה שעה · הקשה על שעה מציגה אותה</div>
      <div class="wxdays">${days.map(x => `<button class="wxd l${dayLevel(F, K, x)} ${x === day ? 'on' : ''}" data-d="${x}"><b>${x === days[0] ? 'היום' : HE_D1[new Date(x + 'T12:00').getDay()]}</b><small>${dm(x)}</small></button>`).join('')}</div>`;
    $$('[data-h]', el).forEach(b => b.onclick = () => { hi = +b.dataset.h; draw(); });
    $$('[data-d]', el).forEach(b => b.onclick = () => { day = b.dataset.d; hi = -1; draw(); });
    const on = $('.wxh.on', el); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function pickSite(i) { si = i; replaceHash('#/weather/' + S[i].id); draw(); if (map) map.panTo([S[i].lat, S[i].lng]); }
  $$('[data-s]', el).forEach(b => b.onclick = () => pickSite(+b.dataset.s));
  draw();
}
