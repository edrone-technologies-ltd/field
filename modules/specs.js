// מודול אפיונים: אתרים ← מבנים ← טופס אפיון למבנה שלם.
import { sb, state, can, isManager, cache, enqueue, signedUrls, pendingPhotos, $, $$, esc, nf, toast, zoom, contactCard, bindCopy, icon, ask, dm, navButtons, sheet, replaceHash, goUp, thumbUrls , folderGrid, coverArt, coverFor, backBtn, confirmBox } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { airBtn } from '../lib/wx.js';
import { errText } from '../lib/audit.js';
// כסף לא מוצג למי שאין לו כספים (מנהל תפעול): משפטים בטקסט חופשי ממאנדי עם סכום/מע״מ/חשבונית/תנאי תשלום יורדים
const MONEY_RE = /₪|ש["״]ח|שקל|מע["״]מ|חשבוני|קבל[הות]\s*\d|תשלום|תשלומ|משלמ|כספים|חשבון בנק|ניכוי מס|\d[\d,.]*\s*(?:אלף|K\b)/;
const noMoney = t => !t || can('finance') ? t : String(t).split(/(?<=[.!?\n])\s+|\s+(?=⚠)/).filter(x => !MONEY_RE.test(x)).join(' ').trim() || null;

const WASHED = ['עד חצי שנה', 'חצי שנה עד שנה', 'שנה עד שנתיים', 'מעל שנתיים', 'לא נשטף מעולם', 'לא ידוע'];
const DENS = ['נמוכה', 'בינונית', 'גבוהה'];
const MAT = ['Assert Lemon', 'Topax', 'מסיר צמנט', 'מים בלבד', 'אחר'];
const MAT_DEF = 'Assert Lemon', MAT_HEAVY = 'Topax';   // חלונות/חזיתות → Assert Lemon; עובש ולכלוך כבד → Topax; מסיר צמנט — רק בחריג
const METHOD = ['רחפן', 'סנפלינג', 'משולב'];
const TOGS = [['docking', 'אזורי עגינה'], ['secure_storage', 'אחסון ציוד מאובטח']];
// שטח ולוגיסטיקה (specs.site_ops, 096) — זורם לתכנית: מכלית/גנרטור/תיאומים = משימות הכנה ביום 1, סיכונים = דגשים
const OPS1 = [['water', 'מים', ['ברז באתר', 'הידרנט', 'מכלית']], ['power', 'חשמל', ['שקע באתר', 'גנרטור']],
  ['access', 'גישה לרכב', ['עד המבנה', 'חניה קרובה', 'רחוק — סחיבה']], ['launch', 'נקודת המראה', ['קרקע', 'גג', 'חניון']]];
const PERMITS = ['אישור כניסה', 'ביטחון / קב״ט', 'ועד / הנהלה', 'סגירת מדרכה', 'עבודה בגובה', 'ליווי באתר'];
const HAZ = ['הולכי רגל', 'קווי חשמל', 'עצים', 'גגונים / זכוכית', 'רכבים חונים', 'כביש סמוך', 'דיירים / חלונות'];
const AIR = ['פתוח', 'נדרש תיאום', 'מוגבל'];
const FACES = ['צפון', 'מזרח', 'דרום', 'מערב'];
const WINDOW = ['רגיל', 'רק בוקר', 'רק אחה״צ', 'אחרי שעות פעילות'];
const fmtD = v => v ? `${nf(v)} ${v === 1 ? 'יום' : 'ימים'}` : 'ימים?';
const STAT = { new: ['', 'לא מולא'], draft: ['warn', 'טיוטה'], done: ['ok', 'הושלם'] };

// ---------- נתונים (עם מטמון לעבודה בלי קליטה) ----------
async function fetchSites() {
  try {
    const { data, error } = await sb.from('sites')
      .select('id,slug,name,subtitle,cover_path,contact_name,contact_phone,group_word,classification,kind,lead_group,lead_stage,visit_date,lead_owner,service,merged_into,monday_spec_item_id,lat,lng,buildings(id,specs(status,days_expected)),projects(status_label,monday_group,closed_summary)')
      .eq('is_active', true).order('name');
    if (error) throw error;
    await cache.set('sites', data); return data;
  } catch { return (await cache.get('sites')) || []; }
}
const SITE_FULL = '*,buildings(*,plan_images(*),specs(*))';   // כולל sites.service — מה מוצג בטופס
const prepSite = data => { data.buildings.sort((a, b) => a.sort - b.sort);
  data.buildings.forEach(b => { b.plan_images.sort((x, y) => x.sort - y.sort); b.spec = b.specs?.[0] || b.specs || null; }); return data; };
async function fetchSite(slug) {
  try {
    const { data, error } = await sb.from('sites').select(SITE_FULL).eq(/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(slug) ? 'id' : 'slug', slug).single();   // קישור לפי מזהה (שולחן ניהול, Ctrl+K) עובד גם הוא
    if (error) throw error;
    prepSite(data); await cache.set('site:' + slug, data); return data;
  } catch { return await cache.get('site:' + slug); }
}
// עבודה בלי קליטה: פרטי הלידים שלפני סיור נשמרים בטלפון מראש (שאילתה אחת, אותו מטמון של fetchSite)
async function prefetchSites(slugs) {
  if (!navigator.onLine || !slugs.length) return;
  try {
    const { data, error } = await sb.from('sites').select(SITE_FULL).in('slug', slugs);
    if (error) throw error;
    for (const x of data || []) await cache.set('site:' + x.slug, prepSite(x));
  } catch { /* בלי קליטה — נשאר מה שיש */ }
}

