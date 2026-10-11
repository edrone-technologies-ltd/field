// מערכת הדוחות: כל דוח נפתח מתוך פרויקט (או מהבית ← בחירת פרויקט).
// יומי (מסך יום השטח במצב דוח) · תקלה / אירוע בטיחות · החתמת לקוח · סיכום פרויקט פנימי · אפיון.
import { sb, state, isManager, can, cache, enqueue, signedUrls, addFieldPhoto, sheet, uid, icon, coverArt, $, $$, esc, nf, toast, zoom, isoDay, dayLabel, dm, confirmBox, goUp, thumbUrls, backBtn } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const ROLE_CAN_SIGN = () => isManager() || state.profile.role === 'crew_lead';
const rating = n => `<span class="rating" aria-label="${n} מתוך 5">${icon('star', 12).repeat(n)}</span>`;
const thumb = (url, ic, cls = '') => url ? `<span class="mic"><img src="${esc(url)}" alt=""></span>` : `<span class="mic ${cls}">${icon(ic, 20)}</span>`;
export const TYPES = [
  { k: 'spec', ic: 'clipboard', t: 'אפיון', s: 'סיור אפיון לליד או לאתר', ok: () => can('specs'), noProject: true },
  { k: 'daily', ic: 'report', t: 'דוח ביצוע יומי', s: 'מה בוצע, שעות, צוות, חומר ותמונות', ok: () => true },
  { k: 'issue', ic: 'alert', t: 'תקלה / אירוע בטיחות', s: 'רחפן, ציוד, אתר, כמעט תאונה', ok: () => true },
  { k: 'expense', ic: 'report', t: 'הוצאה', s: 'דלק, חניה, אגרה, אוכל, לינה — עם צילום קבלה', ok: () => true },
  { k: 'signoff', ic: 'clipboard', t: 'החתמת לקוח — אישור ביצוע', s: 'הלקוח מאשר וחותם באצבע', ok: ROLE_CAN_SIGN },
  { k: 'visit', ic: 'users', t: 'דוח ביקור / ביקורת', s: 'ביקורת צוות, סיור עם לקוח, בקרת איכות', ok: isManager },
  { k: 'summary', ic: 'shield', t: 'סיכום פרויקט פנימי', s: 'איכות, תקלות, פתרונות ולקחים', ok: isManager },
];

