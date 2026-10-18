// דוח ללקוח — נבנה לבד מהחתימה האחרונה; "מה נכנס" (פאנל) בוחר מכל מקורות הפרויקט ועורכים בתוך הדוח — נשמר לפרויקט (db/144) (מה שהחותם בחר: ימים, זוגות לפני/אחרי מאותו יום, משימות, כמויות, תקלות שטופלו, דירוג, חתימה). לא נשלח במייל — PDF/קישור/קולאז׳ מהמנהל.
// כללים: אחריות על משימות = "E-Drone" (לא שמות עובדים); איש קשר בפוטר = החברה; זוג לפני/אחרי רק מאותו יום עבודה (לא זוגות מזויפים).
import { sb, state, isManager, signedUrls, icon, backBtn, $, $$, esc, toast, dm, coverArt, cache, isoDay, replaceHash, confirmBox } from '../lib/core.js';
import { shareIcon, shareFile, sharePrint, pdfFrom } from '../lib/share.js';
import { terms, serviceOf, siteCtx, fixWorks, cleanPlace, isPilot } from '../lib/service.js';
import { visitDefault, visitPhotos } from './visits.js';

const bdi = t => esc(t).replace(/([+−~≤≥]?[0-9A-Za-z][0-9A-Za-z.,%°~+−≤≥–—/ -]*[0-9A-Za-z%°])/g, '<bdi dir="ltr">$1</bdi>');
const fmt = d => d ? new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const SITE_SEL = 'name,address,contact_name,service,subtitle,scope_text,lead_notes,access_notes';
// שירות + הקשר האתר (פנלים · "על גגות הלולים") — מהפרויקט, האתר, האפיון ודוחות הביקור
const vText = v => [...(v.findings || []).map(x => x.text), v.summary];
async function svcFor(p, visits = []) {
  const sp = p.site_id ? await sb.from('buildings').select('specs(service_type,notes,highlights)').eq('site_id', p.site_id).then(r => (r.data || []).flatMap(b => b.specs ? [].concat(b.specs) : []), () => []) : [];
  const svc = serviceOf(p, sp.find(x => x.service_type)?.service_type);
  const s = p.sites || {}, txt = [p.name, s.name, s.subtitle, s.scope_text, s.lead_notes, s.access_notes, p.scope, p.work_notes, ...sp.flatMap(x => [x.notes, x.highlights]), ...visits.flatMap(vText)];
  const t0 = terms(svc);
  return terms(svc, siteCtx(t0.key, txt));
}
// ================= מה נכנס לדוח (db/144): טיוטה לכל פרויקט / שבוע =================
// sel[k] = בחירה מפורשת (אחרת ברירת המחדל), txt[k] = טקסט שנערך בדוח. "איפוס" מוחק את הטיוטה וחוזר לברירות המחדל.
// מפתחות: d:<יום> יום · dl:<יום> שורת היום · r:<יום> דוח יומי מלא · p:<bucket>:<path> תמונה · vf:<ביקור>:<i> ממצא · vp:<ביקור>:<i>:<j> תמונת ממצא
// vs:<ביקור> סיכום ביקור · t:<משימה> · rp:<תיקון> · is:<תקלה> · so חתימה · nx שבוע הבא · work/intro/summary/title/client… נוסחים
const DRK = (pid, scope) => `rdraft:${pid}:${scope}`;
async function loadDraft(pid, scope) {
  const [r, loc] = await Promise.all([sb.from('project_report_drafts').select('data,updated_at').eq('project_id', pid).eq('scope', scope).maybeSingle().then(x => x, e => ({ error: e })),
    cache.get(DRK(pid, scope)).catch(() => null)]);
  // החדש מבין השניים: עריכה שנשמרה בטלפון ולא הגיעה לשרת (קליטה / שגיאה) לא נדרסת בכניסה הבאה
  const srvAt = r.data?.updated_at ? Date.parse(r.data.updated_at) : 0;
  const d = r.error || (loc?.at && loc.at > srvAt) ? loc : r.data?.data;
  return { sel: { ...(d?.sel || {}) }, txt: { ...(d?.txt || {}) } };
}
function draftSaver(pid, scope, DR) {
  let tm = null, dirty = false, warned = false;
  const now = async () => {
    clearTimeout(tm); if (!dirty) return; dirty = false;
    cache.set(DRK(pid, scope), { sel: DR.sel, txt: DR.txt, at: Date.now() }).catch(() => {});
    const empty = !Object.keys(DR.sel).length && !Object.keys(DR.txt).length;
    const r = await (empty ? sb.from('project_report_drafts').delete().eq('project_id', pid).eq('scope', scope)
      : sb.from('project_report_drafts').upsert({ project_id: pid, scope, data: DR, updated_by: state.user.id, updated_at: new Date().toISOString() })).then(x => x, e => ({ error: e }));
    if (r.error && !warned) { warned = true; toast('הבחירה נשמרה בטלפון — תישמר בשרת כשתחזור קליטה'); }
  };
  addEventListener('hashchange', now, { once: true });
  return { soon: () => { dirty = true; clearTimeout(tm); tm = setTimeout(now, 700); }, now: () => { dirty = true; return now(); } };
}
const pp = t => String(t || '').trim().split(/\n\s*\n/).filter(x => x.trim()).map(x => `<p>${bdi(x.trim()).replace(/\n/g, '<br>')}</p>`).join('');
const lis = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean).map(s => `<li>${bdi(s)}</li>`).join('');
const txtOf = e => e.tagName === 'UL' ? (e.querySelector('li') ? [...e.querySelectorAll('li')].map(li => li.innerText.trim()) : e.innerText.split('\n')).map(s => s.trim()).filter(Boolean).join('\n')
  : e.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
