// לוח שיבוץ שבועי (מנהלים): מי עובד איפה בכל יום. התנגשויות (שני פרויקטים באותו יום) והיעדרויות מסומנות. הקשה על תא ריק = שיבוץ.
import { sb, isManager, sheet, icon, $, $$, esc, toast, confirmBox, HE_D1, isoDay, dm, replaceHash, leadMark, isOpenProject } from '../lib/core.js';
import { errText } from '../lib/audit.js';
import { availability } from '../lib/avail.js';

const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const sunday = s => addDays(s, -new Date(s + 'T12:00:00').getDay());
const ABS = { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש', other: 'היעדרות' };
const noCome = (w, u) => (w.work_day_crew || []).find(c => c.user_id === u && c.cant_come_at);
const openAdmin = (id, after) => import('./dayadmin.js').then(m => m.openDayAdmin(id, after));

export async function renderDispatch(el, start, o = {}) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">למנהלים בלבד</div>'; return; }
  start = sunday(start || isoDay());
  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(start, i)), end = days.at(-1);
  el.innerHTML = `<header class="phead"><a class="back" href="#/schedule" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">${o.title || 'לוח שיבוץ'}</h1></header>
    <div class="monthbar"><button id="wp" aria-label="שבוע קודם">${icon('back', 18)}</button><b>${dm(start)} – ${dm(end)}</b><button id="wn" aria-label="שבוע הבא">${icon('chev', 18)}</button></div>
    <div id="db"><div class="skel tall"></div></div>`;
  $('#wp').onclick = () => replaceHash('#/dispatch/' + addDays(start, -7));
  $('#wn').onclick = () => replaceHash('#/dispatch/' + addDays(start, 7));
  const [{ data: people }, { data: wds }, { data: abs }, { data: projects }, { data: drones }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,is_pilot').eq('is_active', true).order('full_name'),
    sb.from('work_days').select('id,day,status,project_id,crew_lead_id,drone_id,report_time,gust_max,weather_alerted,projects(name,site_id),work_day_crew(user_id,confirmed_at,cant_come_at,cant_come_reason)').gte('day', start).lte('day', end).neq('status', 'cancelled'),
    sb.from('absences').select('user_id,kind,date_from,date_to,status').neq('status', 'rejected').lte('date_from', end).gte('date_to', start),
    sb.from('projects').select('id,name,status_label,monday_group,closed_summary,planned_from,planned_to,site_id').or('monday_group.is.null,monday_group.neq.group_mm5052gw').order('name').then(r => ({ ...r, data: (r.data || []).filter(isOpenProject) })),
    sb.from('equipment').select('id,name,health').eq('kind', 'drone'),
  ]);
  const onWeek = p => (wds || []).some(w => w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id));
  // מי שעובד השבוע — למעלה; אחריו מטיסים פנויים; אחריו השאר (לשיבוץ בלחיצה על תא ריק)
  const staff = (people || []).filter(p => ['crew', 'crew_lead', 'ops_manager'].includes(p.role) || onWeek(p))
    .sort((a, b) => (onWeek(b) - onWeek(a)) || ((b.is_pilot === true) - (a.is_pilot === true)));
  const cell = (p, d) => {
    const mine = (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id)));
    const a = (abs || []).find(x => x.user_id === p.id && x.date_from <= d && x.date_to >= d);
    const conflict = mine.length > 1 || (mine.length && a);
    return `<td class="${conflict ? 'conf' : ''} ${d === isoDay() ? 'today' : ''}" data-u="${p.id}" data-d="${d}">${a ? `<span class="dchip abs ${a.status === 'pending' ? 'pend' : ''}">${ABS[a.kind]}${a.status === 'pending' ? '?' : ''}</span>` : ''}
      ${mine.map(w => { const no = w.status === 'planned' && noCome(w, p.id);
        return `<span class="dchip ${w.status === 'done' ? 'done' : ''} ${w.weather_alerted ? 'wx' : ''} ${no ? 'no' : ''}" data-w="${w.id}" ${w.status === 'planned' ? `draggable="true" data-drag="${w.id}|${p.id}|${d}"` : ''} ${no ? 'data-da="1"' : ''} title="${esc(w.projects?.name || '')}${no ? ' · לא יכול להגיע' + (no.cant_come_reason ? ': ' + esc(no.cant_come_reason) : '') : ''}">${no ? 'לא יגיע · ' : ''}${esc((w.projects?.name || '').split(/[—–-]/)[0].trim().slice(0, 14))}${w.crew_lead_id === p.id ? leadMark() : ''}</span>`; }).join('')}</td>`;
  };
  // רענון אחרי שיבוץ: מריצים מחדש את המסך הנוכחי (לו״ז או לוח שיבוץ) — מוגדר לפני המסלול הצר, שגם הוא משתמש בו
  const reload = () => dispatchEvent(new HashChangeEvent('hashchange'));
  function dnd(sel, target, drop) {
    $$('[data-drag]', el).forEach(c => { c.ondragstart = e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', c.dataset.drag); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); };
      c.ondragend = () => { el.classList.remove('dragging'); $$('.dropok', el).forEach(x => x.classList.remove('dropok')); }; });
    $$(sel, el).forEach(td => { td.ondragover = e => { e.preventDefault(); td.classList.add('dropok'); }; td.ondragleave = () => td.classList.remove('dropok');
      td.ondrop = e => { e.preventDefault(); td.classList.remove('dropok'); const src = e.dataTransfer.getData('text/plain'); if (src) drop(src, target(td)); }; });
  }
  // קישור עמוק מהתראה (לא יוכל להגיע / תחזית): #/dispatch/<day>/<work_day> → ניהול היום נפתח ישר
  const [, , d0, wid] = location.hash.split('/');
  if (/^[0-9a-f-]{36}$/.test(wid || '')) { replaceHash('#/dispatch/' + (d0 || ''), false); setTimeout(() => openAdmin(wid, reload), 60); }
  if (innerWidth < 700) return dayList();
  // פרויקטים שמתוכננים במאנדי השבוע ואין להם יום שטח — לחיצה = גיליון השיבוץ של הפרויקט מהיום הראשון שחסר
  // מחשב: שתי תצוגות — לפי אנשים (מי איפה) או לפי פרויקטים (מה קורה בכל אתר). הבחירה נזכרת
  let view = 'people'; try { view = localStorage.getItem('dispatch:view') || 'people'; } catch { /* */ }
  const viewTabs = `<div class="tabs dview">${[['people', 'לפי אנשים'], ['proj', 'לפי פרויקטים']].map(([k, l]) => `<button type="button" data-view="${k}" aria-selected="${view === k}">${l}</button>`).join('')}</div>`;
  const bindView = () => $$('[data-view]', el).forEach(b => b.onclick = () => { try { localStorage.setItem('dispatch:view', b.dataset.view); } catch { /* */ } reload(); });
  if (view === 'proj') return projView();
  const needP = (projects || []).map(x => ({ x, d: days.find(d => new Date(d + 'T12:00').getDay() < 5 && d >= isoDay() && x.planned_from && x.planned_from <= d && (x.planned_to || x.planned_from) >= d && !(wds || []).some(w => w.project_id === x.id && w.day === d)) })).filter(n => n.d);
  const conflicts = staff.flatMap(p => days.filter(d => (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id))).length > 1).map(d => `${p.full_name.split(' ')[0]} ב-${dm(d)}`));
  $('#db').innerHTML = `${viewTabs}${needP.length ? `<div class="dneed">${needP.map(n => `<button type="button" class="dline need" data-sch="${n.x.id}" data-d="${n.d}"><span class="grow"><b>${esc(n.x.name)}</b><small>מתוכנן במאנדי מ-${dm(n.d)}</small></span><span class="pill warn">לשבץ</span></button>`).join('')}</div>` : ''}${conflicts.length ? `<button class="arow bad card-like" type="button" id="dconf"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>התנגשות שיבוץ</b><small>${esc(conflicts.join(' · '))}</small></span><span class="chev">${icon('chev', 18)}</span></button>` : ''}
    <div class="dwrap"><table class="dgrid"><thead><tr><th></th>${days.map(d => `<th class="${d === isoDay() ? 'today' : ''}">${HE_D1[new Date(d + 'T12:00').getDay()]}<small>${dm(d)}</small></th>`).join('')}</tr></thead>
      <tbody>${staff.map(p => `<tr><th class="who">${esc(p.full_name.split(' ')[0])}${p.is_pilot ? ' <small>מטיס</small>' : ''}</th>${days.map(d => cell(p, d)).join('')}</tr>`).join('')}</tbody></table></div>`;
  bindView();
  { const c = $('td.conf', el), wr = $('.dwrap', el); if (c && wr) wr.scrollLeft += c.getBoundingClientRect().left - wr.getBoundingClientRect().left - wr.clientWidth / 2 + c.clientWidth / 2; }   // התנגשות: רק גלילה אופקית בתוך הלוח, בלי לקפוץ בדף
  const dc = $('#dconf', el); if (dc) dc.onclick = () => $('td.conf', el)?.scrollIntoView({ inline: 'center', block: 'center', behavior: 'smooth' });
  $$('[data-sch]', el).forEach(b => b.onclick = () => { location.hash = `#/p/${b.dataset.sch}/sch/${b.dataset.d}`; });
  $$('.dchip[data-w]', el).forEach(c => c.onclick = e => { e.stopPropagation(); if (c.dataset.da) openAdmin(c.dataset.w, reload); else location.hash = '#/day/' + c.dataset.w; });
  // גרירה (מחשב): שבב ליום אחר באותה שורה = הזזת יום השטח · לאדם אחר באותו יום = החלפה (מי שנגרר עליו נכנס במקומו)
  dnd('td[data-u]', td => ({ u: td.dataset.u, d: td.dataset.d }), async (src, t) => {
    const [w, u, d] = src.split('|'), NM = x => (people || []).find(p => p.id === x)?.full_name.split(' ')[0] || '';
    if (t.d === d && t.u === u) return;
    if (t.d !== d && t.u !== u) return toast('גוררים ליום אחר באותה שורה, או לאדם אחר באותו יום');
    if (t.d === d) { const { error } = await sb.rpc('swap_crew', { w, out_u: u, in_u: t.u }); if (error) return toast(errText(error, 'ההחלפה לא נשמרה'), 5000); toast(`${NM(t.u)} במקום ${NM(u)} · שניהם קיבלו עדכון`, 2200, 'success'); return reload(); }
    if (new Date(t.d + 'T12:00').getDay() === 6) return toast('לא עובדים בשבת');
    const { error } = await sb.rpc('move_day', { w, d: t.d }); if (error) return toast(errText(error, 'היום לא הועבר'), 5000); toast(`הועבר ל-${HE_D1[new Date(t.d + 'T12:00').getDay()]} ${dm(t.d)} · הצוות קיבל עדכון`, 2200, 'success'); reload();
  });
  $$('td[data-u]', el).forEach(td => td.onclick = () => {
    const p = staff.find(x => x.id === td.dataset.u), d = td.dataset.d, mine = (wds || []).filter(w => w.day === d && (w.crew_lead_id === p.id || (w.work_day_crew || []).some(c => c.user_id === p.id)));
    sheet(`<h3>${esc(p.full_name)} · ${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}</h3>
      ${mine.length ? `<div class="list">${mine.map(w => `<div class="lrow"><span class="grow"><b>${esc(w.projects?.name || '')}</b></span><button class="chip" data-rm="${w.id}">הסרה מהיום</button></div>`).join('')}</div>` : ''}
      <label class="field">שיבוץ לפרויקט<select id="ap"><option value="">בחירת פרויקט…</option>${(projects || []).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="ago">שיבוץ</button></div>`, (s, close) => {
      const go = $('#ago', s);
      go.onclick = async () => { const pid = $('#ap', s).value; if (!pid) return toast('בחרו פרויקט'); if (go.disabled) return; go.disabled = true;
        const { error } = await sb.rpc('assign_day', { p: pid, d, u: p.id }); if (error) { go.disabled = false; return toast(errText(error, 'השיבוץ לא נשמר — נסו שוב'), 5000); } close(); toast('שובץ — העובד קיבל הודעה'); reload(); };
      $$('[data-rm]', s).forEach(b => b.onclick = async () => { if (!(await confirmBox(`להסיר את ${p.full_name.split(' ')[0]} מהיום?`, { ok: 'הסרה', danger: true }))) return;
        const { error } = await sb.rpc('unassign_day', { w: b.dataset.rm, u: p.id }); if (error) return toast(errText(error, 'ההסרה לא נשמרה — נסו שוב')); toast('הוסר מהיום'); reload(); });
    });
  });

  // לפי פרויקטים: שורה לכל פרויקט שעובד או מתוכנן במאנדי השבוע. תא = יום השטח (שעה, צוות, רחפן, תחזית, מי לא יגיע); טווח מאנדי בלי יום = "לשבץ"
  function projView() {
    const NM = new Map((people || []).map(p => [p.id, p.full_name.split(' ')[0]])), DR = new Map((drones || []).map(x => [x.id, x]));
    const inRange = (x, d) => x.planned_from && x.planned_from <= d && (x.planned_to || x.planned_from) >= d;
    const P = new Map((projects || []).map(x => [x.id, x]));
    const ids = [...new Set([...(wds || []).map(w => w.project_id), ...(projects || []).filter(x => days.some(d => inRange(x, d))).map(x => x.id)])];
    const first = pid => (wds || []).filter(w => w.project_id === pid).map(w => w.day).sort()[0] || P.get(pid)?.planned_from || '9';
    const rows = ids.map(pid => ({ pid, x: P.get(pid) || { id: pid, name: (wds || []).find(w => w.project_id === pid)?.projects?.name || '' }, site: P.get(pid)?.site_id || (wds || []).find(w => w.project_id === pid)?.projects?.site_id })).sort((a, b) => first(a.pid) < first(b.pid) ? -1 : 1);
    const cellP = (r, d) => {
      const ws = (wds || []).filter(w => w.project_id === r.pid && w.day === d), dow = new Date(d + 'T12:00').getDay();
      if (!ws.length) return inRange(r.x, d) && dow < 5 && d >= isoDay() ? `<td class="dpneed ${d === isoDay() ? 'today' : ''}" data-pd="${r.pid}|${d}"><button type="button" class="dline need" data-sch="${r.pid}" data-d="${d}"><span class="pill warn">לשבץ</span></button></td>` : `<td class="dpempty ${d === isoDay() ? 'today' : ''}" data-pd="${r.pid}|${d}"></td>`;
      return `<td class="${d === isoDay() ? 'today' : ''}" data-pd="${r.pid}|${d}">${ws.map(w => { const crew = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
        const nc = w.status === 'planned' ? crew.filter(u => noCome(w, u)) : [], un = w.status === 'planned' ? (w.work_day_crew || []).filter(c => c.user_id !== w.crew_lead_id && !c.confirmed_at && !c.cant_come_at).length : 0, dr = DR.get(w.drone_id);
        return `<button type="button" class="dpday ${w.status === 'done' ? 'done' : w.status !== 'planned' ? 'live' : ''} ${nc.length ? 'no' : ''}" data-pw="${w.id}" data-st="${w.status}" ${w.status === 'planned' ? `draggable="true" data-drag="${w.id}|${r.pid}|${d}"` : ''}>
          <span class="row tight"><b class="grow">${w.report_time ? w.report_time.slice(0, 5) : w.status === 'done' ? 'בוצע' : '—'}</b>${r.site && w.status === 'planned' ? `<span data-wx="${r.site}|${d}"></span>` : ''}</span>
          <small>${crew.map(u => (noCome(w, u) ? `<s>${esc(NM.get(u) || '')}</s>` : esc(NM.get(u) || '')) + (u === w.crew_lead_id ? leadMark() : '')).join(' · ') || 'בלי צוות'}</small>
          ${dr ? `<small class="${dr.health === 'grounded' ? 'bad' : ''}">${esc(dr.name)}${dr.health === 'grounded' ? ' · מקורקע' : ''}</small>` : w.status === 'planned' ? '<small class="bad">בלי רחפן</small>' : ''}
          ${nc.length ? `<span class="pill bad">${nc.length > 1 ? nc.length + ' לא יגיעו' : 'לא יגיע'}</span>` : un ? `<span class="pill warn">${un} לא אישרו</span>` : ''}</button>`; }).join('')}</td>`;
    };
    $('#db').innerHTML = `${viewTabs}${rows.length ? `<div class="dwrap"><table class="dgrid dpgrid"><thead><tr><th></th>${days.map(d => `<th class="${d === isoDay() ? 'today' : ''}">${HE_D1[new Date(d + 'T12:00').getDay()]}<small>${dm(d)}</small></th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><th class="who"><a href="#/p/${r.pid}">${esc(r.x.name)}</a></th>${days.map(d => cellP(r, d)).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty-line">אין עבודות השבוע</div>'}`;
    bindView();
    $$('[data-sch]', el).forEach(b => b.onclick = () => { location.hash = `#/p/${b.dataset.sch}/sch/${b.dataset.d}`; });
    // גרירה ליום אחר באותה שורה (אותו פרויקט) = הזזת יום השטח
    dnd('td[data-pd]', td => { const [pid, d] = td.dataset.pd.split('|'); return { pid, d }; }, async (src, t) => {
      const [w, pid, d] = src.split('|'); if (t.d === d) return; if (t.pid !== pid) return toast('גוררים ליום אחר באותה שורה');
      if (new Date(t.d + 'T12:00').getDay() === 6) return toast('לא עובדים בשבת');
      const { error } = await sb.rpc('move_day', { w, d: t.d }); if (error) return toast(errText(error, 'היום לא הועבר'), 5000); toast(`הועבר ל-${HE_D1[new Date(t.d + 'T12:00').getDay()]} ${dm(t.d)} · הצוות קיבל עדכון`, 2200, 'success'); reload();
    });
    $$('[data-pw]', el).forEach(b => b.onclick = () => b.dataset.st === 'planned' ? openAdmin(b.dataset.pw, reload) : (location.hash = '#/day/' + b.dataset.pw));
    import('../lib/wx.js').then(m => m.fillWx($('#db'))).catch(() => {});
  }

  function dayList() {
    const NM = new Map((people || []).map(p => [p.id, p.full_name.split(' ')[0]]));
    const box = $('#db');
    box.innerHTML = days.map(d => {
      const dow = new Date(d + 'T12:00').getDay(), wd = (wds || []).filter(w => w.day === d);
      const need = dow < 5 ? (projects || []).filter(x => x.planned_from && x.planned_from <= d && (x.planned_to || x.planned_from) >= d && !wd.some(w => w.project_id === x.id)) : [];
      const ab = (abs || []).filter(a => a.date_from <= d && a.date_to >= d);
      const busy = new Map(); wd.forEach(w => new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean)).forEach(u => busy.set(u, (busy.get(u) || 0) + 1)));   // ראש צוות שגם בצוות = פעם אחת
      const free = !need.length && !wd.length && !ab.length;
      return `<section class="dday ${d === isoDay() ? 'today' : ''} ${free ? 'free' : ''}"><div class="ddh"><b>${HE_D1[dow]} ${dm(d)}</b>${d === isoDay() ? '<span class="pill lime">היום</span>' : ''}${free ? '<span class="muted">פנוי</span>' : ''}<span class="grow"></span>${dow < 6 ? `<button class="hbtn" type="button" data-add="${d}" aria-label="שיבוץ">${icon('plus', 18)}</button>` : ''}</div>
        ${need.map(x => `<button type="button" class="dline need" data-need="${x.id}" data-d="${d}"><span class="grow"><b>${esc(x.name)}</b><small>מתוכנן במאנדי</small></span>${x.site_id ? `<span data-wx="${x.site_id}|${d}"></span>` : ''}<span class="pill warn">לשבץ</span></button>`).join('')}
        ${wd.map(w => { const crew = [...new Set([w.crew_lead_id, ...(w.work_day_crew || []).map(c => c.user_id)].filter(Boolean))];
          const nc = w.status === 'planned' ? crew.filter(u => noCome(w, u)) : [], tag = nc.length ? 'button' : 'a';
          return `<${tag} class="dline ${w.status === 'done' ? 'done' : ''}" ${nc.length ? `type="button" data-da="${w.id}"` : `href="#/day/${w.id}"`}><span class="grow"><b>${esc(w.projects?.name || '')}</b><small>${crew.map(u => (noCome(w, u) ? `<s>${esc(NM.get(u) || '')}</s>` : esc(NM.get(u) || '')) + (u === w.crew_lead_id ? leadMark() : '') + ((busy.get(u) || 0) > 1 ? `<span class="dwarn" title="משובץ פעמיים" aria-label="משובץ פעמיים">${icon('alert', 14)}</span>` : '')).join(' · ') || 'בלי צוות'}${w.weather_alerted ? ' · רוח חריגה' : ''}</small></span>${nc.length ? `<span class="pill bad">${nc.length > 1 ? nc.length + ' לא יגיעו' : 'לא יגיע'}</span>` : w.status === 'done' ? '<span class="pill ok">בוצע</span>' : w.projects?.site_id ? `<span data-wx="${w.projects.site_id}|${d}"></span>` : ''}</${tag}>`; }).join('')}
        ${ab.map(a => `<div class="dline abs"><span class="grow"><small>${esc(NM.get(a.user_id) || '')}: ${ABS[a.kind]}${a.status === 'pending' ? ' (ממתין לאישור)' : ''}</small></span></div>`).join('')}
</section>`;
    }).join('');
    import('../lib/wx.js').then(m => m.fillWx(box)).catch(() => {});
    $$('.ddh', box).forEach(h => { const b = $('[data-add]', h); if (b) h.onclick = e => { if (!e.target.closest('[data-add]')) b.click(); }; });
    $$('[data-add]', box).forEach(b => b.onclick = () => assign(b.dataset.add));
    $$('[data-need]', box).forEach(b => b.onclick = () => { location.hash = `#/p/${b.dataset.need}/sch/${b.dataset.d}`; });   // כל הטווח בגיליון אחד (ראש צוות, רחפן, תחזית) — לא יום-יום
    $$('[data-da]', box).forEach(b => b.onclick = () => openAdmin(b.dataset.da, reload));
    function assign(d, pre = '') {
      sheet(`<h3>שיבוץ · ${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}</h3>
        <label class="field">פרויקט<select id="ap"><option value="">בחירת פרויקט…</option>${(projects || []).map(x => `<option value="${x.id}" ${x.id === pre ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="field">מי<div class="chips">${staff.map(p => `<button type="button" class="chip" data-p="${p.id}" aria-pressed="false"><span>${esc(p.full_name.split(' ')[0])}</span><small class="why"></small></button>`).join('')}</div></div>
        <div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="ago">שיבוץ</button></div>`, (s2, close) => {
        $$('[data-p]', s2).forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
        availability(d, d).then(av => $$('[data-p]', s2).forEach(c => { const why = av.person(c.dataset.p); if (why) { c.disabled = true; c.setAttribute('aria-pressed', 'false'); $('.why', c).textContent = why; } })).catch(() => {});
        const go = $('#ago', s2);
        go.onclick = async () => {
          const pid = $('#ap', s2).value, us = $$('[data-p][aria-pressed="true"]', s2).map(c => c.dataset.p);
          if (!pid || !us.length) return toast('בחרו פרויקט ואנשים');
          if (go.disabled) return; go.disabled = true; let n = 0;
          for (const u of us) { const { error } = await sb.rpc('assign_day', { p: pid, d, u }); if (error) { toast(errText(error, 'השיבוץ לא נשמר — נסו שוב'), 5000); if (n) { close(); reload(); } else go.disabled = false; return; } n++; }
          close(); toast(n > 1 ? `שובצו ${n} — קיבלו הודעה` : 'שובץ — העובד קיבל הודעה'); reload();
        };
      });
    }
  }
}
