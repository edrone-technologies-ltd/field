// ניהול מערכת: צוות, תפקידים, ומי רואה איזה מודול. admin בלבד (נאכף גם בשרת).
import { sb, state, $, $$, esc, toast, ROLE_HE, initials } from '../lib/core.js';

const ROLES = ['admin', 'ops_manager', 'surveyor', 'crew_lead', 'crew', 'partner'];
export async function renderAdmin(el) {
  el.innerHTML = `<div class="top"><button class="back" onclick="location.hash='#/'">→ בית</button></div>
    <div><div class="eyebrow">ניהול מערכת</div><h1>צוות והרשאות</h1></div><div id="ad"><div class="skel"></div></div>`;
  const [{ data: people }, { data: mods }, { data: rm }, { data: sites }, { data: sm }, { data: logs }] = await Promise.all([
    sb.from('profiles').select('*').order('full_name'),
    sb.from('modules').select('*').order('sort'),
    sb.from('role_modules').select('*'),
    sb.from('sites').select('id,name'),
    sb.from('site_members').select('*'),
    sb.from('sync_log').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  const has = (r, m) => rm.some(x => x.role === r && x.module === m);
  $('#ad').innerHTML = `
    <div class="stack">
    <h3>צוות</h3>
    <div class="list">${people.map(p => `<div class="item" style="cursor:default">
      <span class="avatar" aria-hidden="true">${esc(initials(p.full_name))}</span>
      <span class="t"><b>${esc(p.full_name)}</b><small>${esc(p.phone || '')}${p.is_pilot ? ' · מטיס' + (p.pilot_license_expiry ? ' עד ' + new Date(p.pilot_license_expiry).toLocaleDateString('he-IL') : '') : ''}</small></span>
      <select data-role="${p.id}" aria-label="תפקיד" ${p.id === state.user.id ? 'disabled' : ''} style="width:auto">${ROLES.map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${ROLE_HE[r]}</option>`).join('')}</select>
      <label class="sw" title="פעיל"><input type="checkbox" data-act="${p.id}" ${p.is_active ? 'checked' : ''} ${p.id === state.user.id ? 'disabled' : ''}><i></i></label>
    </div>`).join('')}</div>
    <div class="small muted">עובד חדש נוסף מלוח העובדים במאנדי, עם טלפון. הוא מקבל קוד כניסה אישי.</div>

    <h3>מי רואה מה</h3>
    <div class="scroll-x card"><table class="t"><thead><tr><th>מודול</th>${ROLES.map(r => `<th>${ROLE_HE[r]}</th>`).join('')}</tr></thead><tbody>
      ${mods.map(m => `<tr><td><b>${esc(m.title)}</b>${m.is_live ? '' : ' <span class="pill">בבנייה</span>'}</td>${ROLES.map(r => `<td><input type="checkbox" data-rm="${r}|${m.key}" ${has(r, m.key) ? 'checked' : ''} ${r === 'admin' && m.key === 'admin' ? 'disabled' : ''} aria-label="${esc(ROLE_HE[r] + ' · ' + m.title)}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>

    <h3>שיוך לאתרים</h3>
    <div class="small muted">מנהלים רואים את כל האתרים. סוקרים וצוות רואים רק אתרים שמשויכים אליהם.</div>
    <div class="scroll-x card"><table class="t"><thead><tr><th>עובד</th>${sites.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
      ${people.filter(p => !['admin', 'ops_manager'].includes(p.role)).map(p => `<tr><td>${esc(p.full_name)}</td>${sites.map(s => `<td><input type="checkbox" data-sm="${s.id}|${p.id}" ${sm.some(x => x.site_id === s.id && x.user_id === p.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('') || `<tr><td colspan="9" class="muted">כולם מנהלים, ורואים הכל.</td></tr>`}
    </tbody></table></div>

    <h3>סנכרון מאנדי</h3>
    ${logs.length ? `<div class="scroll-x card"><table class="t"><tr><th>מתי</th><th>כיוון</th><th>מה</th><th>מצב</th></tr>${logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString('he-IL')}</td><td>${l.direction === 'to_monday' ? 'למאנדי' : 'ממאנדי'}</td><td>${esc(l.entity)}</td><td><span class="pill ${l.status === 'ok' ? 'ok' : l.status === 'error' ? 'bad' : 'warn'}">${l.status}</span></td></tr>`).join('')}</table></div>` : `<div class="card small muted">אין עדיין פעולות סנכרון.</div>`}
    </div>`;
  $$('[data-role]').forEach(s => s.onchange = async () => { const { error } = await sb.from('profiles').update({ role: s.value }).eq('id', s.dataset.role); toast(error ? 'לא נשמר' : 'התפקיד עודכן'); });
  $$('[data-act]').forEach(c => c.onchange = async () => { const { error } = await sb.from('profiles').update({ is_active: c.checked }).eq('id', c.dataset.act); toast(error ? 'לא נשמר' : c.checked ? 'הגישה הופעלה' : 'הגישה נחסמה'); });
  $$('[data-rm]').forEach(c => c.onchange = async () => {
    const [role, module] = c.dataset.rm.split('|');
    const q = c.checked ? sb.from('role_modules').insert({ role, module }) : sb.from('role_modules').delete().eq('role', role).eq('module', module);
    const { error } = await q; toast(error ? 'לא נשמר' : 'ההרשאה עודכנה');
  });
  $$('[data-sm]').forEach(c => c.onchange = async () => {
    const [site_id, user_id] = c.dataset.sm.split('|');
    const q = c.checked ? sb.from('site_members').insert({ site_id, user_id }) : sb.from('site_members').delete().eq('site_id', site_id).eq('user_id', user_id);
    const { error } = await q; toast(error ? 'לא נשמר' : 'השיוך עודכן');
  });
}
