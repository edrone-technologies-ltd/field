// דוח ביקור / ביקורת: מנהל מבקר צוות, סיור עם לקוח או בקרת איכות. שייך לפרויקט אבל לא לשרשרת הצוות.
// ממצאי "לתיקון" עוברים בלחיצה אחת לצ׳קליסט הפרויקט — הכל במקום אחד, התראה אחת.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, backBtn, signedUrls, zoom, isoDay, dm, goUp, confirmBox } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { errText } from '../lib/audit.js';

export const KIND = { crew_check: 'ביקורת צוות בשטח', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור אחר' };
const FIELD = ['ops_manager', 'crew_lead', 'crew', 'surveyor', 'admin'];
const team = async () => ((await sb.from('profiles').select('id,full_name,role').eq('is_active', true).order('full_name')).data || []).filter(u => FIELD.includes(u.role));
const PH = x => x.photos || (x.photo ? [x.photo] : []);   // תמונות לממצא (תאימות לדוחות עם תמונה אחת)
const SEV = { ok: ['תקין', 'ok'], note: ['הערה', 'warn'], fix: ['לתיקון', 'bad'] };

// טופס חדש / עריכה
export async function renderVisitForm(el, pid, vid) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין לך גישה למסך הזה</div>'; return; }
  const [{ data: p }, { data: v }] = await Promise.all([
    sb.from('projects').select('id,name,client_name,sites(contact_name)').eq('id', pid).single(),
    vid ? sb.from('project_visits').select('*').eq('id', vid).single() : Promise.resolve({ data: null })]);
  // טיוטה בטלפון לדוח חדש — יציאה באמצע (שיחה, מצלמה) לא מאבדת ממצאים
  const DK = 'visit-draft:' + pid, dget = () => { try { return JSON.parse(localStorage.getItem(DK) || 'null'); } catch { return null; } };
  const dput = x => { try { x ? localStorage.setItem(DK, JSON.stringify(x)) : localStorage.removeItem(DK); } catch { /* */ } };
  const dr = !v && dget();
  const f = v ? { ...v, findings: [...(v.findings || [])], todo: [...(v.todo || [])] } : dr?.f || { todo: [], kind: 'crew_check', visit_date: isoDay(), participants: '', findings: [], client_feedback: '', rating: 0, summary: '' };
  // מילוי מראש: הצוות של יום השטח בתאריך הביקור (או האחרון) → משתתפים; ראש הצוות → מטפל ברירת מחדל
  const crewOn = d => sb.from('work_days').select('day,work_day_crew(role,user_id,profiles(full_name))').eq('project_id', pid).lte('day', d).order('day', { ascending: false }).limit(1)
    .then(r => { const C = r.data?.[0]?.work_day_crew || []; return { txt: C.map(x => x.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', '), lead: C.find(x => x.role === 'lead')?.user_id || null }; }, () => ({ txt: '', lead: null }));
  const [urls, T, crew] = await Promise.all([signedUrls('field', [...f.findings, ...f.todo].flatMap(PH)), team(), v ? Promise.resolve(null) : crewOn(f.visit_date)]);
  const okLead = id => id && T.some(u => u.id === id) ? id : null;
  if (!v && !dr && crew?.txt) f.participants = crew.txt;
  const who = dr?.who || { id: okLead(crew?.lead), due: '' };
  let crewTxt = dr ? dr.crewTxt ?? f.participants : f.participants, autoLead = dr ? dr.autoLead ?? null : who.id;
  const hasDraft = () => !!dr && !!(f.findings.length || f.todo.length || (f.summary || '').trim() || (f.client_feedback || '').trim() || f.rating);
  const draw = () => {
    if (!vid) dput({ f, who, crewTxt, autoLead });
    el.innerHTML = `<header class="phead">${backBtn(`#/p/${pid}/d`)}<h1 class="grow">דוח ביקור</h1>${hasDraft() ? '<button class="chip" id="vdrop" type="button">טיוטה חדשה</button>' : ''}</header>
      <div class="stack lg">
        <div class="small muted">${esc(p?.name || '')}</div>
        <div class="field">סוג הביקור<div class="chips">${Object.entries(KIND).map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${f.kind === k}">${t}</button>`).join('')}</div></div>
        <div class="row"><label class="field grow">תאריך<input type="date" id="vd" value="${f.visit_date}"></label></div>
        <label class="field">${f.kind === 'client_tour' ? 'מי מהלקוח השתתף' : 'משתתפים'}<input id="vp" value="${esc(f.participants || '')}" placeholder="${f.kind === 'client_tour' ? 'למשל: רון — מנהל אחזקה' : 'למשל: צוות 1'}"></label>
        <section class="stack"><h3 class="sh">ממצאים</h3>
          <div class="row-btns"><label class="btn primary">${icon('photo', 18)} צילום ממצא<input type="file" accept="image/*" multiple id="vcam" hidden></label><button type="button" class="btn ghost" id="vadd">${icon('plus', 18)} ממצא בכתב</button></div>
          ${f.findings.length ? f.findings.map((x, i) => `<div class="finding">
            <textarea data-ft="${i}" rows="2" placeholder="מה ראית">${esc(x.text || '')}</textarea>
            <div class="row"><div class="chips">${Object.entries(SEV).map(([k, [t]]) => `<button type="button" class="chip" data-fs="${i}" data-v="${k}" aria-pressed="${x.sev === k}">${t}</button>`).join('')}</div><span class="grow"></span>
              <button type="button" class="chip" data-fr="${i}" aria-label="הסרה">${icon('x', 16)}</button></div>
            <div class="fphs">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}<label class="fph add" aria-label="הוספת תמונה">${icon('photo', 18)}<input type="file" accept="image/*" multiple data-fp="${i}" hidden></label></div></div>`).join('') : ''}
        </section>
        ${todoHtml(f, urls)}
        ${pending(f).length ? `<div class="field">למי לטפל<div class="chips">${T.map(u => `<button type="button" class="chip" data-who="${u.id}" aria-pressed="${who.id === u.id}">${esc(u.full_name)}</button>`).join('')}</div></div>
          <label class="field">עד מתי<input type="date" id="vdue" value="${who.due}"></label>` : ''}
        ${f.kind === 'client_tour' ? `<label class="field">מה הלקוח אמר<textarea id="vc" rows="3" placeholder="טענות, בקשות, שביעות רצון">${esc(f.client_feedback || '')}</textarea></label>` : ''}
        <div class="field">ציון כללי<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}" aria-pressed="${f.rating >= n}">★</button>`).join('')}</div></div>
        <label class="field">סיכום<textarea id="vs" rows="3">${esc(f.summary || '')}</textarea></label>
        <button class="btn primary block big" id="vsave">שמירת דוח ביקור${pending(f).length ? ` + ${pending(f).length} לצ׳קליסט` : ''}</button>
      </div>`;
    const keep = () => { if ($('#vdue')) who.due = $('#vdue').value; f.visit_date = $('#vd').value; f.participants = $('#vp').value; f.summary = $('#vs').value; if ($('#vc')) f.client_feedback = $('#vc').value; $$('[data-ft]').forEach(t => f.findings[+t.dataset.ft].text = t.value); };
    const dropB = $('#vdrop'); if (dropB) dropB.onclick = async () => { if (!(await confirmBox('למחוק את הטיוטה ולהתחיל דוח חדש?', { ok: 'מחיקה' }))) return; dput(null); renderVisitForm(el, pid); };
    // תאריך אחר → הצוות של אותו יום (רק אם לא שינו ידנית את המשתתפים)
    $('#vd').onchange = async () => { keep(); if (f.kind === 'client_tour' || (f.participants && f.participants !== crewTxt)) return;
      const c = await crewOn(f.visit_date); crewTxt = f.participants = c.txt; if (who.id === autoLead) who.id = autoLead = okLead(c.lead); draw(); };
    $$('[data-k]').forEach(b => b.onclick = () => { keep(); const was = f.participants; f.kind = b.dataset.k;
      if (f.kind === 'client_tour' && (!was || was === crewTxt) && p?.sites?.contact_name) f.participants = p.sites.contact_name;
      else if (f.kind !== 'client_tour' && was === p?.sites?.contact_name) f.participants = crewTxt || '';
      draw(); });
    if (!vid) { let dt; el.oninput = () => { clearTimeout(dt); dt = setTimeout(() => { keep(); dput({ f, who, crewTxt, autoLead }); }, 600); }; }
    $('#vadd').onclick = () => { keep(); f.findings.push({ text: '', sev: 'note' }); draw(); setTimeout(() => $$('[data-ft]').pop()?.focus(), 50); };
    $$('[data-fs]').forEach(b => b.onclick = () => { keep(); f.findings[+b.dataset.fs].sev = b.dataset.v; draw(); });
    $$('[data-fr]').forEach(b => b.onclick = () => { keep(); f.findings.splice(+b.dataset.fr, 1); draw(); });
    const addTodo = () => { const t = $('#vtin').value.trim(); if (!t) return; keep(); f.todo.push({ text: t }); draw(); setTimeout(() => $('#vtin')?.focus(), 50); };
    $('#vtadd').onclick = addTodo; $('#vtin').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } };
    $$('[data-tr]').forEach(b => b.onclick = () => { keep(); f.todo.splice(+b.dataset.tr, 1); draw(); });
    $$('[data-who]').forEach(b => b.onclick = () => { keep(); who.id = who.id === b.dataset.who ? null : b.dataset.who; draw(); });
    $$('[data-r]').forEach(b => b.onclick = () => { keep(); f.rating = +b.dataset.r; draw(); });
    $$('.fph').forEach(i => i.onclick = () => zoom(i.src, ''));
    // העלאה: כמה תמונות בבת אחת; "צילום ממצא" פותח ממצא חדש עם התמונות
    const put = async (file, caption) => {
      const blob = await shrink(file), path = `${state.user.id}/visits/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
      await sb.from('photos').insert({ storage_path: path, project_id: pid, kind: 'visit', uploaded_by: state.user.id, caption });
      return path;
    };
    const upload = async (files, x) => {
      keep();
      // תמונה אחת: סימון לפני השמירה (עיגול / חץ / תווית) — נשמרת המסומנת, והמקור נשמר לצידה
      let mk = null;
      if (files.length === 1) { mk = await import('../lib/viewer.js').then(m => m.markupFile(files[0])).catch(() => ({ blob: files[0], marked: false })); if (mk === null) return draw(); }
      toast('מעלה תמונות…');
      try {
        if (mk?.marked) { const path = await put(mk.blob, 'דוח ביקור · מסומן'); await put(files[0], 'דוח ביקור · מקור'); x.photos = [...PH(x), path]; delete x.photo; }
        else for (const file of files) { const path = await put(file, 'דוח ביקור'); x.photos = [...PH(x), path]; delete x.photo; }
        Object.assign(urls, await signedUrls('field', PH(x)));
      } catch (e) { toast(errText(e, 'התמונה לא עלתה — נסו שוב')); }
      draw();
    };
    $$('[data-fp]').forEach(inp => inp.onchange = () => inp.files.length && upload([...inp.files], f.findings[+inp.dataset.fp]));
    $$('[data-tp]').forEach(inp => inp.onchange = () => inp.files.length && upload([...inp.files], f.todo[+inp.dataset.tp]));
    $('#vcam').onchange = async e => { const fl = [...e.target.files]; if (!fl.length) return; keep(); const x = { text: '', sev: 'note' }; f.findings.push(x);
      await upload(fl, x); setTimeout(() => $$('[data-ft]').pop()?.focus(), 50); };
    $('#vsave').onclick = async () => {
      keep(); f.findings = f.findings.filter(x => (x.text || '').trim() || PH(x).length);
      const row = { project_id: pid, todo: f.todo, kind: f.kind, visit_date: f.visit_date, participants: f.participants || null, findings: f.findings,
        client_feedback: f.client_feedback || null, rating: f.rating || null, summary: f.summary || null };
      $('#vsave').disabled = true;
      const { data, error } = vid ? await sb.from('project_visits').update(row).eq('id', vid).select('id').single() : await sb.from('project_visits').insert(row).select('id').single();
      if (error) { $('#vsave').disabled = false; return toast(errText(error, 'הדוח לא נשמר — נסו שוב')); }
      dput(null); const n = await toChecklist(data.id, pid, f, who.id, who.due);
      toast(n ? `דוח הביקור נשמר · ${n} פריטים בצ׳קליסט` : 'דוח הביקור נשמר'); location.replace(`#/visit/${data.id}`);
    };
  };
  draw();
}

