// משימות אישיות (מעקב): מנהל פותח לעובד משימה — לרוב מקושרת לליד/אתר — והעובד רואה אותה בראש מסך הבית,
// עם חיוג / וואטסאפ / מייל לאיש הקשר וסימון "בוצע". כל פעולה נחתמת ביומן הפעולות.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, isoDay, dm, initials, ask } from '../lib/core.js';

const SEL = 'id,title,instructions,due,status,assignee_id,created_by,site_id,done_at,sites(name,slug,contact_name,contact_phone)';
const emailIn = t => (String(t || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
const tel = p => String(p || '').replace(/\D/g, '').replace(/^972/, '0');
const wa = p => 'https://wa.me/972' + tel(p).replace(/^0/, '');
const dueTxt = d => { if (!d) return ''; const t = isoDay(); return d < t ? `<span class="err">באיחור · ${dm(d)}</span>` : d === t ? '<b>היום</b>' : 'עד ' + dm(d); };

export async function myTasks(box) {
  if (!box) return;
  const me = state.user.id;
  let mine = [], others = [], names = new Map();
  try {
    const [{ data: a }, { data: b }, { data: p }] = await Promise.all([
      sb.from('tasks').select(SEL).eq('assignee_id', me).eq('phase', 'מעקב').not('status', 'in', '(done,dropped)').order('due', { nullsFirst: false }),
      isManager() ? sb.from('tasks').select(SEL).eq('created_by', me).eq('phase', 'מעקב').neq('assignee_id', me).not('status', 'in', '(done,dropped)').order('due', { nullsFirst: false }) : Promise.resolve({ data: [] }),
      sb.from('profiles').select('id,full_name'),
    ]);
    mine = a || []; others = b || []; (p || []).forEach(x => names.set(x.id, x.full_name));
  } catch { return; }
  if (!mine.length && !others.length) { box.innerHTML = ''; return; }
  const row = (t, mineRow) => {
    const s = t.sites, ph = s?.contact_phone, em = emailIn(t.instructions);
    return `<div class="tcard" data-id="${t.id}">
      <div class="row"><span class="grow"><b>${esc(t.title)}</b><small>${[s?.name ? esc(s.name) : '', dueTxt(t.due), !mineRow ? 'אצל ' + esc((names.get(t.assignee_id) || '').split(' ')[0]) : ''].filter(Boolean).join(' · ')}</small></span>
        ${mineRow ? `<button class="btn primary sm" data-done="${t.id}">בוצע</button>` : ''}</div>
      ${t.instructions ? `<div class="small" style="white-space:pre-line">${esc(t.instructions)}</div>` : ''}
      ${mineRow && (ph || em || s) ? `<div class="tacts">${s?.contact_name ? `<span class="small muted grow">${esc(s.contact_name)}</span>` : '<span class="grow"></span>'}
        ${ph ? `<a class="chip" href="tel:${tel(ph)}">חיוג</a><a class="chip" href="${wa(ph)}" target="_blank" rel="noopener">וואטסאפ</a>` : ''}
        ${em ? `<a class="chip" href="mailto:${esc(em)}">מייל</a>` : ''}${s ? `<a class="chip" href="#/site/${esc(s.slug)}">לליד</a>` : ''}</div>` : ''}
    </div>`;
  };
  box.innerHTML = `${mine.length ? `<section><div class="sh-row"><h3 class="sh">המשימות שלי</h3><span class="count">${mine.length}</span></div><div class="stack">${mine.map(t => row(t, true)).join('')}</div></section>` : ''}
    ${others.length ? `<details class="fold"><summary><span class="sh">משימות שפתחתי לצוות</span><span class="count">${others.length}</span></summary><div class="stack">${others.map(t => row(t, false)).join('')}</div></details>` : ''}`;
  $$('[data-done]', box).forEach(b => b.onclick = async () => {
    const note = await ask('מה סוכם?', { multiline: true, placeholder: 'למשל: נקבעה פגישה ל-12.10 בשעה 10:00 (לא חובה)', ok: 'סימון בוצע', optional: true });
    if (note == null) return;
    b.disabled = true;
    const { error } = await sb.from('tasks').update({ status: 'done', done_by: me, done_at: new Date().toISOString(), done_note: note.trim() || null }).eq('id', b.dataset.done);
    if (error) { b.disabled = false; return toast(error.message); }
    toast('סומן כבוצע — עודכן גם במאנדי'); myTasks(box);
  });
}

// פתיחת משימה לעובד (מנהלים). site = ליד/אתר לקישור (לא חובה)
export async function newTask({ site, title = '', notes = '', project = null, onDone = null } = {}) {
  if (!isManager()) return;
  const { data: team } = await sb.from('profiles').select('id,full_name,role').eq('is_active', true).neq('role', 'partner').order('full_name');
  const tomorrow = (() => { const d = new Date(Date.now() + 864e5); return isoDay(d); })();
  let who = null;
  sheet(`<h3>משימה לצוות</h3>${site ? `<div class="small muted">מקושרת ל: <b>${esc(site.name)}</b>${site.contact_name ? ' · ' + esc(site.contact_name) : ''}</div>` : ''}
    <label class="field">מה לעשות<input id="ntt" value="${esc(title)}" placeholder="למשל: ליצור קשר ולתאם פגישת אפיון"></label>
    <div class="field">למי<div class="chips">${(team || []).map(u => `<button type="button" class="chip" data-u="${u.id}" aria-pressed="false"><span class="avatar xs">${esc(initials(u.full_name))}</span> ${esc(u.full_name)}</button>`).join('')}</div></div>
    <label class="field">עד מתי<input type="date" id="ntd" value="${tomorrow}"></label>
    <label class="field">פרטים<small>מייל או טלפון שכתובים כאן הופכים לכפתור אצל העובד</small><textarea id="ntn">${esc(notes)}</textarea></label>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="nts">פתיחת משימה</button></div>`, (s, close) => {
    $$('[data-u]', s).forEach(c => c.onclick = () => { who = c.dataset.u; $$('[data-u]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#nts', s).onclick = async () => {
      const t = $('#ntt', s).value.trim(); if (!t) return toast('מה המשימה?'); if (!who) return toast('למי המשימה?');
      $('#nts', s).disabled = true;
      const { data: ins, error } = await sb.from('tasks').insert({ title: t, instructions: $('#ntn', s).value.trim() || null, due: $('#ntd', s).value || null, assignee_id: who,
        site_id: site?.id || null, project_id: project, phase: 'מעקב', status: 'todo', created_by: state.user.id, is_extra: true }).select('id').single();
      if (error) { $('#nts', s).disabled = false; return toast(error.message); }
      close(); toast('המשימה נפתחה — נשלחה התראה'); const h = $('#mytasks'); if (h) myTasks(h); if (onDone) onDone(ins.id);
    };
  });
}
