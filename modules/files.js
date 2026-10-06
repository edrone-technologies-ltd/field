// תיק אישי: מסמכים (רישיונות, ת"ז, תעודות, חוזה, 101) ותלושי שכר. עובד — צפייה בשלו. מנהלים — העלאה ומחיקה; תלושים — מנהלי מערכת בלבד.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, confirmBox, uid, initials, ROLE_HE } from '../lib/core.js';

export const KINDS = { payslip: 'תלוש שכר', license: 'רישיון', id: 'תעודה מזהה', certificate: 'תעודה / הסמכה', contract: 'חוזה העסקה', form101: 'טופס 101', other: 'אחר' };
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const mName = m => m ? `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : '';
const isAdmin = () => state.profile.role === 'admin';
const daysTo = d => Math.round((new Date(d) - new Date()) / 864e5);
const expPill = d => { if (!d) return ''; const n = daysTo(d); return `<span class="pill ${n < 0 ? 'bad' : n <= 45 ? 'warn' : 'ok'}">${n < 0 ? 'פג' : 'בתוקף עד'} ${new Date(d).toLocaleDateString('he-IL')}</span>`; };

async function openDoc(d) {
  const { data, error } = await sb.storage.from('hr').createSignedUrl(d.storage_path, 300);
  if (error) return toast('אין גישה לקובץ');
  if (d.user_id === state.user.id && !d.seen_at) sb.from('employee_docs').update({ seen_at: new Date().toISOString() }).eq('id', d.id).then(() => {});
  window.open(data.signedUrl, '_blank');
}
function docList(docs, { manage, reload }) {
  const pays = docs.filter(d => d.kind === 'payslip').sort((a, b) => (b.month || '') < (a.month || '') ? -1 : 1);
  const other = docs.filter(d => d.kind !== 'payslip');
  const row = d => `<div class="lrow"><span class="mic">${icon(d.kind === 'payslip' ? 'report' : 'clipboard', 19)}</span>
    <button class="grow linkish" data-open="${d.id}"><b>${esc(d.kind === 'payslip' ? 'תלוש ' + mName(d.month) : d.title)}</b><small>${esc(d.kind === 'payslip' ? '' : KINDS[d.kind])}${d.user_id === state.user.id && !d.seen_at ? ' · <span class="newdot">חדש</span>' : ''}</small></button>
    ${expPill(d.expires_on)}${manage && (d.kind !== 'payslip' || isAdmin()) ? `<button class="chip" data-del="${d.id}" aria-label="מחיקה">מחיקה</button>` : ''}</div>`;
  const html = `${pays.length || (manage && isAdmin()) ? `<section><h3 class="sh">תלושי שכר</h3><div class="list">${pays.map(row).join('') || '<div class="muted small">עוד לא הועלו תלושים</div>'}</div></section>` : ''}
    <section><h3 class="sh">מסמכים</h3><div class="list">${other.map(row).join('') || '<div class="muted small">אין מסמכים בתיק</div>'}</div></section>`;
  return { html, bind: root => {
    $$('[data-open]', root).forEach(b => b.onclick = () => openDoc(docs.find(x => x.id === b.dataset.open)));
    $$('[data-del]', root).forEach(b => b.onclick = async () => {
      const d = docs.find(x => x.id === b.dataset.del);
      if (!(await confirmBox('למחוק את המסמך?', { body: d.kind === 'payslip' ? 'תלוש ' + mName(d.month) : d.title, ok: 'מחיקה', danger: true }))) return;
      await sb.storage.from('hr').remove([d.storage_path]); const { error } = await sb.from('employee_docs').delete().eq('id', d.id);
      if (error) return toast(error.message); toast('נמחק'); reload();
    });
  } };
}

// ---------- התיק שלי ----------
export async function renderMyFile(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1>התיק שלי</h1></header><div id="mf" class="stack lg"><div class="skel"></div></div>`;
  const { data } = await sb.from('employee_docs').select('*').eq('user_id', state.user.id);
  const L = docList(data || [], { manage: false, reload: () => renderMyFile(el) });
  $('#mf').innerHTML = `<div class="small muted">המסמכים והתלושים שלך. רק אתה והמשרד רואים אותם.</div>${L.html}`; L.bind($('#mf'));
}

