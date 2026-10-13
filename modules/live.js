// מגדל פיקוח (#/live, מנהל תפעול ומעלה): כל המבצע עכשיו במסך אחד חי — מפה עם הצוותים לפי מצב, ציר הזמן של היום,
// התראות שכל אחת נפתחת לתיקון בלחיצה, והשבוע בקצרה. מתרענן לבד (Realtime + כל 45 שנ׳). "מסך משרד" = מסך מלא שמתחלף בין האתרים.
// בלי כסף בכלל (גם לא להנהלה).
import { sb, isManager, $, $$, esc, icon, isoDay, dm, HE_D1, HE_DOW, toast, sheet, timeAgo, initials, shortName, backBtn, state, thumbUrls, zoom } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const first = n => (n || '').split(' ')[0];
const hm = iso => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
const t5 = t => t ? String(t).slice(0, 5) : '';
const at = (day, t) => new Date(`${day}T${String(t).slice(0, 5)}:00`);
const ST = { planned: ['מתוכנן', 'pl'], en_route: ['בדרך', 'rt'], on_site: ['באתר', 'os'], working: ['בעבודה', 'wk'], issue: ['תקלה', 'is'], done: ['נסגר', 'dn'] };
const ACTIVE = new Set(['en_route', 'on_site', 'working', 'issue']);
const WXW = ['טוב לטיסה', 'גבולי', 'לא לטוס'];
const PREP = ['אפיון', 'תכנית עבודה', 'מקור מים', 'מכלית מים', 'תיאום כניסה לאתר', 'מרחב אווירי'];
const REFRESH = 45e3, CYCLE = 9e3, H0 = 5 * 60, H1 = 19 * 60;
let C = null;   // המסך הפתוח

// מצב בפועל: לפי חותמות הזמן (גם אם הסטטוס לא עודכן)
const stOf = w => w.status === 'done' || w.closed_at ? 'done' : w.status === 'issue' ? 'issue' : w.status === 'working' ? 'working' : w.status === 'on_site' || w.arrived_at ? 'on_site' : w.status === 'en_route' || w.departed_at ? 'en_route' : 'planned';
const geoOf = w => { const s = w.projects?.sites, p = w.projects; return w.lat && w.lng ? [+w.lat, +w.lng] : s?.lat && s?.lng ? [+s.lat, +s.lng] : p?.lat && p?.lng ? [+p.lat, +p.lng] : null; };
const gk = g => g ? `g${g[0].toFixed(3)},${g[1].toFixed(3)}` : '';
const nameOf = w => shortName(w.projects?.name || '') || w.projects?.name || 'יום שטח';
const whenOf = (d, t) => d === t ? 'היום' : d === addDays(t, 1) ? 'מחר' : `${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}`;

let LP = null;
const leaflet = () => LP ||= window.L ? Promise.resolve(window.L) : new Promise((ok, no) => {
  if (!document.querySelector('link[href*="leaflet.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); }
  const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => ok(window.L); s.onerror = e => { LP = null; no(e); }; document.head.appendChild(s);
});

function stop() {
  const c = C; if (!c) return; C = null;
  c.timers.forEach(clearInterval); clearTimeout(c.kt); clearInterval(c.cyc);
  if (c.ch) sb.removeChannel(c.ch);
  removeEventListener('hashchange', c.off); document.removeEventListener('visibilitychange', c.vis); document.removeEventListener('keydown', c.key);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  c.lock?.release?.().catch(() => {});
  c.ro?.disconnect();   // שינוי גודל אחרי היציאה הפעיל invalidateSize על מפה שהוסרה (_leaflet_pos)
  try { c.map?.stop(); c.map?.off(); c.map?.remove(); } catch { /* */ }   // עוצרים אנימציית זום/טיסה לפני הסרה
  c.map = null;
}

export async function renderLive(el) {
  if (!isManager()) { el.innerHTML = `<header class="phead">${backBtn('#/')}</header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>למנהל תפעול ומעלה</b></span></div>`; return; }
  stop();
  const c = C = { el, timers: [], focus: null, data: null, wx: {}, wxAt: 0, at: 0, fail: 0, tv: false, bounds: '', ph: new Map(), seen: null, armed: false };
  const sk = n => Array.from({ length: n }, () => '<div class="lvsk"></div>').join('');
  el.innerHTML = `<div class="lv" id="lv">
    <header class="lvh">${backBtn('#/')}<div class="grow"><h1>מגדל פיקוח</h1><div class="lvsub"><span class="lvlive" id="lvlive"><i></i>חי</span><bdi id="lvclk" class="lvclk"></bdi><span id="lvday"></span></div></div>
      <button class="lvtvb" id="lvtv" type="button" aria-pressed="false">${icon('play', 16)}<span>מסך משרד</span></button></header>
    <div class="lvk" id="lvk">${Array.from({ length: 5 }, () => '<div class="lvkp sk"><b>&nbsp;</b><span>&nbsp;</span></div>').join('')}</div>
    <div class="lvg">
      <div class="lvmain">
        <div class="lvmapw"><div id="lvmap" class="lvmap" dir="ltr"></div>
          <div class="lvleg">${Object.entries(ST).map(([, [l, k]]) => `<span><i class="s-${k}"></i>${l}</span>`).join('')}</div>
          <div class="lvfoc" id="lvfoc" hidden></div></div>
        <section class="lvsec" id="lvtl"><div class="lvsh"><h3>היום בשטח</h3></div>${sk(2)}</section>
      </div>
      <aside class="lvside">
        <section class="lvsec" id="lval"><div class="lvsh"><h3>התראות</h3></div>${sk(3)}</section>
        <section class="lvsec" id="lvwk"><div class="lvsh"><h3>השבוע</h3></div><div class="lvsk tall"></div></section>
      </aside>
    </div></div>`;
  $('#lvtv', el).onclick = () => setTv(c, !c.tv);
  c.off = () => stop(); addEventListener('hashchange', c.off, { once: true });
  c.vis = () => { if (!document.hidden && Date.now() - c.at > 15e3) load(c); }; document.addEventListener('visibilitychange', c.vis);
  c.key = e => { c.armed = true; if (e.key === 'Escape' && c.tv) setTv(c, false); }; document.addEventListener('keydown', c.key);
  el.addEventListener('pointerdown', () => { c.armed = true; }, { passive: true });   // צליל רק אחרי מגע ראשון (חוקי הדפדפן)
  tick(c); c.timers.push(setInterval(() => tick(c), 1000));
  initMap(c);
  await load(c);
  c.timers.push(setInterval(() => load(c), REFRESH));
  const kick = () => { clearTimeout(c.kt); c.kt = setTimeout(() => load(c), 1200); $('#lvlive', el)?.classList.add('ping'); setTimeout(() => $('#lvlive', el)?.classList.remove('ping'), 900); };
  try { c.ch = ['work_days', 'issues', 'shifts'].reduce((ch, table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, kick), sb.channel('live-tower')).subscribe(); } catch { /* ריענון כל 45 שנ׳ */ }
}

function tick(c) {
  if (C !== c) return;
  const n = new Date(), e = $('#lvclk', c.el); if (!e) return;
  e.textContent = n.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: c.tv ? undefined : '2-digit' });
  $('#lvday', c.el).textContent = `${HE_DOW[n.getDay()]} ${n.getDate()}.${n.getMonth() + 1}`;
  const off = !navigator.onLine || c.fail > 1 || (c.at && Date.now() - c.at > 3 * 6e4);
  $('#lvlive', c.el).classList.toggle('off', !!off); $('#lvlive', c.el).lastChild.textContent = off ? 'לא מעודכן' : 'חי';
  if (n.getSeconds() === 0 && c.data) drawTimeline(c);   // קו "עכשיו" זז
}