// עריכה בתוך הדוח: כל בלוק עם data-ek נשמר בטיוטה תוך כדי הקלדה
function bindEdits(root, DR, save, onTxt) {
  root.querySelectorAll('[data-ek]').forEach(e => { e.setAttribute('contenteditable', 'true');
    e.addEventListener('input', () => { DR.txt[e.dataset.ek] = txtOf(e); save.soon(); onTxt?.(e.dataset.ek); }); });
}
// "פירוט העבודה": כל שורה עם מפתח קבוע (t:<משימה> / sc:<טקסט> / sa:<חדשה>) וכל עמודה נשמרת בטיוטה (k, k:b, k:s).
// מחיקה = מהדוח בלבד (sel=false, כמו "מה נכנס"); שורה שנוספה — ברשימה 'sc+'. המשימות בפרויקט לא משתנות
const hkey = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };
function scopeRows(T, works, DR, on, tx) {
  const base = T.length ? T.map(x => ({ k: x.k, t: x.t, b: x.b || '' })) : works.map(w => { const k = 'sc:' + hkey(w); return { k, t: tx(k, w), b: '' }; });
  const add = (() => { try { return JSON.parse(DR.txt['sc+'] || '[]'); } catch { return []; } })().map(id => ({ k: 'sa:' + id, t: tx('sa:' + id, ''), b: '' }));
  return [...base.filter(r => on(r.k, true)), ...add];
}
function scopeTable(R, hb, tx) {
  const row = r => `<tr><td class="el" data-ek="${r.k}">${bdi(r.t)}</td><td data-ek="${r.k}:b">${bdi(tx(r.k + ':b', hb ? r.b : 'E-Drone'))}</td><td class="st"><span class="pill" data-ek="${r.k}:s">${esc(tx(r.k + ':s', 'בוצע'))}</span></td><td class="cr-ed"><button type="button" class="cr-x" data-scx="${r.k}" aria-label="מחיקת השורה מהדוח">×</button></td></tr>`;
  return `<table class="cr-scope"><tr><th>עבודה</th><th>${hb ? 'מבנה' : 'באחריות'}</th><th>סטטוס</th><th class="cr-ed"></th></tr>${R.map(row).join('') || '<tr><td colspan="3">—</td></tr>'}</table>
    <button type="button" class="btn ghost cr-ed cr-add" data-scadd>+ שורה</button>`;
}
function bindScope(root, DR, save, draw) {
  root.querySelectorAll('[data-scx]').forEach(b => b.onclick = () => { const k = b.dataset.scx;
    if (k.startsWith('sa:')) { const id = k.slice(3); DR.txt['sc+'] = JSON.stringify(JSON.parse(DR.txt['sc+'] || '[]').filter(x => x !== id)); [k, k + ':b', k + ':s'].forEach(x => delete DR.txt[x]); }
    else DR.sel[k] = false;
    save.soon(); draw(); });
  const a = root.querySelector('[data-scadd]'); if (a) a.onclick = () => { const id = Math.random().toString(36).slice(2, 8);
    DR.txt['sc+'] = JSON.stringify([...JSON.parse(DR.txt['sc+'] || '[]'), id]); DR.txt['sa:' + id] = 'עבודה נוספת'; save.soon(); draw();
    const c = root.querySelector(`[data-ek="sa:${id}"]`); if (c) { c.focus(); getSelection()?.selectAllChildren(c); } };
}
// הפאנל: צד במחשב, גיליון בטלפון. groups: [{ t, open, grid, txt:[{k,l,v,rows}], items:[{k,l,s,img,tag,sub,on}] }]
function picker(groups, DR, save, redraw) {
  document.querySelector('.rpk')?.remove();
  const wide = matchMedia('(min-width: 1100px)').matches;
  const el = document.createElement('aside'); el.className = 'rpk ' + (wide ? 'rpk-side' : 'rpk-sheet'); el.setAttribute('aria-label', 'מה נכנס לדוח');
  const G = groups.filter(g => g.items.length || g.txt?.length);
  const IT = new Map(G.flatMap(g => g.items.map(it => [it.k, it])));
  const TX = new Map(G.flatMap(g => (g.txt || []).map(x => [x.k, x])));
  const on = it => DR.sel[it.k] ?? it.on;
  const cnt = g => g.items.filter(on).length;
  const item = (it, g) => g.grid
    ? `<label class="rpk-ph"><input type="checkbox" data-pk="${esc(it.k)}" ${on(it) ? 'checked' : ''}><img src="${esc(it.img)}" alt="" loading="lazy">${it.tag ? `<span>${esc(it.tag)}</span>` : ''}</label>`
    : `<label class="rpk-i${it.sub ? ' sub' : ''}"><input type="checkbox" data-pk="${esc(it.k)}" ${on(it) ? 'checked' : ''}>${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : ''}<span class="grow"><b>${esc(it.l)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}</span></label>`;
  const head = (g, gi) => `<span class="grow">${esc(g.t)}</span>${g.items.length ? `<span class="rpk-n" data-n="${gi}">${cnt(g)}/${g.items.length}</span><button class="rpk-all" type="button" data-all="${gi}">${cnt(g) === g.items.length ? 'כלום' : 'הכל'}</button>` : ''}`;
  let opened = new Set(G.map((g, i) => g.open ? i : -1).filter(i => i >= 0));
  const draw = () => {
    if (el.isConnected) opened = new Set([...el.querySelectorAll('details[open]')].map(d => +d.dataset.g));
    el.innerHTML = `<div class="rpk-in"><div class="rpk-h"><b class="grow">מה נכנס לדוח</b><button class="btn ghost sm" type="button" data-rpk="reset" title="איפוס לברירת מחדל">איפוס</button><button class="rpk-x" type="button" data-rpk="x" aria-label="סגירה">${icon('x', 18)}</button></div>
      <div class="rpk-b">${G.map((g, gi) => `<details class="rpk-g" data-g="${gi}" ${opened.has(gi) ? 'open' : ''}><summary>${head(g, gi)}</summary>
        ${(g.txt || []).map(x => `<label class="rpk-t"><small>${esc(x.l)}</small><textarea data-tk="${x.k}" rows="${x.rows || 2}">${esc(DR.txt[x.k] ?? x.v)}</textarea></label>`).join('')}
        ${g.items.length ? `<div class="${g.grid ? 'rpk-grid' : 'rpk-list'}">${g.items.map(it => item(it, g)).join('')}</div>` : ''}</details>`).join('')}</div></div>`;
  };
  const counts = () => G.forEach((g, gi) => { const n = el.querySelector(`[data-n="${gi}"]`), a = el.querySelector(`[data-all="${gi}"]`); if (n) n.textContent = `${cnt(g)}/${g.items.length}`; if (a) a.textContent = cnt(g) === g.items.length ? 'כלום' : 'הכל'; });
  const set = (k, v) => { const it = IT.get(k); if (!it) return; if (v === it.on) delete DR.sel[k]; else DR.sel[k] = v; };
  let rt;
  el.addEventListener('change', e => { const k = e.target.dataset?.pk; if (!k) return; set(k, e.target.checked); save.soon(); counts(); redraw(); });
  el.addEventListener('input', e => { const k = e.target.dataset?.tk; if (!k) return; const v = e.target.value, d = TX.get(k)?.v ?? '';
    if (v.trim() === String(d).trim()) delete DR.txt[k]; else DR.txt[k] = v; save.soon(); clearTimeout(rt); rt = setTimeout(redraw, 450); });
  el.addEventListener('click', async e => {
    const all = e.target.closest('[data-all]'); if (all) { e.preventDefault(); const g = G[+all.dataset.all], v = cnt(g) !== g.items.length; g.items.forEach(it => set(it.k, v)); save.soon(); draw(); redraw(); return; }
    const b = e.target.closest('[data-rpk]'); if (!b) return;
    if (b.dataset.rpk === 'x') return close();
    if (!await confirmBox('לחזור לברירת המחדל?', { body: 'הבחירה והעריכות בדוח הזה יימחקו', ok: 'איפוס', danger: true })) return;
    for (const k of Object.keys(DR.sel)) delete DR.sel[k]; for (const k of Object.keys(DR.txt)) delete DR.txt[k];
    save.now(); draw(); redraw(); toast('חזר לברירת המחדל');
  });
  const close = () => { el.remove(); document.body.classList.remove('rpk-on'); };
  addEventListener('hashchange', close, { once: true });
  draw(); document.body.appendChild(el); if (wide) document.body.classList.add('rpk-on');
  return { close, sync: k => { const ta = el.querySelector(`textarea[data-tk="${k}"]`); if (ta && document.activeElement !== ta) ta.value = DR.txt[k] ?? ''; } };
}
// כפתור "מה נכנס" + פתיחה אוטומטית במחשב
function bindPicker(btn, groups, DR, save, redraw, ref) {
  const open = () => { ref.pk = picker(groups(), DR, save, redraw); };
  btn.onclick = () => document.querySelector('.rpk') ? ref.pk?.close() : open();
  if (matchMedia('(min-width: 1100px)').matches) open();
}
// "שמירה לתיק הפרויקט": ה-PDF שנוצר נשמר כ"דוח" בתיק (db/144) — לא נשלח לאף אחד
async function saveReport(btn, pid, name, title) {
  if (btn.disabled) return; const lbl = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="shspin"></span>';
  try {
    $('#cr').querySelectorAll('[contenteditable]').forEach(e => e.blur());
    const blob = await pdfFrom($('#cr'));
    const { saveToProject } = await import('./pfiles.js');
    await saveToProject(pid, new File([blob], name.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf', { type: 'application/pdf' }), title, 'report');
    toast('נשמר בתיק הפרויקט');
  } catch (e) { toast(e?.message === 'lib' ? 'אין קליטה — נסו שוב' : 'לא נשמר — נסו שוב'); }
  btn.disabled = false; btn.innerHTML = lbl;
}

// ביקורים: כל ממצא — טקסט מלא (פסקאות, נערך בדוח) + כל תמונה בנפרד; הסיכום בנפרד. vDef = ברירת המחדל (מההחתמה / visitDefault)
const VLBL = { client_tour: 'סיור עם הלקוח', quality: 'בקרת איכות' };
function visitSel(visits, vDef, on, tx) {
  return visits.map(v => { const d = vDef.get(v.id), fi = new Set(d?.f || []);
    const F = (v.findings || []).map((f, i) => { const k = `vf:${v.id}:${i}`, dflt = fi.has(i), raw = (f.text || '').trim();
      const text = raw && on(k, dflt) ? tx(k, raw) : '';
      const ph = visitPhotos(f).filter((x, j) => on(`vp:${v.id}:${i}:${j}`, dflt));
      return { k, text, ph }; }).filter(f => f.text.trim() || f.ph.length);
    const sk = 'vs:' + v.id, s = (v.summary || '').trim() && on(sk, !!d?.s) ? tx(sk, v.summary.trim()) : '';
    return { v, F, s, sk }; }).filter(b => b.F.length || b.s.trim());
}
function visitItems(visits, vDef, fu) {
  return visits.flatMap(v => { const d = vDef.get(v.id), fi = new Set(d?.f || []), lbl = `${dm(v.visit_date)} · ${VLBL[v.kind] || 'ביקור'}`;
    return [...(v.findings || []).flatMap((f, i) => { const tt = (f.text || '').trim(), P = visitPhotos(f);
      return [...(tt ? [{ k: `vf:${v.id}:${i}`, l: `${lbl} · ממצא ${i + 1}`, s: tt.slice(0, 120), on: fi.has(i) }] : []),
        ...P.map((x, j) => ({ k: `vp:${v.id}:${i}:${j}`, l: `תמונה ${j + 1}${tt ? '' : ' · ' + lbl}`, img: fu[x], sub: true, on: fi.has(i) })).filter(x => x.img)]; }),
      ...((v.summary || '').trim() ? [{ k: 'vs:' + v.id, l: `${lbl} · סיכום`, s: v.summary.trim().slice(0, 120), on: !!d?.s }] : [])]; });
}
function visitPage(VB, url, pilot, foot) {
  if (!VB.length) return '';
  return `<div class="pg flow cr-visit"><div class="pad"><div class="rsec">${pilot ? 'PILOT SUMMARY' : 'SITE VISIT'}</div><h2>${pilot ? 'סיכום הפיילוט' : 'ממצאי ביקור'}</h2><div class="rule"></div>
    ${VB.map(b => `<div class="ba"><div class="band"><span class="t">${esc(fmt(b.v.visit_date))}</span><span class="d">${esc(VLBL[b.v.kind] || 'סיכום מקצועי')}</span><span class="ln"></span></div>
      ${b.F.map(f => { const ph = f.ph.map(url).filter(Boolean); return `<div class="cr-vf">${f.text.trim() ? `<div class="cr-tx" data-ek="${f.k}">${pp(f.text)}</div>` : ''}${ph.length ? `<div class="row3">${ph.map(u => `<div class="shot"><img src="${esc(u)}" alt=""></div>`).join('')}</div>` : ''}</div>`; }).join('')}
      ${b.s.trim() ? `<div class="cr-vf cr-vs"><b>סיכום</b><div class="cr-tx" data-ek="${b.sk}">${pp(b.s)}</div></div>` : ''}</div>`).join('')}
  </div>${foot()}</div>`;
}
// דוחות יומיים מלאים (מה שראש הצוות שלח) — כל יום בלוק נערך
function notesPage(RTs, foot) {
  if (!RTs.length) return '';
  return `<div class="pg flow"><div class="pad"><div class="rsec">FIELD NOTES</div><h2>יומן עבודה מפורט</h2><div class="rule"></div>
    ${RTs.map(x => `<div class="ba"><div class="band"><span class="t">${esc(fmt(x.d))}</span><span class="ln"></span></div><div class="cr-tx" data-ek="${x.k}">${pp(x.t)}</div></div>`).join('')}</div>${foot()}</div>`;
}
const listSec = (rsec, h, X, top = true) => X.length ? `<div class="rsec"${top ? ' style="margin-top:11mm"' : ''}>${rsec}</div><h2 class="cr-h3">${h}</h2><ul class="cl">${X.map(x => `<li data-ek="${x.k}">${bdi(x.t)}</li>`).join('')}</ul>` : '';
// דוח יומי מלא לכל יום: הטקסט שנשלח מהאפליקציה, אחרת ההערות מהדוח במאנדי
function dayTexts(wds, reps) {
  const RT = new Map();
  for (const w of wds) if ((w.report_text || '').trim()) RT.set(w.day, w.report_text.trim());
  for (const r of reps) if (r.report_date && !RT.has(r.report_date) && (r.notes || '').trim()) RT.set(r.report_date, [r.work, r.notes].filter(Boolean).join('\n').trim());
  return RT;
}
const phTag = x => `${dm(x.d)}${x.k === 'before' ? ' · לפני' : x.k === 'after' ? ' · אחרי' : ''}`;

export async function renderClientReport(el, pid) {
  el.innerHTML = '<div class="skel tall"></div>';
  // מנהלים · ראש צוות (תפקיד, או ראש צוות של יום בפרויקט — כמו מי שמותר לו להחתים). קישור ללקוח — מנהלים בלבד (RLS project_shares)
  const M = isManager();
  if (!M) { const lead = state.profile?.role === 'crew_lead' || (await sb.from('work_days').select('id').eq('project_id', pid).eq('crew_lead_id', state.user.id).limit(1).then(r => r.data?.length, () => 0));
    if (!lead) { el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}" aria-label="חזרה">${icon('back', 20)}</a></header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>הדוח ללקוח — לראש הצוות ולמנהלים</b></span></div>`; return; } }
  const q = x => x.then(r => r.data || []).catch(() => []);
  const [{ data: p }, days, tasks, reps0, ph, sos, { data: me }, local, iss, DR] = await Promise.all([
    sb.from('projects').select(`*, sites(${SITE_SEL})`).eq('id', pid).single(),
    q(sb.from('work_days').select('id,day,status,work_types,signoff,gallons,material,weather_stop,report_text').eq('project_id', pid).eq('status', 'done').order('day')),
    q(sb.from('tasks').select('id,title,status,phase,visit_id,buildings(name)').eq('project_id', pid).neq('status', 'dropped').order('day_no').order('seq')),
    q(sb.from('field_reports').select('report_date,work,gallons,notes,photos').eq('project_id', pid).eq('excluded', false).order('report_date')),
    q(sb.from('photos').select('kind,storage_path,work_day_id,created_at').eq('project_id', pid).in('kind', ['before', 'after', 'general']).order('created_at')),
    q(sb.from('project_signoffs').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1)),
    sb.from('app_settings').select('value').eq('key', 'company').maybeSingle(),
    cache.get('signoff-last:' + pid).catch(() => null),
    q(sb.from('issues').select('id,kind,body,resolution,closed_at').eq('project_id', pid).eq('status', 'closed').in('kind', ['site', 'other']).order('closed_at')),
    loadDraft(pid, 'final'),
  ]);
  if (!p) { el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>דוח ללקוח</h1></header><div class="empty-line">הפרויקט לא נמצא</div>`; return; }
  // דוחות ביקור (מנהלים — RLS) → "סיכום הפיילוט" / "ממצאי ביקור"; השירות קובע את השפה של כל הדוח
  const visits = await q(sb.from('project_visits').select('id,kind,visit_date,findings,summary,summary_client').eq('project_id', pid).order('visit_date'));
  const t = await svcFor(p, visits), fw = l => fixWorks(l, t);
  const pilot = isPilot(p, visits.flatMap(vText));
  // החתימה האחרונה קובעת את ברירת המחדל (ימים, תמונות, משימות, מקטעים). חתימה שנשמרה בטלפון ועוד לא הגיעה לשרת — משמשת מיד
  let so = sos[0] || null;
  if (local && (!so || so.id === local.id || new Date(local.created_at) > new Date(so.created_at))) so = { ...(so || {}), ...local };
  if (so?.id && sos[0]?.id === so.id && local) cache.set('signoff-last:' + pid, null).catch(() => {});
  const repBy = so?.created_by || null;   // נציג E-Drone בחתימה = מי שהחתים את הלקוח
  const repName = repBy ? (repBy === state.user.id ? state.profile.full_name : await sb.from('profiles').select('full_name').eq('id', repBy).maybeSingle().then(r => r.data?.full_name || '', () => '')) : '';
  const legacy = !so && [...days].reverse().find(d => d.signoff)?.signoff;
  const inc = so?.include || null, snap = so?.snapshot || null, sec = { works: true, photos: true, qty: false, issues: false, ...(inc?.sections || {}) };
  const reps = reps0.filter(r => r.report_date && !/^⚠/.test(r.notes || ''));
  // ---- ימים
  const D = new Map();
  for (const w of days) D.set(w.day, { d: w.day, work: fw(w.work_types).join(' · '), gal: Number(w.gallons) || 0, mat: w.material });
  for (const r of reps) if (!D.has(r.report_date)) D.set(r.report_date, { d: r.report_date, work: fw((r.work || '').split(/\s*[·,]\s*/)).join(' · '), gal: Number(r.gallons) || 0 });
  for (const x of snap?.days || []) D.set(x.d, { ...(D.get(x.d) || {}), d: x.d, work: (x.work ? fw(x.work.split(/\s*[·,]\s*/)).join(' · ') : '') || D.get(x.d)?.work || '', gal: x.gal ?? D.get(x.d)?.gal, mat: x.mat ?? D.get(x.d)?.mat });
  const allDates = [...D.keys()].sort();
  const defDays = new Set(inc?.days?.length ? inc.days : allDates);
  const RT = dayTexts(days, reps);
  // ---- תמונות: הכל (לפני/אחרי/כלליות + תמונות הדוחות). ברירת מחדל = מה שנבחר בהחתמה, אחרת לפני/אחרי + תמונות הדוחות
  const wdDay = new Map(days.map(w => [w.id, w.day]));
  const pk = x => `p:${x.b}:${x.p}`;
  const PH0 = [...ph.map(x => ({ b: 'field', p: x.storage_path, k: x.kind, d: wdDay.get(x.work_day_id) || isoDay(new Date(x.created_at)) })),
    ...reps.flatMap(r => (r.photos || []).filter(Boolean).map(path => ({ b: 'media', p: path, k: 'doc', d: r.report_date })))];
  for (const x of inc?.photos || []) if (!PH0.some(y => pk(y) === pk(x))) PH0.push(x);
  const defPh = new Set(inc && !sec.photos ? [] : inc?.photos?.length ? inc.photos.map(pk) : PH0.filter(x => x.k !== 'general').map(pk));
  const sigPath = so?.signature_path && !so.sigData ? [so.signature_path] : legacy?.signature_path ? [legacy.signature_path] : [];
  const vDef = new Map((Array.isArray(inc?.visits) ? inc.visits : visits.map(visitDefault)).map(x => [x.id, x]));
  const vphAll = visits.flatMap(v => (v.findings || []).flatMap(f => visitPhotos(f)));
  const [fu, mu] = await Promise.all([signedUrls('field', PH0.filter(x => x.b === 'field').map(x => x.p).concat(sigPath, vphAll)).catch(() => ({})),
    signedUrls('media', PH0.filter(x => x.b === 'media').map(x => x.p).concat(p.cover_path ? [p.cover_path] : [])).catch(() => ({}))]);
  const url = x => (x.b === 'field' ? fu : mu)[x.p];
  const sigUrl = so?.sigData || (sigPath[0] && fu[sigPath[0]]) || null;
  // ---- משימות (בלי פריטי תיקון) · פרוטוקול תיקונים · תקלות שטופלו
  const defT = id => inc ? (inc.tasks || []).includes(id) : true;
  const TK = tasks.filter(x => x.status === 'done' && !x.visit_id);
  const TI = TK.length || !snap?.tasks?.length ? TK.map(x => ({ k: 't:' + x.id, l: x.title, b: x.buildings?.name || null, on: defT(x.id) })) : snap.tasks.map((x, i) => ({ k: 'ts:' + i, l: x.t, b: x.b, on: true }));
  const RPI = tasks.filter(x => x.visit_id && x.status === 'done').map(x => ({ k: 'rp:' + x.id, l: x.title, b: x.buildings?.name || null, on: defT(x.id) }));
  const snapIss = snap?.issues || [];
  const ISI = iss.length ? iss.map(x => ({ k: 'is:' + x.id, l: x.body || '', r: x.resolution || '', on: sec.issues && (!snapIss.length || snapIss.some(y => y.b === x.body)) }))
    : snapIss.map((x, i) => ({ k: 'iss:' + i, l: x.b || '', r: x.r || '', on: sec.issues }));
  const hasSo = !!(so || legacy);
  const on = (k, d) => DR.sel[k] ?? d, tx = (k, d) => DR.txt[k] ?? d;
  const rating = so?.rating || null, ok = so ? so.full_ok !== false : legacy ? legacy.satisfied !== false : null;
  const signer = so?.signer_name || legacy?.name || '', role = so?.signer_role || legacy?.role || '', signedAt = (so?.created_at || legacy?.at) ? isoDay(new Date(so?.created_at || legacy?.at)) : '';   // תאריך ישראל, לא UTC
  const place = cleanPlace(p.sites?.name || p.name.replace(/^[^—]*—\s*/, ''));
  const co = me?.value || {}, coLine = [co.phone, co.email, co.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  const stars = n => `<span class="cr-stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const foot = n => `<div class="cr-pf"><span><bdi dir="ltr"><b>E-Drone</b> Technologies</bdi> · ${esc(place)}</span><span>${n}</span></div>`;
  const shot = (x, tag, cls = '') => `<div class="shot ${cls}"><img src="${esc(url(x))}" alt="">${tag ? `<span class="tag ${tag === 'אחרי' ? 'a' : ''}">${tag}</span>` : ''}</div>`;
  // מה בוצע — בשפת השירות: חזיתות לפי הימים; פנלים/הצללה/סריקה — מונח השירות + הקשר האתר ("על גגות הלולים")
  const whatOf = works => ['facade', 'windows'].includes(t.key) ? (works.join(', ') || t.work) : t.key === 'other' ? (works.filter(w => w !== 'אחר').join(', ') || 'את העבודה') : [t.workFull, ...works.filter(w => w !== t.day)].join(', ');
  const whatAll = whatOf([...new Set(allDates.flatMap(d => (D.get(d).work || '').split(/\s*[·,]\s*/).filter(Boolean)))]);
  const sumDef = [pilot ? 'הפיילוט בוצע בהתאם לתכנית שתואמה' + (visits.length ? ', והמסקנות המקצועיות מפורטות בדוח.' : '.') : 'העבודה בוצעה בהתאם לתכנית ובלוח הזמנים שתואם.', t.safety, t.care].join('\n');
  const introOf = (what, dates, vb) => inc?.text && !/\n/.test(inc.text.trim()) && inc.text.length > 60 ? inc.text
    : `E-Drone ביצעה ${pilot ? 'פיילוט ל' : ''}${what} ב${place}${dates.length ? (dates.length > 1 ? `, בין ${fmt(dates[0])} ל-${fmt(dates.at(-1))}` : `, ב-${fmt(dates[0])}`) : ''}. העבודה בוצעה באמצעות רחפן ייעודי ובצוות מוסמך, תוך שמירה על בטיחות האתר והפרעה מינימלית לשגרה.${pilot && vb ? ' ממצאי הפיילוט והמסקנות המקצועיות מפורטים בהמשך.' : ''}`;

  function build() {
    const wk = (DR.txt.work || '').trim();
    const dates = allDates.filter(d => on('d:' + d, defDays.has(d)));
    const L = dates.map(d => ({ ...D.get(d), k: 'dl:' + d, work: tx('dl:' + d, wk || D.get(d).work || '') }));
    const works = wk ? [wk] : [...new Set(dates.flatMap(d => (D.get(d).work || '').split(/\s*[·,]\s*/).filter(Boolean)))];
    const PH = PH0.filter(x => url(x) && on(pk(x), defPh.has(pk(x))));
    // זוגות אמיתיים בלבד: לפני ואחרי מאותו יום עבודה. השאר — בשורה משלהם
    const blocks = dates.map(d => { const mine = PH.filter(x => x.d === d), b = mine.filter(x => x.k === 'before'), a = mine.filter(x => x.k !== 'before');
      const pairs = []; while (b.length && a.length) pairs.push([b.shift(), a.pop()]); return { d, work: L.find(x => x.d === d)?.work, pairs, rest: [...b, ...a] }; }).filter(x => x.pairs.length || x.rest.length);
    const pages = []; let cur = [], w8 = 0;
    for (const bl of blocks) { const wt = bl.pairs.length * 2 + Math.ceil(bl.rest.length / 3); if (cur.length && w8 + wt > 4) { pages.push(cur); cur = []; w8 = 0; } cur.push(bl); w8 += wt; }
    if (cur.length) pages.push(cur);
    const afterAll = PH.filter(x => x.k !== 'before');
    const hero = (p.cover_path && mu[p.cover_path]) || (afterAll.length && url(afterAll.at(-1))) || (PH[0] && url(PH[0])) || coverArt(p.name);
    const VB = visitSel(visits, vDef, on, tx);
    const T = TI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, x.l), b: x.b }));
    const RP = RPI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, [x.l, x.b].filter(Boolean).join(' · ')) }));
    const IS = ISI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, [x.l, x.r].filter(Boolean).join(' — ')) }));
    const RTs = allDates.filter(d => RT.has(d) && on('r:' + d, false)).map(d => ({ d, k: 'r:' + d, t: tx('r:' + d, RT.get(d)) })).filter(x => x.t.trim());
    const qty = sec.qty ? (snap?.qty || { gallons: L.reduce((s, x) => s + (x.gal || 0), 0), material: [...new Set(L.map(x => x.mat).filter(Boolean))] }) : null;
    const showSo = signer && on('so', hasSo);
    const intro = tx('intro', introOf(wk || whatOf(works), dates, VB.length));
    let pn = 1;
    const html = `<div class="pg"><div class="hero"><img src="${esc(hero)}" alt=""><div class="hero-top"><div class="wordmark"><div class="w">E-DRONE</div><div class="t">TECHNOLOGIES</div></div><div class="kicker">PROJECT REPORT</div></div>
        <div class="hero-txt"><div class="lbl">${pilot ? 'דוח סיכום פיילוט' : 'דוח סיכום פרויקט'}</div><h1 data-ek="title">${bdi(tx('title', place))}</h1><div class="sub" data-ek="client">${bdi(tx('client', p.client_name || ''))}</div></div></div>
        <div class="stats"><div class="stat"><div class="n">${dates.length || '—'}</div><div class="c">ימי עבודה</div></div><div class="stat"><div class="n">${T.length || works.length || '—'}</div><div class="c">${T.length ? 'משימות שבוצעו' : 'סוגי עבודה'}</div></div>
          <div class="stat"><div class="n">${PH.length || '—'}</div><div class="c">תמונות תיעוד</div></div><div class="stat"><div class="n">${showSo && rating ? `${rating}<em>/5</em>` : showSo && ok != null ? '✓' : '—'}</div><div class="c">${showSo && rating ? 'שביעות רצון' : 'אישור לקוח'}</div></div></div>
        <div class="intro"><div class="cr-tx" data-ek="intro">${pp(intro)}</div></div>
        <div class="meta"><div><div class="k">לקוח</div><div class="v" data-ek="mclient">${bdi(tx('mclient', p.client_name || '—'))}</div></div><div><div class="k">אתר</div><div class="v" data-ek="addr">${bdi(tx('addr', p.sites?.address || place || '—'))}</div></div><div><div class="k">מועד ביצוע</div><div class="v">${dates.length ? `<bdi dir="ltr">${dm(dates[0])}${dates.length > 1 ? '–' + dm(dates.at(-1)) : ''}</bdi>` : '—'}</div></div></div>
        <div class="foot"><span><b>E-Drone</b> Technologies</span>${coLine ? `<span>${coLine}</span>` : ''}</div></div>
      ${pilot ? visitPage(VB, x => fu[x], true, () => foot(++pn)) : ''}
      ${pages.map((pg, i) => `<div class="pg"><div class="pad">${i ? '' : '<div class="rsec">DOCUMENTATION</div><h2>תיעוד העבודה</h2><div class="rule"></div>'}
        ${pg.map(bl => `<div class="ba"><div class="band"><span class="t">${esc(fmt(bl.d))}</span>${bl.work ? `<span class="d">${esc(bl.work)}</span>` : ''}<span class="ln"></span></div>
          ${bl.pairs.map(([b, a]) => `<div class="row2 cr-pair">${shot(b, 'לפני')}${shot(a, 'אחרי')}</div>`).join('')}
          ${bl.rest.length ? `<div class="row3">${bl.rest.map(x => shot(x, x.k === 'before' ? 'לפני' : x.k === 'after' ? 'אחרי' : '')).join('')}</div>` : ''}</div>`).join('')}
        </div>${foot(++pn)}</div>`).join('')}
      ${pilot ? '' : visitPage(VB, x => fu[x], false, () => foot(++pn))}
      ${notesPage(RTs, () => foot(++pn))}
      <div class="pg"><div class="pad"><div class="rsec">SCOPE</div><h2>פירוט העבודה</h2><div class="rule"></div>
        ${scopeTable(scopeRows(T, works, DR, on, tx), T.some(x => x.b), tx)}
        ${L.length ? `<div class="rsec" style="margin-top:11mm">FIELD LOG</div><h2 class="cr-h3">יומן ימי העבודה</h2>
          <table class="cr-log"><tr><th>תאריך</th><th>עבודה</th>${qty ? '<th>כמות</th>' : ''}</tr>${L.map(x => `<tr><td class="cr-d"><bdi dir="ltr">${dm(x.d)}</bdi></td><td data-ek="${x.k}">${bdi(x.work || 'עבודה באתר')}</td>${qty ? `<td>${x.gal ? `<bdi dir="ltr">${x.gal}</bdi> גל׳` : ''}</td>` : ''}</tr>`).join('')}</table>
          ${qty && (qty.gallons || qty.material?.length) ? `<div class="cr-qty">${qty.gallons ? `<span><b><bdi dir="ltr">${qty.gallons}</bdi></b> גלונים בסה״כ</span>` : ''}${qty.material?.length ? `<span>${esc(qty.material.join(' · '))}</span>` : ''}</div>` : ''}` : ''}
        ${listSec('REPAIRS', 'נקודות שתוקנו', RP)}
        ${listSec('RESOLVED', 'נקודות שטופלו', IS)}
      </div>${foot(++pn)}</div>
      <div class="pg"><div class="pad">
        ${showSo ? `<div class="rsec">CLIENT APPROVAL</div><h2>אישור הלקוח</h2><div class="rule"></div><div class="cr-sign"><div class="cr-sv"><div class="k">החותם</div><div class="v">${bdi(signer)}${role ? ` · ${esc(role)}` : ''}</div>
            <div class="k">תאריך</div><div class="v">${signedAt ? fmt(signedAt) : ''}</div>
            ${rating ? `<div class="k">שביעות רצון</div><div class="v">${stars(rating)}</div>` : ''}</div>
          <div class="cr-sig">${sigUrl ? `<img src="${esc(sigUrl)}" alt="חתימה">` : ''}<span>חתימת הלקוח</span></div></div>
          <div class="cr-sign cr-rep"><div class="cr-sv"><div class="k">נציג E-Drone</div><div class="v" data-ek="rep">${bdi(tx('rep', repName || ''))}&nbsp;</div><div class="k">חברה</div><div class="v"><bdi dir="ltr">E-Drone Technologies</bdi></div></div>
            <div class="cr-sig"><span>חתימת נציג E-Drone</span></div></div>
          <div class="note"><div class="cr-tx" data-ek="sonote">${pp(tx('sonote', `${ok === false ? 'העבודה אושרה עם הערות.' : 'העבודה בוצעה במלואה ולשביעות רצון הלקוח.'}${so?.notes || legacy?.notes ? ` ${so?.notes || legacy?.notes}` : ''}`))}</div></div>`
        : !hasSo ? '<div class="rsec">CLIENT APPROVAL</div><h2>אישור הלקוח</h2><div class="rule"></div><div class="note"><p>טרם נחתם על ידי הלקוח.</p></div>' : ''}
        <div class="rsec" style="margin-top:${showSo || !hasSo ? 12 : 0}mm">SUMMARY</div><h2>סיכום</h2><div class="rule"></div>
        <ul class="cl" data-ek="summary">${lis(tx('summary', sumDef))}</ul>
        <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div></div>${foot(++pn)}</div>`;
    return { html, PH, afterAll };
  }
  // הבחירה בפאנל: כל מקורות התוכן של הפרויקט
  const groups = () => [
    { t: 'נוסחים', open: true, items: [], txt: [{ k: 'work', l: 'שם העבודה בדוח (במקום סוג העבודה מהימים)', v: '' }, { k: 'intro', l: 'פסקת פתיחה', v: introOf(whatAll, allDates.filter(d => defDays.has(d)), visits.length), rows: 4 }, { k: 'summary', l: 'סיכום (שורה לכל נקודה)', v: sumDef, rows: 4 }] },
    { t: 'ימי עבודה', items: allDates.map(d => ({ k: 'd:' + d, l: fmt(d), s: D.get(d).work || '', on: defDays.has(d) })) },
    { t: 'דוחות יומיים', items: allDates.filter(d => RT.has(d)).map(d => ({ k: 'r:' + d, l: fmt(d), s: RT.get(d).slice(0, 120), on: false })) },
    { t: pilot ? 'סיכום הפיילוט ודוחות ביקור' : 'דוחות ביקור', open: pilot, items: visitItems(visits, vDef, fu) },
    { t: 'תמונות לפני / אחרי ונוספות', grid: true, items: PH0.filter(url).map(x => ({ k: pk(x), img: url(x), tag: phTag(x), on: defPh.has(pk(x)) })) },
    { t: 'משימות שבוצעו', items: TI.map(x => ({ k: x.k, l: x.l, s: x.b || '', on: x.on })) },
    { t: 'פרוטוקול תיקונים', items: RPI.map(x => ({ k: x.k, l: x.l, s: x.b || '', on: x.on })) },
    { t: 'תקלות שטופלו', items: ISI.map(x => ({ k: x.k, l: x.l, s: x.r, on: x.on })) },
    { t: 'חתימת הלקוח', items: signer ? [{ k: 'so', l: signer + (role ? ' · ' + role : ''), s: signedAt ? fmt(signedAt) : '', on: hasSo }] : [] },
  ];
  const save = draftSaver(pid, 'final', DR), ref = {};
  let cur;
  const draw = () => { cur = build(); const cr = $('#cr'); if (!cr) return; cr.innerHTML = cur.html; bindEdits(cr, DR, save, k => ref.pk?.sync(k)); bindScope(cr, DR, save, draw); };
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/p/${pid}/s" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ללקוח${hasSo ? '' : ' <span class="pill warn">לפני חתימה</span>'}</b>
      <button class="btn ghost sm" id="rpkb">${icon('check', 16)}<span class="rt-l"> מה נכנס</span></button>
      ${M ? `<button class="btn ghost sm" id="shr">${icon('send', 16)}<span class="rt-l"> קישור</span></button>` : ''}<button class="btn ghost sm" id="collage">קולאז׳</button><button class="btn ghost sm" id="print">הדפסה</button>
      ${M ? `<button class="btn ghost sm" id="crsave" aria-label="שמירה לתיק הפרויקט">${icon('folder', 16)}<span class="rt-l"> לתיק</span></button>` : ''}<button class="btn primary sm" id="crsh" aria-label="שיתוף PDF">${shareIcon(16)} PDF</button></div>
    <div class="creport" id="cr"></div>`;
  draw();
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => { const tt = document.title; document.title = `E-Drone · ${place}`; window.print(); setTimeout(() => document.title = tt, 500); };
  $('#collage').onclick = e => collage(cur.PH.filter(x => x.k === 'before').map(url), cur.afterAll.map(url), place, e.currentTarget);
  $('#crsh').onclick = e => sharePrint(e.currentTarget, $('#cr'), `דוח E-Drone - ${place}`, `דוח סיכום · ${place}`);
  const sv = $('#crsave'); if (sv) sv.onclick = e => saveReport(e.currentTarget, pid, `דוח E-Drone - ${place}`, `${pilot ? 'דוח סיכום פיילוט' : 'דוח סיכום'} · ${dm(isoDay())}`);
  const sh = $('#shr'); if (sh) sh.onclick = () => shareLink(p, pid);
  bindPicker($('#rpkb'), groups, DR, save, draw, ref);
}

// קישור ללקוח (share.html): מתקדם לבד מ"התקדמות" ל"דוח סיום" ברגע שנחתם. משתמשים בקישור הפעיל אם יש
async function shareLink(p, pid) {
  if (!isManager()) return;
  let { data: s } = await sb.from('project_shares').select('token,expires_at').eq('project_id', pid).eq('revoked', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!s) ({ data: s } = await sb.from('project_shares').insert({ project_id: pid, created_by: state.user.id }).select('token').single());
  if (!s) return toast('הקישור לא נוצר — נסו שוב');
  const u = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?t=' + s.token;
  try { if (navigator.share) await navigator.share({ title: `E-Drone · ${p.sites?.name || p.name}`, url: u }); else { await navigator.clipboard.writeText(u); toast('הקישור הועתק'); } } catch { }
}

// קולאז׳ לפני/אחרי לשיווק (1080×1080) — עם לוגו, בלי שם לקוח בתמונה
async function collage(before, after, name, btn) {
  if (!before.length || !after.length) return toast('צריך לפחות תמונת לפני ותמונת אחרי');
  const load = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  try {
    const [a, b, logo] = await Promise.all([load(before[0]), load(after[0]), load('logo.png').catch(() => null)]);
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
    const draw = (img, dx) => { const s = Math.max(540 / img.width, 1080 / img.height), w = img.width * s, h = img.height * s; x.save(); x.beginPath(); x.rect(dx, 0, 540, 1080); x.clip(); x.drawImage(img, dx + (540 - w) / 2, (1080 - h) / 2, w, h); x.restore(); };
    draw(b, 0); draw(a, 540);   // RTL: לפני מימין, אחרי משמאל
    x.fillStyle = '#C6EA5E'; x.fillRect(538, 0, 4, 1080);
    x.font = 'bold 44px Heebo, Arial'; x.textAlign = 'center';
    [['לפני', 810, 'rgba(14,16,19,.85)', '#fff'], ['אחרי', 270, '#C6EA5E', '#16181C']].forEach(([t, cx, bg, fg]) => { x.fillStyle = bg; x.fillRect(cx - 90, 40, 180, 70); x.fillStyle = fg; x.fillText(t, cx, 92); });
    if (logo) { const h = 70, w = logo.width * h / logo.height; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(1080 - w - 60, 960, w + 40, h + 30); x.drawImage(logo, 1080 - w - 40, 975, w, h); }
    // שיתוף הקובץ (וואטסאפ / שמירה); במחשב — הורדה או וואטסאפ Web
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    await shareFile(blob, `לפני-אחרי-${name}.jpg`, 'לפני / אחרי · E-Drone', '', { btn });
  } catch { toast('התמונות לא נטענו — נסו שוב'); }
}

// ================= עדכון שבועי ללקוח (פרויקט ארוך: יותר מ-5 ימי שטח) =================
// נבנה לבד מהימים שנסגרו בשבוע: תאריכים, חזיתות שהושלמו והתקדמות %, זוגות לפני/אחרי מאותו יום, נקודות שטופלו, ומה מתוכנן לשבוע הבא.
// לא נשלח לבד ללקוח (אף פעם לא מייל אוטומטי) — המנהל משתף PDF בלחיצה. שבוע = ראשון–שבת.
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
export const weekStart = s => addD(s, -new Date(s + 'T12:00:00').getDay());
const LONG = 5;
// השבוע של העדכון: השבוע הנוכחי אם נסגר בו יום; אחרת השבוע שעבר (ראשון בבוקר עוד מראה את השבוע שהסתיים)
export function weeklyFor(days) {
  const live = (days || []).filter(d => d.status !== 'cancelled');
  if (live.length <= LONG) return null;
  for (const ws of [weekStart(isoDay()), addD(weekStart(isoDay()), -7)]) {
    const we = addD(ws, 6), wd = live.filter(d => d.status === 'done' && d.day >= ws && d.day <= we);
    if (wd.length) return { ws, we, n: wd.length };
  }
  return null;
}
const wkKey = (pid, ws) => `wkup:${pid}:${ws}`;
export const weeklyShared = (pid, ws) => { try { return !!localStorage.getItem(wkKey(pid, ws)); } catch { return false; } };
const markShared = (pid, ws) => { try { localStorage.setItem(wkKey(pid, ws), '1'); } catch { /* */ } };

// כרטיס בסיכום הפרויקט: "עדכון שבועי מוכן" — לחיצה = העדכון, "שיתוף" = PDF מיד
export function weeklyCard(box, p, days) {
  if (!box || !isManager()) return;
  const w = weeklyFor(days); if (!w) { box.innerHTML = ''; return; }
  const sent = weeklyShared(p.id, w.ws), base = `#/client-report/${p.id}/w/${w.ws}`;
  box.innerHTML = `<div class="card wkup"><a class="mic" href="${base}" aria-hidden="true">${icon('report', 20)}</a><a class="grow" href="${base}"><b>${sent ? 'עדכון שבועי שותף' : 'עדכון שבועי מוכן'}</b><small class="muted">${w.n === 1 ? 'יום אחד' : w.n + ' ימים'} · ${dm(w.ws)}–${dm(w.we)}</small></a>
    <a class="btn ${sent ? 'ghost' : 'primary'} sm" href="${base}/s">${shareIcon(16)} שיתוף</a></div>`;
}

