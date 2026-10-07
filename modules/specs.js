// מודול אפיונים: אתרים ← מבנים ← טופס אפיון למבנה שלם.
import { sb, state, can, cache, enqueue, signedUrls, pendingPhotos, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, icon, ask, dm, navButtons, sheet, replaceHash, goUp } from '../lib/core.js';
import { shrink } from '../lib/store.js';

const WASHED = ['עד חצי שנה', 'חצי שנה עד שנה', 'שנה עד שנתיים', 'מעל שנתיים', 'לא נשטף מעולם', 'לא ידוע'];
const DENS = ['נמוכה', 'בינונית', 'גבוהה'];
const MAT = ['Assert Lemon', 'Topax', 'מים בלבד', 'אחר'];
const METHOD = ['רחפן', 'סנפלינג', 'משולב'];
const TOGS = [['obstacles', 'מכשולים בסביבה'], ['docking', 'אזורי עגינה'], ['hydrants', 'הידרנטים'], ['power', 'מקור חשמל'], ['secure_storage', 'אחסון ציוד מאובטח']];
const FACES = ['צפון', 'מזרח', 'דרום', 'מערב'];
const WINDOW = ['רגיל', 'רק בוקר', 'רק אחה״צ', 'אחרי שעות פעילות'];
const fmtD = v => v ? `${nf(v)} ${v === 1 ? 'יום' : 'ימים'}` : 'ימים?';
const STAT = { new: ['', 'לא מולא'], draft: ['warn', 'טיוטה'], done: ['ok', 'הושלם'] };

// ---------- נתונים (עם מטמון לעבודה בלי קליטה) ----------
async function fetchSites() {
  try {
    const { data, error } = await sb.from('sites')
      .select('id,slug,name,subtitle,cover_path,contact_name,contact_phone,group_word,classification,kind,lead_group,lead_stage,visit_date,lead_owner,buildings(id,specs(status,days_expected))')
      .eq('is_active', true).order('name');
    if (error) throw error;
    await cache.set('sites', data); return data;
  } catch { return (await cache.get('sites')) || []; }
}
async function fetchSite(slug) {
  try {
    const { data, error } = await sb.from('sites')
      .select('*,buildings(*,plan_images(*),specs(*))').eq('slug', slug).single();
    if (error) throw error;
    data.buildings.sort((a, b) => a.sort - b.sort);
    data.buildings.forEach(b => { b.plan_images.sort((x, y) => x.sort - y.sort); b.spec = b.specs?.[0] || b.specs || null; });
    await cache.set('site:' + slug, data); return data;
  } catch { return await cache.get('site:' + slug); }
}

// ---------- רשימת אפיונים: כל ליד ממאנדי + אתרים מרובי מבנים ----------
const ORDER = ['ממתין לסיור אפיון', 'לידים חדשים', 'בטיפול', 'בדיון / פגישה', 'אתרים מרובי מבנים', 'אפיון בוצע — ממתין להצעה', 'ממתין להצעת קבלן משנה', 'הצעה נשלחה', 'הצעה לא אושרה — פנייה חוזרת', 'הומרו לפרויקט'];
const FOLDED = new Set(['הצעה נשלחה', 'הצעה לא אושרה — פנייה חוזרת', 'הומרו לפרויקט']);
export async function renderSites(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1>אפיונים</h1></header>
    <input type="search" class="search" id="sq" placeholder="חיפוש ליד, לקוח או אתר"><div id="sl" class="stack lg"><div class="skel"></div><div class="skel"></div></div>`;
  const sites = await fetchSites();
  const urls = await signedUrls('plans', sites.map(s => s.cover_path).filter(Boolean));
  const st = s => { const n = s.buildings.length, done = s.buildings.filter(b => (b.specs?.[0] || b.specs)?.status === 'done').length, draft = s.buildings.some(b => (b.specs?.[0] || b.specs)?.status === 'draft'); return { n, done, draft }; };
  const row = s => { const { n, done, draft } = st(s); const lead = s.kind === 'lead';
    const sub = lead ? [s.visit_date ? 'סיור ' + dm(s.visit_date) : null, s.contact_name, s.lead_owner].filter(Boolean).join(' · ') : `${n} מבנים · ${done} הושלמו`;
    return `<button class="item" data-s="${esc(s.slug)}" data-one="${lead && n === 1 ? s.buildings[0].id : ''}" data-q="${esc(s.name + ' ' + (s.contact_name || ''))}">${s.cover_path ? `<img src="${esc(urls[s.cover_path])}" alt="">` : ''}
      <span class="t"><b>${esc(s.name)}</b><small>${esc(sub)}</small>${!lead ? `<span class="progress" style="margin-top:7px"><i style="width:${n ? Math.round(done / n * 100) : 0}%"></i></span>` : ''}</span>
      ${lead ? (done === n && n ? '<span class="pill ok">בוצע</span>' : draft || done ? '<span class="pill warn">בתהליך</span>' : `<span class="chev">${icon('chev', 18)}</span>`) : `<span class="pill ${done === n && n ? 'ok' : done ? 'warn' : ''}">${done}/${n}</span>`}</button>`; };
  const groups = {}; sites.forEach(s => { const g = s.kind === 'lead' ? (s.lead_group || 'לידים חדשים') : 'אתרים מרובי מבנים'; (groups[g] ||= []).push(s); });
  const keys = [...ORDER.filter(k => groups[k]), ...Object.keys(groups).filter(k => !ORDER.includes(k))];
  const draw = q => {
    $('#sl').innerHTML = keys.map(k => { const list = groups[k].filter(s => !q || (s.name + ' ' + (s.contact_name || '')).includes(q)); if (!list.length) return '';
      const fold = FOLDED.has(k) && !q;
      return fold ? `<details class="fold"><summary><span class="sh">${esc(k)}</span><span class="count">${list.length}</span></summary><div class="list">${list.map(row).join('')}</div></details>`
        : `<section><div class="sh-row"><h3 class="sh">${esc(k)}</h3><span class="count">${list.length}</span></div><div class="list">${list.map(row).join('')}</div></section>`; }).join('')
      || `<div class="empty-card"><span><b>לא נמצא</b><small>לידים חדשים מופיעים כאן תוך כמה דקות</small></span></div>`;
    $$('#sl .item').forEach(b => b.onclick = () => location.hash = b.dataset.one ? `#/b/${b.dataset.s}/${b.dataset.one}` : '#/site/' + b.dataset.s);
  };
  $('#sq').oninput = e => draw(e.target.value.trim());
  draw('');
}


