// תכנית עבודה כמסמך: יום אחרי יום — מה עושים (כתוב) + תמונות מהאפיון, מדוחות קודמים ומהשטח.
// המנהל כותב ומשבץ תמונות; הצוות רואה את אותו מסמך (ובמסך היום — את היום שלו). ניתן להדפסה כ-PDF מטעם E-Drone.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, signedUrls, zoom, dm, dayLabel, isoDay } from '../lib/core.js';
import { shrink } from '../lib/store.js';

const KIND = { facade: 'אפיון', site: 'אפיון', obstacle: 'מכשול', before: 'לפני', after: 'אחרי', general: 'שטח', report: 'דוח קודם' };

// כל התמונות של הפרויקט: אפיון האתר, ימי שטח, ודוחות קודמים (מאנדי)
async function pool(p) {
  const [{ data: ph }, { data: reps }] = await Promise.all([
    sb.from('photos').select('storage_path,kind,building_id,created_at').or(`project_id.eq.${p.id}${p.site_id ? `,site_id.eq.${p.site_id}` : ''}`).in('kind', ['facade', 'site', 'obstacle', 'before', 'after', 'general']).order('created_at'),
    sb.from('field_reports').select('report_date,photos').eq('project_id', p.id).order('report_date')]);
  const list = (ph || []).map(x => ({ ref: 'f:' + x.storage_path, kind: x.kind, b: x.building_id }))
    .concat((reps || []).flatMap(r => (r.photos || []).filter(Boolean).map(path => ({ ref: 'm:' + path, kind: 'report', d: r.report_date }))));
  const seen = new Set(); return list.filter(x => !seen.has(x.ref) && seen.add(x.ref));
}
async function urlsFor(refs) {
  const f = refs.filter(r => r.startsWith('f:')).map(r => r.slice(2)), m = refs.filter(r => r.startsWith('m:')).map(r => r.slice(2));
  const [a, b] = await Promise.all([signedUrls('field', f), signedUrls('media', m)]);
  return Object.fromEntries(refs.map(r => [r, (r.startsWith('f:') ? a[r.slice(2)] : b[r.slice(2)]) || '']));
}
// טקסט ברירת מחדל ליום — מהמשימות שנבנו מהאפיון
// (דגשי האפיון מופיעים פעם אחת בראש התכנית — לא חוזרים בכל יום)
const draft = ts => ts.map(t => `• ${t.title}${t.method ? ` — ${t.method}` : ''}`).join('\n');