async function load(c) {
  if (C !== c || c.busy || (document.hidden && c.data)) return;
  c.busy = true;
  const t = isoDay(), wk = addDays(t, 6), t0 = new Date(t + 'T00:00:00').toISOString(), d14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const q = async p => { const { data, error } = await p; if (error) throw error; return data || []; };
  const n = async p => { try { const { count, error } = await p; return error ? null : count ?? 0; } catch { return null; } };
  const soft = p => q(p).catch(() => []);
  try {
    const [days, people, drones, crit, miss, rdy, dd, nIss, nPh, nSh, set] = await Promise.all([
      q(sb.from('work_days').select('id,day,kind,status,report_time,site_arrival,site_end,departed_at,arrived_at,opened_at,finished_at,closed_at,crew_lead_id,drone_id,project_id,lat,lng,address,weather_alerted,gust_max,air_minutes,flights,projects(id,name,site_id,lat,lng,sites(id,name,lat,lng)),work_day_crew(user_id,role,confirmed_at,cant_come_at,cant_come_reason)').gte('day', addDays(t, -3)).lte('day', wk).neq('status', 'cancelled').order('day').order('report_time')),
      soft(sb.from('profiles').select('id,full_name,phone,is_pilot').eq('is_active', true)),
      soft(sb.from('equipment').select('id,name,health').eq('kind', 'drone')),
      soft(sb.from('issues').select('id,body,kind,project_id,work_day_id,opened_by,created_at,projects(name)').eq('status', 'open').eq('severity', 'critical').gte('created_at', d14).order('created_at', { ascending: false })),
      soft(sb.from('missing_items').select('id,item,qty,created_at,work_day_id,work_days(day,project_id,projects(name))').eq('status', 'open').gte('created_at', d14).order('created_at')),
      soft(sb.rpc('readiness_list')),
      soft(sb.from('drone_days').select('equipment_id,flights,air_minutes').eq('day', t)),
      n(sb.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'open')),
      n(sb.from('photos').select('id', { count: 'exact', head: true }).gte('created_at', t0)),
      n(sb.from('shifts').select('id', { count: 'exact', head: true }).eq('status', 'open').is('end_at', null)),
      c.office ? null : soft(sb.from('app_settings').select('value').eq('key', 'dispatch').maybeSingle()),
    ]);
    if (C !== c) return;
    if (set && !c.office) { const o = set.value?.office; c.office = Array.isArray(o) ? { ll: o, name: set.value.office_name || 'משרד' } : { ll: [31.2203, 34.8041], name: 'המשרד' }; }
    // יום "דיווח עצמי" כפול ליום מתוכנן של אותו פרויקט — פעם אחת
    const D = days.filter(w => w.kind !== 'report' || !days.some(x => x !== w && x.kind !== 'report' && x.project_id === w.project_id && x.day === w.day));
    D.forEach(w => { w.st = stOf(w); w.g = geoOf(w); });
    c.data = { t, D, P: new Map(people.map(p => [p.id, p])), DR: new Map(drones.map(d => [d.id, d])), crit, miss, rdy, dd, nIss, nPh, nSh };
    c.at = Date.now(); c.fail = 0;
    const fresh = c.seen ? crit.filter(i => !c.seen.has(i.id)) : []; c.seen = new Set(crit.map(i => i.id));
    drawAll(c);
    if (fresh.length && c.tv) flash(c, fresh[0]);
    if (Date.now() - c.wxAt > 15 * 6e4) loadWx(c);
  } catch (e) {
    c.fail++;
    if (!c.data) $('#lvtl', c.el).innerHTML = `<div class="lvsh"><h3>היום בשטח</h3></div><div class="lvempty">${esc(errText(e, 'הנתונים לא נטענו'))}<button class="lvbtn" data-retry type="button">שוב</button></div>`;
    $('[data-retry]', c.el)?.addEventListener('click', () => load(c));
  } finally { c.busy = false; }
}

