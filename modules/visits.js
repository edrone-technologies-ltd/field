// דוח ביקור / ביקורת: מנהל מבקר צוות, סיור עם לקוח או בקרת איכות. שייך לפרויקט אבל לא לשרשרת הצוות.
// ממצאי "לתיקון" עוברים בלחיצה אחת לצ'קליסט הפרויקט — הכל במקום אחד, התראה אחת.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, backBtn, signedUrls, zoom, isoDay, dm, goUp } from '../lib/core.js';
import { shrink } from '../lib/store.js';

export const KIND = { crew_check: 'ביקורת צוות בשטח', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור אחר' };
const FIELD = ['ops_manager', 'crew_lead', 'crew', 'surveyor', 'admin'];
const team = async () => ((await sb.from('profiles').select('id,full_name,role').eq('is_active', true).order('full_name')).data || []).filter(u => FIELD.includes(u.role));
const PH = x => x.photos || (x.photo ? [x.photo] : []);   // תמונות לממצא (תאימות לדוחות עם תמונה אחת)
const SEV = { ok: ['תקין', 'ok'], note: ['הערה', 'warn'], fix: ['לתיקון', 'bad'] };

// טופס חדש / עריכה
export async function renderVisitForm(el, pid, vid) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  const [{ data: p }, { data: v }] = await Promise.all([
    sb.from('projects').select('id,name,client_name').eq('id', pid).single(),
    vid ? sb.from('project_visits').select('*').eq('id', vid).single() : Promise.resolve({ data: null })]);
  const f = v ? { ...v, findings: [...(v.findings || [])], todo: [...(v.todo || [])] } : { todo: [], kind: 'crew_check', visit_date: isoDay(), participants: '', findings: [], client_feedback: '', rating: 0, summary: '' };
  const [urls, T] = await Promise.all([signedUrls('field', [...f.findings, ...f.todo].flatMap(PH)), team()]);
  const who = { id: null, due: '' };
  const draw = () => {
    el.innerHTML = `<header class="phead">${backBtn(`#/p/${pid}/d`)}<h1 class="grow">דוח ביקור</h1></header>
      <div class="stack lg">
        <div class="small muted">${esc(p?.name || '')}</div>
        <div class="field">סוג הביקור<div class="chips">${Object.entries(KIND).map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${f.kind === k}">${t}</button>`).join('')}</div></div>
        <div class="row"><label class="field grow">תאריך<input type="date" id="vd" value="${f.visit_date}"></label></div>
        <label class="field">${f.kind === 'client_tour' ? 'מי מהלקוח השתתף' : 'משתתפים'}<input id="vp" value="${esc(f.participants || '')}" placeholder="${f.kind === 'client_tour' ? 'למשל: רון — מנהל אחזקה' : 'למשל: צוות 1'}"></label>
        <section class="stack"><h3 class="sh">ממצאים</h3>
          <div class="row-btns"><label class="btn primary">${icon('photo', 18)} צילום ממצא<input type="file" accept="image/*" multiple id="vcam" hidden></label><button type="button" class="btn ghost" id="vadd">+ ממצא בכתב</button></div>
          ${f.findings.length ? f.findings.map((x, i) => `<div class="finding">
            <textarea data-ft="${i}" rows="2" placeholder="מה ראית">${esc(x.text || '')}</textarea>
            <div class="row"><div class="chips">${Object.entries(SEV).map(([k, [t]]) => `<button type="button" class="chip" data-fs="${i}" data-v="${k}" aria-pressed="${x.sev === k}">${t}</button>`).join('')}</div><span class="grow"></span>
              <button type="button" class="chip" data-fr="${i}" aria-label="הסרה">×</button></div>
            <div class="fphs">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}<label class="fph add" aria-label="הוספת תמונה">${icon('photo', 18)}<input type="file" accept="image/*" multiple data-fp="${i}" hidden></label></div></div>`).join('') : ''}
        </section>
        ${todoHtml(f, urls)}
        ${pending(f).length ? `<div class="field">למי לטפל<div class="chips">${T.map(u => `<button type="button" class="chip" data-who="${u.id}" aria-pressed="${who.id === u.id}">${esc(u.full_name)}</button>`).join('')}</div></div>
          <label class="field">עד מתי<input type="date" id="vdue" value="${who.due}"></label>` : ''}
        ${f.kind === 'client_tour' ? `<label class="field">מה הלקוח אמר<textarea id="vc" rows="3" placeholder="טענות, בקשות, שביעות רצון">${esc(f.client_feedback || '')}</textarea></label>` : ''}
        <div class="field">ציון כללי<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}" aria-pressed="${f.rating >= n}">★</button>`).join('')}</div></div>
        <label class="field">סיכום<textarea id="vs" rows="3">${esc(f.summary || '')}</textarea></label>
        <button class="btn primary block big" id="vsave">שמירת דוח ביקור${pending(f).length ? ` + ${pending(f).length} לצ'קליסט` : ''}</button>
      </div>`;
    const keep = () => { if ($('#vdue')) who.due = $('#vdue').value; f.visit_date = $('#vd').value; f.participants = $('#vp').value; f.summary = $('#vs').value; if ($('#vc')) f.client_feedback = $('#vc').value; $$('[data-ft]').forEach(t => f.findings[+t.dataset.ft].text = t.value); };
    $$('[data-k]').forEach(b => b.onclick = () => { keep(); f.kind = b.dataset.k; draw(); });
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
    const upload = async (files, x) => {
      keep(); toast('מעלה תמונות…');
      try {
        for (const file of files) {
          const blob = await shrink(file), path = `${state.user.id}/visits/${crypto.randomUUID()}.jpg`;
          const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
          await sb.from('photos').insert({ storage_path: path, project_id: pid, kind: 'visit', uploaded_by: state.user.id, caption: 'דוח ביקור' });
          x.photos = [...PH(x), path]; delete x.photo;
        }
        Object.assign(urls, await signedUrls('field', PH(x)));
      } catch (e) { toast(e.message || 'התמונה לא עלתה'); }
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
      if (error) { $('#vsave').disabled = false; return toast(error.message); }
      const n = await toChecklist(data.id, pid, f, who.id, who.due);
      if (n && who.id) await share(data.id, [who.id]);
      toast(n ? `דוח הביקור נשמר · ${n} פריטים בצ'קליסט` : 'דוח הביקור נשמר'); location.replace(`#/visit/${data.id}`);
    };
  };
  draw();
}