// ---------- פתיחת דוח חדש ----------
export async function newReport(projectId, links = [], type = null) {
  // סוג ידוע מראש (מה"+" הגלובלי): ישר לזרימה של הסוג, בלי בחירת סוג
  const T = type && TYPES.find(x => x.k === type);
  if (T) {
    if (T.noProject) return open(T.k);
    if (projectId) return open(T.k, projectId);
    // תקלה כשיש לי יום שטח היום: ישר ליום (בלי בחירת פרויקט)
    if (T.k === 'issue') { const w = await myDayNow(); if (w) return issueSheet(w.project_id, null, null, w.id); }
    const again = () => pickProject(pid => open(T.k, pid, again), () => newReport()); return again();
  }
  if (projectId) return pickType(projectId);
  // מהבית: קודם סוג הדוח, ואז (אם צריך) הפרויקט
  sheet(`<h3>${links.length ? 'חדש' : 'דוח חדש'}</h3><div class="menu">${TYPES.filter(t => t.ok()).map(t => `<button class="lrow" data-t="${t.k}"><span class="mic">${icon(t.ic, 20)}</span><span class="grow"><b>${t.t}</b><small>${t.s}</small></span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}${links.map(([h, ic, t, d]) => `<a class="lrow" href="${h}" data-close><span class="mic">${icon(ic, 20)}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $$('[data-t]', s).forEach(b => b.onclick = async () => { close(); const t = TYPES.find(x => x.k === b.dataset.t); if (t.noProject) return open(t.k);
      if (t.k === 'issue') { const w = await myDayNow(); if (w) return issueSheet(w.project_id, null, null, w.id); }
      const again = () => pickProject(pid => open(t.k, pid, again), () => newReport()); again(); });
  });
}
async function pickProject(then, back) {
  const { data, error } = await sb.rpc('reportable_projects'); if (error) return toast(errText(error, 'רשימת הפרויקטים לא נטענה — נסו שוב'));
  sheet(`<h3>על איזה פרויקט?</h3><input type="search" class="search" id="rq" placeholder="חיפוש פרויקט">
    <div class="list" id="rl">${(data || []).map(p => `<button class="lrow" data-p="${p.id}" data-n="${esc(p.name + ' ' + (p.client_name || ''))}"><span class="grow"><b>${esc(p.name)}</b><small>${esc([p.client_name, p.status_label].filter(Boolean).join(' · '))}</small></span>${p.mine ? '<span class="pill lime">שלי</span>' : ''}</button>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $('#rq', s).oninput = e => $$('[data-p]', s).forEach(b => b.hidden = !b.dataset.n.includes(e.target.value.trim()));
    $$('[data-p]', s).forEach(b => b.onclick = async () => { try { await sb.rpc('join_project', { p: b.dataset.p }); } catch {} close(); then(b.dataset.p); });
  }, { back });
}
function pickType(pid) {
  sheet(`<h3>איזה דוח?</h3><div class="menu">${TYPES.filter(t => t.ok()).map(t => `<button class="lrow" data-t="${t.k}"><span class="mic">${icon(t.ic, 20)}</span><span class="grow"><b>${t.t}</b><small>${t.s}</small></span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div>
    <button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    $$('[data-t]', s).forEach(b => b.onclick = () => { close(); open(b.dataset.t, pid, () => pickType(pid)); });
  });
}
export function open(k, pid, back) {
  if (k === 'spec') { location.hash = '#/specs'; return; }
  if (k === 'daily') return dailyDate(pid, back);
  if (k === 'issue') return issueSheet(pid, null, back);
  if (k === 'expense') return import('./expenses.js').then(m => m.newExpense(pid, null, back));
  if (k === 'signoff') location.hash = '#/signoff/' + pid;
  if (k === 'summary') location.hash = '#/summary/' + pid;
  if (k === 'visit') location.hash = '#/visit/new/' + pid;
}
function dailyDate(pid, back) {
  const t = isoDay(), y = isoDay(new Date(Date.now() - 864e5));
  sheet(`<h3>דוח ביצוע יומי · לאיזה יום?</h3><div class="chips"><button class="chip" data-d="${t}" aria-pressed="true">היום</button><button class="chip" data-d="${y}">אתמול</button></div>
    <label class="field">או תאריך אחר<input type="date" id="dd" max="${t}" value="${t}"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="dgo">פתיחת הדוח</button></div>`, (s, close) => {
    $$('[data-d]', s).forEach(c => c.onclick = () => { $('#dd', s).value = c.dataset.d; $$('[data-d]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#dgo', s).onclick = async () => {
      const d = $('#dd', s).value; if (new Date(d + 'T12:00').getDay() === 6) return toast('לא עובדים בשבת');
      const go = $('#dgo', s); if (go.disabled) return; go.disabled = true;
      const { data, error } = await sb.rpc('start_report', { p: pid, d }); if (error) { go.disabled = false; return toast(errText(error, 'הדוח לא נפתח — נסו שוב'), 4000); }
      close(); location.hash = '#/day/' + data;
    };
  }, { back });
}
// יום השטח שלי עכשיו: המסך הפתוח (#/day/…), אחרת היום שלי היום (מהשרת, ובלי קליטה — מהמטמון)
async function myDayNow() {
  const me = state.user.id, t = isoDay();
  const dayId = (location.hash.match(/^#\/day\/([0-9a-f-]{36})/) || [])[1];
  if (dayId) { const c = await cache.get('day:' + dayId).catch(() => null); if (c?.day?.project_id) return { id: dayId, project_id: c.day.project_id }; }
  try {
    const { data, error } = await sb.from('work_days').select('id,project_id,status,work_day_crew!inner(user_id)').eq('day', t).eq('work_day_crew.user_id', me).neq('status', 'done').limit(1);
    if (error) throw error; if (data?.[0]) return data[0];
    const { data: led } = await sb.from('work_days').select('id,project_id').eq('day', t).eq('crew_lead_id', me).neq('status', 'done').limit(1);
    return led?.[0] || null;
  } catch {
    const h = await cache.get('home2').catch(() => null);
    return (h?.wdays || []).find(w => w.day === t && w.status !== 'done' && (w.crew_lead_id === me || (w.work_day_crew || []).some(c => c.user_id === me))) || null;
  }
}
const ISSUE_KIND = { 'רחפן': 'equipment', 'ציוד': 'equipment', 'בטיחות': 'safety', 'כמעט תאונה': 'near_miss', 'אתר': 'site', 'לקוח': 'site', 'אחר': 'other' };
// dayId: יום השטח שאליו התקלה שייכת (לא חובה). מספיק סוג בלחיצה, מילים או תמונה
export function issueSheet(pid, after, back, dayId = null) {
  let kind = null, crit = false, files = [];
  sheet(`<h3>תקלה / אירוע בטיחות</h3><div class="chips">${Object.keys(ISSUE_KIND).map(k => `<button class="chip" data-k="${k}" aria-pressed="false">${k}</button>`).join('')}</div>
    <textarea id="ib" rows="4" placeholder="מה קרה, איפה, מה נעשה"></textarea>
    <label class="tog"><span>קריטי — העבודה נעצרה / סכנה</span><span class="sw"><input type="checkbox" id="ic"><i></i></span></label>
    <label class="btn ghost block">${icon('photo', 18)} תמונות<input type="file" accept="image/*" multiple id="ip" hidden></label><div id="ipn" class="small muted"></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="isend">דיווח</button></div>`, (s, close) => {
    $$('[data-k]', s).forEach(b => b.onclick = () => { kind = kind === b.dataset.k ? null : b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x.dataset.k === kind)); });
    $('#ic', s).onchange = e => crit = e.target.checked;
    $('#ip', s).onchange = e => { files = [...e.target.files]; $('#ipn', s).textContent = files.length ? `${files.length} תמונות יצורפו` : ''; };
    $('#isend', s).onclick = async () => {
      const text = $('#ib', s).value.trim(); if (!text && !kind && !files.length) { $('#ib', s).focus(); return toast('בחרו סוג, כתבו או צלמו'); }
      if ($('#isend', s).disabled) return; $('#isend', s).disabled = true;
      const body = text ? (['רחפן', 'לקוח'].includes(kind) ? `${kind}: ${text}` : text) : kind || 'תקלה (בתמונה)';
      const row = { id: uid(), project_id: pid, ...(dayId ? { work_day_id: dayId } : {}), kind: ISSUE_KIND[kind] || 'other', severity: crit ? 'critical' : 'normal', body, opened_by: state.user.id };
      await enqueue({ kind: 'insert', table: 'issues', row });
      for (const f of files) await addFieldPhoto(f, { kind: 'issue', project_id: pid, issue_id: row.id, ...(dayId ? { work_day_id: dayId } : {}) });
      close(); toast(crit ? 'דווח — המנהלים מקבלים התראה' : 'התקלה דווחה'); after && after(row);
    };
  }, { back });
}

// החתמת לקוח — modules/signoff.js

// ---------- סיכום פרויקט פנימי ----------
export async function renderSummary(el, pid) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין גישה</div>'; return; }
  el.innerHTML = `<div class="skel"></div>`;
  const [{ data: p }, { data: s }, { data: iss }, { data: reps }] = await Promise.all([
    sb.from('projects').select('id,name').eq('id', pid).single(),
    sb.from('project_summaries').select('*').eq('project_id', pid).maybeSingle(),
    sb.from('issues').select('body,created_at,resolution').eq('project_id', pid).order('created_at'),
    sb.from('field_reports').select('report_date,issues').eq('project_id', pid).eq('excluded', false).not('issues', 'is', null).order('report_date'),
  ]);
  const auto = [...(reps || []).map(r => `${dm(r.report_date)}: ${r.issues}`), ...(iss || []).map(i => `${dm(i.created_at.slice(0, 10))}: ${i.body}${i.resolution ? ' → ' + i.resolution : ''}`)].join('\n');
  const F = { quality: s?.quality || 0, issues: s?.issues ?? auto, solutions: s?.solutions || (iss || []).filter(i => i.resolution).map(i => i.resolution).join('\n'), lessons: s?.lessons || '', notes: s?.notes || '' };
  el.innerHTML = `<header class="phead">${backBtn(`#/p/${pid}/d`)}<h1>סיכום פרויקט</h1></header>
    <div class="stack"><div class="muted">${esc(p?.name || '')}</div>
      <div class="sec"><b>איכות הביצוע</b><div class="stars" id="sq">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${F.quality >= n}">★</button>`).join('')}</div></div>
      <div class="sec"><label class="field">תקלות ובעיות שהתגלו<textarea id="f1" rows="5">${esc(F.issues)}</textarea></label>
        <label class="field">פתרונות שיושמו<textarea id="f2" rows="3">${esc(F.solutions)}</textarea></label>
        <label class="field">לקחים — מה משנים בפעם הבאה<textarea id="f3" rows="3">${esc(F.lessons)}</textarea></label>
        <label class="field">הערות מקצועיות<textarea id="f4" rows="2">${esc(F.notes)}</textarea></label></div></div>`;
  $$('#sq [data-q]').forEach(b => b.onclick = () => { F.quality = +b.dataset.q; $$('#sq [data-q]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.q <= F.quality)); });
  const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<button class="btn primary" id="sgo">שמירת הסיכום</button>'; document.body.appendChild(bar);
  $('#sgo').onclick = async () => {
    if ($('#sgo').disabled) return; $('#sgo').disabled = true;
    const row = { project_id: pid, quality: F.quality || null, issues: $('#f1').value.trim() || null, solutions: $('#f2').value.trim() || null, lessons: $('#f3').value.trim() || null, notes: $('#f4').value.trim() || null, updated_by: state.user.id };
    await enqueue({ kind: 'insert', table: 'project_summaries', row }); toast('הסיכום נשמר'); goUp('#/p/' + pid + '/d');
  };
}

// ---------- לשונית "דוחות" בפרויקט ----------
export async function reportsTab(box, D, { reload }) {
  const M = isManager(), pid = D.p.id, t = isoDay();
  box.innerHTML = `<div id="rlist" class="stack"><div class="skel"></div></div>`;
  const [{ data: sos }, { data: sum }, { data: ph }, { data: vis }] = await Promise.all([
    sb.from('project_signoffs').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
    M ? sb.from('project_summaries').select('*').eq('project_id', pid).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('photos').select('storage_path,kind,work_day_id').eq('project_id', pid).in('kind', ['after', 'before']).order('created_at'),
    M ? sb.from('project_visits').select('id,kind,visit_date,findings,rating,profiles:visitor_id(full_name)').eq('project_id', pid) : Promise.resolve({ data: [] }),
  ]);
  const VK = { crew_check: 'ביקורת צוות', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור' };
  const pushed = new Set(D.days.map(d => d.monday_item_id).filter(Boolean));
  const thumbs = {}; (ph || []).forEach(x => { if (!thumbs[x.work_day_id]) thumbs[x.work_day_id] = x.storage_path; });
  const urls = await thumbUrls('field', Object.values(thumbs)).then(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.t]))).catch(() => ({}));
  const mUrls = await signedUrls('media', D.reps.map(r => (r.photos || []).find(Boolean)).filter(Boolean)).catch(() => ({}));
  const feed = [
    ...D.days.filter(d => d.status === 'done' || d.kind === 'report').map(d => ({ at: d.day, html: `<a class="lrow" href="#/day/${d.id}">${thumb(thumbs[d.id] && urls[thumbs[d.id]], 'report')}<span class="grow"><b>דוח יומי · ${dayLabel(d.day)}</b><small>${esc((d.work_day_crew || []).map(c => c.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', '))}${d.gallons != null ? ` · ${nf(d.gallons)} גל׳` : ''}</small></span><span class="pill ${d.status === 'done' ? (d.monday_item_id ? 'ok' : '') : 'warn'}">${d.status === 'done' ? 'נשלח' : 'טיוטה'}</span></a>` })),
    ...D.reps.filter(r => !pushed.has(r.monday_item_id)).map(r => { const p1 = (r.photos || []).find(Boolean); return { at: r.report_date, html: `<button class="lrow" data-mr="${r.monday_item_id}">${thumb(p1 && mUrls[p1], 'report')}<span class="grow"><b>דוח יומי · ${dm(r.report_date)}</b><small>${esc([r.crew, r.work].filter(Boolean).join(' · '))}</small>${r.issues ? `<small class="issue">${esc(r.issues)}</small>` : ''}</span></button>` }; }),
    ...D.issues.map(i => ({ at: i.created_at.slice(0, 10), html: `<button class="lrow" data-is="${i.id}">${thumb(null, 'alert', i.status === 'open' ? 'warnbg' : '')}<span class="grow"><b>תקלה · ${dm(i.created_at.slice(0, 10))}</b><small>${esc(i.body)}</small></span><span class="pill ${i.status === 'open' ? (i.severity === 'critical' ? 'bad' : 'warn') : 'ok'}">${i.status === 'open' ? 'פתוחה' : 'טופלה'}</span></button>` })),
    ...(sos || []).map(s => ({ at: s.created_at.slice(0, 10), html: `<button class="lrow" data-so="${s.id}">${thumb(null, 'clipboard', 'okbg')}<span class="grow"><b>החתמת לקוח · ${dm(s.created_at.slice(0, 10))}</b><small>${esc(s.signer_name)}${s.signer_role ? ' · ' + esc(s.signer_role) : ''}${s.rating ? ' · ' + rating(s.rating) : ''}</small></span><span class="pill ${s.full_ok ? 'ok' : 'warn'}">${s.full_ok ? 'אושר' : 'עם הערות'}</span></button>` })),
    ...(vis || []).map(v => { const fx = (v.findings || []).filter(x => x.sev === 'fix').length;
      return { at: v.visit_date, html: `<a class="lrow" href="#/visit/${v.id}">${thumb(null, 'users')}<span class="grow"><b>דוח ביקור · ${VK[v.kind] || ''}</b><small>${dm(v.visit_date)} · ${esc(v.profiles?.full_name || '')} · ${(v.findings || []).length} ממצאים</small></span>${fx ? `<span class="pill bad">${fx} לתיקון</span>` : ''}</a>` }; }),
    ...(sum ? [{ at: sum.updated_at.slice(0, 10), html: `<a class="lrow" href="#/summary/${pid}">${thumb(null, 'shield')}<span class="grow"><b>סיכום פרויקט פנימי</b><small>${sum.quality ? rating(sum.quality) + ' · ' : ''}עודכן ${dm(sum.updated_at.slice(0, 10))}</small></span><span class="pill">נשמר</span></a>` }] : []),
  ].sort((a, b) => a.at < b.at ? 1 : -1);
  $('#rlist').innerHTML = `
    <section><div class="sh-row"><h3 class="sh">כל הדוחות</h3>${feed.length ? `<span class="count">${feed.length}</span>` : ''}</div>
      ${feed.length ? `<div class="list">${feed.map(f => f.html).join('')}</div>` : '<div class="empty-line">אין דוחות</div>'}</section>`;
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
        await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: r, closed_by: state.user.id, closed_at: new Date().toISOString() } }); toast('התקלה נסגרה'); reload('d'); };
    }); });
  $$('[data-so]').forEach(b => b.onclick = async () => { const s = sos.find(x => x.id === b.dataset.so); const u = s.signature_path ? await signedUrls('field', [s.signature_path]) : {};
    sheet(`<h3>החתמת לקוח · ${dm(s.created_at.slice(0, 10))}</h3><div class="menu">${[['חותם', s.signer_name + (s.signer_role ? ' · ' + s.signer_role : '')], ['אישור', s.full_ok ? 'בוצע במלואו ולשביעות רצון' : 'עם הערות'], ['שביעות רצון', s.rating ? `${s.rating}/5` : ''], ['מה בוצע', s.works], ['הערות', s.notes]].filter(x => x[1]).map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${esc(v)}</b></span></div>`).join('')}</div>
      ${u[s.signature_path] ? `<img src="${esc(u[s.signature_path])}" alt="חתימה" class="sigimg">` : ''}<button class="btn ghost block" data-close>סגירה</button>`); });
}