// ---------- רשימת אפיונים: כל ליד ממאנדי + אתרים מרובי מבנים ----------
export async function renderSites(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1>אפיונים</h1></header>
    <input type="search" class="search" id="sq" placeholder="חיפוש ליד, לקוח או אתר"><div id="sl" class="stack lg"><div class="skel"></div><div class="skel"></div></div>`;
  const sites = await fetchSites();
  const urls = await signedUrls('plans', sites.map(s => s.cover_path).filter(Boolean));
  const st = s => { const n = s.buildings.length, done = s.buildings.filter(b => (b.specs?.[0] || b.specs)?.status === 'done').length, draft = s.buildings.some(b => (b.specs?.[0] || b.specs)?.status === 'draft'); return { n, done, draft }; };
  const row = s => { const { n, done, draft } = st(s); const lead = s.kind === 'lead';
    const sub = lead ? [s.visit_date ? 'סיור ' + dm(s.visit_date) : null, s.contact_name, s.lead_owner].filter(Boolean).join(' · ') : `${n} מבנים · ${done} הושלמו`;
    return `<button class="item" data-s="${esc(s.slug)}" data-one="${lead && n === 1 ? s.buildings[0].id : ''}" data-q="${esc(s.name + ' ' + (s.contact_name || ''))}">${s.cover_path ? `<img src="${esc(urls[s.cover_path])}" alt="">` : ''}
      <span class="t"><b>${esc(s.name)}</b><small>${esc(sub)}</small>${!lead ? `<span class="progress"><i style="width:${n ? Math.round(done / n * 100) : 0}%"></i></span>` : ''}</span>
      ${lead ? (done === n && n ? '<span class="pill ok">בוצע</span>' : draft || done ? '<span class="pill warn">בתהליך</span>' : `<span class="chev">${icon('chev', 18)}</span>`) : `<span class="pill ${done === n && n ? 'ok' : done ? 'warn' : ''}">${done}/${n}</span>`}</button>`; };
  // תיקייה לכל אתר/ליד, בשלוש קבוצות ברורות במקום שלבי מאנדי: לסיור · הושלם · ארכיון (סגור)
  // השלב נקבע מהעובדות באפליקציה קודם (מה אופיין, האם יש פרויקט), ורק אחר כך מהקבוצה במאנדי. null = לא מוצג
  const closedP = x => x.monday_group === 'group_mm5052gw' || /^הסתיים|שולם/.test(x.status_label || '') || x.closed_summary;
  const STAGE = s => {
    if (s.merged_into) return null;                                    // ליד ששויך לאתר קיים — מוצג רק האתר
    const { n, done } = st(s), P = s.projects || [];
    if (P.length && P.every(closedP)) return 'arch';                  // כל הפרויקטים באתר הסתיימו
    if (!n) return P.length ? 'arch' : null;                           // אתר פרויקט בלי מבנים — אין מה לאפיין
    if (s.kind !== 'lead') return done === n || (done && (P.length || s.monday_spec_item_id)) ? 'done' : 'open';
    const g = s.lead_group || '';
    if (/הצעה נשלחה|לא אושרה|הומרו/.test(g)) return 'arch';
    if (done === n || /אפיון בוצע|קבלן משנה|פיילוט/.test(g)) return 'done';
    return /לידים חדשים/.test(g) && !s.visit_date && !draft(s) ? 'new' : 'open'; };   // ליד חדש בלי סיור — לא "לסיור" עדיין
  const draft = s => s.buildings.some(b => (b.specs?.[0] || b.specs)?.status === 'draft');
  const GROUPS = [['open', 'לסיור ואפיון'], ['done', 'אפיון הושלם'], ['new', 'לידים חדשים'], ['arch', 'ארכיון']];
  // תאריך הסיור כתווית: היום / מחר / עבר בלי אפיון
  const today = new Date().toLocaleDateString('en-CA'), tmrw = new Date(Date.now() + 864e5).toLocaleDateString('en-CA');
  const visitPill = d => !d ? null : d === today ? ['סיור היום', 'ok'] : d === tmrw ? ['סיור מחר', 'ok'] : d < today ? ['סיור עבר', 'warn'] : ['סיור ' + dm(d), ''];
  const folder = (s, k) => { const { n, done, draft } = st(s), lead = s.kind === 'lead';
    const vp = k === 'open' && lead && !done && !draft ? visitPill(s.visit_date) : null;
    // בתהליך → ישר לטופס; הושלם → סיכום האתר
    return { href: lead && n === 1 && !done ? `#/b/${s.slug}/${s.buildings[0].id}` : '#/site/' + s.slug, img: coverFor(s, s.cover_path && urls[s.cover_path]), title: s.name,
      sub: lead ? [s.contact_name, s.service].filter(Boolean).join(' · ') : `${n} מבנים`,
      pill: vp ? vp[0] : n > 1 ? `${done}/${n}` : (done === n && n) || k === 'done' ? 'בוצע' : draft || done ? 'בתהליך' : '',
      tone: vp ? vp[1] : (done === n && n) || k === 'done' ? 'ok' : done || draft ? 'warn' : '' }; };
  const draw = q => {
    const list = sites.filter(s => !q || (s.name + ' ' + (s.contact_name || '')).includes(q));
    $('#sl').innerHTML = GROUPS.map(([k, t]) => { const g = list.filter(s => STAGE(s) === k); if (!g.length) return '';
      // לסיור: בתהליך קודם, אחר כך לפי תאריך הסיור הקרוב (סיורים שעברו בסוף הרשימה של המתוזמנים)
      if (k === 'open') { const key = s => draft(s) ? '0' : !s.visit_date ? '3' : s.visit_date >= today ? '1' + s.visit_date : '2' + s.visit_date; g.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0); }
      const body = folderGrid(g.map(x => folder(x, k)));
      return (k === 'arch' || k === 'new') && !q ? `<details class="fold"><summary><span class="sh">${t}</span><span class="count">${g.length}</span></summary>${body}</details>`
        : `<section class="stack"><div class="sh-row"><h3 class="sh">${t}</h3><span class="count">${g.length}</span></div>${body}</section>`; }).join('')
      || `<div class="empty-line">לא נמצא</div>`;
  };
  $('#sq').oninput = e => draw(e.target.value.trim());
  draw('');
  // הקרובים לסיור קודם (עם תאריך סיור), עד 15
  const near = sites.filter(s => s.kind === 'lead' && STAGE(s) === 'open').sort((a, b) => (a.visit_date || '9') < (b.visit_date || '9') ? -1 : 1).slice(0, 15);
  setTimeout(() => prefetchSites(near.map(s => s.slug)), 1200);
}


// ---------- מיקום האתר (כפתור אחד לאתר) — לתחזית ולמתכנן השמש בביצוע ----------
// ---------- מפת אתר (תצ״א / מפת מתחם): אחת לאתר, בראש העמוד ----------
const siteMapHtml = s => (s.map_path || can('specs')) ? `<div class="card sitemap" id="sitemap"><div class="skel"></div></div>` : '';
async function bindSiteMap(s, after) {
  const box = $('#sitemap'); if (!box) return;
  const url = s.map_path ? (await signedUrls('plans', [s.map_path]))[s.map_path] : '';
  box.innerHTML = url ? `<button class="smimg" type="button"><img src="${esc(url)}" alt="מפת האתר"></button><div class="row"><b class="grow">מפת האתר</b>${can('specs') ? '<label class="chip">החלפה<input type="file" accept="image/*" hidden></label>' : ''}</div>`
    : `<label class="row addmap"><span class="mic">${icon('pin', 19)}</span><span class="grow"><b>מפת האתר</b></span><span class="chip">העלאה</span><input type="file" accept="image/*" hidden></label>`;
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
    } catch (e) { toast(errText(e, 'ההעלאה נכשלה — נסו שוב')); }
  };
}

// ---------- כלי אתר בשורה אחת: מפה · ניווט ותחזית · מחיר. כל אחד נפתח בלחיצה — לא תופס את המסך ----------
function siteTools(s, opts = {}) {
  const t = [];
  t.push(`<button class="stile" type="button" data-st="map">${s.map_path ? '<span class="stimg" id="stmap"></span>' : `<span class="mic">${icon('photo', 19)}</span>`}<b>מפת האתר</b>${s.map_path ? '' : '<small>אין עדיין · העלאה</small>'}</button>`);
  t.push(`<button class="stile ${s.lat ? '' : 'todo'}" type="button" data-st="loc"><span class="mic ${s.lat ? 'ok' : ''}">${icon('pin', 19)}</span><b>${s.lat ? 'ניווט ותחזית' : 'שמירת מיקום'}</b>${s.lat ? '<small>Waze · Maps · 4 ימים</small>' : ''}</button>`);
  if (isManager()) t.push(`<button class="stile" type="button" data-st="task"><span class="mic">${icon('send', 19)}</span><b>משימה לצוות</b><small>${s.contact_name ? 'ליצור קשר עם ' + esc(s.contact_name.split(' ')[0]) : 'מעקב על הליד'}</small></button>`);
  if (isManager() && s.kind === 'lead') t.push(`<button class="stile" type="button" data-st="merge"><span class="mic">${icon('folder', 19)}</span><b>שיוך לאתר קיים</b></button>`);
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
    // ליד שכבר אופיין כאתר (או שיש לו פרויקט) — מאחדים לרשומה אחת: הליד יוצא מהרשימות והאפיון מתקשר אליו במאנדי
    if (k === 'merge') {
      const { data: all } = await sb.from('sites').select('id,slug,name,kind,buildings(id)').neq('kind', 'lead').eq('is_active', true).order('name');
      const words = s.name.split(/[\s—–\-,()]+/).filter(w => w.length > 2);
      const score = x => words.filter(w => x.name.includes(w)).length;
      const list = (all || []).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
      return sheet(`<h3 class="sh">שיוך ${esc(s.name)}</h3><input type="search" class="search" id="mq" placeholder="חיפוש אתר">
        <div class="list" id="ml">${list.map(x => `<button class="lrow" data-to="${x.id}" data-slug="${esc(x.slug)}" data-n="${esc(x.name)}"><span class="grow"><b>${esc(x.name)}</b><small>${(x.buildings || []).length} מבנים</small></span></button>`).join('')}</div>`, (sh, close) => {
        $('#mq', sh).oninput = e => $$('[data-n]', sh).forEach(r => r.hidden = e.target.value && !r.dataset.n.includes(e.target.value.trim()));
        $$('[data-to]', sh).forEach(r => r.onclick = async () => {
          if (!(await confirmBox(`לאחד את הליד עם "${r.dataset.n}"?`, { ok: 'איחוד' }))) return;
          r.disabled = true; const { error } = await sb.rpc('merge_lead', { lead: s.id, target: r.dataset.to });
          if (error) { r.disabled = false; return toast(errText(error, 'האיחוד נכשל — נסו שוב')); }
          close(); toast('אוחד — הליד יתעדכן במאנדי'); location.hash = '#/site/' + r.dataset.slug; });
      });
    }
    if (k === 'task') return (await import('./tasks.js')).newTask({ site: s, title: s.kind === 'lead' ? `ליצור קשר${s.contact_name ? ' עם ' + s.contact_name : ''} ולתאם פגישת אפיון` : '' });
    if (k === 'price') sheet(`<div class="card" id="price"></div><button class="btn ghost block" data-close>סגירה</button>`, () => priceCard(s, opts.days));
  });
}