// צפייה
export async function renderVisit(el, id) {
  const M = isManager();
  const { data: v } = await sb.from('project_visits').select('*, projects(id,name,site_id), profiles:visitor_id(full_name)').eq('id', id).maybeSingle();
  if (!v) { el.innerHTML = `<header class="phead">${backBtn('#/reports')}<h1>דוח ביקור</h1></header><div class="empty-line">הדוח לא נמצא</div>`; return; }
  const F = v.findings || [], urls = await signedUrls('field', [...F, ...(v.todo || [])].flatMap(PH));
  const T = v.todo || [], open = pending({ findings: F, todo: T });
  // מצב הטיפול בשטח — מהמשימות עצמן (העובד מסמן "טופל" עם תמונת אחרי)
  const ids = [...F, ...T].map(x => x.task_id).filter(Boolean);
  const { data: tk } = ids.length ? await sb.from('tasks').select('id,title,project_id,status,assignee_id,due,done_at,done_note,photos,profiles:assignee_id(full_name)').in('id', ids) : { data: [] };
  const TK = new Map((tk || []).map(t => [t.id, t]));
  Object.assign(urls, await signedUrls('field', (tk || []).flatMap(t => t.photos?.after || [])).catch(() => ({})));
  const live = [...TK.values()].filter(t => t.status !== 'dropped'), tot = live.length, dn = live.filter(t => t.status === 'done').length;
  const unas = live.filter(t => t.status !== 'done' && !t.assignee_id);
  const first = n => (n || '').split(' ')[0];
  const st = x => { const t = TK.get(x.task_id); if (!t) return '';
    if (t.status !== 'done' && t.assignee_id === state.user.id) return `<button class="btn primary sm" data-fix="${t.id}">סימון כטופל</button>`;
    return t.status === 'done' ? `<span class="pill ok">טופל · ${dm(isoDay(new Date(t.done_at)))}</span>` : t.assignee_id ? `<span class="pill warn">אצל ${esc(first(t.profiles?.full_name))}${t.due ? ' · עד ' + dm(t.due) : ''}</span>` : '<span class="pill">ממתין לשיוך</span>'; };
  const row = (lbl, list) => list.length ? `<div class="small muted">${lbl}</div><div class="fphs">${list.map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</div>` : '';
  const shots = x => { const t = TK.get(x.task_id), aft = t?.photos?.after || [];
    return aft.length || t?.done_note ? `${row('לפני', PH(x))}${row('אחרי', aft)}${t?.done_note ? `<div class="small">${esc(t.done_note)}</div>` : ''}` : PH(x).length ? `<div class="fphs">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</div>` : ''; };
  const ring = (d, n) => `<div class="ring" style="--p:${Math.round(d / n * 100)}"><b>${d}/${n}</b></div>`;
  el.innerHTML = `<header class="phead">${backBtn(`#/p/${v.project_id}/d`)}<h1 class="grow">${KIND[v.kind]}</h1>${M ? `<a class="chip" href="#/visit/edit/${v.project_id}/${v.id}">עריכה</a><a class="chip" href="#/visit/${v.id}/report">דוח</a>` : ''}</header>
    <div class="stack lg">
      <div class="card stack tight"><b>${esc(v.projects?.name || '')}</b><small class="muted">${dm(v.visit_date)} · ${esc(v.profiles?.full_name || '')}${v.participants ? ' · ' + esc(v.participants) : ''}</small>
        ${M && v.rating ? `<span class="rating" aria-label="${v.rating} מתוך 5">${icon('star', 14).repeat(v.rating)}</span>` : ''}</div>
      ${tot ? `<div class="card row">${ring(dn, tot)}<div class="grow"><b>${dn === tot ? 'הכל טופל' : `טיפול בשטח · ${dn}/${tot}`}</b><div class="small muted">${unas.length ? `${unas.length} ממתינים לשיוך` : dn === tot ? '' : 'מתעדכן מהשטח'}</div></div>${M && unas.length ? `<button class="btn primary sm" id="vassign">שיוך לצוות</button>` : ''}</div>
        ${M ? `<a class="lrow" href="#/visit/${v.id}/fix"><span class="mic">${icon('clipboard', 19)}</span><span class="grow"><b>פרוטוקול תיקונים</b><small>${tot} פריטים · לפני ואחרי</small></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}` : ''}
      ${F.length ? `<section class="stack"><div class="sh-row"><h3 class="sh">ממצאים</h3><span class="count">${F.length}</span></div>
        ${F.map(x => `<div class="finding ro"><div class="row"><span class="pill ${SEV[x.sev]?.[1] || ''}">${SEV[x.sev]?.[0] || ''}</span><span class="grow"></span>${st(x)}</div>
          <div>${esc(x.text || '')}</div>${shots(x)}</div>`).join('')}</section>` : ''}
      ${T.length ? `<section class="stack"><h3 class="sh">צ׳קליסט לצוות</h3>${T.map(x => `<div class="finding ro"><div class="row"><b class="grow">${esc(x.text)}</b>${st(x)}</div>${shots(x)}</div>`).join('')}</section>` : ''}
      ${M && open.length ? `<button class="btn primary block" id="tochk">העברה לצ׳קליסט הפרויקט (${open.length})</button>` : ''}
      ${v.client_feedback ? `<section class="stack"><h3 class="sh">מה הלקוח אמר</h3><div class="card">${esc(v.client_feedback).replace(/\n/g, '<br>')}</div></section>` : ''}
      ${v.summary ? `<section class="stack"><h3 class="sh">סיכום</h3><div class="card">${esc(v.summary).replace(/\n/g, '<br>')}</div></section>` : ''}
    </div>`;
  $$('.fph').forEach(i => i.onclick = () => zoom(i.src, ''));
  $$('[data-fix]').forEach(b => b.onclick = async () => (await import('./tasks.js')).completeTask(TK.get(b.dataset.fix), () => renderVisit(el, id)));
  const va = $('#vassign'); if (va) va.onclick = async () => {
    const U = await team();
    sheet(`<h3>למי לטפל?</h3><div class="small muted">${unas.length} פריטים</div><div class="list">${U.map(u => `<button class="lrow" data-u="${u.id}"><b class="grow">${esc(u.full_name)}</b></button>`).join('')}</div>
      <label class="field">עד מתי (לא חובה)<input type="date" id="adue"></label><button class="btn ghost block" data-close>ביטול</button>`, (s2, close) => {
      $$('[data-u]', s2).forEach(x => x.onclick = async () => {
        if (x.disabled) return; const all = $$('[data-u]', s2); all.forEach(y => y.disabled = true);
        const { error } = await sb.from('tasks').update({ assignee_id: x.dataset.u, due: $('#adue', s2).value || null }).in('id', unas.map(t => t.id));
        if (error) { all.forEach(y => y.disabled = false); return toast(errText(error, 'השיוך לא נשמר — נסו שוב')); } close(); toast('שויך — נשלחה התראה אחת'); renderVisit(el, id);
      });
    });
  };
  // כל הממצאים לתיקון בהכנסה אחת לצ׳קליסט — טריגר ההתראות שולח התראה מרוכזת אחת
  const b = $('#tochk'); if (b) b.onclick = async () => {
    b.disabled = true;
    const n = await toChecklist(v.id, v.project_id, { kind: v.kind, visit_date: v.visit_date, findings: F, todo: T });
    if (n == null) { b.disabled = false; return; }
    toast(`${n} פריטים נוספו לצ׳קליסט`); location.hash = `#/p/${v.project_id}/t`;
  };
}

