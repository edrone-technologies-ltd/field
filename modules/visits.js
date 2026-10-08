// דוח ביקור / ביקורת: מנהל מבקר צוות, סיור עם לקוח או בקרת איכות. שייך לפרויקט אבל לא לשרשרת הצוות.
// ממצאי "לתיקון" עוברים בלחיצה אחת לצ'קליסט הפרויקט — הכל במקום אחד, התראה אחת.
import { sb, state, isManager, icon, $, $$, esc, toast, backBtn, signedUrls, zoom, isoDay, dm, goUp } from '../lib/core.js';
import { shrink } from '../lib/store.js';

export const KIND = { crew_check: 'ביקורת צוות בשטח', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור אחר' };
const SEV = { ok: ['תקין', 'ok'], note: ['הערה', 'warn'], fix: ['לתיקון', 'bad'] };

// טופס חדש / עריכה
export async function renderVisitForm(el, pid, vid) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  const [{ data: p }, { data: v }] = await Promise.all([
    sb.from('projects').select('id,name,client_name').eq('id', pid).single(),
    vid ? sb.from('project_visits').select('*').eq('id', vid).single() : Promise.resolve({ data: null })]);
  const f = v ? { ...v, findings: [...(v.findings || [])], todo: [...(v.todo || [])] } : { todo: [], kind: 'crew_check', visit_date: isoDay(), participants: '', findings: [], client_feedback: '', rating: 0, summary: '' };
  const urls = await signedUrls('field', f.findings.map(x => x.photo).filter(Boolean));
  const draw = () => {
    el.innerHTML = `<header class="phead">${backBtn(`#/p/${pid}/d`)}<h1 class="grow">דוח ביקור</h1></header>
      <div class="stack lg">
        <div class="small muted">${esc(p?.name || '')}</div>
        <div class="field">סוג הביקור<div class="chips">${Object.entries(KIND).map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${f.kind === k}">${t}</button>`).join('')}</div></div>
        <div class="row"><label class="field grow">תאריך<input type="date" id="vd" value="${f.visit_date}"></label></div>
        <label class="field">${f.kind === 'client_tour' ? 'מי מהלקוח השתתף' : 'משתתפים'}<input id="vp" value="${esc(f.participants || '')}" placeholder="${f.kind === 'client_tour' ? 'למשל: רון — מנהל אחזקה' : 'למשל: צוות 1'}"></label>
        <section class="stack"><div class="row"><h3 class="grow">ממצאים</h3><button class="chip" id="vadd">+ ממצא</button></div>
          ${f.findings.length ? f.findings.map((x, i) => `<div class="finding">
            <textarea data-ft="${i}" rows="2" placeholder="מה ראית">${esc(x.text || '')}</textarea>
            <div class="row"><div class="chips">${Object.entries(SEV).map(([k, [t]]) => `<button type="button" class="chip" data-fs="${i}" data-v="${k}" aria-pressed="${x.sev === k}">${t}</button>`).join('')}</div><span class="grow"></span>
              ${x.photo && urls[x.photo] ? `<img class="fph" src="${esc(urls[x.photo])}" alt="">` : `<label class="chip">${icon('photo', 16)} תמונה<input type="file" accept="image/*" capture="environment" data-fp="${i}" hidden></label>`}
              <button type="button" class="chip" data-fr="${i}" aria-label="הסרה">×</button></div></div>`).join('')
          : '<div class="small muted">כל דבר שראית — שורה. "לתיקון" הופך אחר כך למשימה לצוות.</div>'}
        </section>
        ${todoHtml(f)}
        ${f.kind === 'client_tour' ? `<label class="field">מה הלקוח אמר<textarea id="vc" rows="3" placeholder="טענות, בקשות, שביעות רצון">${esc(f.client_feedback || '')}</textarea></label>` : ''}
        <div class="field">ציון כללי<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}" aria-pressed="${f.rating >= n}">★</button>`).join('')}</div></div>
        <label class="field">סיכום<textarea id="vs" rows="3">${esc(f.summary || '')}</textarea></label>
        <button class="btn primary block big" id="vsave">שמירת דוח ביקור${pending(f).length ? ` + ${pending(f).length} לצ'קליסט` : ''}</button>
      </div>`;
    const keep = () => { f.visit_date = $('#vd').value; f.participants = $('#vp').value; f.summary = $('#vs').value; if ($('#vc')) f.client_feedback = $('#vc').value; $$('[data-ft]').forEach(t => f.findings[+t.dataset.ft].text = t.value); };
    $$('[data-k]').forEach(b => b.onclick = () => { keep(); f.kind = b.dataset.k; draw(); });
    $('#vadd').onclick = () => { keep(); f.findings.push({ text: '', sev: 'note' }); draw(); setTimeout(() => $$('[data-ft]').pop()?.focus(), 50); };
    $$('[data-fs]').forEach(b => b.onclick = () => { keep(); f.findings[+b.dataset.fs].sev = b.dataset.v; draw(); });
    $$('[data-fr]').forEach(b => b.onclick = () => { keep(); f.findings.splice(+b.dataset.fr, 1); draw(); });
    const addTodo = () => { const t = $('#vtin').value.trim(); if (!t) return; keep(); f.todo.push({ text: t }); draw(); setTimeout(() => $('#vtin')?.focus(), 50); };
    $('#vtadd').onclick = addTodo; $('#vtin').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } };
    $$('[data-tr]').forEach(b => b.onclick = () => { keep(); f.todo.splice(+b.dataset.tr, 1); draw(); });
    $$('[data-r]').forEach(b => b.onclick = () => { keep(); f.rating = +b.dataset.r; draw(); });
    $$('.fph').forEach(i => i.onclick = () => zoom(i.src, ''));
    $$('[data-fp]').forEach(inp => inp.onchange = async () => {
      keep(); const file = inp.files[0]; if (!file) return;
      try { const blob = await shrink(file), path = `${state.user.id}/visits/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
        await sb.from('photos').insert({ storage_path: path, project_id: pid, kind: 'visit', uploaded_by: state.user.id, caption: 'דוח ביקור' });
        f.findings[+inp.dataset.fp].photo = path; Object.assign(urls, await signedUrls('field', [path])); draw();
      } catch (e) { toast(e.message || 'התמונה לא עלתה'); }
    });
    $('#vsave').onclick = async () => {
      keep(); f.findings = f.findings.filter(x => (x.text || '').trim() || x.photo);
      const row = { project_id: pid, todo: f.todo, kind: f.kind, visit_date: f.visit_date, participants: f.participants || null, findings: f.findings,
        client_feedback: f.client_feedback || null, rating: f.rating || null, summary: f.summary || null };
      $('#vsave').disabled = true;
      const { data, error } = vid ? await sb.from('project_visits').update(row).eq('id', vid).select('id').single() : await sb.from('project_visits').insert(row).select('id').single();
      if (error) { $('#vsave').disabled = false; return toast(error.message); }
      const n = await toChecklist(data.id, pid, f);
      toast(n ? `דוח הביקור נשמר · ${n} פריטים בצ'קליסט` : 'דוח הביקור נשמר'); location.replace(`#/visit/${data.id}`);
    };
  };
  draw();
}

