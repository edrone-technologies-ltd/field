// מודול אפיונים: אתרים ← מבנים ← טופס אפיון למבנה שלם.
import { sb, state, can, cache, enqueue, signedUrls, pendingPhotos, $, $$, esc, nf, toast, zoom, contactCard, bindCopy } from '../lib/core.js';
import { shrink } from '../lib/store.js';

const WASHED = ['עד חצי שנה', 'חצי שנה עד שנה', 'שנה עד שנתיים', 'מעל שנתיים', 'לא נשטף מעולם', 'לא ידוע'];
const DENS = ['נמוכה', 'בינונית', 'גבוהה'];
const MAT = ['Assert Lemon', 'Topax', 'מים בלבד', 'אחר'];
const METHOD = ['רחפן', 'סנפלינג', 'משולב'];
const TOGS = [['obstacles', 'מכשולים בסביבה'], ['docking', 'אזורי עגינה'], ['hydrants', 'הידרנטים'], ['power', 'מקור חשמל'], ['secure_storage', 'אחסון ציוד מאובטח']];
const STAT = { new: ['', 'לא מולא'], draft: ['warn', 'טיוטה'], done: ['ok', 'הושלם'] };

// ---------- נתונים (עם מטמון לעבודה בלי קליטה) ----------
async function fetchSites() {
  try {
    const { data, error } = await sb.from('sites')
      .select('id,slug,name,subtitle,cover_path,contact_name,contact_phone,group_word,classification,buildings(id,specs(status,days_expected))')
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

// ---------- רשימת אתרים ----------
export async function renderSites(el) {
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/'">→ בית</button></div>
    <div><div class="eyebrow">אפיונים</div><h1>בחירת אתר</h1></div><div class="list" id="sl"><div class="skel"></div><div class="skel"></div></div>`;
  const sites = await fetchSites();
  const urls = await signedUrls('plans', sites.map(s => s.cover_path).filter(Boolean));
  $('#sl').innerHTML = sites.length ? sites.map(s => {
    const n = s.buildings.length, done = s.buildings.filter(b => (b.specs?.[0] || b.specs)?.status === 'done').length;
    const days = s.buildings.reduce((t, b) => t + Number((b.specs?.[0] || b.specs)?.days_expected || 0), 0);
    return `<button class="item" data-s="${esc(s.slug)}">${s.cover_path ? `<img src="${esc(urls[s.cover_path])}" alt="">` : ''}
      <span class="t"><b>${esc(s.name)}</b><small>${n} מבנים · ${done} הושלמו${days ? ` · ${nf(days)} ימי עבודה` : ''}</small>
      <span class="progress" style="margin-top:7px"><i style="width:${n ? Math.round(done / n * 100) : 0}%"></i></span></span>
      <span class="pill ${done === n && n ? 'ok' : done ? 'warn' : ''}">${done}/${n}</span></button>`;
  }).join('') : `<div class="empty">אין אתרים משויכים אליך עדיין.</div>`;
  $$('#sl .item').forEach(b => b.onclick = () => location.hash = '#/site/' + b.dataset.s);
}

// ---------- אתר: מבנים + צ'אט ----------
export async function renderSite(el, slug, tab = 'b') {
  el.innerHTML = `<div class="skel"></div>`;
  const s = await fetchSite(slug);
  if (!s) { el.innerHTML = `<div class="empty">האתר לא נמצא, או שאין לך גישה אליו.</div>`; return; }
  const n = s.buildings.length, done = s.buildings.filter(b => b.spec?.status === 'done').length;
  const days = s.buildings.reduce((t, b) => t + Number(b.spec?.days_expected || 0), 0);
  const thumbs = await signedUrls('plans', s.buildings.map(b => b.plan_images[0]?.storage_path).filter(Boolean));
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/specs'">→ כל האתרים</button><span class="grow"></span>
      ${s.classification === 'restricted' ? '<span class="pill warn">אתר מוגבל</span>' : ''}</div>
    <div><div class="eyebrow">סיור אפיון</div><h1>${esc(s.name)}</h1></div>
    ${contactCard(s.contact_name, s.contact_phone)}
    <div class="kpis"><div class="kpi"><b>${done}/${n}</b><span>מבנים הושלמו</span></div><div class="kpi"><b>${days ? nf(days) : '—'}</b><span>ימי עבודה שהוזנו</span></div>
      <div class="kpi"><b>${(a => a ? nf(a) : '—')(s.buildings.reduce((t, b) => t + Number(b.facade_area_m2 || 0), 0))}</b><span>מ"ר לפי התכנית</span></div></div>
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === 'b'}" data-t="b">מבנים</button><button role="tab" aria-selected="${tab === 'c'}" data-t="c">צ'אט פרויקט</button></div>
    <div id="tabbody"></div>`;
  bindCopy(el);
  $$('.tabs button', el).forEach(b => b.onclick = () => location.hash = `#/site/${slug}${b.dataset.t === 'c' ? '/chat' : ''}`);
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
  el.innerHTML = `<div class="top"><button class="back" id="bk">→ ${esc(s.name)}</button><span class="grow"></span><span class="pill ${sc}" id="stp">${st}</span></div>
    <div><div class="eyebrow">${esc(s.name)}${b.group_label ? ' · ' + esc(s.group_word) + ' ' + esc(b.group_label) : ''}</div><h2>${esc(b.name)}</h2>${b.subtitle ? `<div class="muted">${esc(b.subtitle)}</div>` : ''}</div>
    <div class="kpis"><div class="kpi"><b>${b.facade_area_m2 ? nf(b.facade_area_m2) : '—'}</b><span>${b.facade_area_m2 ? 'מ"ר לפי התכנית' : 'שטח: למדוד בשטח'}</span></div>
      <div class="kpi"><b>${b.floors ? nf(b.floors) : '—'}</b><span>קומות</span></div><div class="kpi"><b>${b.plan_source === 'plans' ? b.plan_images.length : 'סקיצה'}</b><span>${b.plan_source === 'plans' ? 'חזיתות בתכנית' : 'מקור'}</span></div></div>
    ${b.office_note ? `<div class="note">${esc(b.office_note)}</div>` : ''}
    ${contactCard(s.contact_name, s.contact_phone)}
    ${b.plan_images.length ? `<div><h3>${b.plan_source === 'plans' ? 'החזיתות מהתכנית' : 'מיקום בסקיצה'}</h3><div class="small muted">גוללים הצידה, לחיצה מגדילה</div></div>
      <div class="facades">${b.plan_images.map((p, i) => `<button class="fc" data-i="${i}"><img loading="lazy" src="${esc(plans[p.storage_path])}" alt="${esc(p.title)}"><div><b>${esc(p.title)}</b>${esc(p.dims_text || '')}${p.area_m2 ? ' · ' + nf(p.area_m2) + ' מ"ר' : ''}</div></button>`).join('')}</div>` : ''}
    <fieldset ${editable ? '' : 'disabled'} style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:14px">
    <div class="sec"><h3>הערכת ביצוע</h3>
      <div class="field">ימי עבודה צפויים למבנה<small>כל המבנה, כל החזיתות. חצי יום = 0.5</small>
        <div class="stepper"><button type="button" id="dm">−</button><input class="days grow" id="days" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(form.days_expected ?? '')}"><button type="button" id="dp">+</button></div></div>
      <div class="field">שיטת ביצוע ${chips('method', METHOD)}</div>
      <div class="field">מתי נשטף לאחרונה ${chips('washed_last', WASHED)}</div>
      <div class="field">רמת לכלוך וצפיפות ${chips('density', DENS)}</div>
      <div class="field">חומר ניקוי ${chips('material', MAT)}</div>
      <div class="note" id="dirtNote" ${['מעל שנתיים', 'לא נשטף מעולם'].includes(form.washed_last) ? '' : 'hidden'}>לא נשטף מעל שנתיים: לכלוך מצטבר דורש מעברים חוזרים. כדאי להוסיף ימים.</div>
    </div>
    <div class="sec"><h3>בשטח</h3>
      ${TOGS.map(([k, l]) => `<label class="tog" for="t_${k}"><span>${l}</span><span class="sw"><input type="checkbox" id="t_${k}" ${form[k] ? 'checked' : ''}><i></i></span></label>`).join('')}
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

  $$('.fc', el).forEach(f => f.onclick = () => { const p = b.plan_images[+f.dataset.i]; zoom(plans[p.storage_path], p.title + ' · ' + (p.dims_text || '')); });
  bindCopy(el);
  const set = (k, v) => { form[k] = v; dirty = true; };
  $$('.chip', el).forEach(c => c.onclick = () => {
    const g = c.dataset.g; set(g, form[g] === c.dataset.v ? null : c.dataset.v);
    $$(`.chip[data-g="${g}"]`, el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === form[g]));
    if (g === 'washed_last') $('#dirtNote').hidden = !['מעל שנתיים', 'לא נשטף מעולם'].includes(form[g]);
  });
  const days = $('#days');
  days.oninput = () => set('days_expected', days.value === '' ? null : Number(days.value));
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
    ['days_expected', 'method', 'washed_last', 'density', 'material', 'obstacles', 'obstacles_text', 'docking', 'hydrants', 'power', 'secure_storage', 'notes', 'highlights'].forEach(k => patch[k] = form[k] ?? null);
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
      await save(true); location.hash = '#/site/' + slug;
    };
  }
  $('#bk').onclick = async () => { if (dirty && editable) await save(false, true); location.hash = '#/site/' + slug; };
  addEventListener('hashchange', function h() { if (dirty && editable) save(false, true); removeEventListener('hashchange', h); }, { once: true });
}