// מה עוד לא נשתל בצ׳קליסט: ממצאי "לתיקון" + פריטים שנכתבו ידנית
const pending = f => [...f.findings.filter(x => x.sev === 'fix' && !x.task_id && (x.text || '').trim()), ...f.todo.filter(x => !x.task_id && x.text)];

// הכנסה אחת לטבלת המשימות → התראה מרוכזת אחת; מסמנים task_id על כל פריט
async function toChecklist(vid, pid, f, assignee = null, due = null) {
  const P = pending(f); if (!P.length) return 0;
  const rows = P.map(x => ({ project_id: pid, title: x.text.trim().slice(0, 120), instructions: `מדוח ביקור · ${KIND[f.kind]} · ${dm(f.visit_date)}`, phase: 'מעקב', status: 'todo', is_extra: true, created_by: state.user.id, visit_id: vid,
    assignee_id: assignee, due: due || null, photos: { before: PH(x) } }));
  const { data, error } = await sb.from('tasks').insert(rows).select('id');
  if (error) { toast(errText(error, 'הפריטים לא נוספו לצ׳קליסט — נסו שוב')); return null; }
  P.forEach((x, k) => x.task_id = data[k]?.id);
  await sb.from('project_visits').update({ findings: f.findings, todo: f.todo }).eq('id', vid);
  return P.length;
}