async function loadWx(c) {
  c.wxAt = Date.now();
  const { t, D } = c.data, tm = addDays(t, 1);
  const S = [...new Map(D.filter(w => w.g && w.day >= t && w.day <= tm).map(w => [gk(w.g), { id: gk(w.g), lat: w.g[0], lng: w.g[1] }])).values()];
  if (!S.length) return;
  try { const { siteDays } = await import('../lib/wx.js'); c.wx = await siteDays(S); if (C === c) drawAll(c); } catch { c.wxAt = 0; }
}
const wxOf = (c, w) => (w.g && c.wx[gk(w.g)]?.[w.day]) || (w.gust_max != null ? { g: +w.gust_max, L: w.weather_alerted ? 2 : +w.gust_max >= 28 ? 1 : 0, saved: 1 } : null);
const wxChip = x => x ? `<span class="lvwx l${x.L}">${icon('sun', 13)}<bdi>${Math.round(x.g)}</bdi> קמ״ש · ${WXW[x.L]}</span>` : '';

function drawAll(c) { drawKpis(c); drawMap(c); drawTimeline(c); drawAlerts(c); drawWeek(c); if (c.focus) drawFocus(c); }

// ---------- מדדים ----------
function drawKpis(c) {
  const { t, D, dd, nIss, nPh, nSh, crit } = c.data, T = D.filter(w => w.day === t);
  const live = T.filter(w => ACTIVE.has(w.st)), sites = new Set(live.map(w => w.projects?.site_id || w.project_id));
  const mins = dd.length ? dd.reduce((s, x) => s + (+x.air_minutes || 0), 0) : T.reduce((s, w) => s + (+w.air_minutes || 0), 0);
  const fl = dd.length ? dd.reduce((s, x) => s + (+x.flights || 0), 0) : T.reduce((s, w) => s + (+w.flights || 0), 0);
  const k = (v, l, sub, tone = '', ic = '') => `<div class="lvkp ${tone}"><span class="lvki">${icon(ic, 16)}</span><b>${v ?? '—'}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : '<small>&nbsp;</small>'}</div>`;
  $('#lvk', c.el).innerHTML = k(live.length, 'צוותים בשטח', nSh ? `${nSh} במשמרת` : T.length ? `מתוך ${T.length} היום` : '', live.length ? 'on' : '', 'users')
    + k(sites.size, 'אתרים פעילים', T.length ? `${T.filter(w => w.st === 'done').length}/${T.length} נסגרו` : 'אין היום', '', 'pin')
    + k(mins ? (Math.round(mins / 6) / 10).toLocaleString('he-IL') : '0', 'שעות טיסה', fl ? `${fl} טיסות` : '', '', 'drone')
    + k(nPh, 'תמונות היום', '', '', 'photo')
    + k(nIss, 'תקלות פתוחות', crit.length ? `${crit.length} קריטיות` : '', crit.length ? 'bad' : nIss ? 'warn' : '', 'alert');
}

// ---------- מפה ----------
async function initMap(c) {
  let L; try { L = await leaflet(); } catch { $('#lvmap', c.el)?.classList.add('nomap'); return; }
  const box = $('#lvmap', c.el); if (C !== c || !box) return;
  c.L = L; c.map = L.map(box, { zoomControl: false, attributionControl: true, zoomSnap: 1 }).setView([31.6, 34.9], 7);
  c.map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(c.map);
  c.layer = L.layerGroup().addTo(c.map);
  c.map.on('click', () => setFocus(c, null));
  c.ro = new ResizeObserver(() => { if (C === c) c.map?.invalidateSize(); }); c.ro.observe(box);
  if (c.data) drawMap(c);
}
// על המפה: היום, ואם אין — מחר, ואם אין — הקרובים השבוע. יום אחד לכל אתר (הקרוב ביותר)
const mapDays = c => { const { t, D } = c.data, tm = addDays(t, 1);
  let M = D.filter(w => w.g && (w.day === t || w.day === tm || (w.day < t && ACTIVE.has(w.st))));
  if (!M.length) M = D.filter(w => w.g && w.day > tm).slice(0, 6);
  const by = new Map(); for (const w of M.sort((a, b) => (b.day === t) - (a.day === t) || a.day.localeCompare(b.day))) if (!by.has(gk(w.g))) by.set(gk(w.g), w);
  return [...by.values()]; };