// ---------- מיקום האתר (כפתור אחד לאתר) — לתחזית ולמתכנן השמש בביצוע ----------
// ---------- מפת אתר (תצ"א / מפת מתחם): אחת לאתר, בראש העמוד ----------
const siteMapHtml = s => (s.map_path || can('specs')) ? `<div class="card sitemap" id="sitemap"><div class="skel"></div></div>` : '';
async function bindSiteMap(s, after) {
  const box = $('#sitemap'); if (!box) return;
  const url = s.map_path ? (await signedUrls('plans', [s.map_path]))[s.map_path] : '';
  box.innerHTML = url ? `<button class="smimg" type="button"><img src="${esc(url)}" alt="מפת האתר"></button><div class="row"><b class="grow">מפת האתר</b>${can('specs') ? '<label class="chip">החלפה<input type="file" accept="image/*" hidden></label>' : ''}</div>`
    : `<label class="row addmap"><span class="mic">${icon('pin', 19)}</span><span class="grow"><b>מפת האתר</b><small class="muted">תצ"א או מפת מתחם עם מספרי המבנים — מופיעה לכל מי שעובד באתר</small></span><span class="chip">העלאה</span><input type="file" accept="image/*" hidden></label>`;
  const im = $('.smimg', box); if (im) im.onclick = () => zoom(url, 'מפת האתר · ' + s.name);
  const inp = $('input[type=file]', box);
  if (inp) inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (!navigator.onLine) return toast('העלאת מפה דורשת קליטה');
    toast('מעלה…');
    try {
      const blob = await shrink(f, 2400), path = `${s.id}/site-map-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('plans').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
      const { error: e2 } = await sb.rpc('set_site_map', { s: s.id, path }); if (e2) throw e2;
      s.map_path = path; await cache.set('site:' + s.slug, s); toast('המפה נשמרה'); after ? after() : bindSiteMap(s);
    } catch (e) { toast(e.message || 'ההעלאה נכשלה'); }
  };
}

// ---------- כלי אתר בשורה אחת: מפה · ניווט ותחזית · מחיר. כל אחד נפתח בלחיצה — לא תופס את המסך ----------
function siteTools(s, opts = {}) {
  const t = [];
  t.push(`<button class="stile" type="button" data-st="map">${s.map_path ? '<span class="stimg" id="stmap"></span>' : `<span class="mic">${icon('photo', 19)}</span>`}<b>מפת האתר</b><small>${s.map_path ? 'לחיצה להגדלה' : 'אין עדיין · העלאה'}</small></button>`);
  t.push(`<button class="stile ${s.lat ? '' : 'todo'}" type="button" data-st="loc"><span class="mic ${s.lat ? 'ok' : ''}">${icon('pin', 19)}</span><b>${s.lat ? 'ניווט ותחזית' : 'שמירת מיקום'}</b><small>${s.lat ? 'Waze · Maps · 4 ימים' : 'עומדים באתר ולוחצים'}</small></button>`);
  if (can('finance') && opts.price) t.push(`<button class="stile" type="button" data-st="price"><span class="mic">${icon('cash', 19)}</span><b>הערכת מחיר</b><small>${opts.days ? nf(opts.days) + ' ימי עבודה' : 'אחרי הזנת ימים'}</small></button>`);
  return `<div class="stools">${t.join('')}</div>`;
}
function bindSiteTools(s, opts = {}) {
  const box = $('.stools'); if (!box) return;
  if (s.map_path) signedUrls('plans', [s.map_path]).then(u => { const e = $('#stmap'); if (e && u[s.map_path]) e.style.backgroundImage = `url("${u[s.map_path]}")`; });
  $$('[data-st]', box).forEach(b => b.onclick = async () => {
    const k = b.dataset.st;
    if (k === 'map') {
      if (s.map_path) { const u = await signedUrls('plans', [s.map_path]); if (u[s.map_path]) return zoom(u[s.map_path], 'מפת האתר · ' + s.name); }
      sheet(`<h3>מפת האתר</h3>${siteMapHtml(s)}<button class="btn ghost block" data-close>סגירה</button>`, () => bindSiteMap(s, () => location.reload()), { back: null });
    }
    if (k === 'loc') sheet(`<h3>${esc(s.name)}</h3>${siteLocHtml(s)}${s.map_path && can('specs') ? `<button class="btn ghost block" id="mapre">${icon('photo', 18)} החלפת מפת האתר</button>` : ''}<button class="btn ghost block" data-close>סגירה</button>`, sh => {
      bindSiteLoc(s); const m = $('#mapre', sh); if (m) m.onclick = () => sheet(`<h3>מפת האתר</h3>${siteMapHtml(s)}<button class="btn ghost block" data-close>סגירה</button>`, () => bindSiteMap(s, () => location.reload()));
    });
    if (k === 'price') sheet(`<div class="card" id="price"></div><button class="btn ghost block" data-close>סגירה</button>`, () => priceCard(s, opts.days));
  });
}

function siteLocHtml(s) {
  return `<div class="card siteloc" id="siteloc">${s.lat ? `<div class="row"><span class="mic ok">${icon('pin', 19)}</span><span class="grow"><b>מיקום האתר נשמר</b><small class="muted">${s.geo_source === 'manual' ? 'נשמר בשטח' : 'משוער'}${s.geo_at ? ' · ' + new Date(s.geo_at).toLocaleDateString('he-IL') : ''} · <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">מפה</a></small></span><button class="chip" id="locset">עדכון</button></div>${navButtons(s.lat, s.lng)}<div id="wx3" class="wx3"></div>`
    : `<div class="row"><span class="mic">${icon('pin', 19)}</span><span class="grow"><b>שמירת מיקום האתר</b><small class="muted">עומדים באתר ולוחצים — לתחזית רוח ולתכנון שמש בביצוע</small></span><button class="btn primary sm" id="locset">שמירה</button></div>`}</div>`;
}
function bindSiteLoc(s) {
  const redraw = () => { const c = $('#siteloc'); if (c) { c.outerHTML = siteLocHtml(s); bindSiteLoc(s); } };
  const b = $('#locset'); if (!b) return;
  b.onclick = () => {
    if (!navigator.geolocation) return toast('הטלפון לא תומך במיקום');
    b.disabled = true; b.textContent = 'מאתר…';
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: la, longitude: ln, accuracy } = pos.coords;
      if (accuracy > 300) toast(`דיוק נמוך (${Math.round(accuracy)} מ׳) — כדאי לנסות בחוץ`, 3500);
      const { error } = await sb.rpc('set_site_location', { s: s.id, la, ln, acc: Math.round(accuracy) });
      if (error) { b.disabled = false; b.textContent = 'שמירה'; return toast(error.message); }
      Object.assign(s, { lat: la, lng: ln, geo_source: 'manual', geo_at: new Date().toISOString() }); toast('מיקום האתר נשמר'); redraw();
    }, () => { b.disabled = false; b.textContent = 'שמירה'; toast('לא התקבלה הרשאת מיקום'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  if (s.lat) wx3(s);
}
// תחזית 3 ימים לאתר (רוח ומשבים בשעות העבודה)
async function wx3(s) {
  const box = $('#wx3'); if (!box) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lng}&hourly=wind_speed_10m,wind_gusts_10m,precipitation&timezone=Asia%2FJerusalem&forecast_days=4`);
    const h = (await r.json()).hourly; const days = {};
    h.time.forEach((t, i) => { const d = t.slice(0, 10), hr = +t.slice(11, 13); if (hr < 6 || hr > 17) return; const x = days[d] ||= { w: 0, g: 0, r: 0 }; x.w = Math.max(x.w, h.wind_speed_10m[i]); x.g = Math.max(x.g, h.wind_gusts_10m[i]); x.r += h.precipitation[i] || 0; });
    box.innerHTML = Object.entries(days).slice(0, 4).map(([d, x]) => { const bad = x.g >= 35 || x.w >= 25 || x.r >= 2;
      return `<div class="wxd ${bad ? 'bad' : ''}"><b>${new Date(d + 'T12:00').toLocaleDateString('he-IL', { weekday: 'short' })}</b><small>משבים ${Math.round(x.g)}</small>${x.r >= 0.5 ? `<small>גשם ${x.r.toFixed(1)}</small>` : ''}</div>`; }).join('');
  } catch { box.innerHTML = ''; }
}


