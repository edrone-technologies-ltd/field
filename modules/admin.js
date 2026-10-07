// ניהול מערכת: צוות, תפקידים, ומי רואה איזה מודול. admin בלבד (נאכף גם בשרת).
import { sb, state, $, $$, esc, toast, ROLE_HE, FIELD_HE, initials, sheet } from '../lib/core.js';

const ROLES = ['admin', 'ops_manager', 'surveyor', 'crew_lead', 'crew', 'partner'];
export async function renderAdmin(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></a><h1>צוות והרשאות</h1></header><div id="ad"><div class="skel"></div></div>`;
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
    <div id="teams"></div>
    <h3>אנשים והרשאות</h3>
    <div class="list">${people.map(p => `<div class="item" style="cursor:default">
      <span class="avatar" aria-hidden="true">${esc(initials(p.full_name))}</span>
      <span class="t"><b>${esc(p.full_name)}</b><small>${esc(p.phone || '')}${p.field_role ? ' · ' + FIELD_HE[p.field_role] : ''}${p.is_pilot && p.pilot_license_expiry ? ' · רישיון עד ' + new Date(p.pilot_license_expiry).toLocaleDateString('he-IL') : ''}</small></span>
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
  usageCard(el); teamsCard(people);
}

// צוותי שטח: מטיס + מפעיל מערכות, ואחד מהם ראש צוות (מקבל אוטומטית הרשאת ראש צוות)
async function teamsCard(people) {
  const box = $('#teams'); if (!box) return;
  const { data: teams } = await sb.from('teams').select('*').eq('active', true).order('sort').order('name');
  const N = id => people.find(p => p.id === id)?.full_name || '—';
  const field = people.filter(p => p.is_active && ['crew', 'crew_lead', 'ops_manager', 'admin'].includes(p.role));
  box.innerHTML = `<div class="row"><h3 class="grow">צוותי שטח</h3><button class="chip" id="tnew">+ צוות</button></div>
    <div class="small muted">כל צוות: מטיס + מפעיל מערכות. ראש הצוות מקבל הרשאות ראש צוות; בשיבוץ בוחרים צוות בלחיצה.</div>
    <div class="list">${(teams || []).map(t => `<button class="item" data-t="${t.id}"><span class="t"><b>${esc(t.name)}</b>
      <small>מטיס: ${esc(N(t.pilot_id))}${t.lead_id === t.pilot_id ? ' ★' : ''} · מפעיל מערכות: ${esc(N(t.operator_id))}${t.lead_id === t.operator_id ? ' ★' : ''}</small></span></button>`).join('') || '<div class="empty small">עוד אין צוותים</div>'}</div>
    <div class="small muted">★ = ראש צוות</div>`;
  const edit = t => {
    const f = { name: t?.name || `צוות ${(teams || []).length + 1}`, pilot_id: t?.pilot_id || null, operator_id: t?.operator_id || null, lead_id: t?.lead_id || null };
    const pick = (k, title) => `<div class="field">${title}<div class="chips">${field.map(p => `<button type="button" class="chip" data-${k}="${p.id}" aria-pressed="${f[k + '_id'] === p.id}">${esc(p.full_name)}</button>`).join('')}</div></div>`;
    sheet(`<h3>${t ? 'עריכת צוות' : 'צוות חדש'}</h3>
      <label class="field">שם הצוות<input id="tn" value="${esc(f.name)}"></label>
      ${pick('pilot', 'מטיס')}${pick('operator', 'מפעיל מערכות')}
      <div class="field">ראש צוות<div class="chips" id="tl"></div></div>
      <div class="row">${t ? '<button class="btn ghost" id="tdel">פירוק צוות</button>' : ''}<button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="tsv">שמירה</button></div>`, (s, close) => {
      const lead = () => { $('#tl', s).innerHTML = [f.pilot_id, f.operator_id].filter(Boolean).map(id => `<button type="button" class="chip" data-lead="${id}" aria-pressed="${f.lead_id === id}">${esc(N(id))}</button>`).join('') || '<span class="small muted">בוחרים קודם מטיס ומפעיל</span>';
        $$('[data-lead]', s).forEach(b => b.onclick = () => { f.lead_id = b.dataset.lead; lead(); }); };
      ['pilot', 'operator'].forEach(k => $$(`[data-${k}]`, s).forEach(b => b.onclick = () => {
        f[k + '_id'] = b.dataset[k]; const other = k === 'pilot' ? 'operator' : 'pilot';
        if (f[other + '_id'] === f[k + '_id']) f[other + '_id'] = null;
        if (![f.pilot_id, f.operator_id].includes(f.lead_id)) f.lead_id = null;
        $$('[data-pilot],[data-operator]', s).forEach(x => x.setAttribute('aria-pressed', f[(x.dataset.pilot ? 'pilot' : 'operator') + '_id'] === (x.dataset.pilot || x.dataset.operator)));
        lead(); }));
      lead();
      const d = $('#tdel', s); if (d) d.onclick = async () => { await sb.from('teams').update({ active: false }).eq('id', t.id); close(); toast('הצוות פורק'); teamsCard(people); };
      $('#tsv', s).onclick = async () => {
        if (!f.pilot_id || !f.operator_id) return toast('חסר מטיס או מפעיל מערכות');
        if (!f.lead_id) return toast('מי ראש הצוות?');
        const row = { name: $('#tn', s).value.trim() || f.name, pilot_id: f.pilot_id, operator_id: f.operator_id, lead_id: f.lead_id };
        const { error } = t ? await sb.from('teams').update(row).eq('id', t.id) : await sb.from('teams').insert(row);
        if (error) return toast(error.message); close(); toast('נשמר'); renderAdmin(document.getElementById('app'));
      };
    });
  };
  $('#tnew', box).onclick = () => edit(null);
  $$('[data-t]', box).forEach(b => b.onclick = () => edit(teams.find(t => t.id === b.dataset.t)));
}

