// בקשת טופס (db/178, docs/forms/README.md החלטה 3): אין מנוע טפסים. ההנהלה מגישה אפיון מלא, והבקשה עוברת לפיתוח.
// מנהל (admin / ops_manager) רואה ומגיש. היוצר או admin עורכים תוכן. רק admin משנה סטטוס (גם בשרת: form_requests_guard).
// עדיין לא מחובר לניווט (app.js נדחה). כניסה: renderFormRequests(app).
import { sb, state, isManager, cache, enqueue, sheet, uid, $, $$, esc, toast, dm, icon, goBack, haptic, ROLE_HE, FIELD_HE } from '../lib/core.js';
import { outbox } from '../lib/store.js';

const ST = { new: ['חדשה', 'warn'], in_review: ['בבדיקה', 'lime'], in_dev: ['בפיתוח', 'lime'], done: ['הושלמה', 'ok'], rejected: ['נדחתה', 'bad'] };
const TYPES = { text: 'טקסט', long: 'טקסט ארוך', number: 'מספר', date: 'תאריך', choice: 'בחירה', multi: 'בחירה מרובה', yesno: 'כן / לא', photo: 'תמונה', check: 'צ׳ק-ליסט' };
const ROLES = { ...Object.fromEntries(Object.entries(ROLE_HE).filter(([k]) => k !== 'partner')), ...FIELD_HE };
const isAdmin = () => state.profile?.role === 'admin';
const fdate = iso => iso ? dm(iso.slice(0, 10)) : '';

const css = () => { if ($('#fr-css')) return; const s = document.createElement('style'); s.id = 'fr-css'; s.textContent = `
.fr-f{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
.fr-f .row{gap:8px;align-items:center}
.fr-f input,.fr-f select{min-width:0}
.fr-x{flex:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--muted)}
.fr-n{flex:none;min-width:24px;font:700 .85rem var(--f-mono);color:var(--muted);text-align:center}
.fr-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:.92rem} .fr-kv small{color:var(--muted)}
.fr-fl{display:flex;flex-direction:column} .fr-fl>div{display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)} .fr-fl>div:last-child{border-bottom:0}
[data-fr] [aria-invalid=true]{border-color:var(--bad)!important}
`; document.head.appendChild(s); };

export async function renderFormRequests(app) {
  css();
  app.innerHTML = `<header class="phead"><a class="back" href="#/menu" data-gb aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">בקשות טופס</h1>${isManager() ? `<button class="hbtn" id="fradd" aria-label="בקשת טופס">${icon('plus', 20)}</button>` : ''}</header>
    <div id="frl" class="stack lg"><div class="skel"></div><div class="skel"></div></div>`;
  $$('[data-gb]', app).forEach(a => a.onclick = e => { e.preventDefault(); goBack('#/menu'); });
  if (!isManager()) { $('#frl').innerHTML = `<div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>אין לך גישה למסך הזה</b></span></div>`; return; }
  let R = [];
  try {
    const { data, error } = await sb.from('form_requests').select('*, profiles:created_by(full_name)').order('created_at', { ascending: false }).limit(100);
    if (error) throw error; R = data || []; cache.set('form_requests', R).catch(() => {});
  } catch { R = (await cache.get('form_requests').catch(() => null)) || []; }
  // מה שעוד בתור (בלי קליטה)
  try { const ids = new Set(R.map(r => r.id)); (await outbox.all()).filter(x => x.table === 'form_requests' && x.kind === 'insert' && !ids.has(x.row?.id)).forEach(x => R.unshift({ ...x.row, __q: true, created_at: new Date(x.at).toISOString(), profiles: { full_name: state.profile?.full_name } })); } catch { /* */ }
  const again = () => renderFormRequests(app);
  const open = R.filter(r => !['done', 'rejected'].includes(r.status)), closed = R.filter(r => ['done', 'rejected'].includes(r.status));
  const row = r => { const [t, c] = r.__q ? ['ממתין לשליחה', ''] : ST[r.status] || ['', ''];
    return `<button type="button" class="lrow" data-r="${r.id}"><span class="grow"><b>${esc(r.title)}</b><small>${esc([fdate(r.created_at), r.profiles?.full_name, (r.fields || []).length ? (r.fields.length === 1 ? 'שדה אחד' : `${r.fields.length} שדות`) : ''].filter(Boolean).join(' · '))}</small></span><span class="pill ${c}">${t}</span></button>`; };
  $('#frl').innerHTML = R.length ? `
    ${open.length ? `<section><div class="sh-row"><h3 class="sh">פתוחות</h3><span class="count">${open.length}</span></div><div class="list">${open.map(row).join('')}</div></section>` : ''}
    ${closed.length ? `<section><div class="sh-row"><h3 class="sh">סגורות</h3><span class="count">${closed.length}</span></div><div class="list">${closed.map(row).join('')}</div></section>` : ''}`
    : `<div class="ecta"><span class="ei">${icon('clipboard', 28)}</span><b>עוד אין בקשות</b><button class="btn primary" id="frnew">${icon('plus', 18)} בקשת טופס</button></div>`;
  ['#fradd', '#frnew'].forEach(k => { const b = $(k); if (b) b.onclick = () => editSheet(null, again); });
  $$('[data-r]').forEach(b => b.onclick = () => viewSheet(R.find(r => r.id === b.dataset.r), again));
}