export async function renderPlan(el, pid, print = false) {
  el.innerHTML = '<div class="skel tall"></div>';
  const M = isManager();
  const [{ data: p }, { data: tasks }, { data: days }, { data: rows }] = await Promise.all([
    sb.from('projects').select('id,name,client_name,site_id,sites(name,address,contact_name,contact_phone)').eq('id', pid).single(),
    sb.from('tasks').select('id,title,day_no,method,instructions,risk,building_id,work_day_id,status').eq('project_id', pid).neq('phase', 'מעקב').neq('status', 'dropped').order('day_no').order('seq'),
    sb.from('work_days').select('id,day,status,report_time,kind').eq('project_id', pid).neq('kind', 'report').order('day'),
    sb.from('plan_days').select('*').eq('project_id', pid).order('day_no')]);
  if (!p) { el.innerHTML = '<div class="empty">הפרויקט לא נמצא.</div>'; return; }
  const P = await pool(p);
  const R = new Map((rows || []).map(r => [r.day_no, r]));
  const nums = [...new Set([...(tasks || []).map(t => t.day_no).filter(Boolean), ...R.keys()])].sort((a, b) => a - b);
  const sched = (days || []).filter(d => d.kind !== 'report');
  const dateOf = n => { const ts = (tasks || []).filter(t => t.day_no === n && t.work_day_id); const wd = ts.length && sched.find(d => d.id === ts[0].work_day_id); return wd || sched[n - 1] || null; };
  // תמונות ליום: מה שנבחר; אחרת הצעה אוטומטית — תמונות האפיון של המבנים של אותו יום
  const photosOf = n => { const r = R.get(n); if (r && (r.photos || []).length) return r.photos;
    const bs = new Set((tasks || []).filter(t => t.day_no === n).map(t => t.building_id).filter(Boolean));
    return P.filter(x => x.b && bs.has(x.b) && x.kind === 'facade').slice(0, 4).map(x => x.ref); };
  const U = await urlsFor([...new Set(nums.flatMap(photosOf))]);
  const s = p.sites;
  const notes = [...new Set((tasks || []).map(t => t.instructions).filter(Boolean))], risks = [...new Set((tasks || []).map(t => t.risk).filter(Boolean))];
  const brief = notes.length || risks.length ? `<section class="pbrief"><b>דגשים מהאפיון</b>${notes.map(x => `<div>${esc(x).replace(/\n/g, '<br>')}</div>`).join('')}${risks.map(x => `<div class="warn">⚠ ${esc(x)}</div>`).join('')}</section>` : '';

  const dayCard = n => {
    const ts = (tasks || []).filter(t => t.day_no === n), wd = dateOf(n), body = R.get(n)?.body ?? draft(ts), ph = photosOf(n);
    return `<section class="pday" data-n="${n}">
      <div class="pdh"><span class="pdn">${n}</span><div class="grow"><b>יום ${n}</b><small>${wd ? `${dayLabel(wd.day)}${wd.report_time ? ' · יציאה ' + wd.report_time.slice(0, 5) : ''}` : 'עוד לא שובץ'}</small></div>
        ${M && !print ? `<button class="chip sm" data-pick="${n}">${icon('photo', 16)} תמונות</button>` : ''}</div>
      ${M && !print ? `<textarea class="pbody" data-body="${n}" rows="${Math.max(3, body.split('\n').length + 1)}" placeholder="מה עושים ביום הזה">${esc(body)}</textarea>`
        : `<div class="ptext">${esc(body).replace(/\n/g, '<br>') || '<span class="muted">—</span>'}</div>`}
      ${ph.length ? `<div class="pphotos">${ph.map(r => U[r] ? `<img src="${esc(U[r])}" alt="" data-z>` : '').join('')}</div>` : M && !print ? `<button class="pempty" data-pick="${n}">${icon('photo', 22)}<span>שיבוץ תמונות מהאפיון ומהשטח</span></button>` : ''}
    </section>`;
  };
  const head = `<div class="plhead"><div class="grow"><small class="eyebrow">תכנית עבודה</small><h1>${esc(p.name)}</h1>
      <small>${esc([s?.address, nums.length ? `${nums.length} ימי עבודה` : ''].filter(Boolean).join(' · '))}</small></div></div>
    ${s?.contact_name || s?.contact_phone ? `<div class="small muted">איש קשר באתר: ${esc(s.contact_name || '')}${s.contact_phone ? ` · <a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a>` : ''}</div>` : ''}`;

  el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}/t" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תכנית עבודה</h1>
      ${nums.length ? `<a class="chip" href="#/plan/${pid}/print">PDF</a>` : ''}</header>
    <div class="stack lg plan">${head}
      ${brief}${nums.length ? nums.map(dayCard).join('') : `<div class="empty">עוד אין תכנית.${M ? '' : ''}</div>`}
      ${M ? `<div class="row-btns">${p.site_id ? `<button class="btn ghost" id="pgen">${nums.length ? 'בנייה מחדש מהאפיון' : 'בנייה מהאפיון'}</button>` : ''}<button class="btn ghost" id="padd">+ יום</button></div>` : ''}
    </div>`;
  if (print) return printView(el, p, nums, dayCard, brief);

  $$('[data-z]', el).forEach(i => i.onclick = () => zoom(i.src, ''));
  if (!M) return;
  const save = async (n, patch) => {
    const { error } = await sb.from('plan_days').upsert({ project_id: pid, day_no: n, ...patch, updated_by: state.user.id, updated_at: new Date().toISOString() });
    if (error) toast(error.message); else { R.set(n, { ...(R.get(n) || { photos: [] }), ...patch }); }
  };
  // הטקסט נשמר תוך כדי הקלדה (השהיה קצרה) ובעזיבת השדה; התיבה גדלה עם הטקסט
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
  $$('[data-body]', el).forEach(t => { grow(t); let tm;
    const go = () => { clearTimeout(tm); const n = +t.dataset.body; return save(n, { body: t.value, photos: R.get(n)?.photos?.length ? R.get(n).photos : photosOf(n) }); };
    t.oninput = () => { grow(t); clearTimeout(tm); tm = setTimeout(go, 900); addEventListener('hashchange', () => tm && go(), { once: true }); }; t.onchange = go; });
  $$('[data-pick]', el).forEach(b => b.onclick = () => picker(+b.dataset.pick));
  $('#padd').onclick = async () => { const n = (nums.at(-1) || 0) + 1; await save(n, { body: '', photos: [] }); renderPlan(el, pid); };
  const g = $('#pgen'); if (g) g.onclick = async () => {
    g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: pid }); if (error) { g.disabled = false; return toast(error.message, 4000); }
    toast(`נבנו ${data} ימי עבודה`); renderPlan(el, pid);
  };

  // בוחר תמונות: כל תמונות הפרויקט לפי מקור, סימון/ביטול, + צילום חדש
  async function picker(n) {
    const sel = new Set(photosOf(n)), PU = await urlsFor(P.map(x => x.ref));
    const groups = [['מהאפיון', P.filter(x => ['facade', 'site', 'obstacle'].includes(x.kind))], ['מדוחות קודמים', P.filter(x => x.kind === 'report')], ['מהשטח', P.filter(x => ['before', 'after', 'general'].includes(x.kind))]].filter(g => g[1].length);
    sheet(`<h3>תמונות ליום ${n}</h3>
      ${groups.map(([t, xs]) => `<div class="small muted">${t} · ${xs.length}</div><div class="pick">${xs.map(x => PU[x.ref] ? `<button type="button" class="pk" data-r="${esc(x.ref)}" aria-pressed="${sel.has(x.ref)}"><img src="${esc(PU[x.ref])}" alt="" loading="lazy"></button>` : '').join('')}</div>`).join('') || '<div class="small muted">אין עדיין תמונות בפרויקט.</div>'}
      <label class="btn ghost block">${icon('photo', 18)} צילום / העלאה<input type="file" accept="image/*" multiple id="pup" hidden></label>
      <button class="btn primary block" id="pok">שמירה</button>`, (sh, close) => {
      $$('[data-r]', sh).forEach(b => b.onclick = () => { const r = b.dataset.r; sel.has(r) ? sel.delete(r) : sel.add(r); b.setAttribute('aria-pressed', sel.has(r)); });
      $('#pup', sh).onchange = async e => {
        toast('מעלה…');
        for (const file of e.target.files) {
          try { const blob = await shrink(file), path = `${state.user.id}/plan/${crypto.randomUUID()}.jpg`;
            const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
            await sb.from('photos').insert({ storage_path: path, project_id: pid, site_id: p.site_id, kind: 'site', uploaded_by: state.user.id, caption: 'תכנית עבודה' });
            sel.add('f:' + path);
          } catch (er) { toast(er.message || 'התמונה לא עלתה'); }
        }
        await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' }); close(); renderPlan(el, pid);
      };
      $('#pok', sh).onclick = async () => { await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' }); close(); renderPlan(el, pid); };
    });
  }
}

// הדפסה: אותו מסמך בתבנית הדוחות של החברה, בלי שדות עריכה
async function printView(el, p, nums, dayCard, brief) {
  const { data: co } = await sb.from('app_settings').select('value').eq('key', 'company').maybeSingle();
  const c = co?.value || {}, coLine = [c.phone, c.email, c.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/plan/${p.id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">תכנית עבודה</b><button class="btn primary sm" id="print">הדפסה / PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">WORK PLAN</div><h2>${esc(p.name)}</h2><div class="rule"></div>
      ${brief}${nums.map(n => dayCard(n)).join('')}
      <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div>
    </div></div></div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
}

// בלוק "תכנית היום" למסך יום השטח
export async function planForDay(box, day) {
  if (!box || !day?.project_id) return;
  const [{ data: ts }, { data: days }] = await Promise.all([
    sb.from('tasks').select('day_no,work_day_id').eq('project_id', day.project_id).neq('phase', 'מעקב').not('day_no', 'is', null),
    sb.from('work_days').select('id,day,kind').eq('project_id', day.project_id).order('day')]);
  const n = (ts || []).find(t => t.work_day_id === day.id)?.day_no || ((days || []).filter(d => d.kind !== 'report').findIndex(d => d.id === day.id) + 1);
  if (!n) return;
  const { data: r } = await sb.from('plan_days').select('*').eq('project_id', day.project_id).eq('day_no', n).maybeSingle();
  if (!r || (!r.body && !(r.photos || []).length)) return;
  const U = await urlsFor(r.photos || []);
  box.innerHTML = `<section class="stack"><div class="sh-row"><h3 class="sh">תכנית היום</h3><a class="more" href="#/plan/${day.project_id}">כל התכנית</a></div>
    <div class="card stack" style="gap:10px">${r.body ? `<div class="ptext">${esc(r.body).replace(/\n/g, '<br>')}</div>` : ''}
    ${(r.photos || []).length ? `<div class="pphotos">${r.photos.map(x => U[x] ? `<img src="${esc(U[x])}" alt="" data-z>` : '').join('')}</div>` : ''}</div></section>`;
  $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.src, ''));
}