// צפייה
// הוספת צופים לדוח (מי ששויך לטפל רואה את הדוח)
async function share(vid, users) {
  const { data } = await sb.from('project_visits').select('viewers').eq('id', vid).single();
  const all = [...new Set([...(data?.viewers || []), ...users])];
  await sb.from('project_visits').update({ viewers: all }).eq('id', vid);
}

export async function renderVisit(el, id) {
  const M = isManager();
  const { data: v } = await sb.from('project_visits').select('*, projects(id,name,site_id), profiles:visitor_id(full_name)').eq('id', id).maybeSingle();
  if (!v) { el.innerHTML = `<header class="phead">${backBtn('#/reports')}<h1>דוח ביקור</h1></header><div class="empty">הדוח לא נמצא.</div>`; return; }
  const F = v.findings || [], urls = await signedUrls('field', [...F, ...(v.todo || [])].flatMap(PH));
  const T = v.todo || [], open = pending({ findings: F, todo: T });
  // מצב הטיפול בשטח — מהמשימות עצמן (העובד מסמן "טופל" עם תמונת אחרי)
  const ids = [...F, ...T].map(x => x.task_id).filter(Boolean);
  const [{ data: tk }, { data: VW0 }] = await Promise.all([ids.length ? sb.from('tasks').select('id,title,project_id,status,assignee_id,due,done_at,done_note,photos,profiles:assignee_id(full_name)').in('id', ids) : { data: [] },
    M && (v.viewers || []).length ? sb.from('profiles').select('id,full_name').in('id', v.viewers) : { data: [] }]);
  const VW = VW0 || [];
  const TK = new Map((tk || []).map(t => [t.id, t]));
  Object.assign(urls, await signedUrls('field', (tk || []).flatMap(t => t.photos?.after || [])).catch(() => ({})));
  const live = [...TK.values()].filter(t => t.status !== 'dropped'), tot = live.length, dn = live.filter(t => t.status === 'done').length;
  const unas = live.filter(t => t.status !== 'done' && !t.assignee_id);
  const first = n => (n || '').split(' ')[0];
  const st = x => { const t = TK.get(x.task_id); if (!t) return '';
    if (t.status !== 'done' && (t.assignee_id === state.user.id || !M)) return `<button class="btn primary sm" data-fix="${t.id}">טיפול</button>`;
    return t.status === 'done' ? `<span class="pill ok">טופל · ${dm(t.done_at.slice(0, 10))}</span>` : t.assignee_id ? `<span class="pill warn">אצל ${esc(first(t.profiles?.full_name))}${t.due ? ' · עד ' + dm(t.due) : ''}</span>` : '<span class="pill">ממתין לשיוך</span>'; };
  const row = (lbl, list) => list.length ? `<div class="small muted">${lbl}</div><div class="fphs">${list.map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</div>` : '';
  const shots = x => { const t = TK.get(x.task_id), aft = t?.photos?.after || [];
    return aft.length || t?.done_note ? `${row('לפני', PH(x))}${row('אחרי', aft)}${t?.done_note ? `<div class="small">${esc(t.done_note)}</div>` : ''}` : PH(x).length ? `<div class="fphs">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</div>` : ''; };
  const ring = (d, n) => `<div class="ring" style="--p:${Math.round(d / n * 100)}"><b>${d}/${n}</b></div>`;
  el.innerHTML = `<header class="phead">${backBtn(`#/p/${v.project_id}/d`)}<h1 class="grow">${KIND[v.kind]}</h1>${M ? `<a class="chip" href="#/visit/edit/${v.project_id}/${v.id}">עריכה</a><a class="chip" href="#/visit/${v.id}/report">דוח</a>` : ''}</header>
    <div class="stack lg">
      <div class="card stack" style="gap:4px"><b>${esc(v.projects?.name || '')}</b><small class="muted">${dm(v.visit_date)} · ${esc(v.profiles?.full_name || '')}${v.participants ? ' · ' + esc(v.participants) : ''}</small>
        ${M ? `<button class="lrow vshare" id="vshare"><span class="grow small">${(v.viewers || []).length ? 'גלוי גם ל: ' + esc(VW.map(u => first(u.full_name)).join(', ')) : 'גלוי להנהלה בלבד'}</span><span class="chip sm">שיתוף</span></button>` : ''}
        ${M && v.rating ? `<div class="stars ro">${[1, 2, 3, 4, 5].map(n => `<span class="${v.rating >= n ? 'on' : ''}">★</span>`).join('')}</div>` : ''}</div>
      ${tot ? `<div class="card row">${ring(dn, tot)}<div class="grow"><b>${dn === tot ? 'הכל טופל' : `טיפול בשטח · ${dn}/${tot}`}</b><div class="small muted">${unas.length ? `${unas.length} ממתינים לשיוך` : dn === tot ? '' : 'מתעדכן מהשטח'}</div></div>${M && unas.length ? `<button class="btn primary sm" id="vassign">שיוך לצוות</button>` : ''}</div>` : ''}
      ${F.length ? `<section class="stack"><div class="sh-row"><h3 class="sh">ממצאים</h3><span class="count">${F.length}</span></div>
        ${F.map(x => `<div class="finding ro"><div class="row"><span class="pill ${SEV[x.sev]?.[1] || ''}">${SEV[x.sev]?.[0] || ''}</span><span class="grow"></span>${st(x)}</div>
          <div>${esc(x.text || '')}</div>${shots(x)}</div>`).join('')}</section>` : ''}
      ${T.length ? `<section class="stack"><h3 class="sh">צ'קליסט לצוות</h3>${T.map(x => `<div class="finding ro"><div class="row"><b class="grow">${esc(x.text)}</b>${st(x)}</div>${shots(x)}</div>`).join('')}</section>` : ''}
      ${M && open.length ? `<button class="btn primary block" id="tochk">העברה לצ'קליסט הפרויקט (${open.length})</button>` : ''}
      ${v.client_feedback ? `<section class="stack"><h3 class="sh">מה הלקוח אמר</h3><div class="card">${esc(v.client_feedback).replace(/\n/g, '<br>')}</div></section>` : ''}
      ${v.summary ? `<section class="stack"><h3 class="sh">סיכום</h3><div class="card">${esc(v.summary).replace(/\n/g, '<br>')}</div></section>` : ''}
    </div>`;
  $$('.fph').forEach(i => i.onclick = () => zoom(i.src, ''));
  $$('[data-fix]').forEach(b => b.onclick = async () => (await import('./tasks.js')).completeTask(TK.get(b.dataset.fix), () => renderVisit(el, id)));
  const vs = $('#vshare'); if (vs) vs.onclick = async () => {
    const U = await team(), on = new Set(v.viewers || []);
    sheet(`<h3>מי עוד רואה את הדוח?</h3><div class="small muted">ההנהלה רואה תמיד. הציון נשאר להנהלה.</div><div class="chips">${U.filter(u => !['admin', 'ops_manager'].includes(u.role)).map(u => `<button type="button" class="chip" data-v="${u.id}" aria-pressed="${on.has(u.id)}">${esc(u.full_name)}</button>`).join('')}</div>
      <button class="btn primary block" id="vsok">שמירה</button>`, (s2, close) => {
      $$('[data-v]', s2).forEach(c => c.onclick = () => { on.has(c.dataset.v) ? on.delete(c.dataset.v) : on.add(c.dataset.v); c.setAttribute('aria-pressed', on.has(c.dataset.v)); });
      $('#vsok', s2).onclick = async () => { const { error } = await sb.from('project_visits').update({ viewers: [...on] }).eq('id', v.id); if (error) return toast(error.message); close(); toast('נשמר'); renderVisit(el, id); };
    });
  };
  const va = $('#vassign'); if (va) va.onclick = async () => {
    const U = await team();
    sheet(`<h3>למי לטפל?</h3><div class="small muted">${unas.length} פריטים</div><div class="list">${U.map(u => `<button class="lrow" data-u="${u.id}"><b class="grow">${esc(u.full_name)}</b></button>`).join('')}</div>
      <label class="field">עד מתי (לא חובה)<input type="date" id="adue"></label><button class="btn ghost block" data-close>ביטול</button>`, (s2, close) => {
      $$('[data-u]', s2).forEach(x => x.onclick = async () => {
        const { error } = await sb.from('tasks').update({ assignee_id: x.dataset.u, due: $('#adue', s2).value || null }).in('id', unas.map(t => t.id));
        if (error) return toast(error.message); await share(v.id, [x.dataset.u]); close(); toast('שויך — נשלחה התראה אחת'); renderVisit(el, id);
      });
    });
  };
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
async function toChecklist(vid, pid, f, assignee = null, due = null) {
  const P = pending(f); if (!P.length) return 0;
  const rows = P.map(x => ({ project_id: pid, title: x.text.trim().slice(0, 120), instructions: `מדוח ביקור · ${KIND[f.kind]} · ${dm(f.visit_date)}`, phase: 'מעקב', status: 'todo', is_extra: true, created_by: state.user.id,
    assignee_id: assignee, due: due || null, photos: { before: PH(x) } }));
  const { data, error } = await sb.from('tasks').insert(rows).select('id');
  if (error) { toast(error.message); return null; }
  P.forEach((x, k) => x.task_id = data[k]?.id);
  await sb.from('project_visits').update({ findings: f.findings, todo: f.todo }).eq('id', vid);
  return P.length;
}

function todoHtml(f, urls = {}) {
  const fx = f.findings.filter(x => x.sev === 'fix' && (x.text || '').trim());
  return `<section class="stack"><div class="sh-row"><h3 class="sh">צ'קליסט לצוות</h3>${fx.length + f.todo.length ? `<span class="count">${fx.length + f.todo.length}</span>` : ''}</div>
    <div class="cklist">${fx.map(x => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b></span>${x.task_id ? '<span class="small muted">✓</span>' : '<span class="pill bad">לתיקון</span>'}</div>`).join('')}
      ${f.todo.map((x, i) => `<div class="ck"><span class="grow"><b>${esc(x.text)}</b>${PH(x).length ? `<span class="fphs sm">${PH(x).map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</span>` : ''}</span>
        <label class="chip sm" aria-label="תמונה">${icon('photo', 16)}<input type="file" accept="image/*" multiple data-tp="${i}" hidden></label>${x.task_id ? '<span class="small muted">✓</span>' : `<button type="button" class="chip sm" data-tr="${i}" aria-label="הסרה">×</button>`}</div>`).join('')}
      <div class="ckadd"><input id="vtin" placeholder="+ פריט לצוות" autocomplete="off"><button type="button" class="btn primary sm" id="vtadd">הוספה</button></div></div></section>`;
}

// ----- הפקת דוח: כל שורה = ממצא + תמונות, בתבנית הדוחות של E-Drone. מטעם החברה, בלי שמות אישיים -----
export async function renderVisitReport(el, id) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const [{ data: v }, { data: co }] = await Promise.all([
    sb.from('project_visits').select('*, projects(name,client_name,sites(name,address))').eq('id', id).maybeSingle(),
    sb.from('app_settings').select('value').eq('key', 'company').maybeSingle()]);
  if (!v) { el.innerHTML = '<div class="empty">הדוח לא נמצא.</div>'; return; }
  const F = v.findings || [], T = v.todo || [], ids = [...F, ...T].map(x => x.task_id).filter(Boolean);
  const { data: tk } = ids.length ? await sb.from('tasks').select('id,status,done_at,done_note,photos').in('id', ids) : { data: [] };
  const TK = new Map((tk || []).map(t => [t.id, t]));
  const urls = await signedUrls('field', [...[...F, ...T].flatMap(PH), ...(tk || []).flatMap(t => t.photos?.after || [])]);
  const c = co?.value || {}, coLine = [c.phone, c.email, c.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  const date = new Date(v.visit_date + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const strip = (list, tag) => list.length ? `<div class="vpics">${list.map(ph => urls[ph] ? `<div class="vp"><img src="${esc(urls[ph])}" alt="">${tag ? `<span class="tg ${tag === 'אחרי' ? 'a' : ''}">${tag}</span>` : ''}</div>` : '').join('')}</div>` : '';
  const pics = x => { const t = TK.get(x.task_id), aft = t?.status === 'done' ? t.photos?.after || [] : [];
    return aft.length ? strip(PH(x), 'לפני') + strip(aft, 'אחרי') : strip(PH(x)); };
  const done = x => { const t = TK.get(x.task_id); return t?.status === 'done' ? `<div class="vdone">טופל · ${dm(t.done_at.slice(0, 10))}${t.done_note ? ' — ' + esc(t.done_note) : ''}</div>` : ''; };
  const SC = { ok: 'ok', note: 'warn', fix: 'bad' };
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/visit/${id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ${esc(KIND[v.kind] || 'ביקור')}</b><button class="btn primary sm" id="print">הדפסה / PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">SITE VISIT REPORT</div><h2>${esc(KIND[v.kind] || 'דוח ביקור')}</h2><div class="rule"></div>
      <div class="meta"><div><div class="k">פרויקט</div><div class="v">${esc(v.projects?.name || '')}</div></div><div><div class="k">תאריך</div><div class="v">${date}</div></div>
        ${v.participants ? `<div><div class="k">${v.kind === 'client_tour' ? 'מטעם הלקוח' : 'משתתפים'}</div><div class="v">${esc(v.participants)}</div></div>` : ''}
        ${v.rating ? `<div><div class="k">ציון כללי</div><div class="v">${'★'.repeat(v.rating)}<span style="color:#D5D8DD">${'★'.repeat(5 - v.rating)}</span></div></div>` : ''}</div>
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
