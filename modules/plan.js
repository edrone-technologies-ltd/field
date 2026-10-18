// תכנית עבודה כמסמך: יום אחרי יום — מה עושים (כתוב) + תמונות מהאפיון, מדוחות קודמים ומהשטח.
// המנהל כותב ומשבץ תמונות; הצוות רואה את אותו מסמך (ובמסך היום — את היום שלו). ניתן להדפסה כ-PDF מטעם E-Drone.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, signedUrls, zoom, dm, dayLabel, isoDay, confirmBox } from '../lib/core.js';
import { hideMoneyText as noMoney$, moneyPart } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { errText } from '../lib/audit.js';
import { shareIcon, sharePrint } from '../lib/share.js';
import { terms, serviceOf } from '../lib/service.js';

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
    sb.from('projects').select('id,name,client_name,site_id,service,sites(name,address,contact_name,contact_phone,service)').eq('id', pid).single(),
    sb.from('tasks').select('id,title,day_no,method,instructions,risk,building_id,work_day_id,status').eq('project_id', pid).neq('phase', 'מעקב').neq('status', 'dropped').order('day_no').order('seq'),
    sb.from('work_days').select('id,day,status,report_time,kind,drone_id').eq('project_id', pid).neq('kind', 'report').order('day'),
    sb.from('plan_days').select('*').eq('project_id', pid).order('day_no')]);
  if (!p) { el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תכנית עבודה</h1></header><div class="empty-line">הפרויקט לא נמצא</div>`; return; }
  // אין תכנית ויש אתר עם אפיון שהושלם → נבנית לבד (בדרך כלל השרת כבר בנה אותה בשיוך/בסיום האפיון); הטקסט נשאר לעריכה
  if (M && !print && p.site_id && !(tasks || []).some(t => t.day_no) && !(rows || []).length && !el.dataset.autoplan) {
    el.dataset.autoplan = pid;
    let n = 0; try { n = (await sb.rpc('generate_work_plan', { p: pid })).data; } catch { /* בלי קליטה — מוצג מה שיש */ }
    if (n > 0) return renderPlan(el, pid, print);
  }
  delete el.dataset.autoplan;
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
  const notes = [...new Set((tasks || []).map(t => noMoney$(t.instructions)).filter(Boolean))], risks = [...new Set((tasks || []).map(t => t.risk).filter(Boolean))];
  const load = await loadout(p, nums.length, days || []).catch(() => '');
  const brief = load + (notes.length || risks.length ? `<section class="pbrief"><b>דגשים מהאפיון</b>${notes.map(x => `<div>${esc(x).replace(/\n/g, '<br>')}</div>`).join('')}${risks.map(x => `<div class="warn">${icon('alert', 14)} ${esc(x)}</div>`).join('')}</section>` : '');

  const dayCard = n => {
    const ts = (tasks || []).filter(t => t.day_no === n), wd = dateOf(n), body = R.get(n)?.body ?? draft(ts), ph = photosOf(n);
    return `<section class="pday" data-n="${n}">
      <div class="pdh"><span class="pdn">${n}</span><div class="grow"><b>יום ${n}</b><small>${wd ? `${dayLabel(wd.day)}${wd.report_time ? ' · יציאה ' + wd.report_time.slice(0, 5) : ''}` : 'עוד לא שובץ'}</small></div>
        ${M && !print ? `<button class="chip sm" data-pick="${n}">${icon('photo', 16)} תמונות</button>` : ''}</div>
      ${M && !print ? `<textarea class="pbody" data-body="${n}" rows="${Math.max(3, body.split('\n').length + 1)}" placeholder="מה עושים ביום הזה">${esc(noMoney$(body))}</textarea>`
        : `<div class="ptext">${esc(noMoney$(body)).replace(/\n/g, '<br>') || '<span class="muted">—</span>'}</div>`}
      ${ph.length ? `<div class="pphotos">${ph.map(r => U[r] ? `<img src="${esc(U[r])}" alt="" data-z>` : '').join('')}</div>` : M && !print ? `<button class="pempty" data-pick="${n}">${icon('photo', 22)}<span>שיבוץ תמונות</span></button>` : ''}
    </section>`;
  };
  const head = `<div class="plhead"><div class="grow"><small class="eyebrow">תכנית עבודה</small><h1>${esc(p.name)}</h1>
      <small>${esc([s?.address, nums.length ? `${nums.length} ימי עבודה` : ''].filter(Boolean).join(' · '))}</small></div></div>
    ${s?.contact_name || s?.contact_phone ? `<div class="small muted">איש קשר באתר: ${esc(s.contact_name || '')}${s.contact_phone ? ` · <a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a>` : ''}</div>` : ''}`;

  el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}/t" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תכנית עבודה</h1>
      ${nums.length ? `<a class="hbtn" href="#/plan/${pid}/print" aria-label="PDF">${icon('file', 20)}</a>` : ''}</header>
    <div class="stack lg plan">${head}
      ${brief}${nums.length ? nums.map(dayCard).join('') : '<div class="empty-line">אין תכנית עדיין</div>'}
      ${M ? `<div class="row-btns">${p.site_id && nums.length ? `<button class="btn ghost" id="pgen">עדכון מהאפיון</button>` : ''}<button class="btn ghost" id="padd">${icon('plus', 18)} יום</button></div>` : ''}
    </div>`;
  if (print) return printView(el, p, nums, dayCard, brief);

  $$('[data-z]', el).forEach(i => i.onclick = () => zoom(i.src, ''));
  if (!M) return;
  const save = async (n, patch) => {
    const { error } = await sb.from('plan_days').upsert({ project_id: pid, day_no: n, ...patch, updated_by: state.user.id, updated_at: new Date().toISOString() });
    if (error) { toast(errText(error, 'לא נשמר — נסו שוב')); return false; } R.set(n, { ...(R.get(n) || { photos: [] }), ...patch }); return true;
  };
  // הטקסט נשמר תוך כדי הקלדה (השהיה קצרה) ובעזיבת השדה; התיבה גדלה עם הטקסט
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
  $$('[data-body]', el).forEach(t => { grow(t); let tm;
    const hid = moneyPart(R.get(+t.dataset.body)?.body ?? '');   // משפט כספי שהוסתר — חוזר לסוף בשמירה
    const go = () => { clearTimeout(tm); const n = +t.dataset.body; return save(n, { body: t.value + (hid ? '\n' + hid : ''), photos: R.get(n)?.photos?.length ? R.get(n).photos : photosOf(n) }); };
    t.oninput = () => { grow(t); clearTimeout(tm); tm = setTimeout(go, 900); addEventListener('hashchange', () => tm && go(), { once: true }); }; t.onchange = go; });
  $$('[data-pick]', el).forEach(b => b.onclick = () => picker(+b.dataset.pick));
  $('#padd').onclick = async e => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; const n = (nums.at(-1) || 0) + 1; if (await save(n, { body: '', photos: [] })) renderPlan(el, pid); else b.disabled = false; };
  const g = $('#pgen'); if (g) g.onclick = async () => {
    if (g.disabled) return;
    if ((rows || []).length && !(await confirmBox('לבנות מחדש מהאפיון?', { body: 'הטקסט והתמונות שנכתבו לכל יום נשארים', ok: 'בנייה מחדש' }))) return;
    g.disabled = true; const { data, error } = await sb.rpc('generate_work_plan', { p: pid }); if (error) { g.disabled = false; return toast(errText(error, 'התכנית לא נבנתה — נסו שוב'), 4000); }
    toast(`נבנו ${data} ימי עבודה`); renderPlan(el, pid);
  };

  // בוחר תמונות: כל תמונות הפרויקט לפי מקור, סימון/ביטול, + צילום חדש
  async function picker(n) {
    const sel = new Set(photosOf(n)), PU = await urlsFor(P.map(x => x.ref));
    const groups = [['מהאפיון', P.filter(x => ['facade', 'site', 'obstacle'].includes(x.kind))], ['מדוחות קודמים', P.filter(x => x.kind === 'report')], ['מהשטח', P.filter(x => ['before', 'after', 'general'].includes(x.kind))]].filter(g => g[1].length);
    sheet(`<h3>תמונות ליום ${n}</h3>
      ${groups.map(([t, xs]) => `<div class="small muted">${t} · ${xs.length}</div><div class="pick">${xs.map(x => PU[x.ref] ? `<button type="button" class="pk" data-r="${esc(x.ref)}" aria-pressed="${sel.has(x.ref)}"><img src="${esc(PU[x.ref])}" alt="" loading="lazy"></button>` : '').join('')}</div>`).join('') || '<div class="empty-line">אין תמונות בפרויקט</div>'}
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
          } catch (er) { toast(errText(er, 'התמונה לא עלתה — נסו שוב')); }
        }
        await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' }); close(); renderPlan(el, pid);
      };
      $('#pok', sh).onclick = async () => { const b = $('#pok', sh); if (b.disabled) return; b.disabled = true;
        if (await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' })) { close(); toast('נשמר'); renderPlan(el, pid); } else b.disabled = false; };
    });
  }
}

// "מה להעמיס" — נגזר מהאפיונים שהושלמו באתר + הרחפן ששובץ. קריאה בלבד, בלי מספרים מומצאים
async function loadout(p, ndays, days) {
  if (!p.site_id) return '';
  const droneIds = [...new Set(days.map(d => d.drone_id).filter(Boolean))];
  const [{ data: bs }, { data: dr }] = await Promise.all([
    sb.from('buildings').select('floors,specs(status,method,material,floors,site_ops,hydrants,power,service_type)').eq('site_id', p.site_id),
    droneIds.length ? sb.from('equipment').select('name').in('id', droneIds) : Promise.resolve({ data: [] })]);
  const S = (bs || []).flatMap(b => (Array.isArray(b.specs) ? b.specs : [b.specs]).filter(x => x?.status === 'done').map(x => ({ ...x, fl: Number(x.floors ?? b.floors) || 0 })));
  if (!S.length) return '';
  const t = terms(serviceOf(p, S.find(x => x.service_type)?.service_type));   // פנלים על גג — בלי "קומות"; סריקה — בלי "שטיפה"
  const O = S.map(x => x.site_ops || {}), has = (k, v) => O.some(o => o[k] === v), any = k => [...new Set(O.flatMap(o => o[k] || []))];
  const M = new Set(S.map(x => x.method).filter(Boolean)), mats = [...new Set(S.map(x => x.material).filter(m => m && m !== 'אחר'))];
  const fl = Math.max(0, ...S.map(x => x.fl)), haz = any('hazards');
  const L = [];
  if (M.has('רחפן') || M.has('משולב') || !M.size) L.push(['רחפן', (dr || []).map(x => x.name).join(', ') || (t.wash ? 'שטיפה' : t.work)]);
  if (M.has('סנפלינג') || M.has('משולב')) L.push(['סנפלינג', 'ציוד גלישה ועיגון']);
  if (mats.length) L.push(['חומר ניקוי', mats.join(' · ') + (ndays ? ` · ל-${ndays} ימי עבודה` : '')]);
  if (has('water', 'מכלית')) L.push(['מים', 'מכלית — אין מקור באתר']);
  else if (has('water', 'הידרנט')) L.push(['מים', 'מתאם הידרנט']);
  else if (has('water', 'ברז באתר')) L.push(['מים', 'מחבר לברז']);
  else if (S.some(x => x.hydrants)) L.push(['מים', 'מתאם הידרנט']);   // אפיונים מלפני 096
  // צינור הלחץ והמשאבה קבועים על הנגרר — לא בהעמסה. סחיבה רחוקה — כהערה
  if (has('access', 'רחוק — סחיבה')) L.push(['גישה', 'רחוק — סחיבה' + (t.roof ? ' · עבודה על גג' : fl ? ` · גובה ${fl} קומות` : '')]);
  if (has('power', 'גנרטור')) L.push(['חשמל', 'גנרטור · כבל מאריך · עמדת חשמל ניידת']);
  else if (has('power', 'שקע באתר') || S.some(x => x.power)) L.push(['חשמל', 'שקע באתר — בלי גנרטור · כבל מאריך']);
  L.push(['בטיחות', ['ציוד מגן אישי', 'ערכת עזרה ראשונה', 'מערכת קשר', haz.includes('הולכי רגל') && 'גידור מעבר הולכי רגל', has('launch', 'גג') && 'עבודה מהגג — רתמות'].filter(Boolean).join(' · ')]);
  return `<section class="pload"><b>מה להעמיס</b>${L.map(([k, v]) => `<div class="pl"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>`;
}

// הדפסה: אותו מסמך בתבנית הדוחות של החברה, בלי שדות עריכה
async function printView(el, p, nums, dayCard, brief) {
  const { data: co } = await sb.from('app_settings').select('value').eq('key', 'company').maybeSingle();
  const c = co?.value || {}, coLine = [c.phone, c.email, c.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/plan/${p.id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">תכנית עבודה</b><button class="btn ghost sm" id="print">הדפסה</button><button class="btn primary sm" id="plsh">${shareIcon(16)} PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">WORK PLAN</div><h2>${esc(p.name)}</h2><div class="rule"></div>
      ${brief}${nums.map(n => dayCard(n)).join('')}
      <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div>
    </div></div></div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
  $('#plsh').onclick = e => sharePrint(e.currentTarget, $('.creport', el), `תכנית עבודה - ${p.name}`, `תכנית עבודה · ${p.name}`);
}

// תכנית היום של יום שטח (נשמר במטמון של היום — עובד גם בלי קליטה). null = אין תכנית
export async function dayPlan(day) {
  if (!day?.project_id) return null;
  const [{ data: ts, error: e1 }, { data: days, error: e2 }] = await Promise.all([
    sb.from('tasks').select('day_no,work_day_id').eq('project_id', day.project_id).neq('phase', 'מעקב').not('day_no', 'is', null),
    sb.from('work_days').select('id,day,kind').eq('project_id', day.project_id).order('day')]);
  if (e1 || e2) throw e1 || e2;
  const n = (ts || []).find(t => t.work_day_id === day.id)?.day_no || ((days || []).filter(d => d.kind !== 'report').findIndex(d => d.id === day.id) + 1);
  if (!n) return null;
  const { data: r, error } = await sb.from('plan_days').select('body,photos').eq('project_id', day.project_id).eq('day_no', n).maybeSingle();
  if (error) throw error;
  return r && (r.body || (r.photos || []).length) ? { body: r.body || '', photos: r.photos || [] } : null;
}
// בלוק "תכנית היום" למסך יום השטח. r = תכנית מהמטמון (undefined = לטעון). מחזיר את התכנית שהוצגה
export async function planForDay(box, day, r) {
  if (!box || !day?.project_id) return r;
  if (r === undefined) r = await dayPlan(day);
  if (!r) { box.innerHTML = ''; return r; }
  const U = await urlsFor(r.photos || []).catch(() => ({}));
  box.innerHTML = `<section class="stack"><div class="sh-row"><h3 class="sh">תכנית היום</h3><a class="more" href="#/plan/${day.project_id}">כל התכנית</a></div>
    <div class="card stack">${r.body ? `<div class="ptext">${esc(noMoney$(r.body)).replace(/\n/g, '<br>')}</div>` : ''}
    ${(r.photos || []).some(x => U[x]) ? `<div class="pphotos">${r.photos.map(x => U[x] ? `<img src="${esc(U[x])}" alt="" data-z>` : '').join('')}</div>` : ''}</div></section>`;
  $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.src, ''));
  return r;
}