// ---------- תיקי עובדים (מנהלים) ----------
export async function renderTeamFiles(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תיקי עובדים</h1>${isAdmin() ? `<button class="btn primary sm" id="bulk">${icon('plus', 18)} תלושים לחודש</button>` : ''}</header><div id="tf" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: people }, { data: docs }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,is_active').eq('is_active', true).order('full_name'),
    sb.from('employee_docs').select('id,user_id,kind,title,month,expires_on'),
  ]);
  const soon = (docs || []).filter(d => d.expires_on && daysTo(d.expires_on) <= 45);
  $('#tf').innerHTML = `${soon.length ? `<section><h3 class="sh">פג תוקף בקרוב</h3><div class="alist">${soon.map(d => `<a class="arow ${daysTo(d.expires_on) < 0 ? 'bad' : 'warn'}" href="#/files/${d.user_id}"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(people.find(p => p.id === d.user_id)?.full_name || '')} · ${esc(d.title)}</b><small>${daysTo(d.expires_on) < 0 ? 'פג' : `בעוד ${daysTo(d.expires_on)} ימים`} · ${new Date(d.expires_on).toLocaleDateString('he-IL')}</small></span></a>`).join('')}</div></section>` : ''}
    <div class="list">${(people || []).map(p => { const mine = (docs || []).filter(d => d.user_id === p.id); const pays = mine.filter(d => d.kind === 'payslip').length;
      return `<a class="lrow" href="#/files/${p.id}"><span class="avatar sm">${esc(initials(p.full_name))}</span><span class="grow"><b>${esc(p.full_name)}</b><small>${esc(ROLE_HE[p.role] || '')} · ${mine.length - pays} מסמכים${isAdmin() ? ` · ${pays} תלושים` : ''}</small></span><span class="chev">${icon('chev', 18)}</span></a>`; }).join('')}</div>`;
  const b = $('#bulk'); if (b) b.onclick = () => bulkPayslips(people || [], () => renderTeamFiles(el));
}

// מסמכים של עובד בתוך פורטל העובדים
export async function employeeDocs(box, userId) {
  const [{ data: p }, { data: docs }] = await Promise.all([
    sb.from('profiles').select('id,full_name').eq('id', userId).single(),
    sb.from('employee_docs').select('*').eq('user_id', userId),
  ]);
  const reload = () => employeeDocs(box, userId);
  const L = docList(docs || [], { manage: true, reload });
  box.innerHTML = `<button class="btn primary block" id="up">${icon('plus', 18)} העלאת מסמך${isAdmin() ? ' / תלוש' : ''}</button>${L.html}`;
  L.bind(box); $('#up', box).onclick = () => uploadSheet(p, reload);
}
export const bulkUpload = (people, done) => bulkPayslips(people, done);