function drawMap(c) {
  if (!c.map || !c.data) return;
  const L = c.L, { t } = c.data; c.layer.clearLayers(); c.pins = new Map();
  const W = mapDays(c), o = c.office;
  if (o) L.marker(o.ll, { icon: L.divIcon({ className: 'lvpw', html: `<div class="lvoff" title="${esc(o.name)}">${icon('home', 16)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: -100, keyboard: false }).addTo(c.layer);
  for (const w of W) {
    const k = ST[w.st][1], lead = c.data.P.get(w.crew_lead_id), x = wxOf(c, w);
    if (o && w.st === 'en_route') L.polyline([o.ll, w.g], { className: 'lvroute', weight: 3, interactive: false }).addTo(c.layer);
    const html = `<div class="lvpin s-${k}${w.day !== t ? ' later' : ''}${c.focus === w.id ? ' sel' : ''}">${ACTIVE.has(w.st) ? '<i class="ring"></i>' : ''}<b>${esc(lead ? initials(lead.full_name) : '?')}</b>${x && x.L === 2 && w.st === 'planned' ? '<i class="wxb"></i>' : ''}</div>
      <span class="lvpl">${esc(nameOf(w).length > 26 ? nameOf(w).slice(0, 25) + '…' : nameOf(w))}${w.day !== t ? ` · ${whenOf(w.day, t)}` : ''}</span>`;
    const m = L.marker(w.g, { icon: L.divIcon({ className: 'lvpw', html, iconSize: [40, 40], iconAnchor: [20, 20] }), zIndexOffset: ACTIVE.has(w.st) ? 500 : w.day === t ? 300 : 0, title: nameOf(w) }).addTo(c.layer);
    m.on('click', e => { L.DomEvent.stop(e); setFocus(c, w.id, true); });
    c.pins.set(w.id, m);
  }
  const key = W.map(w => w.id).sort().join();
  if (key !== c.bounds) { c.bounds = key; fitAll(c); }
}
function fitAll(c, anim = false) {
  if (!c.map) return;
  const pts = mapDays(c).map(w => w.g); if (c.office) pts.push(c.office.ll);
  if (pts.length > 1) c.map.fitBounds(pts, { padding: [46, 46], maxZoom: 11, animate: anim });
  else if (pts.length) c.map.setView(pts[0], 10, { animate: anim });
}
function setFocus(c, id, fly = false) {
  c.focus = id;
  $$('.lvpin.sel', c.el).forEach(p => p.classList.remove('sel'));
  c.pins?.get(id)?.getElement()?.querySelector('.lvpin')?.classList.add('sel');
  $$('.lvrow[data-f]', c.el).forEach(r => r.classList.toggle('sel', r.dataset.f === id));
  drawFocus(c);
  const w = c.data?.D.find(x => x.id === id);
  if (fly && w?.g && c.map) {   // הסיכה מעל הכרטיס, לא מתחתיו
    const z = Math.max(c.map.getZoom(), c.tv ? 12 : 11), h = $('#lvfoc', c.el)?.offsetHeight || 0;
    c.map.flyTo(c.map.unproject(c.map.project(w.g, z).add([0, h / 2]), z), z, { duration: c.tv ? 1.6 : .8 });
  }
}
function drawFocus(c) {
  const box = $('#lvfoc', c.el), w = c.data?.D.find(x => x.id === c.focus);
  if (!box) return; if (!w) { box.hidden = true; return; }
  const { t, P, DR } = c.data, [sl, k] = ST[w.st], lead = P.get(w.crew_lead_id), dr = DR.get(w.drone_id), x = wxOf(c, w);
  const crew = (w.work_day_crew || []).filter(m => m.user_id !== w.crew_lead_id), eta = etaOf(w);
  const who = (u, cls = '') => `<span class="lvav ${cls}" title="${esc(P.get(u)?.full_name || '')}">${esc(initials(P.get(u)?.full_name || '?'))}</span>`;
  const times = [w.report_time && ['יציאה', t5(w.report_time), w.departed_at && hm(w.departed_at)], w.site_arrival && ['הגעה', t5(w.site_arrival), w.arrived_at && hm(w.arrived_at)],
    !w.site_arrival && w.arrived_at && ['הגעה', '', hm(w.arrived_at)], w.finished_at ? ['סיום', '', hm(w.finished_at)] : eta ? ['סיום משוער', w.site_end && eta !== t5(w.site_end) ? t5(w.site_end) : '', eta] : w.site_end && ['סיום', t5(w.site_end), '']].filter(Boolean);
  const ph = c.ph.get(w.project_id);
  box.hidden = false;
  box.innerHTML = `${ph ? `<button class="lvph" type="button" style="background-image:url('${esc(ph.t)}')" aria-label="תמונה אחרונה"><small>${esc(timeAgo(ph.at))}</small></button>` : ''}<div class="lvfh"><span class="lvst s-${k}">${sl}</span><span class="lvwhen">${whenOf(w.day, t)}</span>${wxChip(x)}<button class="lvx" type="button" aria-label="סגירה">${icon('x', 16)}</button></div>
    <b class="lvft">${esc(nameOf(w))}</b>${w.projects?.sites?.name || w.address ? `<small class="lvfs">${esc(w.address || w.projects.sites.name)}</small>` : ''}
    <div class="lvcrew">${lead ? `${who(lead.id, 'lead')}<span class="lvln">${esc(first(lead.full_name))} ★</span>` : '<span class="lvst s-is">אין ראש צוות</span>'}${crew.map(m => who(m.user_id, m.cant_come_at ? 'no' : m.confirmed_at || w.st !== 'planned' ? 'ok' : '')).join('')}${dr ? `<span class="lvdr${dr.health === 'grounded' ? ' bad' : ''}">${icon('drone', 14)}${esc(dr.name)}</span>` : ''}</div>
    ${times.length ? `<div class="lvtimes">${times.map(([l, p, a]) => `<span><small>${l}</small><bdi>${a || p}</bdi>${a && p ? `<i>${p}</i>` : ''}</span>`).join('')}</div>` : ''}
    <div class="lvfa"><a class="lvbtn" href="#/day/${w.id}">יום השטח</a>${w.st === 'planned' ? '<button class="lvbtn" type="button" data-adm>ניהול היום</button>' : ''}${lead?.phone ? `<a class="lvbtn ghost" href="tel:${esc(lead.phone)}">התקשרות</a>` : ''}</div>`;
  $('.lvx', box).onclick = e => { e.stopPropagation(); setFocus(c, null); };
  const pb = $('.lvph', box); if (pb) pb.onclick = () => zoom(ph.f, nameOf(w));
  if (!c.ph.has(w.project_id)) loadPhoto(c, w);
  const a = $('[data-adm]', box); if (a) a.onclick = () => adm(c, w.id);
}
const adm = (c, id) => import('./dayadmin.js').then(m => m.openDayAdmin(id, () => load(c)));

// ---------- ציר הזמן של היום ----------
const pct = m => Math.max(0, Math.min(100, (m - H0) / (H1 - H0) * 100));
const minOf = d => d.getHours() * 60 + d.getMinutes();
function lateOf(w, now) {
  const f = [], mn = ms => Math.round(ms / 6e4);
  if (w.report_time) { const r = at(w.day, w.report_time);
    if (!w.departed_at && w.st === 'planned' && now - r > 10 * 6e4) f.push([`לא יצאו · ${mn(now - r)} דק׳`, 'bad']);
    else if (w.departed_at && new Date(w.departed_at) - r > 15 * 6e4) f.push([`יצאו +${mn(new Date(w.departed_at) - r)}`, 'warn']); }
  if (w.site_arrival) { const s = at(w.day, w.site_arrival);
    if (!w.arrived_at && (w.st === 'en_route' || (w.st === 'planned' && !w.report_time)) && now - s > 10 * 6e4) f.push([`איחור להגעה · ${mn(now - s)} דק׳`, 'bad']);
    else if (w.arrived_at && new Date(w.arrived_at) - s > 15 * 6e4) f.push([`הגיעו +${mn(new Date(w.arrived_at) - s)}`, 'warn']); }
  return f;
}
function row(c, w, now, isToday) {
  const { P, DR } = c.data, k = ST[w.st][1], lead = P.get(w.crew_lead_id), dr = DR.get(w.drone_id);
  const nm = isToday ? minOf(now) : null, tsM = iso => minOf(new Date(iso));
  const seg = (a, b, cls) => a == null ? '' : `<i class="lvseg ${cls}" style="inset-inline-start:${pct(a)}%;width:${Math.max(.8, pct(b) - pct(a))}%"></i>`;
  const dep = w.departed_at && tsM(w.departed_at), arr = w.arrived_at && tsM(w.arrived_at), fin = (w.finished_at || w.closed_at) && tsM(w.finished_at || w.closed_at);
  const end = fin ?? (isToday ? nm : null);
  const steps = [['יציאה', w.departed_at, w.report_time], ['הגעה', w.arrived_at, w.site_arrival], ['עבודה', w.opened_at || (['working', 'issue', 'done'].includes(w.st) ? w.arrived_at : null), null], ['סגירה', w.finished_at || w.closed_at, null]], eta = isToday ? etaOf(w) : null;
  const fl = isToday ? lateOf(w, now) : [];
  return `<button class="lvrow s-${k}${c.focus === w.id ? ' sel' : ''}${isToday ? '' : ' later'}" type="button" data-f="${w.id}">
    <span class="lvwho"><span class="lvav s-${k}">${esc(lead ? initials(lead.full_name) : '?')}</span><span class="grow"><b>${esc(nameOf(w))}</b><small>${esc([lead ? first(lead.full_name) + ' ★' : 'אין ראש צוות', (w.work_day_crew || []).some(m => m.user_id !== w.crew_lead_id) ? `+${(w.work_day_crew || []).filter(m => m.user_id !== w.crew_lead_id).length}` : '', dr?.name].filter(Boolean).join(' · '))}</small></span>
      <span class="lvst s-${k}">${isToday ? ST[w.st][0] : whenOf(w.day, c.data.t)}</span></span>
    <span class="lvtrack">${w.report_time ? `<i class="lvmk" style="inset-inline-start:${pct(minOf(at(w.day, w.report_time)))}%" title="יציאה מתוכננת"></i>` : ''}${w.site_arrival ? `<i class="lvmk arr" style="inset-inline-start:${pct(minOf(at(w.day, w.site_arrival)))}%" title="הגעה מתוכננת"></i>` : ''}${w.site_end ? `<i class="lvmk end" style="inset-inline-start:${pct(minOf(at(w.day, w.site_end)))}%" title="סיום מתוכנן"></i>` : ''}${eta && !w.finished_at ? `<i class="lveta" style="inset-inline-start:${pct(minOf(at(w.day, eta)))}%"></i>` : ''}
      ${isToday && minOf(now) > H0 && minOf(now) < H1 ? `<i class="lvnowl" style="inset-inline-start:${pct(minOf(now))}%"></i>` : ''}${dep != null ? seg(dep, arr ?? end ?? dep, 'rt') : ''}${arr != null ? seg(arr, end ?? arr, w.st === 'issue' ? 'is' : w.st === 'done' ? 'dn' : 'wk') : ''}</span>
    <span class="lvsteps">${steps.map(([l, a, p], j) => `<span class="${a ? 'on' : ''}"><i></i>${j === 3 && !a && eta ? 'סיום' : l}<bdi>${a ? hm(a) : j === 3 && eta ? '~' + eta : p ? t5(p) : ''}</bdi></span>`).join('')}</span>
    ${fl.length ? `<span class="lvflags">${fl.map(([x, tone]) => `<span class="lvflag ${tone}">${esc(x)}</span>`).join('')}</span>` : ''}</button>`;
}
function drawTimeline(c) {
  const box = $('#lvtl', c.el); if (!box || !c.data) return;
  const { t, D } = c.data, now = new Date(), tm = addDays(t, 1);
  const T = D.filter(w => w.day === t).sort((a, b) => (ACTIVE.has(b.st) - ACTIVE.has(a.st)) || String(a.report_time || '99').localeCompare(String(b.report_time || '99')));
  const N = T.length ? [] : D.filter(w => w.day > t); const nd = N[0]?.day, NX = N.filter(w => w.day === nd);
  const axis = `<div class="lvaxis"><i></i><div class="lvax">${[6, 8, 10, 12, 14, 16, 18].map(h => `<span style="inset-inline-start:${pct(h * 60)}%">${h}</span>`).join('')}${T.length && minOf(now) > H0 && minOf(now) < H1 ? `<i class="lvnow" style="inset-inline-start:${pct(minOf(now))}%"><b>${hm(now.toISOString())}</b></i>` : ''}</div></div>`;
  const head = T.length ? `<div class="lvsh"><h3>היום בשטח</h3><span class="lvcnt">${T.filter(w => w.st === 'done').length}/${T.length}</span></div>`
    : `<div class="lvsh"><h3>${nd ? (nd === tm ? 'מחר בשטח' : `הבא · ${whenOf(nd, t)}`) : 'היום בשטח'}</h3>${nd ? '<span class="lvquiet">היום אין ימי שטח</span>' : ''}</div>`;
  box.innerHTML = head + (T.length || NX.length ? `<div class="lvtlw${T.length ? '' : ' later'}">${axis}${(T.length ? T : NX).map(w => row(c, w, now, !!T.length)).join('')}</div>`
    : `<div class="lvempty">${icon('calendar', 22)}<span>אין ימי שטח השבוע</span><a class="lvbtn" href="#/schedule">לוח השיבוץ</a></div>`);
  $$('.lvrow[data-f]', box).forEach(r => r.onclick = () => { setFocus(c, r.dataset.f, true); if (innerWidth < 1000) $('.lvmapw', c.el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// ---------- התראות: כל שורה = התיקון שלה בלחיצה ----------
function alertsOf(c) {
  const { t, D, P, DR, crit, miss, rdy } = c.data, tm = addDays(t, 1), wk = addDays(t, 6), now = new Date(), A = [];
  const nm = u => first(P.get(u)?.full_name) || '—';
  const busy = new Map(); D.filter(w => w.drone_id && w.st !== 'done' && w.day >= t).forEach(w => busy.set(w.day + w.drone_id, (busy.get(w.day + w.drone_id) || 0) + 1));
  crit.forEach(i => A.push({ tone: 'bad', ic: 'alert', t: `תקלה קריטית · ${shortName(i.projects?.name || '') || 'שטח'}`, s: `${i.body} · ${nm(i.opened_by)} · ${timeAgo(i.created_at)}`, act: () => closeIssue(c, i) }));
  for (const w of D) {
    const pn = nameOf(w), when = whenOf(w.day, t), crew = w.work_day_crew || [], ppl = [...new Set([w.crew_lead_id, ...crew.map(m => m.user_id)].filter(Boolean))];
    const fix = () => adm(c, w.id), go = `#/day/${w.id}`;
    if (w.day < t) { if (ACTIVE.has(w.st)) A.push({ tone: 'warn', ic: 'clock', t: `יום שטח לא נסגר · ${when}`, s: pn, href: go }); continue; }
    if (w.day === t) for (const [x, tone] of lateOf(w, now)) if (tone === 'bad') A.push({ tone, ic: 'clock', t: `${x} · ${pn}`, s: P.get(w.crew_lead_id)?.full_name || '', act: () => setFocus(c, w.id, true) });
    if (w.st !== 'planned' || w.day > wk) continue;
    crew.filter(m => m.cant_come_at).forEach(m => A.push({ tone: 'bad', ic: 'users', t: `${nm(m.user_id)} לא יכול להגיע · ${when}`, s: [pn, m.cant_come_reason].filter(Boolean).join(' · '), act: fix }));
    if (!w.crew_lead_id) A.push({ tone: 'bad', ic: 'users', t: `אין ראש צוות · ${when}`, s: pn, act: fix });
    if (!crew.length) A.push({ tone: 'bad', ic: 'users', t: `לא שובץ צוות · ${when}`, s: pn, act: fix });
    else if (!ppl.some(u => P.get(u)?.is_pilot)) A.push({ tone: 'bad', ic: 'drone', t: `אין מטיס · ${when}`, s: pn, act: fix });
    const dr = DR.get(w.drone_id);
    if (dr?.health === 'grounded') A.push({ tone: 'bad', ic: 'drone', t: `${dr.name} מקורקע · ${when}`, s: pn, act: fix });
    else if (busy.get(w.day + w.drone_id) > 1) A.push({ tone: 'bad', ic: 'drone', t: `${dr?.name || 'רחפן'} משובץ פעמיים · ${when}`, s: pn, act: fix });
    const x = wxOf(c, w);
    if (w.day <= tm && x?.L === 2) A.push({ tone: 'warn', ic: 'sun', t: `תחזית לא לטוס · ${when}`, s: `${pn} · משבים ${Math.round(x.g)} קמ״ש`, act: fix });
    const un = crew.filter(m => m.role !== 'lead' && m.user_id !== w.crew_lead_id && !m.confirmed_at && !m.cant_come_at);
    if (w.day === tm && un.length) A.push({ tone: 'warn', ic: 'clock', t: `${un.length > 1 ? un.length + ' לא אישרו' : nm(un[0].user_id) + ' לא אישר'} הגעה למחר`, s: [pn, un.length > 1 ? un.map(m => nm(m.user_id)).join(', ') : ''].filter(Boolean).join(' · '), act: fix });
  }
  for (const r of rdy.filter(x => x.next_day && x.next_day <= tm)) {
    const m = (r.miss || []).filter(x => PREP.includes(x)); if (!m.length) continue;
    const w = D.find(x => x.project_id === r.project_id && x.day === r.next_day);
    A.push({ tone: 'warn', ic: 'clipboard', t: `לא מוכן ל${r.next_day === t ? 'היום' : 'מחר'} · ${w ? nameOf(w) : 'פרויקט'}`, s: m.join(' · '), href: `#/p/${r.project_id}` });
  }
  [...new Map(miss.map(m => [m.work_day_id, miss.filter(x => x.work_day_id === m.work_day_id)])).values()].forEach(ms => A.push({ tone: 'warn', ic: 'cart', t: `חסר בשטח · ${shortName(ms[0].work_days?.projects?.name || '')}`, s: ms.map(m => m.item + (m.qty > 1 ? ' ×' + m.qty : '')).join(' · '), act: () => supplied(c, ms) }));
  return A.sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1));
}
function drawAlerts(c) {
  const box = $('#lval', c.el); if (!box) return;
  const A = c.alerts = alertsOf(c), bad = A.filter(a => a.tone === 'bad').length;
  box.innerHTML = `<div class="lvsh"><h3>התראות</h3>${A.length ? `<span class="lvcnt ${bad ? 'bad' : 'warn'}">${A.length}</span>` : ''}</div>`
    + (A.length ? `<div class="lval">${A.map((a, i) => `<${a.href ? `a href="${a.href}"` : 'button type="button"'} class="lvar ${a.tone}" data-a="${i}"><span class="lvai">${icon(a.ic, 17)}</span><span class="grow"><b>${esc(a.t)}</b>${a.s ? `<small>${esc(a.s)}</small>` : ''}</span><span class="lvchev">${icon('chev', 16)}</span></${a.href ? 'a' : 'button'}>`).join('')}</div>`
      : `<div class="lvok">${icon('check', 20)}<b>הכל תקין</b></div>`);
  $$('button[data-a]', box).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await A[+b.dataset.a].act(); } catch (e) { toast(errText(e)); } finally { b.disabled = false; } });
}
function closeIssue(c, i) {
  sheet(`<div class="stack tight"><h3 class="sh">${esc(i.body)}</h3><small class="muted">${esc([shortName(i.projects?.name || ''), timeAgo(i.created_at)].filter(Boolean).join(' · '))}</small></div>
    <label class="field">איך טופל<textarea id="lvir" rows="2" placeholder="לא חובה"></textarea></label>
    <div class="row-btns"><a class="btn ghost" href="${i.work_day_id ? '#/day/' + i.work_day_id : '#/p/' + i.project_id}" data-close>${i.work_day_id ? 'יום השטח' : 'הפרויקט'}</a><button class="btn primary" id="lviok">טופל</button></div>`, (s2, close) => {
    $('#lviok', s2).onclick = async e => { e.target.disabled = true;
      const { error } = await sb.from('issues').update({ status: 'closed', resolution: $('#lvir', s2).value.trim() || 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() }).eq('id', i.id);
      if (error) { e.target.disabled = false; return toast(errText(error)); } close(); toast('התקלה נסגרה', 1800, 'success'); load(c); }; });
}
function supplied(c, ms) {
  const nm = shortName(ms[0].work_days?.projects?.name || '');
  sheet(`<h3>חסר בשטח · ${esc(nm)}</h3><div class="list">${ms.map(m => `<div class="lrow"><span class="grow"><b>${esc(m.item + (m.qty > 1 ? ' ×' + m.qty : ''))}</b><small>${timeAgo(m.created_at)}</small></span></div>`).join('')}</div>
    <div class="row-btns"><a class="btn ghost" href="#/day/${ms[0].work_day_id}" data-close>יום השטח</a><button class="btn primary" id="lvmi">${ms.length > 1 ? 'הכל סופק' : 'סופק'}</button></div>`, (s2, close) => {
    $('#lvmi', s2).onclick = async e => { e.target.disabled = true;
      const { error } = await sb.from('missing_items').update({ status: 'handled' }).in('id', ms.map(m => m.id));
      if (error) { e.target.disabled = false; return toast(errText(error)); } close(); toast('סומן שסופק', 1800, 'success'); load(c); }; });
}

