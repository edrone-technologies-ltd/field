// תיק הפרויקט: קבצים (דוחות סופיים, מסמכים, תכניות). field/projects/<pid>/files/<uuid>.<ext> (db/144).
// מנהל תפעול ומעלה בלבד (אביחי 13/10): רואים, מעלים, מצמידים, משנים שם, מוחקים. צוות וראש צוות — לא מוצג. לא נשלח ללקוח לבד — שיתוף רק בלחיצה.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, dm, isoDay, confirmBox } from '../lib/core.js';
import { shareIcon, shareFile } from '../lib/share.js';

const KINDS = [['report', 'דוח'], ['doc', 'מסמך'], ['plan', 'תכנית'], ['other', 'אחר']];
const KHE = Object.fromEntries(KINDS);
const ACCEPT = 'application/pdf,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.dwg,.dxf,.zip';
const size = n => !n ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + 'KB' : (n / 1048576).toFixed(1) + 'MB';
const extOf = (name, mime) => (/\.(\w{2,5})$/.exec(name || '')?.[1] || ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' })[mime] || 'bin').toLowerCase();
const isImgM = m => /^image\//.test(m || '');
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));

// העלאה לתיק (גם מהדוח ללקוח: "שמירה לתיק הפרויקט")
export async function saveToProject(pid, file, title, kind = 'other', pinned = false) {
  const ext = extOf(file.name, file.type), path = `projects/${pid}/files/${uuid()}.${ext}`;
  const { error: e1 } = await sb.storage.from('field').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (e1) throw e1;
  const { data, error } = await sb.from('project_files').insert({ project_id: pid, title: title.trim() || 'קובץ', kind, storage_path: path, size: file.size, mime: file.type || null, uploaded_by: state.user.id, pinned }).select().single();
  if (error) { sb.storage.from('field').remove([path]).catch(() => {}); throw error; }
  return data;
}

// פתיחה: קישור חתום קצר. החלון נפתח מיד (iOS חוסם חלון שנפתח אחרי המתנה)
async function openFile(f) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('field').createSignedUrl(f.storage_path, 600);
  if (error || !data?.signedUrl) { w?.close(); return toast('אין גישה לקובץ'); }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
}

export async function filesSection(box, p) {
  if (!box) return;
  if (!isManager()) { box.innerHTML = ''; return; }
  const M = true;
  const { data } = await sb.from('project_files').select('*').eq('project_id', p.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }).then(r => r, () => ({ data: null }));
  const L = data || [];
  if (!L.length && !M) { box.innerHTML = ''; return; }
  box.innerHTML = `<section class="pf"><div class="sh-row"><h3 class="sh">מסמכים${L.length ? ` <span class="count">${L.length}</span>` : ''}</h3>${M ? `<button class="more pf-add" type="button" id="pfAdd">${icon('plus', 16)} מסמך</button>` : ''}</div>
    ${L.length ? `<div class="pf-list">${L.map(f => `<div class="pf-row${f.pinned ? ' pin' : ''}" data-f="${f.id}">
      <button class="pf-open" type="button" data-o="${f.id}"><span class="pf-ic ${f.kind}">${icon(isImgM(f.mime) ? 'photo' : f.kind === 'report' ? 'report' : 'file', 18)}</span>
        <span class="grow"><b>${esc(f.title)}</b><small>${f.pinned ? '📌 ' : ''}${esc(KHE[f.kind] || '')} · ${dm(isoDay(new Date(f.created_at)))}${f.size ? ` · <bdi dir="ltr">${size(f.size)}</bdi>` : ''}</small></span></button>
      <button class="pf-b" type="button" data-s="${f.id}" aria-label="שיתוף">${shareIcon(17)}</button>
      ${M ? `<button class="pf-b" type="button" data-m="${f.id}" aria-label="אפשרויות">⋯</button>` : ''}</div>`).join('')}</div>`
      : `<button class="pf-empty" type="button" id="pfAdd2">${icon('folder', 20)}<span>הוספת מסמך</span></button>`}</section>`;
  const byId = id => L.find(f => f.id === id);
  const redraw = () => filesSection(box, p);
  $$('[data-o]', box).forEach(b => b.onclick = () => openFile(byId(b.dataset.o)));
  $$('[data-s]', box).forEach(b => b.onclick = () => { const f = byId(b.dataset.s); shareFile({ bucket: 'field', path: f.storage_path }, `${f.title}.${extOf(f.storage_path)}`, f.title, '', { btn: b }); });
  $$('[data-m]', box).forEach(b => b.onclick = () => menu(byId(b.dataset.m), redraw));
  ['#pfAdd', '#pfAdd2'].forEach(s => { const b = $(s, box); if (b) b.onclick = () => pick(p, redraw); });
}