// ---------- צפייה (+ שינוי סטטוס ל-admin) ----------
function viewSheet(r, done) {
  if (!r) return;
  // תוכן נעול למי שאינו admin אחרי שהבקשה עברה לפיתוח / נסגרה (db/178 form_requests_guard)
  const mine = r.created_by === state.user.id, canEdit = !r.__q && (isAdmin() || (mine && ['new', 'in_review'].includes(r.status)));
  const kv = [['מטרה', r.purpose], ['מי ממלא', (r.filled_by_roles || []).map(k => ROLES[k] || k).join(', ')], ['מתי', r.trigger_when], ['מי מקבל', r.recipients], ['פלט', r.output],
    ['חתימה', r.needs_signature ? 'כן' : ''], ['אישור מנהל', r.needs_approval ? 'כן' : ''], ['הערות', r.notes]].filter(([, v]) => v);
  sheet(`<div class="row"><h3 class="grow">${esc(r.title)}</h3><span class="pill ${(ST[r.status] || [])[1] || ''}">${r.__q ? 'ממתין לשליחה' : (ST[r.status] || [''])[0]}</span></div>
    <div class="small muted">${esc([fdate(r.created_at), r.profiles?.full_name].filter(Boolean).join(' · '))}</div>
    ${kv.length ? `<div class="fr-kv">${kv.map(([k, v]) => `<small>${k}</small><span>${esc(v)}</span>`).join('')}</div>` : ''}
    ${(r.fields || []).length ? `<div class="field">שדות<div class="card fr-fl">${r.fields.map((f, i) => `<div><span class="fr-n">${i + 1}</span><span class="grow"><b>${esc(f.label)}</b>${f.required ? ' <span class="pill warn">חובה</span>' : ''}<small class="muted" style="display:block">${esc([TYPES[f.type] || f.type, (f.options || []).join(' / ')].filter(Boolean).join(' · '))}</small></span></div>`).join('')}</div></div>` : ''}
    ${isAdmin() && !r.__q ? `<div class="field">סטטוס<div class="chips">${Object.entries(ST).map(([k, [t]]) => `<button type="button" class="chip" data-st="${k}" aria-pressed="${r.status === k}">${t}</button>`).join('')}</div></div>` : ''}
    <div class="row-btns"><button class="btn ghost" data-close>סגירה</button>${canEdit ? `<button class="btn ghost" id="fred">${icon('pen', 18)} עריכה</button>` : ''}</div>`, (s, close) => {
    $$('[data-st]', s).forEach(b => b.onclick = async () => { if (r.status === b.dataset.st) return; r.status = b.dataset.st;
      $$('[data-st]', s).forEach(y => y.setAttribute('aria-pressed', y === b));
      await enqueue({ kind: 'update', table: 'form_requests', rowId: r.id, patch: { status: r.status } }); haptic('tap'); toast(`סטטוס: ${ST[r.status][0]}`); done?.(); });
    const ed = $('#fred', s); if (ed) ed.onclick = () => { close(); editSheet(r, done); };
  });
}