// ---------- השבוע ----------
function drawWeek(c) {
  const box = $('#lvwk', c.el); if (!box) return;
  const { t, D, P } = c.data, cols = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const n = D.filter(w => w.day >= t).length;
  box.innerHTML = `<div class="lvsh"><h3>השבוע</h3>${n ? `<span class="lvcnt">${n}</span>` : ''}</div><div class="lvweek">${cols.map(d => { const ws = D.filter(w => w.day === d), off = [5, 6].includes(new Date(d + 'T12:00').getDay());
    return `<div class="lvwd${d === t ? ' now' : ''}${off ? ' off' : ''}"><span class="lvwdh"><b>${d === t ? 'היום' : d === addDays(t, 1) ? 'מחר' : HE_D1[new Date(d + 'T12:00').getDay()]}</b><small>${dm(d)}</small></span><span class="lvwis">${ws.map(w => { const l = P.get(w.crew_lead_id); return `<button class="lvwi s-${ST[w.st][1]}" type="button" data-w="${w.id}"><i></i><span>${esc(nameOf(w))}</span><small>${esc(l ? initials(l.full_name) : '?')}${w.report_time ? ' · ' + t5(w.report_time) : ''}</small></button>`; }).join('') || '<span class="lvwe">—</span>'}</span></div>`; }).join('')}</div>`;
  $$('[data-w]', box).forEach(b => b.onclick = () => { const w = D.find(x => x.id === b.dataset.w); if (!w) return; if (w.g && mapDays(c).some(x => x.id === w.id)) setFocus(c, w.id, true); else if (w.st === 'planned') adm(c, w.id); else location.hash = '#/day/' + w.id; });
}

