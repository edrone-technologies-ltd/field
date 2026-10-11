// ניהול יום שטח מתוכנן (מנהל תפעול ומעלה): כל מה שמתקנים בבעיה של יום — במקום אחד, בלי לעבור למסך הביצוע של העובד.
// העברת תאריך · ראש צוות · רחפן · שעת יציאה · הוספה/הסרה של אנשים · ביטול היום. כל שינוי = התראה לצוות (בצד השרת).
import { sb, isManager, sheet, icon, $, $$, esc, toast, confirmBox, dm, dayLabel, leadMark } from '../lib/core.js';
import { availability } from '../lib/avail.js';

export async function openDayAdmin(id, after) {
  if (!isManager()) return;
  const [{ data: w, error }, { data: people }, { data: drones }] = await Promise.all([
    sb.from('work_days').select('id,day,status,report_time,crew_lead_id,drone_id,project_id,projects(name),work_day_crew(user_id,role,cant_come_at,cant_come_reason)').eq('id', id).single(),
    sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true).in('role', ['crew', 'crew_lead', 'ops_manager', 'admin']).order('full_name'),
    sb.from('equipment').select('id,name,health').eq('kind', 'drone').order('name')]);
  if (error || !w) return toast('היום לא נמצא');
  if (w.status !== 'planned') { location.hash = '#/day/' + id; return; }   // יום שכבר התחיל — מסך הביצוע
  const av = await availability(w.day, w.day, { exceptDay: id, drones: drones || [] }).catch(() => ({ person: () => '', drone: id2 => (drones || []).find(d => d.id === id2)?.health === 'grounded' ? 'מקורקע' : '' }));
  const no = u => (w.work_day_crew || []).find(c => c.user_id === u && c.cant_come_at);
  const P = new Map((people || []).map(p => [p.id, p])), nm = u => (P.get(u)?.full_name || '').split(' ')[0];
  const crew = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
  const free = (people || []).filter(p => !crew.includes(p.id)).sort((a, b) => !!av.person(a.id) - !!av.person(b.id));
  // מחליף בלחיצה: מי שפנוי באותו יום (מטיסים קודם כשאין מטיס בצוות). השאר — ברשימה עם הסיבה
  const pilotIn = crew.some(u => !no(u) && P.get(u)?.is_pilot);
  const quick = free.filter(x => !av.person(x.id)).sort((a, b) => pilotIn ? 0 : (b.is_pilot === true) - (a.is_pilot === true)).slice(0, 8);
  const done = (msg, close) => { close(); toast(msg, 2200, 'success'); after?.(); };
  sheet(`<div class="stack tight"><h3 class="sh">${esc(w.projects?.name || '')}</h3><small class="muted">${dayLabel(w.day)}</small></div>
    <div class="list">
      ${crew.map(u => `<div class="lrow"><span class="avatar sm">${esc(nm(u).slice(0, 2))}</span><span class="grow"><b>${esc(P.get(u)?.full_name || '')}${u === w.crew_lead_id ? leadMark() : ''}</b>${no(u) ? `<small class="bad">לא יכול להגיע${no(u).cant_come_reason ? ' · ' + esc(no(u).cant_come_reason) : ''}</small>` : P.get(u)?.is_pilot ? '<small>מטיס</small>' : ''}</span>
        ${u !== w.crew_lead_id && !no(u) ? `<button class="chip" data-lead="${u}">ראש צוות</button>` : ''}<button class="chip" data-rm="${u}">הסרה</button></div>`).join('') || '<div class="empty-line">לא שובץ צוות</div>'}
      ${quick.length ? `<div class="lrow"><span class="mic">${icon('plus', 18)}</span><div class="chips grow">${quick.map(x => `<button type="button" class="chip" data-addu="${x.id}">${esc(nm(x.id) || x.full_name)}${x.is_pilot && !pilotIn ? ' · מטיס' : ''}</button>`).join('')}</div></div>` : ''}
      ${free.length > quick.length ? `<label class="lrow"><span class="mic">${icon('users', 18)}</span><select id="da-add" class="grow"><option value="">${quick.length ? 'עוד…' : 'הוספת אדם…'}</option>${free.map(p => { const why = av.person(p.id); return `<option value="${p.id}" ${why ? 'disabled' : ''}>${esc(p.full_name)}${p.is_pilot ? ' · מטיס' : ''}${why ? ' — ' + esc(why) : ''}</option>`; }).join('')}</select></label>` : ''}
    </div>
    <div class="row"><label class="field grow">תאריך<input type="date" id="da-day" value="${w.day}"></label><label class="field grow">יציאה<input type="time" id="da-time" value="${(w.report_time || '').slice(0, 5)}"></label></div>
    <label class="field">רחפן<select id="da-drone"><option value="">בלי רחפן</option>${(drones || []).map(d => { const why = av.drone(d.id); return `<option value="${d.id}" ${d.id === w.drone_id ? 'selected' : ''} ${why ? 'disabled' : ''}>${esc(d.name)}${why ? ' — ' + esc(why) : d.health === 'warning' ? ' — במעקב' : ''}</option>`; }).join('')}</select></label>
    <div class="row-btns"><button class="btn ghost" id="da-cancel">ביטול היום</button><button class="btn primary" id="da-save">שמירה</button></div>`, (s, close) => {
    const busy = b => { b.disabled = true; return () => { b.disabled = false; }; };
    $$('[data-rm]', s).forEach(b => b.onclick = async () => {
      if (!(await confirmBox(`להסיר את ${nm(b.dataset.rm)} מהיום?`, { ok: 'הסרה', danger: true }))) return;
      const un = busy(b); const { error: e } = await sb.rpc('unassign_day', { w: id, u: b.dataset.rm }); if (e) { un(); return toast(e.message); } done('הוסר · קיבל עדכון', close); });
    $$('[data-lead]', s).forEach(b => b.onclick = async () => { const un = busy(b);
      const { error: e } = await sb.from('work_days').update({ crew_lead_id: b.dataset.lead }).eq('id', id); if (e) { un(); return toast(e.message); } done(`${nm(b.dataset.lead)} ראש הצוות`, close); });
    $$('[data-addu]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
      const { error: e } = await sb.rpc('assign_day', { p: w.project_id, d: w.day, u: b.dataset.addu }); if (e) { b.disabled = false; return toast(e.message, 5000); } done(`${nm(b.dataset.addu)} שובץ · קיבל עדכון`, close); });
    const add = $('#da-add', s); if (add) add.onchange = async () => { if (!add.value) return; add.disabled = true;
      const { error: e } = await sb.rpc('assign_day', { p: w.project_id, d: w.day, u: add.value }); if (e) { add.disabled = false; add.value = ''; return toast(e.message, 5000); } done('שובץ · קיבל עדכון', close); };
    $('#da-save', s).onclick = async e => {
      const un = busy(e.target), d = $('#da-day', s).value, tm = $('#da-time', s).value || null, dr = $('#da-drone', s).value || null;
      if (tm !== ((w.report_time || '').slice(0, 5) || null) || dr !== (w.drone_id || null)) {
        const { error: e1 } = await sb.from('work_days').update({ report_time: tm, drone_id: dr }).eq('id', id); if (e1) { un(); return toast(e1.message); } }
      if (d && d !== w.day) { const { error: e2 } = await sb.rpc('move_day', { w: id, d }); if (e2) { un(); return toast(e2.message, 5000); } return done(`הועבר ל${dayLabel(d)} · הצוות קיבל עדכון`, close); }
      done('נשמר', close);
    };
    $('#da-cancel', s).onclick = async e => {
      if (!(await confirmBox(`לבטל את יום השטח ב-${dm(w.day)}?`, { ok: 'ביטול היום', danger: true }))) return;
      const un = busy(e.target);
      for (const u of crew) { const { error: e3 } = await sb.rpc('unassign_day', { w: id, u }); if (e3) { un(); return toast(e3.message); } }   // כל אחד מקבל עדכון; היום נמחק כשאין בו אף אחד
      if (!crew.length) await sb.from('work_days').delete().eq('id', id).eq('status', 'planned');
      done('היום בוטל · הצוות קיבל עדכון', close);
    };
  });
}