// ---------- הערכת מחיר (הרשאת כספים בלבד) — לפי הפרמטרים החיים מלוח התמחור במאנדי ----------
const BASE = [31.2524, 34.7908]; // ב"ש
async function roadKm(lat, lng) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${BASE[1]},${BASE[0]};${lng},${lat}?overview=false`);
    const j = await r.json(); if (j.routes?.[0]) return { km: j.routes[0].distance / 1000, est: false };
  } catch {}
  const R = 6371, dl = (lat - BASE[0]) * Math.PI / 180, dg = (lng - BASE[1]) * Math.PI / 180;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(BASE[0] * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dg / 2) ** 2;
  return { km: 2 * R * Math.asin(Math.sqrt(a)) * 1.3, est: true }; // קו אוויר × 1.3 כשאין ניתוב
}
export function estimate(P, days, km, margin) {
  const daily = (P.rate_stas + P.rate_uriel) * P.hours_day + P.material_day + P.fuel_day + P.overhead_month / P.days_month / (P.crews || 1);
  const far = km > P.lodging_km;
  const travel = far ? km * 2 * P.km_cost + P.lodging_day * days : km * 2 * P.km_cost * days;
  const cost = daily * days + travel;
  return { daily, travel, far, cost, price: cost / (1 - margin / 100) };
}
async function priceCard(s, days) {
  const box = $('#price'); if (!box) return;
  const { data } = await sb.from('pricing_params').select('key, value');
  if (!data?.length) { box.remove(); return; }
  const P = Object.fromEntries(data.map(x => [x.key, Number(x.value)]));
  if (!days) { box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">תופיע אחרי שיוזנו ימי עבודה למבנים</small></span></div>`; return; }
  if (!s.lat) { box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">חסר מיקום אתר — שמרו מיקום כדי לחשב נסיעה ולינה</small></span></div>`; return; }
  const d = await roadKm(s.lat, s.lng);
  let m = Math.round(P.margin <= 1 ? P.margin * 100 : P.margin);
  const draw = () => {
    const e = estimate(P, days, d.km, m);
    box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">${nf(days)} ימים · ${Math.round(d.km)} ק"מ מב"ש${d.est ? ' (משוער)' : ''}${e.far ? ' · כולל לינה' : ''}</small></span></div>
      <div class="kpis"><div class="kpi"><b>₪${nf(Math.round(e.price))}</b><span>מחיר לפני מע"מ</span></div><div class="kpi"><b>₪${nf(Math.round(e.cost))}</b><span>עלות מלאה</span></div><div class="kpi"><b>₪${nf(Math.round(e.price / days))}</b><span>ליום</span></div></div>
      <div class="row" style="margin-top:8px"><small class="grow muted">מרווח</small><div class="stepper"><button type="button" data-m="-5">−</button><b style="min-width:3.5em;text-align:center">${m}%</b><button type="button" data-m="5">+</button></div></div>
      <small class="muted">יום: ₪${nf(Math.round(e.daily))} (שכר, חומר, דלק, תקורה) · נסיעה${e.far ? '+לינה' : ''}: ₪${nf(Math.round(e.travel))}. הערכה בלבד — ההצעה נבנית במאנדי.</small>`;
    $$('[data-m]', box).forEach(b => b.onclick = () => { m = Math.min(80, Math.max(0, m + Number(b.dataset.m))); draw(); });
  };
  draw();
}

// ---------- אתר: מבנים + צ'אט ----------
export async function renderSite(el, slug, tab = 'b') {
  el.innerHTML = `<div class="skel"></div>`;
  const s = await fetchSite(slug);
  if (!s) { el.innerHTML = `<div class="empty">האתר לא נמצא, או שאין לך גישה אליו.</div>`; return; }
  const n = s.buildings.length, done = s.buildings.filter(b => b.spec?.status === 'done').length;
  const days = s.buildings.reduce((t, b) => t + Number(b.spec?.days_expected || 0), 0);
  const thumbs = await signedUrls('plans', s.buildings.map(b => b.plan_images[0]?.storage_path).filter(Boolean));
  el.innerHTML = `<div class="top"><a class="back" href="#/specs" aria-label="חזרה"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></a><span class="grow"></span>
      ${s.classification === 'restricted' ? '<span class="pill warn">אתר מוגבל</span>' : ''}</div>
    <div><div class="eyebrow">סיור אפיון</div><h1>${esc(s.name)}</h1></div>
    ${contactCard(s.contact_name, s.contact_phone)}
    ${siteTools(s, { price: true, days: Math.ceil(days - 1e-3) })}
    <div class="kpis"><div class="kpi"><b>${done}/${n}</b><span>מבנים הושלמו</span></div><div class="kpi"><b>${days ? nf(Math.ceil(days - 1e-3)) : '—'}</b><span>ימי עבודה${days % 1 ? ` (${nf(days)} עוגל)` : ''}</span></div>
      ${(a => a ? `<div class="kpi"><b>${nf(a)}</b><span>מ"ר לפי התכנית</span></div>` : `<div class="kpi"><b>${s.buildings.length - done}</b><span>נשארו לאפיון</span></div>`)(s.buildings.reduce((t, b) => t + Number(b.facade_area_m2 || 0), 0))}</div>
    <div class="sigline" id="sig"></div>
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === 'b'}" data-t="b">מבנים</button><button role="tab" aria-selected="${tab === 'c'}" data-t="c">צ'אט אפיון</button></div>
    <div id="tabbody"></div>`;
  bindCopy(el); bindSiteTools(s, { days: Math.ceil(days - 1e-3) });
  import('../lib/audit.js').then(m => m.signature($('#sig'), { site_id: s.id }));
  $$('.tabs button', el).forEach(b => b.onclick = () => replaceHash(`#/site/${slug}${b.dataset.t === 'c' ? '/chat' : ''}`));
  const body = $('#tabbody');
  if (tab === 'c') { const { renderChat } = await import('./chat.js'); return renderChat(body, { site: s }); }
  const groups = [...new Set(s.buildings.map(b => b.group_label || ''))];
  body.innerHTML = groups.map(g => `${g ? `<div class="group-h">${esc(s.group_word)} ${esc(g)}</div>` : ''}<div class="list">${
    s.buildings.filter(b => (b.group_label || '') === g).map(b => {
      const [c, t] = STAT[b.spec?.status || 'new'];
      const meta = [b.facade_area_m2 ? nf(b.facade_area_m2) + ' מ"ר' : null, b.floors ? nf(b.floors) + ' קומות' : null, b.spec?.days_expected ? nf(b.spec.days_expected) + ' ימים' : null].filter(Boolean).join(' · ');
      const th = b.plan_images[0] && thumbs[b.plan_images[0].storage_path];
      return `<button class="item" data-b="${b.id}">${th ? `<img src="${esc(th)}" alt="">` : ''}<span class="t"><b>${esc(b.name)}</b><small>${esc(b.subtitle ? b.subtitle + ' · ' : '')}${meta}</small></span><span class="pill ${c}">${t}</span></button>`;
    }).join('')}</div>`).join('');
  body.insertAdjacentHTML('beforeend', `<button class="btn ghost block" id="addb" style="margin-top:12px">${icon('plus', 18)} הוספת מבנה</button>`);
  $('#addb').onclick = async () => { const n = await ask('שם המבנה', { placeholder: 'למשל: בניין B, אגף מזרחי', ok: 'הוספה' }); if (!n) return;
    const { data, error } = await sb.rpc('add_building', { s: s.id, n }); if (error) return toast(error.message); location.hash = `#/b/${slug}/${data}`; };
  $$('[data-b]', body).forEach(b => b.onclick = () => location.hash = `#/b/${slug}/${b.dataset.b}`);
}