// ---------- הגשה / עריכה ----------
function editSheet(r, done) {
  const F = (r?.fields || []).map(f => ({ ...f, options: [...(f.options || [])] }));
  if (!F.length) F.push({ label: '', type: 'text', required: false, options: [] });
  const roles = new Set(r?.filled_by_roles || []);
  let sig = !!r?.needs_signature, apr = !!r?.needs_approval;
  const fHtml = (f, i) => `<div class="card fr-f" data-f="${i}">
      <div class="row"><span class="fr-n">${i + 1}</span><input class="grow" type="text" data-fl value="${esc(f.label)}" placeholder="שם השדה"><button type="button" class="fr-x" data-fx aria-label="הסרת שדה">${icon('x', 18)}</button></div>
      <div class="row"><select class="grow" data-ft>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button type="button" class="chip" data-fr-req aria-pressed="${!!f.required}">חובה</button></div>
      <input type="text" data-fo value="${esc((f.options || []).join(', '))}" placeholder="אפשרויות, מופרדות בפסיק" ${['choice', 'multi', 'check'].includes(f.type) ? '' : 'hidden'}>
    </div>`;
  sheet(`<div class="stack" data-fr><h3>${r ? 'עריכת בקשה' : 'בקשת טופס'}</h3>
    <label class="field">שם הטופס<input type="text" id="frt" value="${esc(r?.title || '')}" maxlength="200"></label>
    <label class="field">מטרה<textarea id="frp" rows="2">${esc(r?.purpose || '')}</textarea></label>
    <div class="field">מי ממלא<div class="chips" id="frr">${Object.entries(ROLES).map(([k, t]) => `<button type="button" class="chip" data-role="${k}" aria-pressed="${roles.has(k)}">${t}</button>`).join('')}</div></div>
    <label class="field">מתי<input type="text" id="frw" value="${esc(r?.trigger_when || '')}" placeholder="למשל: בסוף כל יום עבודה"></label>
    <label class="field">מי מקבל<input type="text" id="frc" value="${esc(r?.recipients || '')}" placeholder="למשל: מנהל התפעול"></label>
    <div class="field">שדות<div class="stack" id="frf" style="gap:8px">${F.map(fHtml).join('')}</div>
      <button type="button" class="btn ghost block" id="frfa">${icon('plus', 18)} שדה</button></div>
    <div class="chips"><button type="button" class="chip" id="frsig" aria-pressed="${sig}">צריך חתימה</button><button type="button" class="chip" id="frapr" aria-pressed="${apr}">צריך אישור מנהל</button></div>
    <label class="field">פלט<input type="text" id="fro" value="${esc(r?.output || '')}" placeholder="למשל: היסטוריית הכלי, התראה למנהל"></label>
    <label class="field">הערות<textarea id="frn" rows="2">${esc(r?.notes || '')}</textarea></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="frgo">${r ? 'שמירה' : 'שליחת הבקשה'}</button></div></div>`, (s, close) => {
    const fields = () => { $('#frf', s).innerHTML = F.map(fHtml).join(''); bindF(); };
    const bindF = () => $$('[data-f]', s).forEach(c => { const f = F[+c.dataset.f];
      $('[data-fl]', c).oninput = e => { f.label = e.target.value; e.target.removeAttribute('aria-invalid'); };
      $('[data-ft]', c).onchange = e => { f.type = e.target.value; $('[data-fo]', c).hidden = !['choice', 'multi', 'check'].includes(f.type); };
      $('[data-fr-req]', c).onclick = e => { f.required = !f.required; e.currentTarget.setAttribute('aria-pressed', f.required); };
      $('[data-fo]', c).oninput = e => { f.options = e.target.value.split(/[,،]/).map(x => x.trim()).filter(Boolean); };
      $('[data-fx]', c).onclick = () => { F.splice(+c.dataset.f, 1); fields(); }; });
    bindF();
    $('#frfa', s).onclick = () => { F.push({ label: '', type: 'text', required: false, options: [] }); fields(); $$('[data-fl]', s).pop()?.focus(); };
    $$('[data-role]', s).forEach(b => b.onclick = () => { const k = b.dataset.role; roles.has(k) ? roles.delete(k) : roles.add(k); b.setAttribute('aria-pressed', roles.has(k)); });
    $('#frsig', s).onclick = e => { sig = !sig; e.currentTarget.setAttribute('aria-pressed', sig); };
    $('#frapr', s).onclick = e => { apr = !apr; e.currentTarget.setAttribute('aria-pressed', apr); };
    if (!r) setTimeout(() => $('#frt', s)?.focus(), 80);
    $('#frgo', s).onclick = async () => {
      const go = $('#frgo', s); if (go.disabled) return;
      const title = $('#frt', s).value.trim(), bad = n => { n.setAttribute('aria-invalid', 'true'); n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.focus(); haptic('warn'); };
      if (!title) { bad($('#frt', s)); return toast('מה שם הטופס?'); }
      const ff = F.filter(f => f.label.trim() || f.options.length);
      const nl = ff.findIndex(f => !f.label.trim()); if (nl >= 0) { bad($(`[data-f="${F.indexOf(ff[nl])}"] [data-fl]`, s)); return toast('לכל שדה צריך שם'); }
      const v = { title, purpose: $('#frp', s).value.trim() || null, filled_by_roles: [...roles], trigger_when: $('#frw', s).value.trim() || null, recipients: $('#frc', s).value.trim() || null,
        fields: ff.map(f => ({ label: f.label.trim(), type: f.type, required: !!f.required, options: ['choice', 'multi', 'check'].includes(f.type) ? f.options : [] })),
        needs_signature: sig, needs_approval: apr, output: $('#fro', s).value.trim() || null, notes: $('#frn', s).value.trim() || null };
      go.disabled = true;
      if (r) await enqueue({ kind: 'update', table: 'form_requests', rowId: r.id, patch: v });
      else await enqueue({ kind: 'insert', table: 'form_requests', row: { id: uid(), ...v, status: 'new', created_by: state.user.id } });
      haptic('success'); close(); toast(r ? 'נשמר' : 'הבקשה נשלחה', 2200, 'success'); done?.();
    };
  });
}