function siteLocHtml(s) {
  return `<div class="card siteloc" id="siteloc">${s.lat ? `<div class="row"><span class="mic ok">${icon('pin', 19)}</span><span class="grow"><b>מיקום האתר נשמר</b><small class="muted">${s.geo_source === 'manual' ? 'נשמר בשטח' : s.geo_source === 'map' ? 'ננעץ במפה' : 'משוער'}${s.geo_at ? ' · ' + new Date(s.geo_at).toLocaleDateString('he-IL') : ''} · <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">מפה</a></small></span><button class="chip" id="locset">עדכון</button></div>${navButtons(s.lat, s.lng)}<div id="wx3" class="wx3"></div>`
    : `<div class="row"><span class="mic">${icon('pin', 19)}</span><span class="grow"><b>שמירת מיקום האתר</b></span></div>
      <div class="row-btns"><button class="btn primary" id="locset">אני באתר</button><button class="btn ghost" id="locmap">${icon('pin', 16)} מהמפה</button></div>`}${s.lat ? '<button class="more" type="button" id="locmap">תיקון במפה</button>' : ''}${airBtn('sm')}</div>`;
}
function bindSiteLoc(s) {
  const redraw = () => { const c = $('#siteloc'); if (c) { c.outerHTML = siteLocHtml(s); bindSiteLoc(s); } };
  const mb = $('#locmap'); if (mb) mb.onclick = () => pickOnMap(s, redraw);
  const b = $('#locset'); if (!b) { if (s.lat) wx3(s); return; }
  b.onclick = () => {
    if (!navigator.geolocation) return toast('הטלפון לא תומך במיקום');
    b.disabled = true; b.textContent = 'מאתר…';
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: la, longitude: ln, accuracy } = pos.coords;
      if (accuracy > 300) toast(`דיוק נמוך (${Math.round(accuracy)} מ׳) — כדאי לנסות בחוץ`, 3500);
      const { error } = await sb.rpc('set_site_location', { s: s.id, la, ln, acc: Math.round(accuracy) });
      if (error) { b.disabled = false; b.textContent = 'שמירה'; return toast(errText(error, 'המיקום לא נשמר — נסו שוב')); }
      Object.assign(s, { lat: la, lng: ln, geo_source: 'manual', geo_at: new Date().toISOString() }); toast('מיקום האתר נשמר'); redraw();
    }, () => { b.disabled = false; b.textContent = 'שמירה'; toast('לא התקבלה הרשאת מיקום'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  if (s.lat) wx3(s);
}
// נעיצת מיקום במפה: חיפוש כתובת, מפה/לוויין, לחיצה או גרירה של הסיכה
async function loadLeaflet() {
  if (window.L) return window.L;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
  await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
  return window.L;
}
async function pickOnMap(s, done) {
  if (!navigator.onLine) return toast('המפה דורשת קליטה');
  let L; try { L = await loadLeaflet(); } catch { return toast('המפה לא נטענה — נסו שוב'); }
  sheet(`<h3>מיקום ${esc(s.name)}</h3>
    <div class="row"><input type="search" id="mq" class="grow" placeholder="חיפוש כתובת או מקום" value="${esc(s.address || '')}"><button class="btn ghost sm" id="mqs">חיפוש</button></div>
    <div id="mres" class="list"></div>
    <div id="mapbox" class="mapbox"></div>
    <div class="row"><span class="grow"></span><button class="chip sm" id="msat">לוויין</button></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="msave" disabled>שמירת המיקום</button></div>`, (sh, close) => {
    const start = s.lat ? [s.lat, s.lng] : [31.6, 34.9];
    const map = L.map($('#mapbox', sh), { zoomControl: true }).setView(start, s.lat ? 17 : 8);
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
    let mk = null, pos = null;
    const put = ll => { pos = ll; if (mk) mk.setLatLng(ll); else { mk = L.marker(ll, { draggable: true }).addTo(map); mk.on('dragend', () => { pos = mk.getLatLng(); }); } $('#msave', sh).disabled = false; };
    if (s.lat) put(L.latLng(s.lat, s.lng));
    map.on('click', e => put(e.latlng));
    setTimeout(() => map.invalidateSize(), 250);
    $('#msat', sh).onclick = () => { if (map.hasLayer(sat)) { map.removeLayer(sat); osm.addTo(map); $('#msat', sh).textContent = 'לוויין'; } else { map.removeLayer(osm); sat.addTo(map); $('#msat', sh).textContent = 'מפה'; } };
    const find = async () => {
      const q = $('#mq', sh).value.trim(); if (!q) return;
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`)).json();
        $('#mres', sh).innerHTML = r.length ? r.map((x, i) => `<button class="lrow" data-r="${i}"><span class="grow small">${esc(x.display_name)}</span></button>`).join('') : '<div class="empty-line">לא נמצא</div>';
        $$('[data-r]', sh).forEach(b => b.onclick = () => { const x = r[+b.dataset.r]; const ll = L.latLng(+x.lat, +x.lon); map.setView(ll, 18); put(ll); $('#mres', sh).innerHTML = ''; });
      } catch { toast('החיפוש לא זמין כרגע — נעצו ידנית'); }
    };
    $('#mqs', sh).onclick = find; $('#mq', sh).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
    $('#msave', sh).onclick = async () => {
      if (!pos || $('#msave', sh).disabled) return; $('#msave', sh).disabled = true;
      const { error } = await sb.rpc('set_site_location', { s: s.id, la: pos.lat, ln: pos.lng, acc: null, src: 'map' });
      if (error) { $('#msave', sh).disabled = false; return toast(errText(error, 'המיקום לא נשמר — נסו שוב')); }
      Object.assign(s, { lat: pos.lat, lng: pos.lng, geo_source: 'map', geo_at: new Date().toISOString() }); close(); toast('מיקום האתר נשמר'); done();
    };
  });
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
const BASE = [31.2524, 34.7908]; // ב״ש
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
  if (!days) { box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">חסרים ימי עבודה</small></span></div>`; return; }
  if (!s.lat) { box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">חסר מיקום אתר</small></span></div>`; return; }
  const d = await roadKm(s.lat, s.lng);
  let m = Math.round(P.margin <= 1 ? P.margin * 100 : P.margin);
  const draw = () => {
    const e = estimate(P, days, d.km, m);
    box.innerHTML = `<div class="row"><span class="mic">${icon('cash', 19)}</span><span class="grow"><b>הערכת מחיר</b><small class="muted">${nf(days)} ימים · ${Math.round(d.km)} ק״מ מב״ש${d.est ? ' (משוער)' : ''}${e.far ? ' · כולל לינה' : ''}</small></span></div>
      <div class="kpis"><div class="kpi"><b>₪${nf(Math.round(e.price))}</b><span>מחיר לפני מע״מ</span></div><div class="kpi"><b>₪${nf(Math.round(e.cost))}</b><span>עלות מלאה</span></div><div class="kpi"><b>₪${nf(Math.round(e.price / days))}</b><span>ליום</span></div></div>
      <div class="row pmargin"><small class="grow muted">מרווח</small><div class="stepper"><button type="button" data-m="-5">−</button><b class="sval">${m}%</b><button type="button" data-m="5">+</button></div></div>
      <small class="muted">יום ₪${nf(Math.round(e.daily))} · נסיעה${e.far ? '+לינה' : ''} ₪${nf(Math.round(e.travel))}</small>`;
    $$('[data-m]', box).forEach(b => b.onclick = () => { m = Math.min(80, Math.max(0, m + Number(b.dataset.m))); draw(); });
  };
  draw();
}

// ---------- אתר: מבנים + צ׳אט ----------
export async function renderSite(el, slug, tab = 'b') {
  el.innerHTML = `<div class="skel"></div>`;
  const s = await fetchSite(slug);
  if (!s) { el.innerHTML = `<header class="phead">${backBtn('#/specs')}<h1 class="grow">אפיונים</h1></header><div class="empty-line">האתר לא נמצא</div>`; return; }
  const n = s.buildings.length, done = s.buildings.filter(b => b.spec?.status === 'done').length;
  const days = s.buildings.reduce((t, b) => t + Number(b.spec?.days_expected || 0), 0);
  const thumbs = await signedUrls('plans', s.buildings.map(b => b.plan_images[0]?.storage_path).filter(Boolean));
  el.innerHTML = `<header class="phead">${backBtn('#/specs')}<h1 class="grow">${esc(s.name)}</h1>${s.classification === 'restricted' ? '<span class="pill warn">אתר מוגבל</span>' : ''}</header>
    <div id="sctc"></div>
    ${siteTools(s, { price: true, days: Math.ceil(days - 1e-3) })}
    <div class="kpis"><div class="kpi"><b>${done}/${n}</b><span>מבנים הושלמו</span></div><div class="kpi"><b>${days ? nf(Math.ceil(days - 1e-3)) : '—'}</b><span>ימי עבודה${days % 1 ? ` (${nf(days)} עוגל)` : ''}</span></div>
      ${(a => a ? `<div class="kpi"><b>${nf(a)}</b><span>מ״ר לפי התכנית</span></div>` : `<div class="kpi"><b>${s.buildings.length - done}</b><span>נשארו לאפיון</span></div>`)(s.buildings.reduce((t, b) => t + Number(b.facade_area_m2 || 0), 0))}</div>
    <div class="sigline" id="sig"></div>
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === 'b'}" data-t="b">מבנים</button><button role="tab" aria-selected="${tab === 'c'}" data-t="c">צ׳אט אפיון</button></div>
    <div id="tabbody"></div>`;
  bindCopy(el); bindSiteTools(s, { days: Math.ceil(days - 1e-3) });
  import('../lib/contacts.js').then(async m => { await m.renderContacts($('#sctc'), { siteId: s.id, clientId: s.client_id, org: s.name, empty: s.contact_name || s.contact_phone ? contactCard(s.contact_name, s.contact_phone) : '' }); const c = $('#sctc'); if (c) bindCopy(c); });
  import('../lib/audit.js').then(m => m.signature($('#sig'), { site_id: s.id }));
  $$('.tabs button', el).forEach(b => b.onclick = () => replaceHash(`#/site/${slug}${b.dataset.t === 'c' ? '/chat' : ''}`));
  const body = $('#tabbody');
  if (tab === 'c') { const { renderChat } = await import('./chat.js'); return renderChat(body, { site: s }); }
  const groups = [...new Set(s.buildings.map(b => b.group_label || ''))];
  body.innerHTML = groups.map(g => `${g ? `<h3 class="sh">${esc(s.group_word)} ${esc(g)}</h3>` : ''}<div class="list">${
    s.buildings.filter(b => (b.group_label || '') === g).map(b => {
      const [c, t] = STAT[b.spec?.status || 'new'];
      const meta = [b.facade_area_m2 ? nf(b.facade_area_m2) + ' מ״ר' : null, b.floors ? nf(b.floors) + ' קומות' : null, b.spec?.days_expected ? nf(b.spec.days_expected) + ' ימים' : null].filter(Boolean).join(' · ');
      const th = b.plan_images[0] && thumbs[b.plan_images[0].storage_path];
      return `<button class="item" data-b="${b.id}">${th ? `<img src="${esc(th)}" alt="">` : ''}<span class="t"><b>${esc(b.name)}</b><small>${esc(b.subtitle ? b.subtitle + ' · ' : '')}${meta}</small></span><span class="pill ${c}">${t}</span></button>`;
    }).join('')}</div>`).join('');
  body.insertAdjacentHTML('beforeend', `<button class="btn ghost block addb" id="addb">${icon('plus', 18)} הוספת מבנה</button>`);
  // פעולה אחת ברורה: המבנה הבא לאפיון (טיוטה קודם, אחר כך לפי הסדר)
  const nxt = can('specs') && (s.buildings.find(b => b.spec?.status === 'draft') || s.buildings.find(b => b.spec?.status !== 'done'));
  if (nxt) body.insertAdjacentHTML('afterbegin', `<a class="btn primary block" href="#/b/${esc(slug)}/${nxt.id}">${nxt.spec?.status === 'draft' ? 'המשך אפיון' : 'אפיון'} · ${esc(nxt.name)}</a>`);
  $('#addb').onclick = async () => { const n = await ask('שם המבנה', { placeholder: 'למשל: בניין B, אגף מזרחי', ok: 'הוספת מבנה' }); if (!n || $('#addb').disabled) return; $('#addb').disabled = true;
    const { data, error } = await sb.rpc('add_building', { s: s.id, n }); if (error) { $('#addb').disabled = false; return toast(errText(error, 'המבנה לא נוסף — נסו שוב')); } location.hash = `#/b/${slug}/${data}`; };
  $$('[data-b]', body).forEach(b => b.onclick = () => location.hash = `#/b/${slug}/${b.dataset.b}`);
}

// ---------- טופס אפיון ----------
export async function renderBuilding(el, slug, bid) {
  const s = await fetchSite(slug); const b = s?.buildings.find(x => x.id === bid);
  if (!b) { el.innerHTML = `<header class="phead">${backBtn(s ? '#/site/' + slug : '#/specs')}<h1 class="grow">אפיון</h1></header><div class="empty-line">המבנה לא נמצא</div>`; return; }
  const spec = b.spec; let form = { ...spec, floors: spec.floors ?? (b.floors != null ? Math.round(b.floors) : null) }; let dirty = false;
  const editable = can('specs');
  // שטח ולוגיסטיקה: מה שסומן פעם כ"הידרנטים"/"מקור חשמל" ממלא מראש את הבחירה החדשה
  // מבנה נוסף באותו אתר: המים/הגישה/התיאומים בדרך כלל זהים — ממלאים מהמבנה שכבר אופיין
  const sib = !Object.keys(spec.site_ops || {}).length && s.buildings.map(x => x.spec?.site_ops).find(o => o && Object.keys(o).length);
  const OPS = form.site_ops = { ...(spec.site_ops || {}), ...(sib && editable ? sib : {}) };
  if (!OPS.water && spec.hydrants) OPS.water = 'הידרנט';
  if (!OPS.power && spec.power) OPS.power = 'שקע באתר';
  OPS.permits = [...(OPS.permits || [])]; OPS.hazards = [...(OPS.hazards || [])];
  if (form.method == null && !/מידול|מיפוי/.test(s.service || '')) form.method = 'רחפן';
  if (form.work_window == null) form.work_window = 'רגיל';
  // מה רלוונטי לפי השירות באתר: מידול ומיפוי — בלי שדות שטיפה; פנלים/יריעות — בלי ספירה לפי חזיתות
  const svc = s.service || '', WASH = !/מידול|מיפוי/.test(svc);
  // ברירת מחדל לחומר — רק כשהשדה ריק (בחירה של הסוקר לא נדרסת)
  if (editable && WASH && form.material == null && !/פנלים|סולאר/.test(svc)) form.material = MAT_DEF;   // נשמר עם השינוי הראשון / סיום — פתיחה בלבד לא הופכת לטיוטה
  const plans = await signedUrls('plans', b.plan_images.map(p => p.storage_path));
  const chips = (k, opts) => `<div class="chips">${opts.map(o => `<button type="button" class="chip" data-g="${k}" data-v="${esc(o)}" aria-pressed="${form[k] === o}">${esc(o)}</button>`).join('')}</div>`;
  const [sc, st] = STAT[spec.status];
  // חזיתות לספירת ימים: גיליונות "חזית …" מהתכנית; אם אין — 4 כיווני מצפן. הכיוון נגזר מהשם (לתכנון לפי השמש)
  const dirOf = t => FACES.find(f => String(t || '').includes(f)) || null;
  const imgs = b.plan_images.filter(p => /חזית/.test(p.title || ''));
  const FAC = imgs.length ? imgs.map(p => ({ id: p.id, title: p.title, dir: dirOf(p.title), img: true })) : FACES.map(f => ({ id: f, title: 'חזית ' + f, dir: f }));
  const FD = new Map((Array.isArray(spec.facade_days) ? spec.facade_days : []).map(x => [x.k, { ...x }]));  // k → {k,t,dir,d}
  const fget = k => FD.get(k)?.d || 0;
  const FACON = !/פנלים|סולאר|יריעות|הצללה/.test(svc) || [...FD.values()].some(x => x.d > 0);
  const titleOf = k => FAC.find(f => f.id === k)?.title || (FACES.includes(k) ? 'חזית ' + k : 'חזית מצילום');
  const dirOfKey = k => FAC.find(f => f.id === k)?.dir || FD.get(k)?.dir || (FACES.includes(k) ? k : null);
  const counter = k => `<div class="fcount${fget(k) ? ' set' : ''}" data-fk="${esc(k)}"><button type="button" data-d="-0.5" aria-label="פחות">−</button><b>${fmtD(fget(k))}</b><button type="button" data-d="0.5" aria-label="יותר">+</button></div>`;
  const dirChips = k => `<div class="fdir" data-fk="${esc(k)}">${FACES.map(f => `<button type="button" data-v="${f}" aria-pressed="${FD.get(k)?.dir === f}">${f}</button>`).join('')}</div>`;
  const one = s.kind === 'lead' && s.buildings.length === 1;
  // ברירות מחדל מההיקף בליד: "מבנים A+B+C" / "3 מבנים" → יצירת המבנים בלחיצה; "15 קומות" → מילוי מראש (לא נשמר עד שמירה)
  const scope = one ? String(s.scope_text || '') : '';
  const bl = scope.match(/(?:מבנים|בניינים)\s*:?\s*([A-Za-zא-ת0-9]{1,2}(?![A-Za-zא-ת0-9])(?:\s*[+,\/&]\s*[A-Za-zא-ת0-9]{1,2}(?![A-Za-zא-ת0-9]))+)/);
  const bn = +(scope.match(/(\d{1,2})\s*(?:מבנים|בניינים)/)?.[1] || 0);
  // "מבנים A+B, 12 קומות" — המספר שאחריו "קומות" אינו מבנה
  const NAMES = bl ? bl[1].split(/\s*[+,\/&]\s*/).map(x => x.trim()).filter(x => !new RegExp(`(^|[^\\w])${x}\\s*קומות`).test(scope)).map(x => 'מבנה ' + x) : bn >= 2 && bn <= 30 ? Array.from({ length: bn }, (_, i) => 'מבנה ' + (i + 1)) : [];
  const fl0 = +(scope.match(/(\d{1,3})\s*קומות/)?.[1] || 0);
  if (editable && form.floors == null && fl0 > 0 && fl0 <= 200) { form.floors = fl0; dirty = true; }
  const ctx = [one ? null : s.name + (b.group_label ? ' · ' + s.group_word + ' ' + b.group_label : ''), b.subtitle].filter(Boolean).join(' · ');
  el.innerHTML = `<header class="phead"><a class="back" id="bk" data-hard="1" href="javascript:void 0" aria-label="חזרה ל${esc(s.name)}">${icon('back', 20)}</a><h1 class="grow">${esc(one ? s.name : b.name)}</h1><span class="pill ${sc}" id="stp">${st}</span></header>
    ${ctx ? `<div class="muted">${esc(ctx)}</div>` : ''}
    ${editable ? '<div class="ready" id="ready"></div>' : ''}
    ${s.kind === 'lead' ? `<div class="menu">${[['שלב', s.lead_stage], ['היקף', noMoney(s.scope_text)], ['אחראי', s.lead_owner], ['תאריך סיור', s.visit_date ? dm(s.visit_date) : null], ['הערות מהליד', noMoney(s.lead_notes)]].filter(x => x[1]).map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${esc(v)}</b></span></div>`).join('')}
      ${NAMES.length > 1 && editable ? `<button class="lrow" type="button" id="splitb"><span class="grow"><b>יצירת ${NAMES.length} מבנים</b><small>${esc(NAMES.join(' · '))}</small></span><span class="chev">${icon('plus', 18)}</span></button>` : ''}
      <a class="lrow" href="#/site/${esc(slug)}"><span class="grow"><b>${s.buildings.length > 1 ? `כל המבנים בליד (${s.buildings.length})` : 'הוספת מבנה'}</b></span><span class="chev">${icon('chev', 18)}</span></a></div>` : !b.facade_area_m2 && b.plan_source !== 'plans' ? '' : `
    <div class="kpis"><div class="kpi"><b>${b.facade_area_m2 ? nf(b.facade_area_m2) : 'למדידה'}</b><span>${b.facade_area_m2 ? 'מ״ר לפי התכנית' : 'שטח חזיתות'}</span></div>
      <div class="kpi"><b>${b.floors ? nf(b.floors) : '—'}</b><span>קומות</span></div><div class="kpi"><b>${b.plan_source === 'plans' ? b.plan_images.length : 'סקיצה'}</b><span>${b.plan_source === 'plans' ? 'חזיתות בתכנית' : 'מקור'}</span></div></div>`}
    <div class="sigline" id="sig"></div>
    ${b.office_note ? `<div class="note">${esc(b.office_note)}</div>` : ''}
    ${contactCard(s.contact_name, s.contact_phone)}
    ${s.kind === 'lead' && s.buildings.length === 1 ? siteTools(s) : ''}
    ${b.plan_images.length ? `<h3 class="sh">${b.plan_source === 'plans' ? 'החזיתות מהתכנית' : 'מיקום בסקיצה'}</h3>
      <div class="facades">${b.plan_images.map((p, i) => `<div class="fc"><button class="fcimg" data-i="${i}"><img loading="lazy" src="${esc(plans[p.storage_path])}" alt="${esc(p.title)}"></button><div><b>${esc(p.title)}</b>${esc(p.dims_text || '')}${p.area_m2 ? ' · ' + nf(p.area_m2) + ' מ״ר' : ''}</div>${FAC.some(f => f.id === p.id) ? counter(p.id) : ''}</div>`).join('')}</div>` : ''}
    ${!imgs.length && FACON ? `<h3 class="sh">ימים לפי חזית</h3>
      <div class="facades" id="facs"></div>` : ''}
    <fieldset class="fset" ${editable ? '' : 'disabled'}>
    <div class="sec"><h3>הערכת ביצוע</h3>
      <div class="field">קומות במבנה
        <div class="stepper"><button type="button" id="fm" aria-label="פחות קומות">−</button><input class="days grow" id="floors" type="number" inputmode="numeric" step="1" min="0" max="200" value="${esc(form.floors ?? '')}"><button type="button" id="fp" aria-label="יותר קומות">+</button></div></div>
      ${'area_m2' in spec && (!b.facade_area_m2 || spec.area_m2 != null) ? `<label class="field" for="area">שטח חזיתות (מ״ר)<input id="area" type="number" inputmode="decimal" step="1" min="0" value="${esc(form.area_m2 ?? '')}"></label>` : ''}
      <div class="field">ימי עבודה צפויים למבנה<small id="dsrc"></small>
        <div class="stepper"><button type="button" id="dm">−</button><input class="days grow" id="days" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(form.days_expected ?? '')}"><button type="button" id="dp">+</button></div></div>
      <div class="small muted" id="rate"></div>
      <div class="field">שעות עבודה באתר ${chips('work_window', WINDOW)}</div>
      <div class="field">שיטת ביצוע ${chips('method', METHOD)}</div>
      ${WASH ? `<div class="field">מתי נשטף לאחרונה ${chips('washed_last', WASHED)}</div>
      <div class="field">רמת לכלוך וצפיפות ${chips('density', DENS)}</div>
      <div class="field">חומר ניקוי ${chips('material', MAT)}
        <div class="chips"><button type="button" class="chip" id="heavy" aria-pressed="${form.material === MAT_HEAVY}">${icon('alert', 15)} עובש / לכלוך כבד</button></div></div>
      <div class="note" id="dirtNote" ${['מעל שנתיים', 'לא נשטף מעולם'].includes(form.washed_last) ? '' : 'hidden'}>לא נשטף מעל שנתיים — כדאי להוסיף ימים</div>` : ''}
    </div>
    <div class="sec" id="secops"><h3>שטח ולוגיסטיקה</h3>
      ${OPS1.map(([k, l, o]) => `<div class="field">${l}<div class="chips">${o.map(v => `<button type="button" class="chip" data-op="${k}" data-v="${esc(v)}" aria-pressed="${OPS[k] === v}">${esc(v)}</button>`).join('')}</div></div>`).join('')}
      <div class="field">לתאם מראש<div class="chips">${PERMITS.map(v => `<button type="button" class="chip" data-opm="permits" data-v="${esc(v)}" aria-pressed="${OPS.permits.includes(v)}">${esc(v)}</button>`).join('')}</div></div>
      <div class="field">סיכונים ומכשולים<div class="chips">${HAZ.map(v => `<button type="button" class="chip" data-opm="hazards" data-v="${esc(v)}" aria-pressed="${OPS.hazards.includes(v)}">${esc(v)}</button>`).join('')}</div></div>
      ${isManager() ? `<div class="field">מרחב אווירי<div class="chips">${AIR.map(v => `<button type="button" class="chip" data-op="air" data-v="${esc(v)}" aria-pressed="${OPS.air === v}">${esc(v)}</button>`).join('')}</div>${airBtn('sm')}</div>` : ''}
      <div class="field">עוד באתר
        <div class="chips">${TOGS.map(([k, l]) => `<label class="chip tchip" for="t_${k}"><input type="checkbox" id="t_${k}" ${form[k] ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
      <div id="obstBox" ${form.obstacles || OPS.hazards.length ? '' : 'hidden'} class="stack">
        <label class="field" for="obstacles_text">פירוט המכשולים<textarea id="obstacles_text" placeholder="עצים, גגונים, חניה, קווי חשמל…">${esc(form.obstacles_text || '')}</textarea></label>
        <div class="field">צילום המכשולים<div class="photos" id="ph_obstacle"></div></div>
      </div>
    </div>
    <div class="sec"><h3>תמונות והערות</h3>
      <div class="field">תמונות מהאתר<div class="photos" id="ph_site"></div></div>
      <label class="field" for="notes">הערות מיוחדות<textarea id="notes">${esc(form.notes || '')}</textarea></label>
      <label class="field" for="highlights">דגשים להצעה<textarea id="highlights" placeholder="הגבלות גישה, שעות עבודה, אזורים בעייתיים">${esc(form.highlights || '')}</textarea></label>
    </div></fieldset>
    ${editable ? '' : '<div class="empty-line">צפייה בלבד</div>'}`;
  const bar = document.createElement('div'); bar.className = 'bar';
  bar.innerHTML = editable ? `<button class="btn" id="sv">שמירה</button><button class="btn primary" id="dn">סיום אפיון</button>` : '';
  if (editable) el.appendChild(bar);

  $$('.fcimg', el).forEach(f => f.onclick = () => { const p = b.plan_images[+f.dataset.i]; zoom(plans[p.storage_path], p.title + ' · ' + (p.dims_text || '')); });
  bindCopy(el);
  // שמירה אוטומטית (כמו בתכנית): כל שינוי נשמר בתור אחרי הפסקה קצרה
  let tm = null;
  const auto = () => { clearTimeout(tm); tm = setTimeout(() => { tm = null; if (dirty && editable) save(false, true); }, 900); };
  const set = (k, v) => { form[k] = v; dirty = true; auto(); };
  const NPH = { site: 0, obstacle: 0, facade: 0 };
  // מיקום האתר נשמר לבד מהשטח (צילום / סיום) כשהדיוק טוב — בלי "אני באתר"
  const geoSilent = (wait = 0) => new Promise(res => {
    if (s.lat || !editable || !navigator.geolocation) return res(false);
    const t = wait ? setTimeout(() => res(false), wait) : 0; if (!wait) res(false);
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: la, longitude: ln, accuracy } = pos.coords;
      if (s.lat || !(accuracy < 100) || la < 29 || la > 34 || ln < 34 || ln > 36) { clearTimeout(t); return res(false); }
      await enqueue({ kind: 'rpc', fn: 'set_site_location', args: { s: s.id, la, ln, acc: Math.round(accuracy) } });
      Object.assign(s, { lat: la, lng: ln, geo_source: 'manual', geo_at: new Date().toISOString() }); await cache.set('site:' + slug, s); ready();
      clearTimeout(t); res(true);
    }, () => { clearTimeout(t); res(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  $$('.chip[data-g]', el).forEach(c => c.onclick = () => {
    const g = c.dataset.g; set(g, form[g] === c.dataset.v ? null : c.dataset.v);
    $$(`.chip[data-g="${g}"]`, el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === form[g]));
    if (g === 'washed_last') $('#dirtNote').hidden = !['מעל שנתיים', 'לא נשטף מעולם'].includes(form[g]);
    if (g === 'material' && $('#heavy')) $('#heavy').setAttribute('aria-pressed', form.material === MAT_HEAVY);
  });
  // לחיצה אחת: עובש / לכלוך כבד → Topax (ורמת לכלוך גבוהה אם לא סומנה). לחיצה שנייה מחזירה לברירת המחדל
  const hv = $('#heavy'); if (hv) hv.onclick = () => {
    const on = form.material !== MAT_HEAVY; set('material', on ? MAT_HEAVY : MAT_DEF);
    if (on && form.density == null) set('density', 'גבוהה');
    $$('.chip[data-g="material"], .chip[data-g="density"]', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === form[x.dataset.g]));
    hv.setAttribute('aria-pressed', on);
  };
  const days = $('#days');
  // בדיקת מציאות: קצב שנגזר מהמספרים של הסוקר עצמו (שטח ÷ ימים) — לא מספר מומצא
  const rate = () => { const a = Number(b.facade_area_m2 || form.area_m2), d = Number(days.value); $('#rate').textContent = a && d ? `≈ ${nf(Math.round(a / d))} מ״ר חזית ליום עבודה` : ''; ready(); };
  days.oninput = () => { set('days_expected', days.value === '' ? null : Number(days.value)); rate(); }; rate();
  // מונה ימים על כל חזית: הסה״כ למבנה = סכום החזיתות (כשסופרים לפי חזיתות, הסה״כ נעול)
  const syncTotal = (init = false) => {
    const vals = [...FD.values()].map(x => Number(x.d)).filter(v => v > 0), sum = vals.reduce((t, v) => t + v, 0);
    days.readOnly = !!vals.length; $('#dm').disabled = $('#dp').disabled = !!vals.length; $('#dsrc').textContent = vals.length ? 'סכום החזיתות' : '';
    // בפתיחת המסך רק מציגים — שמירה מסומנת רק כשהמשתמש באמת שינה משהו
    if (vals.length) { days.value = sum; if (init) form.days_expected = sum; else set('days_expected', sum); rate(); }
    const dirs = [...FD.values()].filter(x => x.d > 0).map(x => dirOfKey(x.k)).filter(Boolean);
    form.facades = vals.length && dirs.length ? [...new Set(dirs)] : null;
    // נשמר כמערך מסודר לפי סדר הכרטיסים, עם כותרת וכיוון — מנוע התכנית קורא אותו כמו שהוא
    form.facade_days = [...FD.values()].filter(x => x.d > 0 || x.dir).map(x => ({ k: x.k, t: titleOf(x.k), dir: dirOfKey(x.k), d: x.d || 0 }));
  };
  const bindFac = (root, onDir) => {
    $$('.fcount', root).forEach(c => $$('button', c).forEach(btn => btn.onclick = e => {
      e.stopPropagation(); if (!editable) return; const k = c.dataset.fk;
      const v = Math.max(0, fget(k) + Number(btn.dataset.d));
      if (v) FD.set(k, { ...(FD.get(k) || { k }), d: v }); else if (FD.has(k)) FD.get(k).d = 0;
      $('b', c).textContent = fmtD(v); c.classList.toggle('set', v > 0); dirty = true; syncTotal(); auto(); onDir?.();
    }));
    $$('.fdir', root).forEach(c => $$('button', c).forEach(btn => btn.onclick = () => {
      if (!editable) return; const k = c.dataset.fk; FD.set(k, { ...(FD.get(k) || { k, d: 0 }), dir: btn.dataset.v });
      $$('button', c).forEach(x => x.setAttribute('aria-pressed', x === btn)); dirty = true; syncTotal(); auto(); onDir?.();
    }));
  };
  bindFac(el); syncTotal(true);
  // תמונות חזית של הסוקר (כולל ממתינות בתור) + כרטיסי מצפן כשאין תמונות
  async function drawFacades() {
    const box = $('#facs'); if (!box) return;
    let rows = [];
    try { const { data } = await sb.from('photos').select('id,storage_path').eq('spec_id', spec.id).eq('kind', 'facade').order('created_at'); rows = data || []; } catch {}
    const urls = await thumbUrls('field', rows.map(r => r.storage_path));
    const pend = await pendingPhotos(m => m.spec_id === spec.id && m.kind === 'facade');
    const cards = [...rows.map(r => ({ id: r.id, src: urls[r.storage_path].t, full: urls[r.storage_path].f })), ...pend.map(p => ({ id: p.photoId, src: URL.createObjectURL(p.blob) }))];
    NPH.facade = cards.length; ready();
    // כרטיס מצפן לכל כיוון שעוד אין לו צילום — סופרים ימים גם בלי צילום לכל חזית
    const covered = () => new Set(cards.map(c => FD.get(c.id)?.dir).filter(Boolean)), cv = covered();
    const hideC = (f, cs) => cs.has(f) && !(fget(f) > 0);
    box.innerHTML = (editable ? `<label class="fc addfc">${icon('plus', 22)}<b>צילום חזית</b><input type="file" accept="image/*" capture="environment" multiple></label>` : '')
      + cards.map(c => `<div class="fc"><button class="fcimg" type="button" data-z="${esc(c.full || c.src)}"><img src="${esc(c.src)}" data-full="${esc(c.full || c.src)}" alt=""></button>${dirChips(c.id)}${counter(c.id)}</div>`).join('')
      + FACES.map(f => `<div class="fc compass" data-cf="${esc(f)}" ${hideC(f, cv) ? 'hidden' : ''}><div class="cmp">${esc(f)}</div><div><b>חזית ${esc(f)}</b></div>${counter(f)}</div>`).join('');
    $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.dataset.z, b.name));
    bindFac(box, () => { const c2 = covered(); $$('[data-cf]', box).forEach(x => x.hidden = hideC(x.dataset.cf, c2)); });
    const inp = $('input[type=file]', box);
    if (inp) inp.onchange = async () => {
      for (const f of [...inp.files]) {
        try { const blob = await shrink(f), photoId = crypto.randomUUID();
          await enqueue({ kind: 'photo', blob, photoId, path: `${state.user.id}/spec/${spec.id}/${photoId}.jpg`, meta: { spec_id: spec.id, building_id: b.id, site_id: s.id, kind: 'facade' } });
          FD.set(photoId, { k: photoId, d: 0 });
        } catch { toast('תמונה אחת לא נשמרה'); }
      }
      dirty = true; if (spec.status === 'new') form.status = 'draft'; await save(false, true); drawFacades(); geoSilent();
    };
  }
  drawFacades();
  $('#dm').onclick = () => { days.value = Math.max(0, (Number(days.value) || 0) - 0.5); days.oninput(); };
  $('#dp').onclick = () => { days.value = (Number(days.value) || 0) + 0.5; days.oninput(); };
  const fl = $('#floors');
  fl.oninput = () => set('floors', fl.value === '' ? null : Math.max(0, Math.min(200, Math.round(Number(fl.value)))));
  $('#fm').onclick = () => { fl.value = Math.max(0, (Number(fl.value) || 0) - 1); fl.oninput(); };
  $('#fp').onclick = () => { fl.value = Math.min(200, (Number(fl.value) || 0) + 1); fl.oninput(); };
  ['obstacles_text', 'notes', 'highlights'].forEach(k => $('#' + k).oninput = e => set(k, e.target.value));
  const ar = $('#area'); if (ar) ar.oninput = () => { set('area_m2', ar.value === '' ? null : Math.max(0, Number(ar.value))); rate(); };
  const spb = $('#splitb'); if (spb) spb.onclick = async () => {
    if (!navigator.onLine) return toast('יצירת מבנים דורשת קליטה');
    if (spb.disabled || !(await confirmBox(`ליצור ${NAMES.length} מבנים?`, { body: NAMES.join(' · '), ok: 'יצירת המבנים' }))) return;
    spb.disabled = true; if (dirty) await save(false, true);
    await sb.rpc('rename_building', { b: b.id, n: NAMES[0] });   // 088 — בלעדיו המבנה הקיים נשאר בשמו
    for (const n of NAMES.slice(1)) { const { error } = await sb.rpc('add_building', { s: s.id, n, fl: form.floors ?? null }); if (error) { spb.disabled = false; return toast(errText(error, 'המבנים לא נוספו — נסו שוב')); } }
    location.hash = '#/site/' + slug;
  };
  TOGS.forEach(([k]) => $('#t_' + k).onchange = e => set(k, e.target.checked));
  const opsSet = () => { form.site_ops = { ...OPS }; dirty = true; auto(); ready(); };
  $$('[data-op]', el).forEach(c => c.onclick = () => { const k = c.dataset.op; OPS[k] = OPS[k] === c.dataset.v ? null : c.dataset.v;
    $$(`[data-op="${k}"]`, el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === OPS[k])); opsSet(); });
  $$('[data-opm]', el).forEach(c => c.onclick = () => { const a = OPS[c.dataset.opm], v = c.dataset.v, i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1);
    c.setAttribute('aria-pressed', i < 0); if (c.dataset.opm === 'hazards') $('#obstBox').hidden = !a.length && !(form.obstacles_text || '').trim(); opsSet(); });
  // הקלטה קולית להערות (כשהדפדפן תומך) — מדברים, הטקסט נכנס לשדה
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && editable) ['notes', 'highlights', 'obstacles_text'].forEach(k => {
    const t = $('#' + k); if (!t) return;
    const mic = document.createElement('button'); mic.type = 'button'; mic.className = 'chip sm vmic'; mic.innerHTML = icon('M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3', 16); mic.setAttribute('aria-label', 'הקלטה');
    t.insertAdjacentElement('afterend', mic);
    mic.onclick = () => { try { const r = new SR(); r.lang = 'he-IL'; r.interimResults = false; mic.classList.add('on');
      r.onresult = e => { const x = [...e.results].map(z => z[0].transcript).join(' '); t.value = (t.value ? t.value.trimEnd() + ' ' : '') + x; t.oninput({ target: t }); };
      r.onend = () => mic.classList.remove('on'); r.onerror = () => { mic.classList.remove('on'); toast('ההקלטה לא זמינה כרגע'); }; r.start(); } catch { toast('ההקלטה לא זמינה כרגע'); } };
  });
  // מה חסר כדי לסיים — פס התקדמות קטן בראש הטופס. לחיצה = קפיצה לשדה
  function ready() {
    const box = $('#ready'); if (!box) return;
    const it = [['ph', 'תמונות', NPH.site + NPH.facade + NPH.obstacle > 0, '#facs, #ph_site'], ['d', 'ימים', Number(form.days_expected) > 0, '#days'],
      ['ops', 'שטח', !!(OPS.water && OPS.access), '#secops'], ['loc', 'מיקום', !!s.lat, '.stools']];
    const n = it.filter(x => x[2]).length;
    box.innerHTML = `<span class="rbar"><i style="width:${Math.round(n / it.length * 100)}%"></i></span>${it.map(([k, l, ok, sel]) => `<button type="button" class="rdot ${ok ? 'ok' : ''}" data-go="${sel}">${ok ? icon('check', 13) : ''}${l}</button>`).join('')}`;
    $$('[data-go]', box).forEach(x => x.onclick = () => document.querySelector(x.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // תמונות: קיימות מהשרת + ממתינות בתור
  async function drawPhotos(kind) {
    const box = $('#ph_' + kind); if (!box) return;
    let rows = [];
    try { const { data } = await sb.from('photos').select('id,storage_path').eq('spec_id', spec.id).eq('kind', kind).order('created_at'); rows = data || []; } catch {}
    const urls = await thumbUrls('field', rows.map(r => r.storage_path));
    const pend = await pendingPhotos(m => m.spec_id === spec.id && m.kind === kind);
    NPH[kind] = rows.length + pend.length; ready();
    box.innerHTML = rows.map(r => `<div class="ph"><img src="${esc(urls[r.storage_path].t)}" alt="" data-full="${esc(urls[r.storage_path].f)}" data-z="${esc(urls[r.storage_path].f)}"></div>`).join('')
      + pend.map(p => `<div class="ph"><img src="${URL.createObjectURL(p.blob)}" alt=""><span class="q">ממתין</span></div>`).join('')
      + (editable ? `<label class="addph">${icon('plus', 18)} תמונה<input type="file" accept="image/*" multiple data-k="${kind}"></label>` : '');
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
      drawPhotos(kind); geoSilent();
    };
  }
  drawPhotos('site'); drawPhotos('obstacle');

  async function save(done, quiet) {
    clearTimeout(tm); tm = null;
    const patch = {};
    ['days_expected', 'facades', 'facade_days', 'work_window', 'method', 'washed_last', 'density', 'material', 'obstacles', 'obstacles_text', 'docking', 'hydrants', 'power', 'secure_storage', 'notes', 'highlights', 'floors'].forEach(k => patch[k] = form[k] ?? null);
    // הבחירות החדשות קובעות את עמודות מאנדי הקיימות (הידרנטים / מקור חשמל / מכשולים)
    patch.site_ops = { ...OPS };
    patch.hydrants = OPS.water === 'הידרנט'; patch.power = OPS.power === 'שקע באתר';
    patch.obstacles = OPS.hazards.length > 0 || !!(form.obstacles_text || '').trim();
    ['obstacles', 'docking', 'hydrants', 'power', 'secure_storage'].forEach(k => patch[k] = !!patch[k]);
    if ('area_m2' in spec) patch.area_m2 = form.area_m2 ?? null;   // העמודה מ-088; לפני כן לא נשלחת
    patch.status = done ? 'done' : (spec.status === 'done' ? 'done' : 'draft');
    patch.surveyor_id = spec.surveyor_id || state.user.id;
    await enqueue({ kind: 'update', table: 'specs', rowId: spec.id, patch });
    Object.assign(spec, patch); b.spec = spec; if (patch.floors != null) b.floors = patch.floors; await cache.set('site:' + slug, s);
    dirty = false; const [c2, t2] = STAT[patch.status]; const p = $('#stp'); if (p) { p.className = 'pill ' + c2; p.textContent = t2; }
    if (!quiet) toast(navigator.onLine ? (done ? 'האפיון הושלם ונשמר' : 'נשמר') : 'נשמר בטלפון · יישלח כשתחזור קליטה');
  }
  if (editable) {
    $('#sv').onclick = () => save(false);
    $('#dn').onclick = async () => {
      if (!(Number(form.days_expected) > 0)) { toast('חסר: ימי עבודה צפויים (יותר מ-0)'); days.focus(); return; }
      const dn = $('#dn'); if (dn.disabled) return; dn.disabled = true;
      await geoSilent(6000);
      const miss = [!(NPH.site + NPH.facade + NPH.obstacle) && 'אין תמונות', !s.lat && 'אין מיקום'].filter(Boolean);
      if (miss.length && !(await confirmBox(miss.join(' · ') + ' — לסיים בכל זאת?', { ok: 'סיום האפיון' }))) { dn.disabled = false; return; }
      const at = Date.now(); await save(true, true); dn.disabled = false; doneSheet(at);
    };
  }
  // סיכום קצר אחרי סיום: ימים · חזיתות · מצב השליחה למאנדי
  function doneSheet(at) {
    const up = () => goUp(s.kind === 'lead' && s.buildings.length === 1 ? '#/specs' : '#/site/' + slug);
    const fac = (form.facade_days || []).filter(x => x.d > 0), dirs = [...new Set(fac.map(x => x.dir).filter(Boolean))];
    const pushed = !!s.spec_pushed_at && +new Date(s.spec_pushed_at) > at;
    const push = !navigator.onLine ? 'יישלח כשתחזור קליטה' : pushed ? 'נשלח למאנדי' : 'יישלח אוטומטית';
    // המבנה הבא שעוד לא הושלם — ממשיכים אליו בלחיצה, בלי לחזור לרשימה
    const nx = s.buildings.length > 1 ? [...s.buildings.slice(s.buildings.indexOf(b) + 1), ...s.buildings.slice(0, s.buildings.indexOf(b))].find(x => x.spec?.status !== 'done') : null;
    sheet(`<h3>האפיון הושלם</h3>
      <div class="kpis"><div class="kpi"><b>${nf(Number(form.days_expected))}</b><span>ימי עבודה</span></div>${fac.length ? `<div class="kpi"><b>${fac.length}</b><span>${dirs.length ? esc(dirs.join(' · ')) : 'חזיתות'}</span></div>` : ''}</div>
      <div class="list"><div class="lrow"><span class="mic ${pushed ? 'ok' : ''}">${icon('send', 19)}</span><span class="grow"><b>${push}</b></span></div>
        ${(p => p.length ? `<div class="lrow"><span class="mic">${icon('check', 19)}</span><span class="grow"><b>להכנה בתכנית</b><small>${esc(p.join(' · '))}</small></span></div>` : '')([OPS.water === 'מכלית' && 'מכלית מים', OPS.power === 'גנרטור' && 'גנרטור', ...OPS.permits, ['נדרש תיאום', 'מוגבל'].includes(OPS.air) && 'מרחב אווירי'].filter(Boolean))}
        ${OPS.hazards.length ? `<div class="lrow"><span class="mic">${icon('alert', 19)}</span><span class="grow"><b>סיכונים</b><small>${esc(OPS.hazards.join(' · '))}</small></span></div>` : ''}</div>
      ${nx ? `<button class="btn primary block" id="dnnx">המשך ל${esc(nx.name)}</button>` : ''}
      <button class="btn ${nx ? 'ghost' : 'primary'} block" id="dnok">סגירה</button>`, (sh, close) => { $('#dnok', sh).onclick = () => { close(); up(); };
        const n2 = $('#dnnx', sh); if (n2) n2.onclick = () => { close(); location.hash = `#/b/${slug}/${nx.id}`; }; });
  }
  bindSiteTools(s);
  import('../lib/audit.js').then(m => m.signature($('#sig'), { building_id: b.id }, { surveyor: spec.surveyor_id }));
  $('#bk').onclick = async () => { if (dirty && editable) await save(false, true); goUp(s.kind === 'lead' && s.buildings.length === 1 ? '#/specs' : '#/site/' + slug); };
  addEventListener('hashchange', function h() { if (dirty && editable) save(false, true); removeEventListener('hashchange', h); }, { once: true });
}