// ---------- טופס אפיון ----------
export async function renderBuilding(el, slug, bid) {
  const s = await fetchSite(slug); const b = s?.buildings.find(x => x.id === bid);
  if (!b) { el.innerHTML = `<div class="empty">המבנה לא נמצא.</div>`; return; }
  const spec = b.spec; let form = { ...spec }; let dirty = false;
  const editable = can('specs');
  const plans = await signedUrls('plans', b.plan_images.map(p => p.storage_path));
  const chips = (k, opts) => `<div class="chips">${opts.map(o => `<button type="button" class="chip" data-g="${k}" data-v="${esc(o)}" aria-pressed="${form[k] === o}">${esc(o)}</button>`).join('')}</div>`;
  const [sc, st] = STAT[spec.status];
  // חזיתות לספירת ימים: גיליונות "חזית …" מהתכנית; אם אין — 4 כיווני מצפן. הכיוון נגזר מהשם (לתכנון לפי השמש)
  const dirOf = t => FACES.find(f => String(t || '').includes(f)) || null;
  const imgs = b.plan_images.filter(p => /חזית/.test(p.title || ''));
  const FAC = imgs.length ? imgs.map(p => ({ id: p.id, title: p.title, dir: dirOf(p.title), img: true })) : FACES.map(f => ({ id: f, title: 'חזית ' + f, dir: f }));
  const FD = new Map((Array.isArray(spec.facade_days) ? spec.facade_days : []).map(x => [x.k, { ...x }]));  // k → {k,t,dir,d}
  const fget = k => FD.get(k)?.d || 0;
  const titleOf = k => FAC.find(f => f.id === k)?.title || (FACES.includes(k) ? 'חזית ' + k : 'חזית מצילום');
  const dirOfKey = k => FAC.find(f => f.id === k)?.dir || FD.get(k)?.dir || (FACES.includes(k) ? k : null);
  const counter = k => `<div class="fcount${fget(k) ? ' set' : ''}" data-fk="${esc(k)}"><button type="button" data-d="-0.5" aria-label="פחות">−</button><b>${fmtD(fget(k))}</b><button type="button" data-d="0.5" aria-label="יותר">+</button></div>`;
  const dirChips = k => `<div class="fdir" data-fk="${esc(k)}">${FACES.map(f => `<button type="button" data-v="${f}" aria-pressed="${FD.get(k)?.dir === f}">${f}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="top"><a class="back" id="bk" data-hard="1" href="javascript:void 0" aria-label="חזרה ל${esc(s.name)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></a><span class="grow"></span><span class="pill ${sc}" id="stp">${st}</span></div>
    <div>${s.kind === 'lead' && s.buildings.length === 1 ? `<div class="eyebrow">אפיון שטיפה</div><h2>${esc(s.name)}</h2>` : `<div class="eyebrow">${esc(s.name)}${b.group_label ? ' · ' + esc(s.group_word) + ' ' + esc(b.group_label) : ''}</div><h2>${esc(b.name)}</h2>`}${b.subtitle ? `<div class="muted">${esc(b.subtitle)}</div>` : ''}</div>
    ${s.kind === 'lead' ? `<div class="menu">${[['שלב', s.lead_stage], ['היקף', s.scope_text], ['אחראי', s.lead_owner], ['תאריך סיור', s.visit_date ? dm(s.visit_date) : null], ['הערות מהליד', s.lead_notes]].filter(x => x[1]).map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${esc(v)}</b></span></div>`).join('')}
      <a class="lrow" href="#/site/${esc(slug)}"><span class="grow"><b>${s.buildings.length > 1 ? `כל המבנים בליד (${s.buildings.length})` : 'יש כמה מבנים? הוספת מבנה'}</b></span><span class="chev">${icon('chev', 18)}</span></a></div>` : `
    <div class="kpis"><div class="kpi"><b>${b.facade_area_m2 ? nf(b.facade_area_m2) : 'למדידה'}</b><span>${b.facade_area_m2 ? 'מ"ר לפי התכנית' : 'שטח חזיתות'}</span></div>
      <div class="kpi"><b>${b.floors ? nf(b.floors) : '—'}</b><span>קומות</span></div><div class="kpi"><b>${b.plan_source === 'plans' ? b.plan_images.length : 'סקיצה'}</b><span>${b.plan_source === 'plans' ? 'חזיתות בתכנית' : 'מקור'}</span></div></div>`}
    <div class="sigline" id="sig"></div>
    ${b.office_note ? `<div class="note">${esc(b.office_note)}</div>` : ''}
    ${contactCard(s.contact_name, s.contact_phone)}
    ${s.kind === 'lead' && s.buildings.length === 1 ? siteTools(s) : ''}
    ${b.plan_images.length ? `<div><h3>${b.plan_source === 'plans' ? 'החזיתות מהתכנית' : 'מיקום בסקיצה'}</h3><div class="small muted">גוללים הצידה, לחיצה מגדילה</div></div>
      <div class="facades">${b.plan_images.map((p, i) => `<div class="fc"><button class="fcimg" data-i="${i}"><img loading="lazy" src="${esc(plans[p.storage_path])}" alt="${esc(p.title)}"></button><div><b>${esc(p.title)}</b>${esc(p.dims_text || '')}${p.area_m2 ? ' · ' + nf(p.area_m2) + ' מ"ר' : ''}</div>${FAC.some(f => f.id === p.id) ? counter(p.id) : ''}</div>`).join('')}</div>` : ''}
    ${!imgs.length ? `<div><h3>ימים לפי חזית</h3><div class="small muted">מצלמים כל חזית, מסמנים כיוון וסופרים ימים. אפשר גם בהמשך, מהמשרד</div></div>
      <div class="facades" id="facs"></div>` : ''}
    <fieldset ${editable ? '' : 'disabled'} style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:14px">
    <div class="sec"><h3>הערכת ביצוע</h3>
      <div class="field">ימי עבודה צפויים למבנה<small id="dsrc">כל המבנה, כל החזיתות. חצי יום = 0.5</small>
        <div class="stepper"><button type="button" id="dm">−</button><input class="days grow" id="days" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(form.days_expected ?? '')}"><button type="button" id="dp">+</button></div></div>
      <div class="small muted" id="rate"></div>
      <div class="field">שעות עבודה באתר ${chips('work_window', WINDOW)}</div>
      <div class="field">שיטת ביצוע ${chips('method', METHOD)}</div>
      <div class="field">מתי נשטף לאחרונה ${chips('washed_last', WASHED)}</div>
      <div class="field">רמת לכלוך וצפיפות ${chips('density', DENS)}</div>
      <div class="field">חומר ניקוי ${chips('material', MAT)}</div>
      <div class="note" id="dirtNote" ${['מעל שנתיים', 'לא נשטף מעולם'].includes(form.washed_last) ? '' : 'hidden'}>לא נשטף מעל שנתיים: לכלוך מצטבר דורש מעברים חוזרים. כדאי להוסיף ימים.</div>
    </div>
    <div class="sec"><h3>באתר</h3>
      <div class="field">מה יש באתר<small>מסמנים את מה שקיים. משפיע על רשימת ההעמסה ליום העבודה</small>
        <div class="chips">${TOGS.map(([k, l]) => `<label class="chip tchip" for="t_${k}"><input type="checkbox" id="t_${k}" ${form[k] ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
      <div id="obstBox" ${form.obstacles ? '' : 'hidden'} class="stack">
        <label class="field" for="obstacles_text">פירוט המכשולים<textarea id="obstacles_text" placeholder="עצים, גגונים, חניה, קווי חשמל…">${esc(form.obstacles_text || '')}</textarea></label>
        <div class="field">צילום המכשולים<div class="photos" id="ph_obstacle"></div></div>
      </div>
    </div>
    <div class="sec"><h3>תמונות והערות</h3>
      <div class="field">תמונות מהאתר<small>אפשר לבחור כמה תמונות יחד</small><div class="photos" id="ph_site"></div></div>
      <label class="field" for="notes">הערות מיוחדות<textarea id="notes">${esc(form.notes || '')}</textarea></label>
      <label class="field" for="highlights">דגשים להצעה<small>הגבלות גישה, שעות עבודה, אזורים בעייתיים</small><textarea id="highlights">${esc(form.highlights || '')}</textarea></label>
    </div></fieldset>
    ${editable ? '' : '<div class="empty small">צפייה בלבד</div>'}`;
  const bar = document.createElement('div'); bar.className = 'bar';
  bar.innerHTML = editable ? `<button class="btn" id="sv">שמירה</button><button class="btn primary" id="dn">סיום אפיון</button>` : '';
  if (editable) el.appendChild(bar);

  $$('.fcimg', el).forEach(f => f.onclick = () => { const p = b.plan_images[+f.dataset.i]; zoom(plans[p.storage_path], p.title + ' · ' + (p.dims_text || '')); });
  bindCopy(el);
  const set = (k, v) => { form[k] = v; dirty = true; };
  $$('.chip[data-g]', el).forEach(c => c.onclick = () => {
    const g = c.dataset.g; set(g, form[g] === c.dataset.v ? null : c.dataset.v);
    $$(`.chip[data-g="${g}"]`, el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === form[g]));
    if (g === 'washed_last') $('#dirtNote').hidden = !['מעל שנתיים', 'לא נשטף מעולם'].includes(form[g]);
  });
  const days = $('#days');
  // בדיקת מציאות: קצב שנגזר מהמספרים של הסוקר עצמו (שטח ÷ ימים) — לא מספר מומצא
  const rate = () => { const a = Number(b.facade_area_m2), d = Number(days.value); $('#rate').textContent = a && d ? `≈ ${nf(Math.round(a / d))} מ"ר חזית ליום עבודה` : ''; };
  days.oninput = () => { set('days_expected', days.value === '' ? null : Number(days.value)); rate(); }; rate();
  // מונה ימים על כל חזית: הסה״כ למבנה = סכום החזיתות (כשסופרים לפי חזיתות, הסה״כ נעול)
  const syncTotal = (init = false) => {
    const vals = [...FD.values()].map(x => Number(x.d)).filter(v => v > 0), sum = vals.reduce((t, v) => t + v, 0);
    days.readOnly = !!vals.length; $('#dm').disabled = $('#dp').disabled = !!vals.length; $('#dsrc').textContent = vals.length ? 'מחושב מסכום החזיתות' : 'כל המבנה, כל החזיתות. חצי יום = 0.5';
    // בפתיחת המסך רק מציגים — שמירה מסומנת רק כשהמשתמש באמת שינה משהו
    if (vals.length) { days.value = sum; if (init) form.days_expected = sum; else set('days_expected', sum); rate(); }
    const dirs = [...FD.values()].filter(x => x.d > 0).map(x => dirOfKey(x.k)).filter(Boolean);
    form.facades = vals.length && dirs.length ? [...new Set(dirs)] : null;
    // נשמר כמערך מסודר לפי סדר הכרטיסים, עם כותרת וכיוון — מנוע התכנית קורא אותו כמו שהוא
    form.facade_days = [...FD.values()].filter(x => x.d > 0 || x.dir).map(x => ({ k: x.k, t: titleOf(x.k), dir: dirOfKey(x.k), d: x.d || 0 }));
  };
  const bindFac = root => {
    $$('.fcount', root).forEach(c => $$('button', c).forEach(btn => btn.onclick = e => {
      e.stopPropagation(); if (!editable) return; const k = c.dataset.fk;
      const v = Math.max(0, fget(k) + Number(btn.dataset.d));
      if (v) FD.set(k, { ...(FD.get(k) || { k }), d: v }); else if (FD.has(k)) FD.get(k).d = 0;
      $('b', c).textContent = fmtD(v); c.classList.toggle('set', v > 0); dirty = true; syncTotal();
    }));
    $$('.fdir', root).forEach(c => $$('button', c).forEach(btn => btn.onclick = () => {
      if (!editable) return; const k = c.dataset.fk; FD.set(k, { ...(FD.get(k) || { k, d: 0 }), dir: btn.dataset.v });
      $$('button', c).forEach(x => x.setAttribute('aria-pressed', x === btn)); dirty = true; syncTotal();
    }));
  };
  bindFac(el); syncTotal(true);
  // תמונות חזית של הסוקר (כולל ממתינות בתור) + כרטיסי מצפן כשאין תמונות
  async function drawFacades() {
    const box = $('#facs'); if (!box) return;
    let rows = [];
    try { const { data } = await sb.from('photos').select('id,storage_path').eq('spec_id', spec.id).eq('kind', 'facade').order('created_at'); rows = data || []; } catch {}
    const urls = await signedUrls('field', rows.map(r => r.storage_path));
    const pend = await pendingPhotos(m => m.spec_id === spec.id && m.kind === 'facade');
    const cards = [...rows.map(r => ({ id: r.id, src: urls[r.storage_path] })), ...pend.map(p => ({ id: p.photoId, src: URL.createObjectURL(p.blob) }))];
    const comp = cards.length ? FACES.filter(f => fget(f) > 0) : FACES;
    box.innerHTML = (editable ? `<label class="fc addfc">${icon('plus', 22)}<b>צילום חזית</b><small>תמונה לכל חזית</small><input type="file" accept="image/*" capture="environment" multiple></label>` : '')
      + cards.map(c => `<div class="fc"><button class="fcimg" type="button" data-z="${esc(c.src)}"><img src="${esc(c.src)}" alt=""></button>${dirChips(c.id)}${counter(c.id)}</div>`).join('')
      + comp.map(f => `<div class="fc compass"><div class="cmp">${esc(f)}</div><div><b>חזית ${esc(f)}</b></div>${counter(f)}</div>`).join('');
    $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.dataset.z, b.name));
    bindFac(box);
    const inp = $('input[type=file]', box);
    if (inp) inp.onchange = async () => {
      for (const f of [...inp.files]) {
        try { const blob = await shrink(f), photoId = crypto.randomUUID();
          await enqueue({ kind: 'photo', blob, photoId, path: `${state.user.id}/spec/${spec.id}/${photoId}.jpg`, meta: { spec_id: spec.id, building_id: b.id, site_id: s.id, kind: 'facade' } });
          FD.set(photoId, { k: photoId, d: 0 });
        } catch { toast('תמונה אחת לא נשמרה'); }
      }
      dirty = true; if (spec.status === 'new') form.status = 'draft'; await save(false, true); drawFacades();
    };
  }
  drawFacades();
  $('#dm').onclick = () => { days.value = Math.max(0, (Number(days.value) || 0) - 0.5); days.oninput(); };
  $('#dp').onclick = () => { days.value = (Number(days.value) || 0) + 0.5; days.oninput(); };
  ['obstacles_text', 'notes', 'highlights'].forEach(k => $('#' + k).oninput = e => set(k, e.target.value));
  TOGS.forEach(([k]) => $('#t_' + k).onchange = e => { set(k, e.target.checked); if (k === 'obstacles') $('#obstBox').hidden = !e.target.checked; });

  // תמונות: קיימות מהשרת + ממתינות בתור
  async function drawPhotos(kind) {
    const box = $('#ph_' + kind); if (!box) return;
    let rows = [];
    try { const { data } = await sb.from('photos').select('id,storage_path').eq('spec_id', spec.id).eq('kind', kind).order('created_at'); rows = data || []; } catch {}
    const urls = await signedUrls('field', rows.map(r => r.storage_path));
    const pend = await pendingPhotos(m => m.spec_id === spec.id && m.kind === kind);
    box.innerHTML = rows.map(r => `<div class="ph"><img src="${esc(urls[r.storage_path])}" alt="" data-z="${esc(urls[r.storage_path])}"></div>`).join('')
      + pend.map(p => `<div class="ph"><img src="${URL.createObjectURL(p.blob)}" alt=""><span class="q">ממתין</span></div>`).join('')
      + (editable ? `<label class="addph">+ תמונה<input type="file" accept="image/*" multiple data-k="${kind}"></label>` : '');
    $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.dataset.z, b.name));
    const inp = $('input[type=file]', box);
    if (inp) inp.onchange = async () => {
      const files = [...inp.files]; if (!files.length) return;
      toast(`שומר ${files.length} תמונות…`);
      for (const f of files) {
        try {
          const blob = await shrink(f), photoId = crypto.randomUUID();
          await enqueue({ kind: 'photo', blob, photoId, path: `${state.user.id}/spec/${spec.id}/${photoId}.jpg`,
            meta: { spec_id: spec.id, building_id: b.id, site_id: s.id, kind } });
        } catch { toast('תמונה אחת לא נשמרה. נסו תמונה אחרת'); }
      }
      if (spec.status === 'new') { form.status = 'draft'; await save(false, true); }
      drawPhotos(kind);
    };
  }
  drawPhotos('site'); drawPhotos('obstacle');

  async function save(done, quiet) {
    const patch = {};
    ['days_expected', 'facades', 'facade_days', 'work_window', 'method', 'washed_last', 'density', 'material', 'obstacles', 'obstacles_text', 'docking', 'hydrants', 'power', 'secure_storage', 'notes', 'highlights'].forEach(k => patch[k] = form[k] ?? null);
    ['obstacles', 'docking', 'hydrants', 'power', 'secure_storage'].forEach(k => patch[k] = !!patch[k]);
    patch.status = done ? 'done' : (spec.status === 'done' ? 'done' : 'draft');
    patch.surveyor_id = spec.surveyor_id || state.user.id;
    await enqueue({ kind: 'update', table: 'specs', rowId: spec.id, patch });
    Object.assign(spec, patch); b.spec = spec; await cache.set('site:' + slug, s);
    dirty = false; const [c2, t2] = STAT[patch.status]; const p = $('#stp'); if (p) { p.className = 'pill ' + c2; p.textContent = t2; }
    if (!quiet) toast(navigator.onLine ? (done ? 'האפיון הושלם ונשמר' : 'נשמר') : 'נשמר בטלפון · יישלח כשתחזור קליטה');
  }
  if (editable) {
    $('#sv').onclick = () => save(false);
    $('#dn').onclick = async () => {
      if (!(Number(form.days_expected) > 0)) { toast('חסר: ימי עבודה צפויים (יותר מ-0)'); days.focus(); return; }
      await save(true); goUp(s.kind === 'lead' && s.buildings.length === 1 ? '#/specs' : '#/site/' + slug);
    };
  }
  bindSiteTools(s);
  import('../lib/audit.js').then(m => m.signature($('#sig'), { building_id: b.id }, { surveyor: spec.surveyor_id }));
  $('#bk').onclick = async () => { if (dirty && editable) await save(false, true); goUp(s.kind === 'lead' && s.buildings.length === 1 ? '#/specs' : '#/site/' + slug); };
  addEventListener('hashchange', function h() { if (dirty && editable) save(false, true); removeEventListener('hashchange', h); }, { once: true });
}