function todoHtml(f, urls = {}) {
  const fx = f.findings.filter(x => x.sev === 'fix' && (x.text || '').trim());
  return `<section class="stack"><div class="sh-row"><h3 class="sh">צ׳קליסט לצוות</h3>${fx.length + f.todo.length ? `<span class="count">${fx.length + f.todo.length}</span>` : ''}</div>
    <div class="cklist">${fx.map(x => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b></span>${x.task_id ? `<span class="muted">${icon('check', 16)}</span>` : '<span class="pill bad">לתיקון</span>'}</div>`).join('')}
      ${f.todo.map((x, i) => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b>${PH(x).length ? `<span class="fphs sm">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</span>` : ''}</span>
        <label class="chip sm" aria-label="תמונה">${icon('photo', 16)}<input type="file" accept="image/*" multiple data-tp="${i}" hidden></label>${x.task_id ? `<span class="muted">${icon('check', 16)}</span>` : `<button type="button" class="chip sm" data-tr="${i}" aria-label="הסרה">${icon('x', 16)}</button>`}</div>`).join('')}
      <div class="ckadd"><input id="vtin" placeholder="פריט לצוות" autocomplete="off"><button type="button" class="btn primary sm" id="vtadd">הוספת פריט</button></div></div></section>`;
}

// ----- הפקת דוח: כל שורה = ממצא + תמונות, בתבנית הדוחות של E-Drone. מטעם החברה, בלי שמות אישיים -----
export async function renderVisitReport(el, id) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין לך גישה למסך הזה</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const [{ data: v }, { data: co }] = await Promise.all([
    sb.from('project_visits').select('*, projects(name,client_name,sites(name,address))').eq('id', id).maybeSingle(),
    sb.from('app_settings').select('value').eq('key', 'company').maybeSingle()]);
  if (!v) { el.innerHTML = `<header class="phead">${backBtn('#/reports')}<h1>דוח ביקור</h1></header><div class="empty-line">הדוח לא נמצא</div>`; return; }
  const F = v.findings || [], T = v.todo || [], ids = [...F, ...T].map(x => x.task_id).filter(Boolean);
  const { data: tk } = ids.length ? await sb.from('tasks').select('id,status,done_at,done_note,photos').in('id', ids) : { data: [] };
  const TK = new Map((tk || []).map(t => [t.id, t]));
  const urls = await signedUrls('field', [...[...F, ...T].flatMap(PH), ...(tk || []).flatMap(t => t.photos?.after || [])]);
  const c = co?.value || {}, coLine = [c.phone, c.email, c.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  const date = new Date(v.visit_date + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const strip = (list, tag) => list.length ? `<div class="vpics">${list.map(ph => urls[ph] ? `<div class="vp"><img src="${esc(urls[ph])}" alt="">${tag ? `<span class="tg ${tag === 'אחרי' ? 'a' : ''}">${tag}</span>` : ''}</div>` : '').join('')}</div>` : '';
  const pics = x => { const t = TK.get(x.task_id), aft = t?.status === 'done' ? t.photos?.after || [] : [];
    return aft.length ? strip(PH(x), 'לפני') + strip(aft, 'אחרי') : strip(PH(x)); };
  const done = x => { const t = TK.get(x.task_id); return t?.status === 'done' ? `<div class="vdone">טופל · ${dm(isoDay(new Date(t.done_at)))}${t.done_note ? ' — ' + esc(t.done_note) : ''}</div>` : ''; };
  const SC = { ok: 'ok', note: 'warn', fix: 'bad' };
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/visit/${id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ${esc(KIND[v.kind] || 'ביקור')}</b><button class="btn primary sm" id="print">הדפסה / PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">SITE VISIT REPORT</div><h2>${esc(KIND[v.kind] || 'דוח ביקור')}</h2><div class="rule"></div>
      <div class="meta"><div><div class="k">פרויקט</div><div class="v">${esc(v.projects?.name || '')}</div></div><div><div class="k">תאריך</div><div class="v">${date}</div></div>
        ${v.participants ? `<div><div class="k">${v.kind === 'client_tour' ? 'מטעם הלקוח' : 'משתתפים'}</div><div class="v">${esc(v.participants)}</div></div>` : ''}
        ${v.rating ? `<div><div class="k">ציון כללי</div><div class="v">${'★'.repeat(v.rating)}<span class="vstar-off">${'★'.repeat(5 - v.rating)}</span></div></div>` : ''}</div>
      ${F.length ? `<div class="rsec" style="margin-top:9mm">FINDINGS</div><h3 class="vh">ממצאים</h3>
        ${F.map((x, i) => `<div class="vrow"><div class="vn">${i + 1}</div><div class="grow"><div class="vt"><span>${esc(x.text || '')}</span><span class="vs ${TK.get(x.task_id)?.status === 'done' ? 'ok' : SC[x.sev] || ''}">${TK.get(x.task_id)?.status === 'done' ? 'טופל' : SEV[x.sev]?.[0] || ''}</span></div>${done(x)}${pics(x)}</div></div>`).join('')}` : ''}
      ${T.length ? `<div class="rsec" style="margin-top:9mm">ACTION ITEMS</div><h3 class="vh">פעולות להמשך</h3>
        ${T.map((x, i) => `<div class="vrow"><div class="vn">${i + 1}</div><div class="grow"><div class="vt"><span>${esc(x.text)}</span><span class="vs ${TK.get(x.task_id)?.status === 'done' ? 'ok' : ''}">${TK.get(x.task_id)?.status === 'done' ? 'טופל' : 'E-Drone'}</span></div>${done(x)}${pics(x)}</div></div>`).join('')}` : ''}
      ${v.client_feedback ? `<div class="rsec" style="margin-top:9mm">CLIENT FEEDBACK</div><h3 class="vh">התייחסות הלקוח</h3><p>${esc(v.client_feedback).replace(/\n/g, '<br>')}</p>` : ''}
      ${v.summary ? `<div class="rsec" style="margin-top:9mm">SUMMARY</div><h3 class="vh">סיכום</h3><p>${esc(v.summary).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div>
    </div></div></div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
}

// ----- פרוטוקול תיקונים: מסמך אחד לכל פריטי התיקון מהביקור — לפני, מטפל, סטטוס, ואחרי כשנסגר.
// זה מה שמאנדי מקבל (קישור בעדכון אחד על הפרויקט) במקום פריט לכל תיקון -----
export async function renderRepairProtocol(el, id) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין לך גישה למסך הזה</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const [{ data: v }, { data: tk }] = await Promise.all([
    sb.from('project_visits').select('*, projects(name,client_name)').eq('id', id).maybeSingle(),
    sb.from('tasks').select('id,title,status,review,review_note,due,done_at,done_note,photos,profiles:assignee_id(full_name)').eq('visit_id', id).neq('status', 'dropped').order('created_at')]);
  if (!v) { el.innerHTML = `<header class="phead">${backBtn('#/reports')}<h1>פרוטוקול תיקונים</h1></header><div class="empty-line">הדוח לא נמצא</div>`; return; }
  // סדר הפריטים כמו בדוח; לכל משימה — הממצא שממנו נוצרה (תמונות לפני)
  const src = new Map([...(v.findings || []), ...(v.todo || [])].filter(x => x.task_id).map(x => [x.task_id, x]));
  const ord = [...src.keys()], T = (tk || []).sort((a, b) => (ord.indexOf(a.id) + 1 || 1e3) - (ord.indexOf(b.id) + 1 || 1e3)), dn = T.filter(t => t.status === 'done').length;
  const before = t => t.photos?.before?.length ? t.photos.before : PH(src.get(t.id) || {});
  const urls = await signedUrls('field', T.flatMap(t => [...before(t), ...(t.photos?.after || [])])).catch(() => ({}));
  const strip = (list, tag) => list.length ? `<div class="vpics">${list.map(ph => urls[ph] ? `<div class="vp"><img src="${esc(urls[ph])}" alt=""><span class="tg ${tag === 'אחרי' ? 'a' : ''}">${tag}</span></div>` : '').join('')}</div>` : '';
  const date = d => new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const stat = t => t.status === 'done' ? ['ok', t.review === 'approved' ? 'טופל · אושר' : 'טופל'] : t.review === 'pending' ? ['warn', 'ממתין לאישור'] : t.review === 'returned' ? ['bad', 'הוחזר לתיקון'] : t.status === 'in_progress' ? ['warn', 'בטיפול'] : t.status === 'blocked' ? ['bad', 'נתקע'] : ['bad', 'פתוח'];
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/visit/${id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">פרוטוקול תיקונים</b><button class="btn primary sm" id="print">הדפסה / PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">REPAIR PROTOCOL</div><h2>פרוטוקול תיקונים</h2><div class="rule"></div>
      <div class="meta"><div><div class="k">פרויקט</div><div class="v">${esc(v.projects?.name || '')}</div></div>
        <div><div class="k">מדוח</div><div class="v">${esc(KIND[v.kind] || 'ביקור')} · ${date(v.visit_date)}</div></div>
        <div><div class="k">מצב</div><div class="v">${T.length ? (dn === T.length ? 'הושלם' : `${dn} מתוך ${T.length} טופלו`) : '—'}</div></div></div>
      ${T.length ? T.map((t, i) => { const [c, l] = stat(t); return `<div class="vrow"><div class="vn">${i + 1}</div><div class="grow">
        <div class="vt"><span>${esc(t.title)}</span><span class="vs ${c}">${l}</span></div>
        <div class="small muted">${[t.profiles?.full_name ? 'מטפל: ' + esc(t.profiles.full_name) : t.status === 'done' ? '' : 'ממתין לשיוך', t.due && t.status !== 'done' ? 'עד ' + dm(t.due) : ''].filter(Boolean).join(' · ')}</div>
        ${t.status === 'done' ? `<div class="vdone">טופל · ${dm(isoDay(new Date(t.done_at)))}${t.done_note ? ' — ' + esc(t.done_note) : ''}</div>` : ''}
        ${t.review === 'returned' && t.status !== 'done' && t.review_note ? `<div class="small">הוחזר: ${esc(t.review_note)}</div>` : ''}
        ${strip(before(t), 'לפני')}${t.status === 'done' || t.review === 'pending' ? strip(t.photos?.after || [], 'אחרי') : ''}</div></div>`; }).join('') : '<p>אין פריטי תיקון בדוח הזה</p>'}
      <div class="end"><div class="l"><b>E-Drone Technologies</b></div><img src="logo.png" alt="E-Drone"></div>
    </div></div></div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
}