// צפייה
export async function renderVisit(el, id) {
  const { data: v } = await sb.from('project_visits').select('*, projects(id,name,site_id), profiles:visitor_id(full_name)').eq('id', id).maybeSingle();
  if (!v) { el.innerHTML = `<header class="phead">${backBtn('#/reports')}<h1>דוח ביקור</h1></header><div class="empty">הדוח לא נמצא.</div>`; return; }
  const F = v.findings || [], urls = await signedUrls('field', F.map(x => x.photo).filter(Boolean));
  const fix = F.filter(x => x.sev === 'fix').length, T = v.todo || [], open = pending({ findings: F, todo: T });
  el.innerHTML = `<header class="phead">${backBtn(`#/p/${v.project_id}/d`)}<h1 class="grow">${KIND[v.kind]}</h1><a class="chip" href="#/visit/edit/${v.project_id}/${v.id}">עריכה</a></header>
    <div class="stack lg">
      <div class="card stack" style="gap:4px"><b>${esc(v.projects?.name || '')}</b><small class="muted">${dm(v.visit_date)} · ${esc(v.profiles?.full_name || '')}${v.participants ? ' · ' + esc(v.participants) : ''}</small>
        ${v.rating ? `<div class="stars ro">${[1, 2, 3, 4, 5].map(n => `<span class="${v.rating >= n ? 'on' : ''}">★</span>`).join('')}</div>` : ''}</div>
      ${F.length ? `<section class="stack"><div class="sh-row"><h3 class="sh">ממצאים</h3><span class="count">${F.length}</span>${fix ? `<span class="pill bad">${fix} לתיקון</span>` : ''}</div>
        ${F.map((x, i) => `<div class="finding ro"><div class="row"><span class="pill ${SEV[x.sev]?.[1] || ''}">${SEV[x.sev]?.[0] || ''}</span><span class="grow"></span>
            ${x.sev === 'fix' ? (x.task_id ? '<span class="small muted">בצ\'קליסט ✓</span>' : '') : ''}</div>
          <div>${esc(x.text || '')}</div>${x.photo && urls[x.photo] ? `<img class="fph big" src="${esc(urls[x.photo])}" alt="">` : ''}</div>`).join('')}</section>` : ''}
      ${T.length ? `<section class="stack"><h3 class="sh">צ'קליסט לצוות</h3><div class="cklist">${T.map(x => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b></span>${x.task_id ? '<span class="small muted">בצ\'קליסט ✓</span>' : ''}</div>`).join('')}</div></section>` : ''}
      ${open.length ? `<button class="btn primary block" id="tochk">העברה לצ'קליסט הפרויקט (${open.length})</button>` : ''}
      ${v.client_feedback ? `<section class="stack"><h3 class="sh">מה הלקוח אמר</h3><div class="card">${esc(v.client_feedback).replace(/\n/g, '<br>')}</div></section>` : ''}
      ${v.summary ? `<section class="stack"><h3 class="sh">סיכום</h3><div class="card">${esc(v.summary).replace(/\n/g, '<br>')}</div></section>` : ''}
    </div>`;
  $$('.fph').forEach(i => i.onclick = () => zoom(i.src, ''));
  // כל הממצאים לתיקון בהכנסה אחת לצ'קליסט — טריגר ההתראות שולח התראה מרוכזת אחת
  const b = $('#tochk'); if (b) b.onclick = async () => {
    b.disabled = true;
    const n = await toChecklist(v.id, v.project_id, { kind: v.kind, visit_date: v.visit_date, findings: F, todo: T });
    if (n == null) { b.disabled = false; return; }
    toast(`${n} פריטים נוספו לצ'קליסט`); location.hash = `#/p/${v.project_id}/t`;
  };
}

