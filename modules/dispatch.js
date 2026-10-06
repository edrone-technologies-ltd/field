// לוח שיבוץ שבועי (מנהלים): מי עובד איפה בכל יום. התנגשויות (שני פרויקטים באותו יום) והיעדרויות מסומנות. הקשה על תא ריק = שיבוץ.
import { sb, isManager, sheet, icon, $, $$, esc, toast, confirmBox, HE_D1, isoDay, dm } from '../lib/core.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const sunday = s => addDays(s, -new Date(s + 'T12:00:00').getDay());
const ABS = { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש', other: 'היעדרות' };

export async function renderDispatch(el, start) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  start = sunday(start || isoDay());
  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(start, i)), end = days.at(-1);
  el.innerHTML = `<header class="phead"><a class="back" href="#/schedule" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">לוח שיבוץ</h1></header>
    <div class="monthbar"><button id="wp" aria-label="שבוע קודם">${icon('back', 18)}</button><b>${dm(start)} – ${dm(end)}</b><button id="wn" aria-label="שבוע הבא">${icon('chev', 18)}</button></div>
    <div id="db"><div class="skel tall"></div></div>`;
  $('#wp').onclick = () => location.hash = '#/dispatch/' + addDays(start, -7);
  $('#wn').onclick = () => location.hash = '#/dispatch/' + addDays(start, 7);
  const [{ data: people }, { data: wds }, { data: abs }, { data: projects }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true).order('full_name'),
    sb.from('work_days').select('id,day,status,project_id,crew_lead_id,gust_max,weather_alerted,projects(name),work_day_crew(user_id)').gte('day', start).lte('day', end),
    sb.from('absences').select('user_id,kind,date_from,date_to,status').neq('status', 'rejected').lte('date_from', end).gte('date_to', start),
    sb.from('projects').select('id,name,status_label,monday_group').neq('monday_group', 'group_mm5052gw').order('name'),
  ]);
  const staff = (people || []).filter(p => ['crew', 'crew_lead', 'ops_manager'].includes(p.role) || (wds || []).some(w => w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id)));
  const cell = (p, d) => {
    const mine = (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id)));
    const a = (abs || []).find(x => x.user_id === p.id && x.date_from <= d && x.date_to >= d);
    const conflict = mine.length > 1 || (mine.length && a);
    return `<td class="${conflict ? 'conf' : ''} ${d === isoDay() ? 'today' : ''}" data-u="${p.id}" data-d="${d}">${a ? `<span class="dchip abs ${a.status === 'pending' ? 'pend' : ''}">${ABS[a.kind]}${a.status === 'pending' ? '?' : ''}</span>` : ''}
      ${mine.map(w => `<span class="dchip ${w.status === 'done' ? 'done' : ''} ${w.weather_alerted ? 'wx' : ''}" data-w="${w.id}" title="${esc(w.projects?.name || '')}">${esc((w.projects?.name || '').split(/[—–-]/)[0].trim().slice(0, 14))}${w.crew_lead_id === p.id ? ' ★' : ''}</span>`).join('')}</td>`;
  };
  const conflicts = staff.flatMap(p => days.filter(d => (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id))).length > 1).map(d => `${p.full_name.split(' ')[0]} ב-${dm(d)}`));
  $('#db').innerHTML = `${conflicts.length ? `<div class="arow bad card-like"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>התנגשות שיבוץ</b><small>${esc(conflicts.join(' · '))}</small></span></div>` : ''}
    <div class="dwrap"><table class="dgrid"><thead><tr><th></th>${days.map(d => `<th class="${d === isoDay() ? 'today' : ''}">${HE_D1[new Date(d + 'T12:00').getDay()]}<small>${dm(d)}</small></th>`).join('')}</tr></thead>
      <tbody>${staff.map(p => `<tr><th class="who">${esc(p.full_name.split(' ')[0])}${p.is_pilot ? ' <small>מטיס</small>' : ''}</th>${days.map(d => cell(p, d)).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="small muted">★ = ראש צוות · ⚠ ברקע = תחזית רוח חריגה · הקשה על תא ריק משבצת, על פרויקט — פותחת את היום.</div>`;
  const reload = () => renderDispatch(el, start);
  ($('td.conf', el) || $('th.today', el))?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $$('.dchip[data-w]', el).forEach(c => c.onclick = e => { e.stopPropagation(); location.hash = '#/day/' + c.dataset.w; });
  $$('td[data-u]', el).forEach(td => td.onclick = () => {
    const p = staff.find(x => x.id === td.dataset.u), d = td.dataset.d, mine = (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id)));
    sheet(`<h3>${esc(p.full_name)} · ${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}</h3>
      ${mine.length ? `<div class="list">${mine.map(w => `<div class="lrow"><span class="grow"><b>${esc(w.projects?.name || '')}</b></span><button class="chip" data-rm="${w.id}">הסרה מהיום</button></div>`).join('')}</div>` : ''}
      <label class="field">שיבוץ לפרויקט<select id="ap"><option value="">בחירת פרויקט…</option>${(projects || []).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="ago">שיבוץ</button></div>`, (s, close) => {
      $('#ago', s).onclick = async () => { const pid = $('#ap', s).value; if (!pid) return toast('בחרו פרויקט');
        const { error } = await sb.rpc('assign_day', { p: pid, d, u: p.id }); if (error) return toast(error.message, 5000); close(); toast('שובץ — העובד קיבל הודעה'); reload(); };
      $$('[data-rm]', s).forEach(b => b.onclick = async () => { if (!(await confirmBox('להסיר מהיום?', { ok: 'הסרה' }))) return;
        const { error } = await sb.rpc('unassign_day', { w: b.dataset.rm, u: p.id }); if (error) return toast(error.message); reload(); });
    });
  });
}