// ---------- מסך משרד ----------
function setTv(c, on) {
  c.tv = on; const lv = $('#lv', c.el); lv.classList.toggle('tv', on);
  const b = $('#lvtv', c.el); b.setAttribute('aria-pressed', on); b.lastChild.textContent = on ? 'יציאה' : 'מסך משרד';
  clearInterval(c.cyc);
  if (on) {
    try { document.documentElement.requestFullscreen?.()?.catch(() => {}); } catch { /* מסך מלא לא זמין — ממשיכים במסך המורחב */ }
    try { navigator.wakeLock?.request('screen').then(l => { if (c.tv) c.lock = l; else l.release(); }, () => {}); } catch { /* */ }
    let i = -1;
    c.cyc = setInterval(() => { if (C !== c || !c.data) return; const W = mapDays(c).sort((a, b) => ACTIVE.has(b.st) - ACTIVE.has(a.st)); if (!W.length) return;
      i = (i + 1) % (W.length + (W.length > 1 ? 1 : 0)); if (i === W.length) { setFocus(c, null); fitAll(c, true); } else setFocus(c, W[i].id, true); }, CYCLE);
    c.fsx = () => { if (!document.fullscreenElement && c.tv) setTv(c, false); }; document.addEventListener('fullscreenchange', c.fsx);
  } else {
    document.removeEventListener('fullscreenchange', c.fsx);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    c.lock?.release?.().catch(() => {}); c.lock = null;
  }
  tick(c); setTimeout(() => { c.map?.invalidateSize(); if (c.data && !c.focus) fitAll(c, true); }, 350);
}

