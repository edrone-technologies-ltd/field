// נוכחות: כניסה/יציאה בלחיצה (מיקום רק ברגע ההחתמה), השעות שלי, ונוכחות צוות למנהלים (תיקון עם יומן, אישור ונעילה, ייצוא לחשבת השכר).
import { sb, state, isManager, cache, enqueue, sheet, uid, icon, $, $$, esc, toast, confirmBox, ask, HE_DOW, HE_D1, dm } from '../lib/core.js';
import { computeMonth, inShabbat, CATS, hhmm, ymd, DEFAULTS } from '../lib/labor.js';

let SETTINGS = null;
async function settings() {
  if (SETTINGS) return SETTINGS;
  try { const { data } = await sb.from('app_settings').select('value').eq('key', 'attendance').maybeSingle(); SETTINGS = { ...DEFAULTS, ...(data?.value || {}) }; await cache.set('att-settings', SETTINGS); }
  catch { SETTINGS = (await cache.get('att-settings')) || DEFAULTS; }
  return SETTINGS;
}
const monthStart = m => m + '-01';
const nextMonth = m => { const [y, mm] = m.split('-').map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; };
const prevMonth = m => { const [y, mm] = m.split('-').map(Number); return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; };
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const monthName = m => `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const tm = iso => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '—';

// ---------- מיקום פעם אחת (בלי מעקב). אם אין — מחתימים בלי ומסמנים ----------
function locateOnce() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4, acc: Math.round(p.coords.accuracy) }),
      () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

// ---------- משמרת פתוחה שלי (מהשרת, ובלי קליטה מהטלפון) ----------
export async function myOpenShift() {
  // פעולות שעוד בתור (בלי קליטה / באמצע שליחה) גוברות על מה שבשרת
  const { outbox } = await import('../lib/store.js');
  const q = (await outbox.all()).filter(x => x.table === 'shifts');
  const pendingIn = q.filter(x => x.kind === 'insert').map(x => x.row).pop();
  const closed = new Set(q.filter(x => x.kind === 'update' && x.patch?.status === 'closed').map(x => x.rowId));
  let s = null;
  try {
    const { data } = await sb.from('shifts').select('*').eq('user_id', state.user.id).eq('status', 'open').order('start_at', { ascending: false }).limit(1);
    s = data?.[0] || null;
  } catch { s = await cache.get('open-shift'); }
  if (pendingIn && !closed.has(pendingIn.id)) s = pendingIn;
  if (s && closed.has(s.id)) s = null;
  await cache.set('open-shift', s); return s;
}
async function consent() {
  if (state.profile.attendance_consent_at) return true;
  return new Promise(res => sheet(`<h3>רישום שעות ומיקום</h3>
    <div class="small" style="line-height:1.6">
      <p>החוק מחייב רישום של שעות העבודה בפועל. העבודה שלנו באתרים בכל הארץ, ולכן האפליקציה רושמת את המיקום <b>רק ברגע שאתה לוחץ כניסה או יציאה</b>, כדי לאמת שההחתמה נעשתה באתר.</p>
      <p><b>אין מעקב רציף</b>, ואין איסוף מיקום מחוץ לשעות העבודה, בערב, בלינה או בסוף השבוע.</p>
      <p>את המיקום רואים רק המנהלים. לחשבת השכר עובר סיכום שעות בלי מיקום. המיקום נמחק אחרי 90 יום. שעות העבודה נשמרות 7 שנים כנדרש בחוק.</p>
      <p>אין קליטה או GPS? אפשר להחתים בלי מיקום. אפשר לעיין ברישום ולבקש תיקון בכל זמן.</p></div>
    <div class="row-btns"><button class="btn ghost" id="cn">לא עכשיו</button><button class="btn primary" id="cy">קראתי ומסכים</button></div>`, (s, close) => {
    $('#cn', s).onclick = () => { close(); res(false); };
    $('#cy', s).onclick = async () => { const t = new Date().toISOString(); state.profile.attendance_consent_at = t; await enqueue({ kind: 'update', table: 'profiles', rowId: state.user.id, patch: { attendance_consent_at: t } }); close(); res(true); };
  }));
}
export async function clockIn(after) {
  if (!(await consent())) return;
  const S = await settings(); const sh = inShabbat(new Date(), S);
  if (sh) return toast(`שבת — לא עובדים. אפשר להחתים מ-${tm(sh.end.toISOString())}`, 4000);
  toast('מאתר מיקום…', 9000);
  const loc = await locateOnce();
  let project_id = null;
  try { const { data } = await sb.from('work_days').select('project_id,work_day_crew!inner(user_id)').eq('day', ymd(new Date())).eq('work_day_crew.user_id', state.user.id).limit(1); project_id = data?.[0]?.project_id || null; } catch {}
  const row = { id: uid(), user_id: state.user.id, start_at: new Date().toISOString(), start_lat: loc?.lat ?? null, start_lng: loc?.lng ?? null, start_acc: loc?.acc ?? null, project_id, source: 'app', status: 'open' };
  await enqueue({ kind: 'insert', table: 'shifts', row }); await cache.set('open-shift', row);
  toast(loc ? 'נכנסת למשמרת' : 'נכנסת למשמרת (בלי מיקום)'); after && after();
}
export async function clockOut(open, after) {
  const mins = Math.round((Date.now() - new Date(open.start_at)) / 6e4);
  let brk = 0, free = false;
  sheet(`<h3>יציאה מהמשמרת</h3><div class="kpis"><div class="kpi"><b>${tm(open.start_at)}</b><span>כניסה</span></div><div class="kpi"><b>${tm(new Date().toISOString())}</b><span>יציאה</span></div><div class="kpi"><b>${hhmm(mins / 60)}</b><span>משך</span></div></div>
    <b>הפסקה</b><div class="chips">${[0, 15, 30, 45, 60].map(m => `<button class="chip" data-b="${m}" aria-pressed="${m === 0}">${m ? m + ' דק׳' : 'בלי'}</button>`).join('')}</div>
    <label class="tog"><span>בזמן ההפסקה יכולתי לעזוב את האתר<small class="muted" style="display:block">רק הפסקה כזו מנוכה מהשעות</small></span><span class="sw"><input type="checkbox" id="bf"><i></i></span></label>
    <input type="text" id="bn" placeholder="הערה (לא חובה)">
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="bo">יציאה</button></div>`, (s, close) => {
    $$('[data-b]', s).forEach(b => b.onclick = () => { brk = +b.dataset.b; $$('[data-b]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#bf', s).onchange = e => free = e.target.checked;
    $('#bo', s).onclick = async () => {
      $('#bo', s).disabled = true; $('#bo', s).textContent = 'מאתר מיקום…';
      const loc = await locateOnce();
      const patch = { end_at: new Date().toISOString(), end_lat: loc?.lat ?? null, end_lng: loc?.lng ?? null, end_acc: loc?.acc ?? null, break_min: free ? brk : 0, status: 'closed', note: [$('#bn', s).value.trim(), brk && !free ? `הפסקה ${brk} דק׳ באתר (בתשלום)` : ''].filter(Boolean).join(' · ') || null };
      await enqueue({ kind: 'update', table: 'shifts', rowId: open.id, patch }); await cache.set('open-shift', null);
      close(); toast('יצאת מהמשמרת'); after && after();
    };
  });
}

// ---------- כרטיס שעון בבית ----------
let tick;
export async function clockCard(box) {
  if (!box) return;
  const draw = async () => {
    const open = await myOpenShift();
    clearInterval(tick);
    const el = document.createElement('div'); el.className = 'clock' + (open ? ' on' : ''); el.id = 'clockcard';
    const elapsed = () => hhmm((Date.now() - new Date(open.start_at)) / 36e5);
    el.innerHTML = open
      ? `<span class="cl-dot"></span><span class="grow"><b>במשמרת מ-${tm(open.start_at)}</b><small id="cl-t">${elapsed()} שעות</small></span><button class="btn sm danger" id="cl-out">יציאה</button>`
      : `<span class="mic">${icon('clock', 20)}</span><span class="grow"><b>לא במשמרת</b><small><a href="#/hours">השעות שלי</a></small></span><button class="btn sm primary" id="cl-in">כניסה</button>`;
    $('#clockcard')?.remove(); box.prepend(el);
    if (open) { tick = setInterval(() => { const t = $('#cl-t'); if (t) t.textContent = elapsed() + ' שעות'; else clearInterval(tick); }, 30000); $('#cl-out').onclick = () => clockOut(open, draw); }
    else $('#cl-in').onclick = () => clockIn(draw);
  };
  draw();
}


// ---------- בקשת עריכה של עובד (נכנסת לשעות רק אחרי אישור מנהל) ----------
function requestSheet(sh, month, done) {
  const d0 = sh ? new Date(sh.start_at) : null, day = sh ? ymd(d0) : (ymd(new Date()).slice(0, 7) === month ? ymd(new Date()) : `${month}-01`);
  sheet(`<h3>${sh ? 'עריכת משמרת' : 'הוספת משמרת ששכחתי להחתים'}</h3>
    <div class="small muted">השינוי יישלח למנהל, ויתעדכן בשעות רק אחרי שיאשר.</div>
    <label class="field">תאריך<input type="date" id="rd" value="${day}" ${sh ? 'disabled' : ''}></label>
    <div class="row"><label class="field grow">כניסה<input type="time" id="rs" value="${sh ? tm(sh.start_at) : '07:00'}"></label><label class="field grow">יציאה<input type="time" id="re" value="${sh?.end_at ? tm(sh.end_at) : ''}"></label></div>
    <label class="field">הפסקה שבה יכולתי לעזוב (דקות)<input type="number" id="rb" min="0" value="${sh?.break_min || 0}"></label>
    <label class="field">סיבה (חובה)<textarea id="rr" rows="2" placeholder="למשל: שכחתי להחתים יציאה, יצאתי ב-16:30"></textarea></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="ro">שליחה לאישור</button></div>`, (s, close) => {
    $('#ro', s).onclick = async () => {
      const d = $('#rd', s).value, reason = $('#rr', s).value.trim(), st = $('#rs', s).value, en = $('#re', s).value;
      if (!st || !en) return toast('חסרה שעת כניסה או יציאה');
      if (!reason) return toast('חובה לכתוב סיבה');
      const a = new Date(`${d}T${st}:00`); let b = new Date(`${d}T${en}:00`); if (b <= a) b = new Date(+b + 864e5);
      if (b > new Date(Date.now() + 5 * 6e4)) return toast('אי אפשר לדווח שעה עתידית');
      const { error } = await sb.from('shift_requests').insert({ user_id: state.user.id, shift_id: sh?.id || null, req_start: a.toISOString(), req_end: b.toISOString(), req_break: +$('#rb', s).value || 0, reason });
      if (error) return toast(error.message, 4000);
      close(); toast('נשלח לאישור המנהל'); done && done();
    };
  });
}
const REQ_ST = { pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'ok'], rejected: ['נדחה', 'bad'] };
function reqLine(r, sh) {
  const [t, c] = REQ_ST[r.status];
  return `<div class="req ${c}"><div class="row"><span class="pill ${c}">${t}</span><small class="grow">${r.shift_id ? 'עריכה' : 'משמרת שלא הוחתמה'}: ${tm(r.req_start)}–${tm(r.req_end)}${r.req_break ? ` · הפסקה ${r.req_break}` : ''}${sh ? ` (במקום ${tm(sh.start_at)}–${sh.end_at ? tm(sh.end_at) : 'פתוחה'})` : ''}</small></div>
    <div class="small">סיבה: ${esc(r.reason)}</div>${r.manager_reply ? `<div class="small mreply">תגובת המנהל: ${esc(r.manager_reply)}</div>` : ''}</div>`;
}
function bindDecide(root, reload) {
  $$('[data-dec]', root).forEach(b => b.onclick = async () => {
    const ok = b.dataset.ok === '1';
    const reply = await ask(ok ? 'אישור הבקשה' : 'דחיית הבקשה', { multiline: true, placeholder: ok ? 'תגובה לעובד (לא חובה)' : 'למה נדחה? (חובה)', ok: ok ? 'אישור' : 'דחייה', optional: ok });
    if (reply == null) return;
    const { error } = await sb.rpc('decide_shift_request', { rid: b.dataset.dec, ok, reply: reply.trim() });
    if (error) return toast(error.message, 4000); toast(ok ? 'אושר — השעות עודכנו' : 'נדחה — העובד קיבל הודעה'); reload();
  });
}
const decideBtns = r => `<div class="row-btns"><button class="btn ghost sm" data-dec="${r.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-dec="${r.id}" data-ok="1">אישור</button></div>`;