// מד שימוש בחבילה החינמית — אחסון ומסד נתונים. התראה אוטומטית ב-80% (שגרת בוקר)
async function usageCard(el) {
  const { data: u, error } = await sb.rpc('usage_stats'); if (error || !u) return;
  const mb = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + 'MB', pct = (a, b) => Math.min(100, Math.round(a / b * 100));
  const ps = pct(u.storage_bytes, u.storage_limit), pd = pct(u.db_bytes, u.db_limit);
  const months = u.last_30d > 0 ? Math.max(0, (u.storage_limit - u.storage_bytes) / u.last_30d) : null;
  const BK = { field: 'תמונות שטח ואפיון', plans: 'תכניות ומפות', media: 'תמונות דוחות', hr: 'תיקי עובדים', kb: 'מרכז ידע' };
  const c = document.createElement('div'); c.className = 'card stack usage'; c.style.gap = '10px';
  c.innerHTML = `<div class="row"><b class="grow">שימוש בחבילה (חינמית)</b><span class="pill ${Math.max(ps, pd) >= 80 ? 'bad' : Math.max(ps, pd) >= 60 ? 'warn' : 'ok'}">${Math.max(ps, pd)}%</span></div>
    <div><div class="row small"><span class="grow">אחסון קבצים</span><b>${mb(u.storage_bytes)} מתוך 1GB</b></div><div class="progress"><i style="width:${ps}%"></i></div></div>
    <div><div class="row small"><span class="grow">מסד נתונים</span><b>${mb(u.db_bytes)} מתוך 500MB</b></div><div class="progress"><i style="width:${pd}%"></i></div></div>
    <div class="small muted">${Object.entries(u.by_bucket || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${BK[k] || k} ${mb(v)}`).join(' · ')}</div>
    <div class="small">${months != null ? `קצב 30 יום אחרונים: ${mb(u.last_30d)}. ${months > 24 ? 'מספיק ליותר משנתיים' : `בקצב הזה האחסון יתמלא בעוד כ-${months < 1 ? 'פחות מחודש' : Math.round(months) + ' חודשים'}`}.` : ''} ב-80% תגיע התראה. המעבר הבא: Pro, כ-₪95 לחודש (100GB).</div>`;
  const h = el.querySelector('.phead'); if (h) h.after(c); else el.prepend(c);
}
