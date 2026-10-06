// מערכת הדוחות: כל דוח נפתח מתוך פרויקט (או מהבית ← בחירת פרויקט).
// יומי (מסך יום השטח במצב דוח) · תקלה / אירוע בטיחות · החתמת לקוח · סיכום פרויקט פנימי · אפיון.
import { sb, state, isManager, can, enqueue, signedUrls, addFieldPhoto, sheet, uid, icon, coverArt, $, $$, esc, nf, toast, zoom, isoDay, dayLabel, dm, confirmBox } from '../lib/core.js';

const ROLE_CAN_SIGN = () => isManager() || state.profile.role === 'crew_lead';
export const TYPES = [
  { k: 'spec', ic: 'clipboard', t: 'אפיון', s: 'סיור אפיון לליד או לאתר', ok: () => can('specs'), noProject: true },
  { k: 'daily', ic: 'report', t: 'דוח ביצוע יומי', s: 'מה בוצע, שעות, צוות, חומר ותמונות', ok: () => true },
  { k: 'issue', ic: 'alert', t: 'תקלה / אירוע בטיחות', s: 'רחפן, ציוד, אתר, כמעט תאונה', ok: () => true },
  { k: 'signoff', ic: 'clipboard', t: 'החתמת לקוח — אישור ביצוע', s: 'הלקוח מאשר וחותם באצבע', ok: ROLE_CAN_SIGN },
  { k: 'summary', ic: 'shield', t: 'סיכום פרויקט פנימי', s: 'איכות, תקלות, פתרונות ולקחים', ok: isManager },
];