function uploadSheet(p, done) {
  let kind = isAdmin() ? 'payslip' : 'license', file = null;
  const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const kinds = Object.entries(KINDS).filter(([k]) => k !== 'payslip' || isAdmin());
  sheet(`<h3>העלאה לתיק של ${esc(p.full_name)}</h3>
    <div class="chips">${kinds.map(([k, t]) => `<button class="chip" data-k="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
    <label class="field" id="fm">חודש התלוש<input type="month" id="um" value="${prev.toISOString().slice(0, 7)}"></label>
    <label class="field" id="ft" hidden>שם המסמך<input type="text" id="ut" placeholder="למשל: רישיון מטיס, תעודת עבודה בגובה"></label>
    <label class="field" id="fx" hidden>בתוקף עד (לא חובה)<input type="date" id="ux"></label>
    <label class="btn ghost block" style="position:relative">${icon('plus', 18)} <span id="un">בחירת קובץ (PDF או תמונה)</span><input type="file" accept="application/pdf,image/*" id="uf" style="position:absolute;inset:0;opacity:0"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="ugo">העלאה</button></div>`, (s, close) => {
    const sync = () => { $('#fm', s).hidden = kind !== 'payslip'; $('#ft', s).hidden = kind === 'payslip'; $('#fx', s).hidden = !['license', 'id', 'certificate'].includes(kind); };
    $$('[data-k]', s).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); sync(); });
    $('#uf', s).onchange = e => { file = e.target.files[0]; $('#un', s).textContent = file ? file.name : 'בחירת קובץ'; }; sync();
    $('#ugo', s).onclick = async () => {
      if (!file) return toast('לא נבחר קובץ');
      const title = kind === 'payslip' ? `תלוש ${$('#um', s).value}` : ($('#ut', s).value.trim() || KINDS[kind]);
      $('#ugo', s).disabled = true; $('#ugo', s).textContent = 'מעלה…';
      const err = await uploadDoc(p.id, kind, file, { title, month: kind === 'payslip' ? $('#um', s).value + '-01' : null, expires_on: $('#ux', s).value || null });
      if (err) { $('#ugo', s).disabled = false; $('#ugo', s).textContent = 'העלאה'; return toast(err, 4000); }
      close(); toast(kind === 'payslip' ? 'התלוש עלה — העובד קיבל הודעה' : 'המסמך נשמר בתיק'); done();
    };
  });
}
async function uploadDoc(userId, kind, file, meta) {
  const id = uid(), ext = (file.name.split('.').pop() || 'pdf').toLowerCase().slice(0, 5);
  const path = `${userId}/${kind}/${id}.${ext}`;
  const { error: e1 } = await sb.storage.from('hr').upload(path, file, { contentType: file.type || 'application/pdf' });
  if (e1) return e1.message;
  const { error: e2 } = await sb.from('employee_docs').insert({ id, user_id: userId, kind, storage_path: path, mime: file.type, uploaded_by: state.user.id, ...meta });
  if (e2) { await sb.storage.from('hr').remove([path]); return e2.message; }
  return null;
}

// ---------- העלאת תלושים לכל העובדים בבת אחת ----------
function bulkPayslips(people, done) {
  const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let files = [];
  const guess = f => people.find(p => p.full_name.split(' ').some(w => w.length > 1 && f.name.includes(w)))?.id || '';
  sheet(`<h3>תלושי שכר לחודש</h3><div class="small muted">בוחרים את כל הקבצים. השיוך לעובד מנחש לפי השם בקובץ — בודקים ומתקנים לפני ההעלאה. כל עובד מקבל הודעה.</div>
    <label class="field">חודש<input type="month" id="bm" value="${prev.toISOString().slice(0, 7)}"></label>
    <label class="btn ghost block" style="position:relative">${icon('plus', 18)} בחירת קבצים<input type="file" accept="application/pdf,image/*" multiple id="bf" style="position:absolute;inset:0;opacity:0"></label>
    <div id="bl" class="list"></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="bgo">העלאה</button></div>`, (s, close) => {
    $('#bf', s).onchange = e => {
      files = [...e.target.files];
      $('#bl', s).innerHTML = files.map((f, i) => `<div class="lrow"><span class="grow"><small>${esc(f.name)}</small></span><select data-i="${i}" style="width:auto"><option value="">— עובד —</option>${people.map(p => `<option value="${p.id}" ${guess(f) === p.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div>`).join('');
    };
    $('#bgo', s).onclick = async () => {
      const sel = $$('select[data-i]', s).map(x => ({ f: files[+x.dataset.i], u: x.value }));
      if (!sel.length) return toast('לא נבחרו קבצים'); if (sel.some(x => !x.u)) return toast('יש קובץ בלי עובד');
      const m = $('#bm', s).value; $('#bgo', s).disabled = true; let ok = 0;
      for (const x of sel) { $('#bgo', s).textContent = `מעלה ${ok + 1}/${sel.length}…`; const err = await uploadDoc(x.u, 'payslip', x.f, { title: `תלוש ${m}`, month: m + '-01' }); if (err) { toast(err, 4000); break; } ok++; }
      close(); toast(`הועלו ${ok} תלושים`); done();
    };
  });
}