// ---------- סיום משוער: סיום מתוכנן (site_end) + האיחור/ההקדמה בהגעה; בלי site_end — משך היום המתוכנן מההגעה ----------
function etaOf(w) {
  if (!['on_site', 'working', 'issue'].includes(w.st) || w.finished_at || !w.arrived_at) return '';
  const arr = new Date(w.arrived_at);
  let end = null;
  if (w.site_end) { end = at(w.day, w.site_end); if (w.site_arrival) end = new Date(+end + (arr - at(w.day, w.site_arrival))); }
  else if (w.site_arrival) return '';
  if (!end) return '';
  if (end < new Date()) end = new Date(Date.now() + 15 * 6e4);   // עבר הזמן ועדיין עובדים — לא "בעבר"
  end.setMinutes(Math.ceil(end.getMinutes() / 5) * 5);
  return end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
// תמונה אחרונה מהאתר (ממוזערת אם יש)
async function loadPhoto(c, w) {
  c.ph.set(w.project_id, null);
  try {
    let { data } = await sb.from('photos').select('storage_path,created_at').eq('project_id', w.project_id).order('created_at', { ascending: false }).limit(1);
    if (!data?.length && w.projects?.site_id) ({ data } = await sb.from('photos').select('storage_path,created_at').eq('site_id', w.projects.site_id).order('created_at', { ascending: false }).limit(1));
    const p = data?.[0]; if (!p) return;
    const u = (await thumbUrls('field', [p.storage_path]))[p.storage_path];
    if (!u?.t || C !== c) return;
    c.ph.set(w.project_id, { t: u.t, f: u.f || u.t, at: p.created_at });
    if (c.focus === w.id) drawFocus(c);
  } catch { /* בלי תמונה */ }
}
// תקלה קריטית חדשה במסך משרד: פס אדום מהבהב + צליל עדין (רק אחרי מגע ראשון במסך)
function flash(c, i) {
  $('.lvflash', c.el)?.remove();
  const b = document.createElement('button'); b.type = 'button'; b.className = 'lvflash';
  b.innerHTML = `<span class="lvai">${icon('alert', 22)}</span><span class="grow"><b>תקלה קריטית · ${esc(shortName(i.projects?.name || '') || 'שטח')}</b><small>${esc(i.body || '')}</small></span>`;
  b.onclick = () => { b.remove(); closeIssue(c, i); };
  $('#lv', c.el)?.appendChild(b); setTimeout(() => b.remove(), 30e3);
  if (!c.armed) return;
  try {
    const A = c.ac ||= new (window.AudioContext || window.webkitAudioContext)(), t0 = A.currentTime;
    [[660, 0], [880, .22]].forEach(([f, d]) => { const o = A.createOscillator(), g = A.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.12, t0 + d + .03); g.gain.exponentialRampToValueAtTime(.001, t0 + d + .5);
      o.connect(g).connect(A.destination); o.start(t0 + d); o.stop(t0 + d + .55); });
  } catch { /* בלי צליל */ }
}