// ---------- פתיחת דוח חדש ----------
export async function newReport(projectId) {
  if (projectId) return pickType(projectId);
  // מהבית: קודם סוג הדוח, ואז (אם צריך) הפרויקט
  sheet(`<h3>דוח חדש</h3><div class="menu">${TYPES.filter(t => t.ok()).map(t => `<button class="lrow" data-t="${t.k}"><span class="mic">${icon(t.ic, 20)}</span><span class="grow"><b>${t.t}</b><small>${t.s}</small></span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $$('[data-t]', s).forEach(b => b.onclick = () => { close(); const t = TYPES.find(x => x.k === b.dataset.t); if (t.noProject) return open(t.k); pickProject(pid => open(t.k, pid)); });
  });
}
async function pickProject(then) {
  const { data, error } = await sb.rpc('reportable_projects'); if (error) return toast(error.message);
  sheet(`<h3>על איזה פרויקט?</h3><input type="search" class="search" id="rq" placeholder="חיפוש פרויקט">
    <div class="list" id="rl">${(data || []).map(p => `<button class="lrow" data-p="${p.id}" data-n="${esc(p.name + ' ' + (p.client_name || ''))}"><span class="grow"><b>${esc(p.name)}</b><small>${esc([p.client_name, p.status_label].filter(Boolean).join(' · '))}</small></span>${p.mine ? '<span class="pill lime">שלי</span>' : ''}</button>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $('#rq', s).oninput = e => $$('[data-p]', s).forEach(b => b.hidden = !b.dataset.n.includes(e.target.value.trim()));
    $$('[data-p]', s).forEach(b => b.onclick = async () => { try { await sb.rpc('join_project', { p: b.dataset.p }); } catch {} close(); then(b.dataset.p); });
  });
}
function pickType(pid) {
  sheet(`<h3>איזה דוח?</h3><div class="menu">${TYPES.filter(t => t.ok()).map(t => `<button class="lrow" data-t="${t.k}"><span class="mic">${icon(t.ic, 20)}</span><span class="grow"><b>${t.t}</b><small>${t.s}</small></span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $$('[data-t]', s).forEach(b => b.onclick = () => { close(); open(b.dataset.t, pid); });
  });
}
export function open(k, pid) {
  if (k === 'spec') { location.hash = '#/specs'; return; }
  if (k === 'daily') return dailyDate(pid);
  if (k === 'issue') return issueSheet(pid);
  if (k === 'signoff') location.hash = '#/signoff/' + pid;
  if (k === 'summary') location.hash = '#/summary/' + pid;
}
function dailyDate(pid) {
  const t = isoDay(), y = isoDay(new Date(Date.now() - 864e5));
  sheet(`<h3>דוח ביצוע יומי · לאיזה יום?</h3><div class="chips"><button class="chip" data-d="${t}" aria-pressed="true">היום</button><button class="chip" data-d="${y}">אתמול</button></div>
    <label class="field">או תאריך אחר<input type="date" id="dd" max="${t}" value="${t}"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="dgo">פתיחת הדוח</button></div>`, (s, close) => {
    $$('[data-d]', s).forEach(c => c.onclick = () => { $('#dd', s).value = c.dataset.d; $$('[data-d]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#dgo', s).onclick = async () => {
      const d = $('#dd', s).value; if (new Date(d + 'T12:00').getDay() === 6) return toast('לא עובדים בשבת');
      const { data, error } = await sb.rpc('start_report', { p: pid, d }); if (error) return toast(error.message, 4000);
      close(); location.hash = '#/day/' + data;
    };
  });
}
const ISSUE_KIND = { 'רחפן': 'equipment', 'ציוד': 'equipment', 'בטיחות': 'safety', 'כמעט תאונה': 'near_miss', 'אתר': 'site', 'לקוח': 'site', 'אחר': 'other' };
export function issueSheet(pid, after) {
  let kind = 'רחפן', crit = false, files = [];
  sheet(`<h3>תקלה / אירוע בטיחות</h3><div class="chips">${Object.keys(ISSUE_KIND).map(k => `<button class="chip" data-k="${k}" aria-pressed="${k === kind}">${k}</button>`).join('')}</div>
    <textarea id="ib" rows="4" placeholder="מה קרה, איפה, מה נעשה"></textarea>
    <label class="tog"><span>קריטי — העבודה נעצרה / סכנה</span><span class="sw"><input type="checkbox" id="ic"><i></i></span></label>
    <label class="btn ghost block" style="position:relative">${icon('plus', 18)} תמונות<input type="file" accept="image/*" multiple id="ip" style="position:absolute;inset:0;opacity:0"></label><div id="ipn" class="small muted"></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="isend">דיווח</button></div>`, (s, close) => {
    $$('[data-k]', s).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#ic', s).onchange = e => crit = e.target.checked;
    $('#ip', s).onchange = e => { files = [...e.target.files]; $('#ipn', s).textContent = files.length ? `${files.length} תמונות יצורפו` : ''; };
    $('#isend', s).onclick = async () => {
      const body = $('#ib', s).value.trim(); if (!body) return toast('כתבו מה קרה');
      const row = { id: uid(), project_id: pid, kind: ISSUE_KIND[kind], severity: crit ? 'critical' : 'normal', body: ['רחפן', 'לקוח'].includes(kind) ? `${kind}: ${body}` : body, opened_by: state.user.id };
      await enqueue({ kind: 'insert', table: 'issues', row });
      for (const f of files) await addFieldPhoto(f, { kind: 'issue', project_id: pid, issue_id: row.id });
      close(); toast(crit ? 'דווח — המנהלים מקבלים התראה' : 'התקלה דווחה'); after && after(row);
    };
  });
}

// ---------- החתמת לקוח ----------
export async function renderSignoff(el, pid) {
  el.innerHTML = `<div class="skel"></div>`;
  try { await sb.rpc('join_project', { p: pid }); } catch {}
  const [{ data: p }, { data: days }, { data: tasks }, { data: reps }] = await Promise.all([
    sb.from('projects').select('id,name,client_name,cover_path,sites(contact_name)').eq('id', pid).single(),
    sb.from('work_days').select('day,status,work_types').eq('project_id', pid).eq('status', 'done').order('day'),
    sb.from('tasks').select('title,status').eq('project_id', pid).eq('status', 'done'),
    sb.from('field_reports').select('report_date,work').eq('project_id', pid).order('report_date'),
  ]);
  if (!p) { el.innerHTML = '<div class="empty">הפרויקט לא נמצא</div>'; return; }
  const dates = [...new Set([...(days || []).map(d => d.day), ...(reps || []).map(r => r.report_date)])].sort();
  const works = [...new Set([...(days || []).flatMap(d => d.work_types || []), ...(reps || []).flatMap(r => (r.work || '').split(', ').filter(Boolean))])];
  const summary = [works.join(' · '), dates.length ? `${dates.length === 1 ? 'יום עבודה אחד' : dates.length + ' ימי עבודה'}${dates.length ? ` (${dm(dates[0])}${dates.length > 1 ? '–' + dm(dates.at(-1)) : ''})` : ''}` : '', (tasks || []).length ? `${tasks.length} משימות בוצעו` : ''].filter(Boolean).join('\n');
  const F = { name: p.sites?.contact_name || '', role: '', full: true, rating: 5, works: summary, notes: '' };
  el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}/d" aria-label="חזרה">${icon('back', 20)}</a><div class="grow"><small class="muted">החתמת לקוח</small><b class="ttl">${esc(p.name)}</b></div></header>
    <div class="stack">
      <div class="note">מגישים את הטלפון ללקוח. הוא קורא את הסיכום, מאשר וחותם.</div>
      <div class="sec"><h3>מה בוצע</h3><textarea id="sw" rows="4">${esc(F.works)}</textarea></div>
      <div class="sec"><label class="field">שם החותם<input type="text" id="sn" value="${esc(F.name)}"></label>
        <label class="field">תפקיד<input type="text" id="sr" placeholder="מנהל אחזקה, מנהל אתר…"></label>
        <label class="tog"><span>העבודה בוצעה במלואה ולשביעות רצוני</span><span class="sw"><input type="checkbox" id="sf" checked><i></i></span></label>
        <b>שביעות רצון</b><div class="stars" id="st">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${F.rating >= n}">★</button>`).join('')}</div>
        <label class="field">הערות הלקוח<textarea id="snt" rows="2"></textarea></label>
        <div class="row"><b class="grow">חתימה</b><button class="chip" id="sclr" type="button">ניקוי</button></div><canvas id="sig" class="sig"></canvas></div>
    </div>`;
  const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<button class="btn primary" id="sgo">אישור וחתימה</button>'; document.body.appendChild(bar);
  $$('#st [data-q]').forEach(b => b.onclick = () => { F.rating = +b.dataset.q; $$('#st [data-q]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.q <= F.rating)); });
  const { pad } = await import('./today.js'); const sig = pad($('#sig')); $('#sclr').onclick = () => sig.clear();
  $('#sgo').onclick = async () => {
    const name = $('#sn').value.trim(); if (!name) return toast('חסר שם החותם');
    if (sig.empty()) return toast('חסרה חתימה');
    const id = uid(), path = `${state.user.id}/signoff/${id}.png`;
    $('#sgo').disabled = true;
    await enqueue({ kind: 'file', path, blob: await sig.blob(), type: 'image/png' });
    await enqueue({ kind: 'insert', table: 'project_signoffs', row: { id, project_id: pid, signer_name: name, signer_role: $('#sr').value.trim() || null, full_ok: $('#sf').checked, rating: F.rating, works: $('#sw').value.trim() || null, notes: $('#snt').value.trim() || null, signature_path: path, created_by: state.user.id } });
    toast('נחתם ונשלח למשרד'); location.hash = '#/p/' + pid + '/d';
  };
}

// ---------- סיכום פרויקט פנימי ----------
export async function renderSummary(el, pid) {
  if (!isManager()) { el.innerHTML = '<div class="empty">לסיכום הפנימי יש גישה למנהלים בלבד.</div>'; return; }
  el.innerHTML = `<div class="skel"></div>`;
  const [{ data: p }, { data: s }, { data: iss }, { data: reps }] = await Promise.all([
    sb.from('projects').select('id,name').eq('id', pid).single(),
    sb.from('project_summaries').select('*').eq('project_id', pid).maybeSingle(),
    sb.from('issues').select('body,created_at,resolution').eq('project_id', pid).order('created_at'),
    sb.from('field_reports').select('report_date,issues').eq('project_id', pid).not('issues', 'is', null).order('report_date'),
  ]);
  const auto = [...(reps || []).map(r => `${dm(r.report_date)}: ${r.issues}`), ...(iss || []).map(i => `${dm(i.created_at.slice(0, 10))}: ${i.body}${i.resolution ? ' → ' + i.resolution : ''}`)].join('\n');
  const F = { quality: s?.quality || 0, issues: s?.issues ?? auto, solutions: s?.solutions || (iss || []).filter(i => i.resolution).map(i => i.resolution).join('\n'), lessons: s?.lessons || '', notes: s?.notes || '' };
  el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}/d" aria-label="חזרה">${icon('back', 20)}</a><div class="grow"><small class="muted">סיכום פרויקט פנימי</small><b class="ttl">${esc(p?.name || '')}</b></div></header>
    <div class="stack"><div class="small muted">פנימי בלבד, למנהלים. השדות מתמלאים מראש מהדוחות — עורכים ומשלימים.</div>
      <div class="sec"><b>איכות הביצוע</b><div class="stars" id="sq">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${F.quality >= n}">★</button>`).join('')}</div></div>
      <div class="sec"><label class="field">תקלות ובעיות שהתגלו<textarea id="f1" rows="5">${esc(F.issues)}</textarea></label>
        <label class="field">פתרונות שיושמו<textarea id="f2" rows="3">${esc(F.solutions)}</textarea></label>
        <label class="field">לקחים — מה משנים בפעם הבאה<textarea id="f3" rows="3">${esc(F.lessons)}</textarea></label>
        <label class="field">הערות מקצועיות<textarea id="f4" rows="2">${esc(F.notes)}</textarea></label></div></div>`;
  $$('#sq [data-q]').forEach(b => b.onclick = () => { F.quality = +b.dataset.q; $$('#sq [data-q]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.q <= F.quality)); });
  const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<button class="btn primary" id="sgo">שמירת הסיכום</button>'; document.body.appendChild(bar);
  $('#sgo').onclick = async () => {
    const row = { project_id: pid, quality: F.quality || null, issues: $('#f1').value.trim() || null, solutions: $('#f2').value.trim() || null, lessons: $('#f3').value.trim() || null, notes: $('#f4').value.trim() || null, updated_by: state.user.id };
    await enqueue({ kind: 'insert', table: 'project_summaries', row }); toast('הסיכום נשמר'); location.hash = '#/p/' + pid + '/d';
  };
}

// ---------- לשונית "דוחות" בפרויקט ----------
export async function reportsTab(box, D, { reload, schedule }) {
  const M = isManager(), pid = D.p.id, t = isoDay();
  box.innerHTML = `<button class="btn primary block big" id="nr">${icon('plus', 20)} דוח חדש</button><div id="rlist" class="stack"><div class="skel"></div></div>`;
  $('#nr').onclick = () => pickType(pid);
  const [{ data: sos }, { data: sum }, { data: ph }] = await Promise.all([
    sb.from('project_signoffs').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
    M ? sb.from('project_summaries').select('*').eq('project_id', pid).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('photos').select('storage_path,kind,work_day_id').eq('project_id', pid).in('kind', ['after', 'before']).order('created_at'),
  ]);
  const pushed = new Set(D.days.map(d => d.monday_item_id).filter(Boolean));
  const thumbs = {}; (ph || []).forEach(x => { if (!thumbs[x.work_day_id]) thumbs[x.work_day_id] = x.storage_path; });
  const urls = await signedUrls('field', Object.values(thumbs)).catch(() => ({}));
  const mUrls = await signedUrls('media', D.reps.map(r => (r.photos || []).find(Boolean)).filter(Boolean)).catch(() => ({}));
  const upcoming = D.days.filter(d => d.status !== 'done' && d.day >= t && d.kind !== 'report');
  const feed = [
    ...D.days.filter(d => d.status === 'done' || d.kind === 'report').map(d => ({ at: d.day, html: `<a class="rep" href="#/day/${d.id}">${thumbs[d.id] && urls[thumbs[d.id]] ? `<img src="${esc(urls[thumbs[d.id]])}" alt="">` : `<span class="rep-ph">${icon('report', 22)}</span>`}<span class="grow"><b>דוח יומי · ${dayLabel(d.day)}</b><small>${esc((d.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', '))}${d.gallons != null ? ` · ${nf(d.gallons)} גל׳` : ''}</small></span><span class="pill ${d.status === 'done' ? (d.monday_item_id ? 'ok' : '') : 'warn'}">${d.status === 'done' ? 'נשלח' : 'טיוטה'}</span></a>` })),
    ...D.reps.filter(r => !pushed.has(r.monday_item_id)).map(r => { const p1 = (r.photos || []).find(Boolean); return { at: r.report_date, html: `<button class="rep" data-mr="${r.monday_item_id}">${p1 && mUrls[p1] ? `<img src="${esc(mUrls[p1])}" alt="">` : `<span class="rep-ph">${icon('report', 22)}</span>`}<span class="grow"><b>דוח יומי · ${dm(r.report_date)}</b><small>${esc([r.crew, r.work].filter(Boolean).join(' · '))}</small>${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}</span></button>` }; }),
    ...D.issues.map(i => ({ at: i.created_at.slice(0, 10), html: `<button class="rep" data-is="${i.id}"><span class="rep-ph ${i.status === 'open' ? 'warnbg' : ''}">${icon('alert', 22)}</span><span class="grow"><b>תקלה · ${dm(i.created_at.slice(0, 10))}</b><small>${esc(i.body)}</small></span><span class="pill ${i.status === 'open' ? (i.severity === 'critical' ? 'bad' : 'warn') : 'ok'}">${i.status === 'open' ? 'פתוחה' : 'טופלה'}</span></button>` })),
    ...(sos || []).map(s => ({ at: s.created_at.slice(0, 10), html: `<button class="rep" data-so="${s.id}"><span class="rep-ph okbg">${icon('clipboard', 22)}</span><span class="grow"><b>החתמת לקוח · ${dm(s.created_at.slice(0, 10))}</b><small>${esc(s.signer_name)}${s.signer_role ? ' · ' + esc(s.signer_role) : ''}${s.rating ? ' · ' + '★'.repeat(s.rating) : ''}</small></span><span class="pill ${s.full_ok ? 'ok' : 'warn'}">${s.full_ok ? 'אושר' : 'עם הערות'}</span></button>` })),
    ...(sum ? [{ at: sum.updated_at.slice(0, 10), html: `<a class="rep" href="#/summary/${pid}"><span class="rep-ph">${icon('shield', 22)}</span><span class="grow"><b>סיכום פרויקט פנימי</b><small>${sum.quality ? '★'.repeat(sum.quality) + ' · ' : ''}עודכן ${dm(sum.updated_at.slice(0, 10))}</small></span><span class="pill">נשמר</span></a>` }] : []),
  ].sort((a, b) => a.at < b.at ? 1 : -1);
  $('#rlist').innerHTML = `
    ${M || upcoming.length ? `<section><div class="sh-row"><h3 class="sh">ימי שטח מתוכננים</h3>${M ? `<button class="more" id="sch" style="border:0;background:none;cursor:pointer">${D.days.length ? 'שיבוץ מחדש' : 'שיבוץ ימים'}</button>` : ''}</div>
      ${upcoming.map(d => `<a class="lrow" href="#/day/${d.id}"><span class="datebox"><b>${+d.day.slice(8)}</b><small>${dm(d.day)}</small></span><span class="grow"><b>${dayLabel(d.day)}${d.is_last_day ? ' · יום אחרון' : ''}</b><small>${d.report_time ? d.report_time.slice(0, 5) + ' · ' : ''}${esc((d.work_day_crew || []).map(c => (c.profiles?.full_name?.split(' ')[0] || '') + (c.role !== 'lead' ? (c.confirmed_at ? ' ✓' : ' ?') : '')).join(', '))}</small></span></a>`).join('') || '<div class="small muted">אין ימים מתוכננים</div>'}</section>` : ''}
    <section><div class="sh-row"><h3 class="sh">כל הדוחות</h3><span class="count">${feed.length}</span></div>
      <div class="list">${feed.map(f => f.html).join('') || `<div class="empty-card"><span class="ei">${icon('report', 26)}</span><span><b>עוד אין דוחות</b><small>לוחצים "דוח חדש" למעלה</small></span></div>`}</div></section>`;
  const s = $('#sch'); if (s) s.onclick = schedule;
  $$('[data-mr]').forEach(b => b.onclick = async () => { const r = D.reps.find(x => x.monday_item_id === b.dataset.mr); const u = await signedUrls('media', (r.photos || []).filter(Boolean));
    sheet(`<h3>דוח יומי · ${dm(r.report_date)}</h3><div class="small muted">${esc(r.crew || '')}</div>
      <div class="menu">${[['עבודה', r.work], ['שעות', r.hours], ['גלונים', r.gallons], ['בעיות', r.issues], ['הערות', r.notes]].filter(x => x[1]).map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${esc(String(v))}</b></span></div>`).join('')}</div>
      <div class="gallery">${(r.photos || []).filter(Boolean).map(x => `<button data-z="${esc(u[x])}"><img src="${esc(u[x])}" alt=""></button>`).join('')}</div>
      ${isManager() ? `<a class="more center" href="https://edroneil-force.monday.com/boards/5099882177/pulses/${r.monday_item_id}" target="_blank" rel="noopener">פתיחה במאנדי</a>` : ''}<button class="btn ghost block" data-close>סגירה</button>`, sh => $$('[data-z]', sh).forEach(z => z.onclick = () => zoom(z.dataset.z, ''))); });
  $$('[data-is]').forEach(b => b.onclick = async () => { const i = D.issues.find(x => x.id === b.dataset.is);
    const { data: ip } = await sb.from('photos').select('storage_path').eq('issue_id', i.id); const u = await signedUrls('field', (ip || []).map(x => x.storage_path));
    sheet(`<h3>תקלה · ${dm(i.created_at.slice(0, 10))}</h3><div>${esc(i.body)}</div>${i.resolution ? `<div class="note">טיפול: ${esc(i.resolution)}</div>` : ''}
      <div class="gallery">${(ip || []).map(x => `<button data-z="${esc(u[x.storage_path])}"><img src="${esc(u[x.storage_path])}" alt=""></button>`).join('')}</div>
      <div class="row-btns"><button class="btn ghost" data-close>סגירה</button>${M && i.status === 'open' ? '<button class="btn primary" id="ifix">סימון כטופלה</button>' : ''}</div>`, (sh, close) => {
      $$('[data-z]', sh).forEach(z => z.onclick = () => zoom(z.dataset.z, ''));
      const f = $('#ifix', sh); if (f) f.onclick = async () => { close(); const { ask } = await import('../lib/core.js'); const r = await ask('איך טופל?', { multiline: true, ok: 'סגירת התקלה' }); if (r == null) return;
        await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: new Date().toISOString() } }); reload('d'); };
    }); });
  $$('[data-so]').forEach(b => b.onclick = async () => { const s = sos.find(x => x.id === b.dataset.so); const u = s.signature_path ? await signedUrls('field', [s.signature_path]) : {};
    sheet(`<h3>החתמת לקוח · ${dm(s.created_at.slice(0, 10))}</h3><div class="menu">${[['חותם', s.signer_name + (s.signer_role ? ' · ' + s.signer_role : '')], ['אישור', s.full_ok ? 'בוצע במלואו ולשביעות רצון' : 'עם הערות'], ['שביעות רצון', s.rating ? '★'.repeat(s.rating) : ''], ['מה בוצע', s.works], ['הערות', s.notes]].filter(x => x[1]).map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${esc(v)}</b></span></div>`).join('')}</div>
      ${u[s.signature_path] ? `<img src="${esc(u[s.signature_path])}" alt="חתימה" style="background:#fff;border-radius:12px;max-width:100%">` : ''}<button class="btn ghost block" data-close>סגירה</button>`); });
}