export async function renderWeeklyUpdate(el, pid, ws0, autoShare = false) {
  el.innerHTML = '<div class="skel tall"></div>';
  if (!isManager()) { el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}" aria-label="חזרה">${icon('back', 20)}</a></header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>העדכון השבועי — למנהלים</b></span></div>`; return; }
  const ws = /^\d{4}-\d\d-\d\d$/.test(ws0 || '') ? weekStart(ws0) : weekStart(isoDay()), we = addD(ws, 6);
  const q = x => x.then(r => r.data || []).catch(() => []);
  const [{ data: p }, all, { data: Z }, { data: me }] = await Promise.all([
    sb.from('projects').select(`*, sites(${SITE_SEL})`).eq('id', pid).single(),
    q(sb.from('work_days').select('id,day,status,work_types,zones_done,gallons,report_text').eq('project_id', pid).neq('status', 'cancelled').order('day')),
    sb.rpc('project_zones', { p: pid }).then(r => r, () => ({ data: null })),
    sb.from('app_settings').select('value').eq('key', 'company').maybeSingle()]);
  if (!p) { el.innerHTML = '<div class="empty">הפרויקט לא נמצא</div>'; return; }
  const W = all.filter(d => d.status === 'done' && d.day >= ws && d.day <= we);
  const ids = W.map(d => d.id);
  // ביקורים עד סוף השבוע (שפת השירות); בבחירה — רק מהשבועיים האחרונים, ברירת מחדל = האחרון
  const visits = await q(sb.from('project_visits').select('id,kind,visit_date,findings,summary,summary_client').lte('visit_date', we).eq('project_id', pid).order('visit_date'));
  const t = await svcFor(p, visits), pilot = isPilot(p, visits.flatMap(vText));
  const vin = visits.filter(v => v.visit_date >= addD(ws, -14));
  const vLast = [...vin].reverse().find(v => { const d = visitDefault(v); return d.f.length || d.s; });
  const vDef = new Map(vin.map(v => [v.id, v === vLast ? visitDefault(v) : { id: v.id, f: [], s: false }]));
  const [ph, iss, tk, DR] = await Promise.all([
    ids.length ? q(sb.from('photos').select('kind,storage_path,work_day_id,created_at').in('work_day_id', ids).in('kind', ['before', 'after', 'general']).order('created_at')) : [],
    q(sb.from('issues').select('id,kind,body,resolution,closed_at').eq('project_id', pid).eq('status', 'closed').in('kind', ['site', 'other']).gte('closed_at', ws + 'T00:00:00').lte('closed_at', we + 'T23:59:59')),
    q(sb.from('tasks').select('id,title,visit_id,done_at,buildings(name)').eq('project_id', pid).eq('status', 'done').gte('done_at', ws + 'T00:00:00').lte('done_at', we + 'T23:59:59').order('done_at')),
    loadDraft(pid, 'w:' + ws)]);
  const urls = await signedUrls('field', ph.map(x => x.storage_path).concat(vin.flatMap(v => (v.findings || []).flatMap(f => visitPhotos(f))))).catch(() => ({}));
  const coverU = p.cover_path ? (await signedUrls('media', [p.cover_path]).catch(() => ({})))[p.cover_path] : null;
  const place = cleanPlace(p.sites?.name || p.name.replace(/^[^—]*—\s*/, ''));
  // התקדמות: חזיתות שהושלמו עד סוף השבוע מתוך כל החזיתות של האתר
  const zones = Z?.zones || [], zd = Z?.done || [];
  const upTo = zd.filter(z => z.day <= we).length, before = zd.filter(z => z.day < ws).length;
  const prog = zones.length ? Math.round(upTo / zones.length * 100) : null, progPrev = zones.length ? Math.round(before / zones.length * 100) : null;
  const zName = z => [z.bn, t.zone(z.t)].filter(Boolean).join(' · ');
  const zOf = d => (Array.isArray(d.zones_done) ? d.zones_done : []).map(zName).filter(Boolean);
  const nextW = all.filter(d => d.status !== 'done' && d.day > we && d.day <= addD(we, 7)).map(d => d.day);
  const wdDay = new Map(W.map(d => [d.id, d.day]));
  const pk = x => 'p:field:' + x.p;
  const PH0 = ph.filter(x => urls[x.storage_path]).map(x => ({ p: x.storage_path, u: urls[x.storage_path], k: x.kind, d: wdDay.get(x.work_day_id) }));
  const RT = dayTexts(W, []);
  const TI = tk.filter(x => !x.visit_id).map(x => ({ k: 't:' + x.id, l: x.title, b: x.buildings?.name || null, on: false }));
  const RPI = tk.filter(x => x.visit_id).map(x => ({ k: 'rp:' + x.id, l: x.title, b: x.buildings?.name || null, on: false }));
  const ISI = iss.map(x => ({ k: 'is:' + x.id, l: x.body || '', r: x.resolution || '', on: true }));
  const on = (k, d) => DR.sel[k] ?? d, tx = (k, d) => DR.txt[k] ?? d;
  const co = me?.value || {}, coLine = [co.phone, co.email, co.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  const range = `${dm(ws)}–${dm(we)}`;
  const introOf = (Wd, nz) => Wd.length ? `השבוע (${range}) עבד צוות E-Drone ${Wd.length === 1 ? 'יום אחד' : Wd.length + ' ימים'} ב${place}${nz ? ` והשלים ${t.n(nz)}` : ''}.${prog != null ? ` הפרויקט הושלם ב-${prog}%.` : ''}${nextW.length ? ` בשבוע הבא מתוכננים ${nextW.length === 1 ? 'יום עבודה אחד' : nextW.length + ' ימי עבודה'}.` : ''}`
    : `לא נסגרו ימי עבודה בשבוע ${range}.`;
  const shot = (x, tag) => `<div class="shot"><img src="${esc(x.u)}" alt="">${tag ? `<span class="tag ${tag === 'אחרי' ? 'a' : ''}">${tag}</span>` : ''}</div>`;
  const foot = n => `<div class="cr-pf"><span><bdi dir="ltr"><b>E-Drone</b> Technologies</bdi> · ${esc(place)}</span><span>${n}</span></div>`;
  const title = `עדכון שבועי E-Drone - ${place} ${range.replace(/\./g, '-')}`;

  function build() {
    const wk = (DR.txt.work || '').trim();
    const Wd = W.filter(d => on('d:' + d.day, true));
    const L = Wd.map(d => ({ d: d.day, k: 'dl:' + d.day, zk: 'dz:' + d.day, work: tx('dl:' + d.day, wk || fixWorks(d.work_types, t).join(' · ')), zones: tx('dz:' + d.day, zOf(d).join('\n')) }));
    const zWeek = [...new Set(Wd.flatMap(zOf))];
    const PH = PH0.filter(x => on(pk(x), x.k !== 'general'));
    const blocks = Wd.map(d => { const mine = PH.filter(x => x.d === d.day), b = mine.filter(x => x.k === 'before'), a = mine.filter(x => x.k === 'after'); const pairs = []; while (b.length && a.length) pairs.push([b.shift(), a.pop()]);
      return { d: d.day, work: L.find(x => x.d === d.day)?.work, pairs, rest: [...b, ...a, ...mine.filter(x => x.k === 'general')] }; }).filter(x => x.pairs.length || x.rest.length);
    const pages = []; let cur = [], w8 = 0;
    for (const bl of blocks) { const wt = bl.pairs.length * 2 + Math.ceil(bl.rest.length / 3); if (cur.length && w8 + wt > 4) { pages.push(cur); cur = []; w8 = 0; } cur.push(bl); w8 += wt; }
    if (cur.length) pages.push(cur);
    const hero = coverU || PH.filter(x => x.k === 'after').at(-1)?.u || PH[0]?.u || coverArt(p.name);
    const VB = visitSel(vin, vDef, on, tx);
    const T = TI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, [x.l, x.b].filter(Boolean).join(' · ')) }));
    const RP = RPI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, [x.l, x.b].filter(Boolean).join(' · ')) }));
    const IS = ISI.filter(x => on(x.k, x.on)).map(x => ({ k: x.k, t: tx(x.k, [x.l, x.r].filter(Boolean).join(' — ')) }));
    const RTs = W.filter(d => RT.has(d.day) && on('r:' + d.day, false)).map(d => ({ d: d.day, k: 'r:' + d.day, t: tx('r:' + d.day, RT.get(d.day)) })).filter(x => x.t.trim());
    const NX = nextW.length && on('nx', true) ? nextW : [];
    const intro = tx('intro', introOf(Wd, zWeek.length));
    let pn = 1;
    const html = `<div class="pg"><div class="hero wk"><img src="${esc(hero)}" alt=""><div class="hero-top"><div class="wordmark"><div class="w">E-DRONE</div><div class="t">TECHNOLOGIES</div></div><div class="kicker">WEEKLY UPDATE</div></div>
        <div class="hero-txt"><div class="lbl">עדכון שבועי · <bdi dir="ltr">${range}</bdi></div><h1 data-ek="title">${bdi(tx('title', place))}</h1><div class="sub" data-ek="client">${bdi(tx('client', p.client_name || ''))}</div></div></div>
        <div class="stats"><div class="stat"><div class="n">${Wd.length || '—'}</div><div class="c">ימי עבודה השבוע</div></div><div class="stat"><div class="n">${zWeek.length || '—'}</div><div class="c">${esc(t.units)} שהושלמו</div></div>
          <div class="stat"><div class="n">${prog != null ? `${prog}<em>%</em>` : '—'}</div><div class="c">${prog != null && progPrev != null && prog > progPrev ? `התקדמות (+${prog - progPrev}%)` : 'התקדמות'}</div></div><div class="stat"><div class="n">${PH.length || '—'}</div><div class="c">תמונות תיעוד</div></div></div>
        ${prog != null ? `<div class="wk-prog"><i style="width:${progPrev}%"></i><i class="now" style="width:${prog - progPrev}%"></i></div>` : ''}
        <div class="intro"><div class="cr-tx" data-ek="intro">${pp(intro)}</div></div>
        ${L.length ? `<div class="pad wk-log"><div class="rsec">FIELD LOG</div><table class="cr-log"><tr><th>תאריך</th><th>עבודה</th><th>הושלם</th></tr>${L.map(x => `<tr><td class="cr-d"><bdi dir="ltr">${dm(x.d)}</bdi></td><td data-ek="${x.k}">${bdi(x.work || 'עבודה באתר')}</td><td data-ek="${x.zk}">${x.zones ? x.zones.split('\n').map(bdi).join('<br>') : ''}</td></tr>`).join('')}</table></div>` : ''}
        <div class="foot"><span><b>E-Drone</b> Technologies</span>${coLine ? `<span>${coLine}</span>` : ''}</div></div>
      ${pages.map((pg, i) => `<div class="pg"><div class="pad">${i ? '' : '<div class="rsec">BEFORE / AFTER</div><h2>לפני ואחרי</h2><div class="rule"></div>'}
        ${pg.map(bl => `<div class="ba"><div class="band"><span class="t">${esc(fmt(bl.d))}</span>${bl.work ? `<span class="d">${esc(bl.work)}</span>` : ''}<span class="ln"></span></div>
          ${bl.pairs.map(([b, a]) => `<div class="row2 cr-pair">${shot(b, 'לפני')}${shot(a, 'אחרי')}</div>`).join('')}
          ${bl.rest.length ? `<div class="row3">${bl.rest.map(x => shot(x, x.k === 'before' ? 'לפני' : x.k === 'after' ? 'אחרי' : '')).join('')}</div>` : ''}</div>`).join('')}</div>${foot(++pn)}</div>`).join('')}
      ${visitPage(VB, x => urls[x], pilot, () => foot(++pn))}
      ${notesPage(RTs, () => foot(++pn))}
      ${IS.length || NX.length || T.length || RP.length ? `<div class="pg"><div class="pad">
        ${listSec('DONE', 'מה בוצע השבוע', T, false)}
        ${listSec('REPAIRS', 'נקודות שתוקנו', RP, T.length > 0)}
        ${listSec('RESOLVED', 'נקודות שטופלו השבוע', IS, T.length + RP.length > 0)}
        ${NX.length ? `<div class="rsec" style="margin-top:${IS.length + T.length + RP.length ? 11 : 0}mm">NEXT WEEK</div><h2 class="cr-h3">מתוכנן לשבוע הבא</h2><ul class="cl" data-ek="nxl">${lis(tx('nxl', NX.map(d => fmt(d)).join('\n')))}</ul>` : ''}
        <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div></div>${foot(++pn)}</div>` : ''}`;
    return { html };
  }
  const groups = () => [
    { t: 'נוסחים', open: true, items: [], txt: [{ k: 'work', l: 'שם העבודה בדוח (במקום סוג העבודה מהימים)', v: '' }, { k: 'intro', l: 'פסקת פתיחה', v: introOf(W, new Set(W.flatMap(zOf)).size), rows: 4 }] },
    { t: 'ימי עבודה', items: W.map(d => ({ k: 'd:' + d.day, l: fmt(d.day), s: fixWorks(d.work_types, t).join(' · '), on: true })) },
    { t: 'דוחות יומיים', items: W.filter(d => RT.has(d.day)).map(d => ({ k: 'r:' + d.day, l: fmt(d.day), s: RT.get(d.day).slice(0, 120), on: false })) },
    { t: 'דוחות ביקור', items: visitItems(vin, vDef, urls) },
    { t: 'תמונות לפני / אחרי ונוספות', grid: true, items: PH0.map(x => ({ k: pk(x), img: x.u, tag: phTag(x), on: x.k !== 'general' })) },
    { t: 'משימות שבוצעו', items: TI.map(x => ({ k: x.k, l: x.l, s: x.b || '', on: x.on })) },
    { t: 'פרוטוקול תיקונים', items: RPI.map(x => ({ k: x.k, l: x.l, s: x.b || '', on: x.on })) },
    { t: 'תקלות שטופלו', items: ISI.map(x => ({ k: x.k, l: x.l, s: x.r, on: x.on })) },
    { t: 'השבוע הבא', items: nextW.length ? [{ k: 'nx', l: 'מתוכנן לשבוע הבא', s: nextW.map(dm).join(' · '), on: true }] : [] },
  ];
  const save = draftSaver(pid, 'w:' + ws, DR), ref = {};
  const draw = () => { const cr = $('#cr'); if (!cr) return; cr.innerHTML = build().html; bindEdits(cr, DR, save, k => ref.pk?.sync(k)); };
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/p/${pid}/s" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">עדכון שבועי <small class="muted"><bdi dir="ltr">${range}</bdi></small></b>
      <button class="btn ghost sm" id="wkprev" aria-label="שבוע קודם">‹</button><button class="btn ghost sm" id="wknext" aria-label="שבוע הבא">›</button>
      <button class="btn ghost sm" id="rpkb">${icon('check', 16)}<span class="rt-l"> מה נכנס</span></button>
      <button class="btn ghost sm" id="crsave" aria-label="שמירה לתיק הפרויקט">${icon('folder', 16)}<span class="rt-l"> לתיק</span></button>
      <button class="btn primary sm" id="wksh" aria-label="שיתוף PDF">${shareIcon(16)} PDF</button></div>
    <div class="creport" id="cr"></div>`;
  draw();
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  const go = n => { location.hash = `#/client-report/${pid}/w/${addD(ws, n * 7)}`; };
  $('#wkprev').onclick = () => go(-1); $('#wknext').onclick = () => go(1);
  const share = btn => { markShared(pid, ws); return sharePrint(btn, $('#cr'), title, `עדכון שבועי · ${place}`); };
  $('#wksh').onclick = e => share(e.currentTarget);
  $('#crsave').onclick = e => saveReport(e.currentTarget, pid, title, `עדכון שבועי · ${range}`);
  bindPicker($('#rpkb'), groups, DR, save, draw, ref);
  // הגעה מ"שיתוף" בכרטיס: ה-PDF נבנה ונפתח השיתוף מיד (אם הטלפון מבקש לחיצה נוספת — גיליון שיתוף אחד)
  if (autoShare) { replaceHash(`#/client-report/${pid}/w/${ws}`, false); if (W.length) share($('#wksh')); }
}