// ---------- השעות שלי / של עובד ----------
export async function renderHours(el, userId, month) {
  const me = !userId || userId === state.user.id; userId ||= state.user.id;
  month ||= ymd(new Date()).slice(0, 7);
  el.innerHTML = `<header class="phead"><a class="back" href="${me ? '#/menu' : '#/attendance'}" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow" id="ht">${me ? 'השעות שלי' : ''}</h1></header>
    <div class="monthbar"><button id="mp" aria-label="חודש קודם">${icon('back', 18)}</button><b>${monthName(month)}</b><button id="mn" aria-label="חודש הבא">${icon('chev', 18)}</button></div>
    <div id="hb" class="stack lg"><div class="skel"></div></div>`;
  const base = me ? '#/hours' : `#/attendance/${userId}`;
  $('#mp').onclick = () => location.hash = `${base}/${prevMonth(month)}`;
  $('#mn').onclick = () => location.hash = `${base}/${nextMonth(month)}`;
  const S = await settings();
  const from = new Date(monthStart(prevMonth(month)) + 'T00:00:00+03:00').toISOString(), to = new Date(monthStart(nextMonth(month)) + 'T00:00:00+03:00').toISOString();
  const [{ data: shifts }, { data: am }, { data: who }, { data: edits }, { data: reqs }] = await Promise.all([
    sb.from('shifts').select('*').eq('user_id', userId).gte('start_at', from).lt('start_at', to).order('start_at'),
    sb.from('attendance_months').select('*').eq('user_id', userId).eq('month', monthStart(month)).maybeSingle(),
    sb.from('profiles').select('full_name').eq('id', userId).single(),
    sb.from('shift_edits').select('*').eq('user_id', userId).order('at', { ascending: false }).limit(30),
    sb.from('shift_requests').select('*').eq('user_id', userId).gte('req_start', from).lt('req_start', to).order('created_at', { ascending: false }),
  ]);
  const R0 = reqs || [], pendingNew = R0.filter(r => !r.shift_id), byShift = id => R0.filter(r => r.shift_id === id);
  if (!me) $('#ht').textContent = who?.full_name || '';
  const R = computeMonth(shifts || [], month, S);
  const T = R.totals, M = isManager() && !me || (isManager() && me);
  const locked = am?.locked;
  const box = $('#hb'); if (!box) return;
  box.innerHTML = `
    <div class="kpis"><div class="kpi"><b>${T.days}</b><span>ימי עבודה</span></div><div class="kpi"><b>${hhmm(T.net)}</b><span>סה״כ שעות</span></div><div class="kpi"><b>${hhmm(T.ot125 + T.ot150)}</b><span>שעות נוספות</span></div></div>
    <div class="menu">${CATS.filter(([k]) => T[k] > 0 || ['reg', 'ot125', 'ot150'].includes(k)).map(([k, l]) => `<div class="lrow kv"><span class="grow"><small>${l}</small><b>${hhmm(T[k])} שעות</b></span></div>`).join('')}
      ${T.nights ? `<div class="lrow kv"><span class="grow"><small>משמרות לילה</small><b>${T.nights}</b></span></div>` : ''}</div>
    ${R.flags.length ? `<section><h3 class="sh">לתשומת לב</h3><div class="alist">${R.flags.map(f => `<div class="arow warn"><span class="aic">${icon('alert', 18)}</span><span class="grow"><small style="white-space:normal;color:var(--ink)">${esc(f)}</small></span></div>`).join('')}</div></section>` : ''}
    <section><h3 class="sh">לפי ימים</h3><div class="list">${R.days.map(d => `<div class="lrow dayline"><span class="datebox"><b>${+d.date.slice(8)}</b><small>יום ${HE_D1[new Date(d.date + 'T12:00').getDay()]}</small></span>
      <span class="grow"><b>${d.shifts.map(s => `${tm(s.start_at)}–${s.end_at ? tm(s.end_at) : 'פתוחה'}${s.start_lat == null && s.source === 'app' ? ' ⌀' : ''}`).join(' · ')}</b>
      <small>${hhmm(d.netH)} שעות${d.ot125 + d.ot150 ? ` · נוספות ${hhmm(d.ot125 + d.ot150)}` : ''}${d.isNight ? ' · לילה' : ''}${d.holiday ? ' · ' + d.holiday : ''}${d.breakMin ? ` · הפסקה ${Math.round(d.breakMin)} דק׳` : ''}</small></span>
      ${me && !locked && !d.shifts.some(x => byShift(x.id).some(r => r.status === 'pending')) ? `<button class="chip" data-req="${d.shifts[0].id}">עריכה</button>` : !me && isManager() && !locked ? `<button class="chip" data-edit="${d.shifts[0].id}">תיקון</button>` : ''}</div>
      ${d.shifts.flatMap(x => byShift(x.id).filter(r => r.status === 'pending' || Date.now() - new Date(r.decided_at) < 30 * 864e5).map(r => reqLine(r, x) + (!me && isManager() && r.status === 'pending' ? decideBtns(r) : ''))).join('')}`).join('') || '<div class="muted small">אין משמרות בחודש הזה</div>'}
      ${pendingNew.map(r => reqLine(r) + (!me && isManager() && r.status === 'pending' ? decideBtns(r) : '')).join('')}</div>
      ${me && !locked ? `<button class="btn ghost block" id="reqadd">${icon('plus', 18)} הוספת משמרת ששכחתי להחתים</button>` : ''}
      ${!me && isManager() && !locked ? `<button class="btn ghost block" id="addsh">${icon('plus', 18)} הוספת משמרת (מנהל)</button>` : ''}</section>
    <section><h3 class="sh">אישור החודש</h3><div class="menu">
      <div class="lrow kv"><span class="grow"><small>העובד</small><b>${am?.worker_ok_at ? 'אישר ' + new Date(am.worker_ok_at).toLocaleDateString('he-IL') : 'עוד לא אישר'}</b></span>${me && !am?.worker_ok_at && !locked ? '<button class="btn primary sm" id="wok">אישור השעות</button>' : ''}</div>
      <div class="lrow kv"><span class="grow"><small>המנהל</small><b>${locked ? 'אושר ונעל ' + new Date(am.manager_ok_at).toLocaleDateString('he-IL') : 'עוד לא אושר'}</b></span>${isManager() && !me && !locked ? '<button class="btn primary sm" id="mok">אישור ונעילה</button>' : ''}</div></div>
</section>
    ${isManager() && (edits || []).length ? `<details class="fold"><summary><span class="sh">יומן תיקונים</span><span class="count">${edits.length}</span></summary><div class="list">${edits.map(e => `<div class="lrow kv"><span class="grow"><small>${new Date(e.at).toLocaleString('he-IL')}</small><b>${esc(e.reason || '')}</b></span></div>`).join('')}</div></details>` : ''}`;
  const reload = () => renderHours(el, me ? null : userId, month);
  $('#wok')?.addEventListener('click', async () => { const { error } = await sb.rpc('worker_approve_month', { m: monthStart(month) }); if (error) return toast(error.message); toast('אישרת את השעות'); reload(); });
  $('#mok')?.addEventListener('click', async () => {
    if (R.days.some(d => d.shifts.some(s => !s.end_at))) return toast('יש משמרת פתוחה — מתקנים לפני אישור');
    if (!(await confirmBox(`לאשר ולנעול את ${monthName(month)}?`, { body: 'אחרי הנעילה אי אפשר לשנות שעות בחודש הזה.', ok: 'אישור ונעילה' }))) return;
    const { error } = await sb.from('attendance_months').upsert({ user_id: userId, month: monthStart(month), manager_ok_at: new Date().toISOString(), manager_id: state.user.id, locked: true }); if (error) return toast(error.message); reload();
  });
  $$('[data-req]').forEach(b => b.onclick = () => requestSheet((shifts || []).find(x => x.id === b.dataset.req), month, reload));
  $('#reqadd')?.addEventListener('click', () => requestSheet(null, month, reload));
  bindDecide(box, reload);
  const edit = (sh) => {
    const d0 = sh ? new Date(sh.start_at) : new Date(), day = sh ? ymd(d0) : `${month}-01`;
    sheet(`<h3>${sh ? 'תיקון משמרת' : 'הוספת משמרת'}</h3>
      <label class="field">תאריך<input type="date" id="ed" value="${day}"></label>
      <div class="row"><label class="field grow">כניסה<input type="time" id="es" value="${sh ? tm(sh.start_at) : '07:00'}"></label><label class="field grow">יציאה<input type="time" id="ee" value="${sh?.end_at ? tm(sh.end_at) : '16:00'}"></label></div>
      <label class="field">הפסקה מנוכה (דקות)<input type="number" id="eb" value="${sh?.break_min || 0}" min="0"></label>
      <label class="field">סיבה (חובה — נשמר ביומן)<input type="text" id="er" placeholder="למשל: שכח להחתים יציאה, אושר מול ראש הצוות"></label>
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="eo">שמירה</button></div>`, (s, close) => {
      $('#eo', s).onclick = async () => {
        const d = $('#ed', s).value, st = new Date(`${d}T${$('#es', s).value}:00`), en0 = new Date(`${d}T${$('#ee', s).value}:00`);
        const en = en0 <= st ? new Date(+en0 + 864e5) : en0;   // יציאה אחרי חצות = למחרת
        const { error } = await sb.rpc('manager_set_shift', { sid: sh?.id || null, uid: userId, s: st.toISOString(), e: en.toISOString(), brk: +$('#eb', s).value || 0, reason: $('#er', s).value });
        if (error) return toast(error.message, 4000); close(); toast('נשמר'); reload();
      };
    });
  };
  $$('[data-edit]').forEach(b => b.onclick = () => edit((shifts || []).find(x => x.id === b.dataset.edit)));
  $('#addsh')?.addEventListener('click', () => edit(null));
}

