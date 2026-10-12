// מזג אוויר וטיסה: מפת האתרים הפעילים (כל אתר בצבע הסטטוס שלו), ולכל אתר — פסק טיסה, 5 נתונים (רוח, משבים, גשם, סבירות לגשם, Kp)
// וציר שעות לניתוח היום. בהשראת UAV Forecast. ספים כמו בשיבוץ. הצבעים מבוססי שקיפות — קריאים גם בבהיר וגם בכהה.
import { sb, $, $$, esc, icon, backBtn, dm, HE_D1, replaceHash, toast, isOpenProject } from '../lib/core.js';

import { ARCH, T, VERDICT, kpSeries, forecast, hourData, dayLevel, daySummary, airBtn } from '../lib/wx.js';

async function sitesList() {
  const { data } = await sb.from('projects').select('id,name,status_label,monday_group,closed_summary,planned_from,site_id,sites(id,slug,name,lat,lng,address)').not('site_id', 'is', null);
  const today = new Date().toLocaleDateString('en-CA'), m = new Map();
  for (const p of data || []) {
    if (!p.sites?.lat || !isOpenProject(p)) continue;
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
  const head = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">מזג אוויר וטיסה</h1></header>`;
  el.innerHTML = head + '<div class="skel tall"></div>';
  const S = await sitesList().catch(() => []);
  let FF = [], K = [];
  try { [FF, K] = await Promise.all([S.length ? forecast(S) : [], kpSeries()]); } catch { FF = []; }
  if (!/^#\/weather/.test(location.hash) || !el.isConnected) return;   // המשתמש כבר עבר מסך — לא מציירים עליו
  // מיקום חופשי (כללי, לא קשור לאתר): המיקום שלי / חיפוש / לחיצה במפה. ברירת מחדל כשאין אתרים — המשרד בב״ש
  let A = null, FA = null;
  let sel = S.length && FF.length ? Math.max(0, S.findIndex(s => s.id === siteId)) : -1;   // -1 = המיקום החופשי
  const cur = () => sel < 0 ? { s: A, F: FA } : { s: S[sel], F: FF[sel] };
  const now = new Date(), nowKey = now.toLocaleDateString('en-CA') + 'T' + String(now.getHours()).padStart(2, '0');
  let day = null, hi = -1;
  const short = n => n.replace(/^[^—]*—\s*/, '').slice(0, 16) || n;
  // חלון הטיסה הארוך ביותר ביום (06–18, שעות "טוב לטיסה" רצופות)
  const win = (F, dd) => { let best = null, cur = null;
    F.hourly.time.forEach((t, i) => { const h = +t.slice(11, 13); if (t.slice(0, 10) !== dd || h < 6 || h > 17) return;
      if (hourData(F, K, i).L === 0) { cur = cur ? { a: cur.a, b: h } : { a: h, b: h }; if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur }; } else cur = null; });
    const p = x => String(x).padStart(2, '0');
    return `<small class="wxwin">${best ? (best.a === 6 && best.b === 17 ? 'כל היום טוב לטיסה' : `חלון טיסה <bdi dir="ltr">${p(best.a)}:00–${p(best.b + 1)}:00</bdi>`) : 'אין חלון טיסה בשעות העבודה'}</small>`; };

  el.innerHTML = head + `<div class="stack wxp">
      <div class="row wxfind"><input type="search" id="wq" class="grow" placeholder="עיר או כתובת"><button class="btn ghost sm" id="wqs">חיפוש</button><button class="btn ghost sm" id="wme">${icon('pin', 16)} המיקום שלי</button></div>
      <div id="wres" class="list"></div>
      <div class="wxmap" id="wxmap"></div>
      ${S.length ? `<div class="chips wxsites">${S.map((s, i) => `<button class="chip" data-s="${i}">${esc(s.name.replace(/^[^—]*—\s*/, '').slice(0, 26) || s.name)}</button>`).join('')}</div>` : ''}
      <div id="wxbody"><div class="skel"></div></div>
    </div>`;

  let map, Lf, marks = [], am = null;
  const COL = ['#3DB24B', '#E3A23B', '#D64532'];
  try {
    Lf = await L(); if (!$('#wxmap', el)) return; map = Lf.map($('#wxmap', el), { zoomControl: false, attributionControl: false });
    Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    marks = S.map((s, i) => Lf.circleMarker([s.lat, s.lng], { radius: 9, weight: 3, color: '#fff', fillOpacity: 1 }).addTo(map).on('click', e => { Lf.DomEvent.stop(e); pick(i); }));
    if (S.length) map.fitBounds(S.map(s => [s.lat, s.lng]), { padding: [26, 26], maxZoom: 11 }); else map.setView([31.5, 34.9], 7);
    map.on('click', async e => { const n = await placeName(e.latlng.lat, e.latlng.lng); setPoint(e.latlng.lat, e.latlng.lng, n || 'נקודה במפה'); });
  } catch { $('#wxmap', el)?.remove(); }

  async function placeName(la, ln) {
    try { const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&accept-language=he&lat=${la}&lon=${ln}`)).json(); return (j.address && (j.address.village || j.address.town || j.address.city || j.address.suburb)) || j.name || ''; } catch { return ''; }
  }
  async function setPoint(la, ln, name) {
    A = { id: 'x', name, lat: la, lng: ln, projects: [] };
    try { FA = (await forecast([A]))[0]; } catch { return toastMsg('אין נתוני תחזית כרגע'); }
    sel = -1; if (map) { if (am) am.setLatLng([la, ln]); else am = Lf.circleMarker([la, ln], { radius: 10, weight: 3, color: '#fff', fillColor: '#2F6FEB', fillOpacity: 1 }).addTo(map); map.panTo([la, ln]); }
    draw();
  }
  const toastMsg = m => { $('#wxbody', el).innerHTML = `<div class="empty-line">${m}</div>`; };
  function pick(i) { sel = i; replaceHash('#/weather/' + S[i].id); if (map) map.panTo([S[i].lat, S[i].lng]); draw(); }

  function draw() {
    const { s, F } = cur(); if (!F) return;
    const days = [...new Set(F.hourly.time.map(t => t.slice(0, 10)))];
    if (!day || !days.includes(day)) { day = now.getHours() >= 18 ? days[1] : days[0]; hi = -1; }
    const idx = F.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.slice(0, 10) === day).map(([, i]) => i);
    if (!idx.includes(hi)) hi = idx.find(i => F.hourly.time[i].startsWith(nowKey)) ?? idx.find(i => +F.hourly.time[i].slice(11, 13) === 8) ?? idx[0];
    const d = hourData(F, K, hi);
    $$('[data-s]', el).forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === sel));
    marks.forEach((m, i) => m.setStyle({ fillColor: COL[dayLevel(FF[i], K, day)], radius: i === sel ? 12 : 8 }));
    if (am) am.setStyle({ radius: sel < 0 ? 12 : 8 });
    const tile = (k, label, val, unit) => `<div class="wxt l${d.lv[k]}"><small>${label}</small><b>${val == null ? '—' : val}</b><small>${unit}</small></div>`;
    $('#wxbody', el).innerHTML = `
      <div class="wxv l${d.L}"><b>${VERDICT[d.L]}</b><small>${sel < 0 ? esc(s.name) + ' · ' : ''}${HE_D1[new Date(day + 'T12:00').getDay()]} ${dm(day)} · ${d.t.slice(11, 16)}</small>${win(F, day)}</div>
      ${(s.projects || []).length ? `<div class="wxproj">${s.projects.map(p => `<a class="chip sm" href="#/p/${p.id}">${esc(p.name.replace(/^[^—]*—\s*/, '').slice(0, 34) || p.name)}${p.from ? ' · ' + dm(p.from) : ''}</a>`).join('')}</div>` : ''}
      ${airBtn()}
      <div class="wxtiles">${tile('w', 'רוח', Math.round(d.w), 'קמ״ש')}${tile('g', 'משבים', Math.round(d.g), 'קמ״ש')}${tile('r', 'גשם', d.r == null ? null : d.r.toFixed(1), 'מ״מ')}${tile('p', 'סבירות לגשם', d.p, '%')}${tile('kp', 'Kp', d.kp, d.kp >= 5 ? 'סערה' : d.kp >= 4 ? 'מוגבר' : 'שקט')}</div>
      <div class="wxhours" id="wxh">${idx.map(i => { const h = hourData(F, K, i); return `<button class="wxh l${h.L} ${i === hi ? 'on' : ''}" data-h="${i}"><small>${h.t.slice(11, 13)}</small><i style="height:${Math.min(100, Math.round(h.g / 50 * 100))}%"></i><b>${Math.round(h.g)}</b></button>`; }).join('')}</div>
      <div class="wxdays">${days.map(x => `<button class="wxd l${dayLevel(F, K, x)} ${x === day ? 'on' : ''}" data-d="${x}"><b>${x === days[0] ? 'היום' : HE_D1[new Date(x + 'T12:00').getDay()]}</b><small>${dm(x)}</small></button>`).join('')}</div>
      ${S.length > 1 && FF.length === S.length ? `<section class="stack"><div class="sh-row"><h3 class="sh">השבוע באתרים</h3><small class="muted">משבים קמ״ש</small></div><div class="wxgrid" style="--n:${days.length}">
        <span></span>${days.map(x => `<small class="wxgh">${x === days[0] ? 'היום' : HE_D1[new Date(x + 'T12:00').getDay()]}</small>`).join('')}
        ${S.map((st, i) => `<button class="wxgn ${i === sel ? 'on' : ''}" data-gs="${i}">${esc(short(st.name))}</button>${days.map(x => { const sm = daySummary(FF[i], K, x); return sm ? `<button class="wxgc l${sm.L} ${i === sel && x === day ? 'on' : ''}" data-gs="${i}" data-gd="${x}" aria-label="${esc(st.name)} ${dm(x)} ${VERDICT[sm.L]}">${Math.round(sm.g)}</button>` : '<span></span>'; }).join('')}`).join('')}
      </div></section>` : ''}`;
    $$('[data-gs]', el).forEach(b => b.onclick = () => { if (b.dataset.gd) { day = b.dataset.gd; hi = -1; } pick(+b.dataset.gs); });
    $$('[data-h]', el).forEach(b => b.onclick = () => { hi = +b.dataset.h; draw(); });
    $$('[data-d]', el).forEach(b => b.onclick = () => { day = b.dataset.d; hi = -1; draw(); });
    const on = $('.wxh.on', el); if (on) { const bx = on.parentElement, a = on.getBoundingClientRect(), b = bx.getBoundingClientRect(); bx.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2 }); }   // רק אופקית — המסך לא קופץ למטה
  }
  $$('[data-s]', el).forEach(b => b.onclick = () => pick(+b.dataset.s));
  // חיפוש מקום
  const find = async () => {
    const q = $('#wq', el).value.trim(); if (!q) return;
    try {
      const r = (await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`)).json()).filter((x, i, A) => A.findIndex(y => y.display_name === x.display_name) === i);
      $('#wres', el).innerHTML = r.length ? r.map((x, i) => `<button class="lrow" data-r="${i}"><span class="grow small">${esc(x.display_name)}</span></button>`).join('') : '<div class="empty-line">לא נמצא</div>';
      $$('[data-r]', el).forEach(b => b.onclick = () => { const x = r[+b.dataset.r]; $('#wres', el).innerHTML = ''; map?.setView([+x.lat, +x.lon], 11); setPoint(+x.lat, +x.lon, x.display_name.split(',')[0]); });
    } catch { $('#wres', el).innerHTML = '<div class="empty-line">החיפוש לא זמין כרגע</div>'; }
  };
  $('#wqs', el).onclick = find; $('#wq', el).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
  $('#wme', el).onclick = () => { const b = $('#wme', el); if (!navigator.geolocation) return toast('הטלפון לא תומך במיקום'); if (b.disabled) return; b.disabled = true;
    navigator.geolocation.getCurrentPosition(p => { b.disabled = false; map?.setView([p.coords.latitude, p.coords.longitude], 11); setPoint(p.coords.latitude, p.coords.longitude, 'המיקום שלי'); },
      () => { b.disabled = false; toast('לא התקבל מיקום — בדקו את הרשאת המיקום'); }, { enableHighAccuracy: false, timeout: 10000 }); };
  if (sel >= 0) draw(); else setPoint(31.2524, 34.7908, 'באר שבע');
}
