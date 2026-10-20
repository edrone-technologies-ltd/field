// דוח ראשי לפרויקט (פנימי, מנהלים בלבד): הכל נאסף לבד — ימי שטח (סיכום היום, צוות, שעות), משימות, תקלות (פתוחות וסגורות),
// חוסרים, ביקורים (ממצאים, תמונות, סטטוס תיקונים), החתמות, איכות ונוכחות. ההקלדה היחידה: "לקחים ומסקנות" (טיוטה scope='internal').
// "הפקה": תבנית "לקוח" = הדוח ללקוח הקיים, בלי שינוי. כסף — רק role === 'admin' (לא מודול finance), ובשום תבנית ללקוח
import { sb, state, isManager, signedUrls, icon, $, esc, dm, sheet, stLabel } from '../lib/core.js';
import { sharePrint, shareIcon } from '../lib/share.js';
import { loadDraft, draftSaver, bindEdits, saveReport, bdi, pp, fmt } from './clientreport.js';
import { visitPhotos } from './visits.js';

const ADMIN = () => state.profile?.role === 'admin';
const ST = { planned: 'מתוכנן', en_route: 'בדרך', on_site: 'באתר', working: 'בעבודה', issue: 'תקלה', done: 'בוצע', cancelled: 'בוטל' };
const TS = { todo: 'לביצוע', in_progress: 'בעבודה', done: 'בוצע', blocked: 'נתקע', dropped: 'בוטל' };
const IK = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'אחר' };
const VK = { crew_check: 'ביקורת צוות', client_tour: 'סיור עם לקוח', quality: 'בקרת איכות', other: 'ביקור' };
const SEV = { ok: 'תקין', note: 'הערה', fix: 'לתיקון' };
const hm = iso => iso ? new Date(iso).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
const H = x => { const m = Math.round(Number(x || 0) * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const ils = n => n == null ? '—' : '₪' + Math.round(Number(n)).toLocaleString('he-IL');
const num = s => `<bdi dir="ltr">${esc(String(s))}</bdi>`;

export async function renderMaster(el, pid) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">הדוח הראשי — למנהלים</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const q = x => x.then(r => r.data || [], () => []);
  const [{ data: p }, days, tasks, issues, miss, photos, visits, sos, labor, fin] = await Promise.all([
    sb.from('projects').select('id,name,client_name,service,status_label,planned_from,planned_to,closed_summary,sites(name,address)').eq('id', pid).single(),
    q(sb.from('work_days').select('id,day,status,kind,day_type,report_time,site_arrival,site_end,arrived_at,finished_at,gallons,flights,air_minutes,quality,material_used,report_text,crew_lead_id,work_day_crew(user_id,hours,profiles(full_name))').eq('project_id', pid).neq('status', 'cancelled').order('day')),
    q(sb.from('tasks').select('id,title,status,phase,done_by,done_at,done_note,visit_id,is_extra').eq('project_id', pid).order('day_no', { nullsFirst: false }).order('seq')),
    q(sb.from('issues').select('id,body,kind,severity,status,decision,resolution,opened_by,created_at,closed_at,work_day_id').eq('project_id', pid).order('created_at')),
    q(sb.from('missing_items').select('id,item,qty,status,created_at,work_day_id,work_days!inner(project_id,day)').eq('work_days.project_id', pid).order('created_at')),
    q(sb.from('photos').select('storage_path,kind,work_day_id').eq('project_id', pid).in('kind', ['before', 'after']).order('created_at')),
    q(sb.from('project_visits').select('*').eq('project_id', pid).order('visit_date')),
    q(sb.from('project_signoffs').select('signer_name,signer_role,full_ok,rating,notes,created_at').eq('project_id', pid).order('created_at')),
    q(sb.from('project_labor_days').select('user_id,day,work_h,travel_h,ot_h,profiles(full_name)').eq('project_id', pid).order('day')),
    ADMIN() ? q(sb.from('project_finance').select('*').eq('project_id', pid)) : Promise.resolve([]),   // כסף — הנהלה בלבד
  ]);
  if (!p) { el.innerHTML = '<div class="empty-line">הפרויקט לא נמצא</div>'; return; }
  const ids = [...new Set([...issues.map(i => i.opened_by), ...tasks.map(t => t.done_by)].filter(Boolean))];
  const { data: ppl } = ids.length ? await sb.from('profiles').select('id,full_name').in('id', ids) : { data: [] };
  const NM = id => ((ppl || []).find(x => x.id === id)?.full_name || '').split(' ')[0];
  const vPaths = visits.flatMap(v => [...(v.findings || []).flatMap(f => visitPhotos(f)), ...(v.todo || []).flatMap(f => visitPhotos(f))]);
  const U = await signedUrls('field', [...photos.map(x => x.storage_path), ...vPaths]).catch(() => ({}));
  const DR = await loadDraft(pid, 'internal'), save = draftSaver(pid, 'internal', DR);
  const done = days.filter(d => d.status === 'done' || d.kind === 'report');
  const crewH = done.reduce((s, d) => s + (d.work_day_crew || []).reduce((a, c) => a + Number(c.hours || 0), 0), 0);
  const gal = done.reduce((s, d) => s + Number(d.gallons || 0), 0);
  const issOpen = issues.filter(i => i.status !== 'closed'), missOpen = miss.filter(m => m.status !== 'handled');
  const place = p.sites?.name || p.name, F = fin[0];
  const foot = (n => () => `<div class="cr-pf"><span><bdi dir="ltr"><b>E-Drone</b> Technologies</bdi> · דוח ראשי · פנימי</span><span>${++n}</span></div>`)(0);
  const sec = (rsec, h, body) => body ? `<div class="pg flow"><div class="pad"><div class="rsec">${rsec}</div><h2>${h}</h2><div class="rule"></div>${body}</div>${foot()}</div>` : '';
  const shot = path => U[path] ? `<div class="shot"><img src="${esc(U[path])}" alt=""></div>` : '';
  const kv = (k, v) => v || v === 0 ? `<div><div class="k">${k}</div><div class="v">${v}</div></div>` : '';

  const cover = `<div class="pg flow"><div class="pad"><div class="rsec">INTERNAL · פנימי</div><h1 class="mr-h1">${bdi(place)}</h1>
      <div class="mr-sub">דוח ראשי · ${esc(p.client_name || '')}${days.length ? ` · ${esc(fmt(days[0].day))} – ${esc(fmt(days.at(-1).day))}` : ''}</div>
      <div class="stats mr-stats">${[[done.length, 'ימי שטח'], [H(crewH), 'שעות צוות'], [gal ? num(gal) : '—', 'גלונים'], [`${num(issues.length)}<em> · ${issOpen.length} פתוחות</em>`, 'תקלות'], [`${num(miss.length)}<em> · ${missOpen.length} פתוחים</em>`, 'חוסרים'], [visits.length, 'ביקורים']].map(([n, c]) => `<div class="stat"><div class="n">${n}</div><div class="c">${c}</div></div>`).join('')}</div>
      <div class="meta">${kv('סטטוס', esc(stLabel(p.status_label)))}${kv('שירות', esc(p.service || ''))}${kv('כתובת', bdi(p.sites?.address || ''))}${kv('החתמה', sos.length ? esc(sos.at(-1).signer_name || '') : 'אין')}</div>
      <div class="rsec" style="margin-top:9mm">LESSONS</div><h2 class="cr-h3">לקחים ומסקנות</h2>
      <div class="cr-tx mr-lessons" data-ek="lessons">${DR.txt.lessons ? pp(DR.txt.lessons) : '<p class="mr-ph">מה למדנו, מה לעשות אחרת בפעם הבאה</p>'}</div></div>${foot()}</div>`;

  const dayBlocks = done.map(d => { const crew = (d.work_day_crew || []), ph = photos.filter(x => x.work_day_id === d.id).slice(0, 6);
    return `<div class="ba"><div class="band"><span class="t">${esc(fmt(d.day))}</span><span class="d">${esc([d.kind === 'report' ? 'סיכום ידני' : '', d.day_type && d.day_type !== 'work' ? d.day_type : ''].filter(Boolean).join(' · '))}</span><span class="ln"></span></div>
      <div class="mr-kv">${[d.report_time && `יציאה ${num(d.report_time.slice(0, 5))}`, d.arrived_at && `באתר ${num(hm(d.arrived_at))}${d.finished_at ? '–' + num(hm(d.finished_at)) : ''}`, d.gallons != null && `${num(d.gallons)} גלונים`, d.flights != null && `${num(d.flights)} טיסות`, d.material_used && esc(d.material_used), d.quality && `איכות ${'★'.repeat(d.quality)}`].filter(Boolean).join(' · ')}</div>
      ${crew.length ? `<div class="mr-kv">צוות: ${crew.map(c => `${esc((c.profiles?.full_name || '').split(' ')[0])}${c.user_id === d.crew_lead_id ? ' (ראש צוות)' : ''}${c.hours != null ? ' ' + num(c.hours) : ''}`).join(' · ')}</div>` : ''}
      ${d.report_text ? `<div class="cr-tx mr-rep">${pp(d.report_text)}</div>` : ''}
      ${ph.length ? `<div class="row3">${ph.map(x => shot(x.storage_path)).join('')}</div>` : ''}</div>`; }).join('');

  const table = (head, rows) => rows.length ? `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const tasksT = table(['משימה', 'סטטוס', 'ביצע'], tasks.map(t => [bdi(t.title), esc(TS[t.status] || t.status), esc([NM(t.done_by), t.done_at ? dm(t.done_at.slice(0, 10)) : ''].filter(Boolean).join(' · '))]));
  const issT = table(['תקלה', 'סוג', 'מצב', 'טיפול'], issues.map(i => [`${bdi(i.body || '')}<small class="mr-s">${esc([NM(i.opened_by), dm(i.created_at.slice(0, 10))].filter(Boolean).join(' · '))}</small>`, esc(IK[i.kind] || ''), i.status === 'closed' ? 'נסגרה' : `<b class="mr-bad">פתוחה</b>`, bdi(i.resolution || (i.decision === 'cleared' ? 'כשיר לעבוד' : i.decision === 'grounded' ? 'השבתה' : '') || '')]));
  const missT = table(['חוסר', 'יום', 'מצב'], miss.map(m => [`${bdi(m.item)}${m.qty > 1 ? ' ×' + num(m.qty) : ''}`, num(dm(m.work_days?.day || '')), m.status === 'handled' ? 'טופל' : '<b class="mr-bad">פתוח</b>']));
  const visT = visits.map(v => { const fx = tasks.filter(t => t.visit_id === v.id);
    return `<div class="ba"><div class="band"><span class="t">${esc(fmt(v.visit_date))}</span><span class="d">${esc(VK[v.kind] || 'ביקור')}${v.rating ? ' · דירוג ' + num(v.rating) : ''}</span><span class="ln"></span></div>
      ${(v.findings || []).map(f => `<div class="cr-vf"><div class="mr-kv"><b>${esc(SEV[f.sev] || '')}</b>${f.task_id ? ` · תיקון: ${esc(TS[tasks.find(t => t.id === f.task_id)?.status] || 'נשלח')}` : ''}</div><div class="cr-tx">${pp(f.text || '')}</div>${visitPhotos(f).length ? `<div class="row3">${visitPhotos(f).map(shot).join('')}</div>` : ''}</div>`).join('')}
      ${(v.todo || []).length ? `<div class="mr-kv">לביצוע: ${(v.todo || []).map(x => bdi(x.text || x)).join(' · ')}</div>` : ''}
      ${v.summary ? `<div class="cr-tx"><p><b>סיכום:</b> ${bdi(v.summary)}</p></div>` : ''}${v.client_feedback ? `<div class="cr-tx"><p><b>משוב הלקוח:</b> ${bdi(v.client_feedback)}</p></div>` : ''}
      ${fx.length ? `<div class="mr-kv">תיקונים: ${fx.map(t => `${bdi(t.title)} — ${esc(TS[t.status] || '')}`).join(' · ')}</div>` : ''}</div>`; }).join('');
  const soT = table(['חותם', 'תאריך', 'אישור', 'הערות'], sos.map(s => [bdi([s.signer_name, s.signer_role].filter(Boolean).join(' · ')), num(dm(s.created_at.slice(0, 10))), s.full_ok === false ? 'עם הערות' : 'בוצע במלואו' + (s.rating ? ' · ' + num(s.rating + '/5') : ''), bdi(s.notes || '')]));
  const by = {}; labor.forEach(r => { const k = r.profiles?.full_name || ''; (by[k] ||= { w: 0, t: 0, o: 0, d: new Set() }); by[k].w += +r.work_h; by[k].t += +r.travel_h; by[k].o += +r.ot_h; by[k].d.add(r.day); });
  const labT = table(['עובד', 'ימים', 'באתר', 'נסיעה', 'נוספות'], Object.entries(by).map(([n, v]) => [esc(n), num(v.d.size), num(H(v.w)), num(H(v.t)), num(H(v.o))]));
  const money = ADMIN() && F ? `<div class="meta mr-money">${kv('מחיר (נטו)', num(ils(F.price_net)))}${kv('עלות מתוכננת', num(ils(F.est_cost)))}${kv('שכר בפועל', num(ils(F.labor_cost_actual)))}${kv('הוצאות שטח', num(ils(F.expenses_actual)))}${kv('רווח גולמי', num(ils(F.gross_profit)) + (F.gross_pct != null ? ` (${num(F.gross_pct + '%')})` : ''))}</div>` : '';

  const html = `<div class="creport mreport">${cover}${sec('FIELD DAYS', 'ימי שטח', dayBlocks)}${sec('TASKS', 'משימות', tasksT)}${sec('ISSUES', 'תקלות — פתוחות וסגורות', issT)}${sec('MISSING', 'חוסרים', missT)}${sec('VISITS', 'ביקורים', visT)}${sec('SIGN-OFF', 'החתמות לקוח', soT)}${sec('ATTENDANCE', 'שעות ונוכחות', labT)}${money ? sec('FINANCE', 'כספים · הנהלה בלבד', money) : ''}</div>`;
  const name = `דוח ראשי · פנימי · ${place}`;
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/p/${pid}" data-up="1" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ראשי <span class="pill">פנימי</span></b>
      <button class="btn ghost sm" id="mrmake">${icon('report', 16)}<span class="rt-l"> הפקה</span></button>
      <button class="btn ghost sm" id="mrsave" aria-label="שמירה לתיק הפרויקט">${icon('folder', 16)}<span class="rt-l"> לתיק</span></button>
      <button class="btn primary sm" id="mrpdf">${shareIcon(16)} PDF</button></div><div id="cr">${html}</div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  const cr = $('#cr', el);
  bindEdits(cr, DR, save);
  const les = $('[data-ek="lessons"]', cr); les.addEventListener('focus', () => { if (!DR.txt.lessons) les.innerHTML = ''; }, { once: true });
  $('#mrpdf', el).onclick = e => sharePrint(e.currentTarget, cr, name, name);
  $('#mrsave', el).onclick = e => saveReport(e.currentTarget, pid, name, name);
  // הפקה: תבנית "לקוח" = הדוח ללקוח הקיים (בחירה ותיקון ניסוח). בלי כסף בשום תבנית
  $('#mrmake', el).onclick = () => sheet(`<h3>הפקה מהדוח הראשי</h3><div class="list">
      <a class="lrow" href="#/client-report/${pid}" data-close><span class="mic">${icon('send', 19)}</span><span class="grow"><b>לקוח</b><small>הדוח ללקוח — בוחרים מה נכנס ומתקנים ניסוח</small></span><span class="chev">${icon('chev', 16)}</span></a></div>`);
}