// ---------- נוכחות צוות (מנהלים) ----------
export async function renderAttendance(el, month) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  month ||= ymd(new Date()).slice(0, 7);
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1>נוכחות צוות</h1></header>
    <div class="monthbar"><button id="mp" aria-label="חודש קודם">${icon('back', 18)}</button><b>${monthName(month)}</b><button id="mn" aria-label="חודש הבא">${icon('chev', 18)}</button></div>
    <div id="ab" class="stack lg"><div class="skel"></div></div>`;
  $('#mp').onclick = () => location.hash = `#/attendance/m/${prevMonth(month)}`;
  $('#mn').onclick = () => location.hash = `#/attendance/m/${nextMonth(month)}`;
  const S = await settings();
  const from = new Date(monthStart(prevMonth(month)) + 'T00:00:00+03:00').toISOString(), to = new Date(monthStart(nextMonth(month)) + 'T00:00:00+03:00').toISOString();
  const [{ data: people }, { data: shifts }, { data: ams }, { data: pend }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role').eq('is_active', true).order('full_name'),
    sb.from('shifts').select('*').gte('start_at', from).lt('start_at', to).order('start_at'),
    sb.from('attendance_months').select('*').eq('month', monthStart(month)),
    sb.from('shift_requests').select('*').eq('status', 'pending').order('created_at'),
  ]);
  const rows = (people || []).map(p => ({ p, R: computeMonth((shifts || []).filter(s => s.user_id === p.id), month, S), am: (ams || []).find(a => a.user_id === p.id) }));
  const nowOn = (shifts || []).filter(s => s.status === 'open');
  const box = $('#ab'); if (!box) return;
  const { data: pShifts } = (pend || []).some(r => r.shift_id) ? await sb.from('shifts').select('*').in('id', pend.filter(r => r.shift_id).map(r => r.shift_id)) : { data: [] };
  box.innerHTML = `
    ${(pend || []).length ? `<section><div class="sh-row"><h3 class="sh">בקשות לאישור</h3><span class="count">${pend.length}</span></div>
      <div class="list">${pend.map(r => `<div class="card stack" style="gap:6px"><b>${esc(people.find(x => x.id === r.user_id)?.full_name || '')} · ${new Date(r.req_start).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</b>${reqLine(r, (pShifts || []).find(x => x.id === r.shift_id))}${decideBtns(r)}</div>`).join('')}</div></section>` : ''}
    <section><div class="sh-row"><h3 class="sh">במשמרת עכשיו</h3><span class="count">${nowOn.length}</span></div>
      ${nowOn.length ? `<div class="list">${nowOn.map(s => { const p = people.find(x => x.id === s.user_id); return `<a class="lrow" href="#/attendance/${s.user_id}"><span class="cl-dot"></span><span class="grow"><b>${esc(p?.full_name || '')}</b><small>מ-${tm(s.start_at)} · ${hhmm((Date.now() - new Date(s.start_at)) / 36e5)} שעות${s.start_lat != null ? ` · <span class="maplink" data-ll="${s.start_lat},${s.start_lng}">מיקום כניסה</span>` : ' · בלי מיקום'}</small></span></a>`; }).join('')}</div>` : '<div class="muted small">אף אחד לא במשמרת כרגע</div>'}</section>
    <section><div class="sh-row"><h3 class="sh">סיכום חודשי</h3><button class="more" id="exp" style="border:0;background:none;cursor:pointer">ייצוא לחשבת השכר</button></div>
      <div class="list">${rows.map(({ p, R, am }) => `<a class="lrow" href="#/attendance/${p.id}/${month}"><span class="avatar sm">${esc(p.full_name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span><span class="grow"><b>${esc(p.full_name)}</b>
        <small>${R.totals.days} ימים · ${hhmm(R.totals.net)} שעות${R.totals.ot125 + R.totals.ot150 ? ` · נוספות ${hhmm(R.totals.ot125 + R.totals.ot150)}` : ''}${R.flags.length ? ` · ${R.flags.length} הערות` : ''}</small></span>
        <span class="pill ${am?.locked ? 'ok' : am?.worker_ok_at ? 'lime' : ''}">${am?.locked ? 'נעול' : am?.worker_ok_at ? 'העובד אישר' : R.totals.days ? 'פתוח' : '—'}</span></a>`).join('')}</div></section>
    <div class="small muted">החישוב מסווג שעות לפי החוק (יומי ואז שבועי, 42 שעות). את הסכומים בכסף והתלוש מכינה חשבת השכר.</div>`;
  bindDecide(box, () => renderAttendance(el, month));
  $$('.maplink', box).forEach(m => m.onclick = e => { e.preventDefault(); e.stopPropagation(); window.open(`https://www.google.com/maps?q=${m.dataset.ll}`, '_blank'); });
  $('#exp').onclick = () => {
    const head = ['עובד', 'תאריך', 'יום', 'כניסה', 'יציאה', 'הפסקה (דק׳)', 'נטו', ...CATS.map(c => c[1]), 'לילה', 'חג', 'הערות'];
    const lines = [head];
    for (const { p, R } of rows) for (const d of R.days) lines.push([p.full_name, d.date, HE_DOW[new Date(d.date + 'T12:00').getDay()], d.shifts.map(s => tm(s.start_at)).join(' / '), d.shifts.map(s => tm(s.end_at)).join(' / '), Math.round(d.breakMin), d.netH, ...CATS.map(c => d[c[0]] || 0), d.isNight ? 'כן' : '', d.holiday || '', d.flags.join('; ')]);
    lines.push([]); lines.push(['סיכום לעובד', '', '', '', '', '', 'נטו', ...CATS.map(c => c[1])]);
    for (const { p, R } of rows) if (R.totals.days) lines.push([p.full_name, '', '', '', '', '', R.totals.net, ...CATS.map(c => R.totals[c[0]])]);
    const csv = '﻿' + lines.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `נוכחות-${month}.csv`; a.click();
  };
}