// מה עוד לא נשתל בצ'קליסט: ממצאי "לתיקון" + פריטים שנכתבו ידנית
const pending = f => [...f.findings.filter(x => x.sev === 'fix' && !x.task_id && (x.text || '').trim()), ...f.todo.filter(x => !x.task_id && x.text)];

// הכנסה אחת לטבלת המשימות → התראה מרוכזת אחת; מסמנים task_id על כל פריט
async function toChecklist(vid, pid, f) {
  const P = pending(f); if (!P.length) return 0;
  const rows = P.map(x => ({ project_id: pid, title: x.text.trim().slice(0, 120), instructions: `מדוח ביקור · ${KIND[f.kind]} · ${dm(f.visit_date)}`, phase: 'מעקב', status: 'todo', is_extra: true, created_by: state.user.id }));
  const { data, error } = await sb.from('tasks').insert(rows).select('id');
  if (error) { toast(error.message); return null; }
  P.forEach((x, k) => x.task_id = data[k]?.id);
  await sb.from('project_visits').update({ findings: f.findings, todo: f.todo }).eq('id', vid);
  return P.length;
}

function todoHtml(f) {
  const fx = f.findings.filter(x => x.sev === 'fix' && (x.text || '').trim());
  return `<section class="stack"><div class="sh-row"><h3 class="sh">צ'קליסט לצוות</h3>${fx.length + f.todo.length ? `<span class="count">${fx.length + f.todo.length}</span>` : ''}</div>
    <div class="cklist">${fx.map(x => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b></span>${x.task_id ? '<span class="small muted">✓</span>' : '<span class="pill bad">לתיקון</span>'}</div>`).join('')}
      ${f.todo.map((x, i) => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b></span>${x.task_id ? '<span class="small muted">✓</span>' : `<button type="button" class="chip sm" data-tr="${i}" aria-label="הסרה">×</button>`}</div>`).join('')}
      <div class="ckadd"><input id="vtin" placeholder="+ פריט לצוות" autocomplete="off"><button type="button" class="btn primary sm" id="vtadd">הוספה</button></div></div></section>`;
}