function pick(p, redraw) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = ACCEPT; inp.hidden = true;
  inp.onchange = () => { const f = inp.files?.[0]; inp.remove(); if (f) addSheet(p, f, redraw); };
  document.body.appendChild(inp); inp.click();
}

function addSheet(p, file, redraw) {
  const guess = /דוח|report|סיכום/i.test(file.name) ? 'report' : /תכנית|plan|dwg|dxf/i.test(file.name) ? 'plan' : /\.pdf$|\.docx?$/i.test(file.name) ? 'doc' : 'other';
  let kind = guess, pin = false;
  const close = sheet(`<h3>קובץ לתיק הפרויקט</h3>
    <div class="pf-file">${icon(isImgM(file.type) ? 'photo' : 'file', 20)}<span class="grow"><bdi>${esc(file.name)}</bdi></span><small dir="ltr">${size(file.size)}</small></div>
    <label class="field">שם<input id="pft" value="${esc(file.name.replace(/\.\w{2,5}$/, ''))}" maxlength="120"></label>
    <div class="chips" id="pfk">${KINDS.map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
    <label class="tog"><span>📌 הצמדה לראש התיק</span><span class="sw"><input type="checkbox" id="pfp"><i></i></span></label>
    <button class="btn primary block big" id="pfu">העלאה</button>`, sh => {
    $$('#pfk [data-k]', sh).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#pfk [data-k]', sh).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#pfp', sh).onchange = e => pin = e.target.checked;
    $('#pfu', sh).onclick = async e => {
      const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.classList.add('busy');
      try { await saveToProject(p.id, file, $('#pft', sh).value, kind, pin); close(); toast('נשמר בתיק הפרויקט'); redraw(); }
      catch { b.disabled = false; b.classList.remove('busy'); toast('ההעלאה נכשלה — נסו שוב'); }
    };
  });
}

function menu(f, redraw) {
  const close = sheet(`<h3>${esc(f.title)}</h3><div class="menu pad">
    <button class="lrow" type="button" data-a="pin"><span class="mic">📌</span><span class="grow"><b>${f.pinned ? 'ביטול הצמדה' : 'הצמדה לראש התיק'}</b></span></button>
    <button class="lrow" type="button" data-a="ren"><span class="mic">${icon('pen', 18)}</span><span class="grow"><b>שינוי שם וסוג</b></span></button>
    <button class="lrow danger" type="button" data-a="del"><span class="mic">${icon('x', 18)}</span><span class="grow"><b>מחיקה</b></span></button></div>`, sh => {
    $$('[data-a]', sh).forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'pin') { close(); const { error } = await sb.from('project_files').update({ pinned: !f.pinned }).eq('id', f.id); toast(error ? 'לא נשמר' : f.pinned ? 'ההצמדה בוטלה' : 'הוצמד'); redraw(); }
      if (a === 'ren') { close(); rename(f, redraw); }
      if (a === 'del') { close(); if (!await confirmBox('למחוק את הקובץ?', { body: f.title, ok: 'מחיקה', danger: true })) return;
        const { error } = await sb.from('project_files').delete().eq('id', f.id);
        if (error) return toast('לא נמחק — נסו שוב');
        sb.storage.from('field').remove([f.storage_path]).catch(() => {}); toast('נמחק'); redraw(); }
    });
  });
}

function rename(f, redraw) {
  let kind = f.kind;
  const close = sheet(`<h3>שינוי שם</h3><label class="field">שם<input id="pft" value="${esc(f.title)}" maxlength="120"></label>
    <div class="chips" id="pfk">${KINDS.map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
    <button class="btn primary block big" id="pfs">שמירה</button>`, sh => {
    $$('#pfk [data-k]', sh).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#pfk [data-k]', sh).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#pfs', sh).onclick = async () => { const title = $('#pft', sh).value.trim() || f.title; const { error } = await sb.from('project_files').update({ title, kind }).eq('id', f.id); close(); toast(error ? 'לא נשמר' : 'נשמר'); redraw(); };
  });
}
