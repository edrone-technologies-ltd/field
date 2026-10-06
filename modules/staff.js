// פורטל עובדים (מנהלים): רשימת הצוות ← כרטיס עובד עם פרטים, שכר (מנהלי מערכת), שעות החודש ומסמכים/תלושים.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, initials, ROLE_HE, dm } from '../lib/core.js';
import { computeMonth, hhmm, ymd, DEFAULTS } from '../lib/labor.js';
import { estimatePay, PAY_TYPES } from '../lib/pay.js';

const isAdmin = () => state.profile.role === 'admin';
const nis = x => '₪' + Math.round(x || 0).toLocaleString('he-IL');
const thisMonth = () => ymd(new Date()).slice(0, 7);
async function monthData(userIds, month) {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 2, 1).toISOString(), to = new Date(y, m, 1).toISOString();
  const [{ data: shifts }, { data: st }] = await Promise.all([
    sb.from('shifts').select('*').in('user_id', userIds).gte('start_at', from).lt('start_at', to).order('start_at'),
    sb.from('app_settings').select('value').eq('key', 'attendance').maybeSingle(),
  ]);
  const S = { ...DEFAULTS, ...(st?.value || {}) };
  return Object.fromEntries(userIds.map(u => [u, computeMonth((shifts || []).filter(s => s.user_id === u), month, S)]).concat([['__open', (shifts || []).filter(s => s.status === 'open')]]));
}

// ---------- רשימת עובדים ----------
export async function renderStaff(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">עובדים</h1>${isAdmin() ? `<button class="btn primary sm" id="bulk">${icon('plus', 18)} תלושים לחודש</button>` : ''}</header><div id="sl" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: people }, { data: prof }, { data: rates }, { data: docs }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,phone,is_active').order('full_name'),
    sb.from('employee_profile').select('user_id,job_title,employment_type'),
    isAdmin() ? sb.from('employee_rates').select('*') : Promise.resolve({ data: [] }),
    sb.from('employee_docs').select('user_id,title,expires_on').not('expires_on', 'is', null),
  ]);
  const active = (people || []).filter(p => p.is_active);
  const M = await monthData(active.map(p => p.id), thisMonth());
  const open = new Set((M.__open || []).map(s => s.user_id));
  const soon = (docs || []).filter(d => (new Date(d.expires_on) - new Date()) / 864e5 <= 45);
  $('#sl').innerHTML = `${soon.length ? `<div class="alist">${soon.map(d => `<a class="arow warn" href="#/staff/${d.user_id}/docs"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(active.find(p => p.id === d.user_id)?.full_name || '')} · ${esc(d.title)}</b><small>בתוקף עד ${new Date(d.expires_on).toLocaleDateString('he-IL')}</small></span></a>`).join('')}</div>` : ''}
    <div class="list">${active.map(p => { const pr = (prof || []).find(x => x.user_id === p.id), R = M[p.id], r = (rates || []).find(x => x.user_id === p.id);
      return `<a class="lrow" href="#/staff/${p.id}"><span class="avatar sm">${esc(initials(p.full_name))}</span><span class="grow"><b>${esc(p.full_name)}${open.has(p.id) ? ' <span class="cl-dot inline"></span>' : ''}</b>
        <small>${esc(pr?.job_title || ROLE_HE[p.role] || '')}${pr?.employment_type && pr.employment_type !== 'עובד' ? ' · ' + esc(pr.employment_type) : ''} · החודש ${hhmm(R?.totals.net || 0)} שעות</small></span>
        ${r ? `<span class="pill">${PAY_TYPES[r.pay_type] || ''}</span>` : ''}<span class="chev">${icon('chev', 18)}</span></a>`; }).join('')}</div>
    <div class="small muted">נקודה ירוקה = במשמרת עכשיו. עובד חדש מוסיפים בניהול המערכת.</div>`;
  const b = $('#bulk'); if (b) b.onclick = async () => (await import('./files.js')).bulkUpload(active, () => renderStaff(el));
}

// ---------- כרטיס עובד ----------
export async function renderEmployee(el, userId, tab = 'info') {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  const { data: p } = await sb.from('profiles').select('*').eq('id', userId).single();
  const TABS = [['info', 'פרטים'], ...(isAdmin() ? [['pay', 'שכר']] : []), ['hours', 'שעות'], ['docs', 'מסמכים']];
  el.innerHTML = `<header class="phead"><a class="back" href="#/staff" aria-label="חזרה">${icon('back', 20)}</a><span class="avatar">${esc(initials(p?.full_name))}</span><div class="grow"><b class="ttl">${esc(p?.full_name || '')}</b><small class="muted">${esc(ROLE_HE[p?.role] || '')}${p?.phone ? ' · ' + esc(p.phone) : ''}</small></div>${p?.phone ? `<a class="btn ghost sm" href="tel:${esc(p.phone)}">חיוג</a>` : ''}</header>
    <div class="tabs" id="et">${TABS.map(([k, t]) => `<button data-t="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</div><div id="eb" class="stack lg"></div>`;
  $$('#et button').forEach(b => b.onclick = () => { history.replaceState(null, '', `#/staff/${userId}/${b.dataset.t}`); $$('#et button').forEach(x => x.setAttribute('aria-selected', x === b)); show(b.dataset.t); });
  const box = $('#eb');
  const show = async t => {
    box.innerHTML = '<div class="skel"></div>';
    if (t === 'docs') return (await import('./files.js')).employeeDocs(box, userId);
    if (t === 'pay' && isAdmin()) return payTab(box, p);
    if (t === 'hours') return hoursTab(box, p);
    return infoTab(box, p);
  };
  show(TABS.some(x => x[0] === tab) ? tab : 'info');
}

async function infoTab(box, p) {
  const { data: e } = await sb.from('employee_profile').select('*').eq('user_id', p.id).maybeSingle();
  const F = [['job_title', 'תפקיד בחברה'], ['division', 'חטיבה'], ['employment_type', 'סוג התקשרות'], ['start_date', 'תחילת עבודה', 'date'], ['id_number', 'תעודת זהות'], ['birth_date', 'תאריך לידה', 'date'], ['address', 'כתובת'], ['emergency_contact', 'איש קשר לחירום'], ['notes', 'הערות', 'long']];
  const v = (k, type) => e?.[k] ? (type === 'date' ? new Date(e[k]).toLocaleDateString('he-IL') : esc(e[k])) : '<span class="muted">—</span>';
  box.innerHTML = `<div class="menu">${F.map(([k, l, t]) => `<div class="lrow kv"><span class="grow"><small>${l}</small><b>${v(k, t)}</b></span></div>`).join('')}
      ${p.is_pilot ? `<div class="lrow kv"><span class="grow"><small>רישיון מטיס</small><b>${esc(p.pilot_license_no || '')}${p.pilot_license_expiry ? ' · עד ' + new Date(p.pilot_license_expiry).toLocaleDateString('he-IL') : ''}</b></span></div>` : ''}
      <div class="lrow kv"><span class="grow"><small>הרשאה באפליקציה</small><b>${esc(ROLE_HE[p.role] || '')}${p.is_active ? '' : ' · מושבת'}</b></span>${isAdmin() ? '<a class="chip" href="#/admin">שינוי</a>' : ''}</div></div>
    <button class="btn ghost block" id="edit">עריכת פרטים</button>`;
  $('#edit', box).onclick = () => sheet(`<h3>עריכת פרטים · ${esc(p.full_name)}</h3>${F.map(([k, l, t]) => `<label class="field">${l}${t === 'long' ? `<textarea data-f="${k}" rows="2">${esc(e?.[k] || '')}</textarea>` : `<input type="${t === 'date' ? 'date' : 'text'}" data-f="${k}" value="${esc(e?.[k] || '')}">`}</label>`).join('')}
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="sv">שמירה</button></div>`, (s, close) => {
    $('#sv', s).onclick = async () => {
      const row = { user_id: p.id, updated_at: new Date().toISOString() }; $$('[data-f]', s).forEach(i => row[i.dataset.f] = i.value.trim() || null);
      const { error } = await sb.from('employee_profile').upsert(row); if (error) return toast(error.message); close(); toast('נשמר'); infoTab(box, p);
    };
  });
}

async function payTab(box, p) {
  const { data: r } = await sb.from('employee_rates').select('*').eq('user_id', p.id).maybeSingle();
  const month = thisMonth(), M = await monthData([p.id], month), T = M[p.id].totals;
  const P = { pay_type: 'hourly', ...(r || {}) };
  const draw = () => {
    const est = estimatePay(T, P);
    box.innerHTML = `<div class="sec"><b>סוג העסקה</b><div class="chips">${Object.entries(PAY_TYPES).map(([k, t]) => `<button class="chip" data-pt="${k}" aria-pressed="${P.pay_type === k}">${t}</button>`).join('')}</div>
        ${P.pay_type === 'hourly' ? `<label class="field">שכר לשעה (₪)<input type="number" step="0.5" id="ph" value="${P.hourly_rate ?? ''}"></label>`
          : `<label class="field">משכורת חודשית ברוטו (₪)<input type="number" id="pm" value="${P.monthly_salary ?? ''}"></label>`}
        ${P.pay_type === 'global' ? `<div class="row"><label class="field grow">רכיב גלובלי (₪ לחודש)<input type="number" id="pg" value="${P.global_ot_amount ?? ''}"></label><label class="field grow">שעות נוספות מכוסות<input type="number" id="pgh" value="${P.global_ot_hours ?? ''}"></label></div>
          <div class="small muted">לפי החוק הגלובלי חייב לכסות את השעות הנוספות בפועל. אם עובדים יותר — מגיע הפרש, והמערכת תתריע.</div>` : ''}
        <label class="field">החזר נסיעות ליום (₪, לא חובה)<input type="number" step="0.1" id="pt" value="${P.travel_per_day ?? ''}"></label>
        <label class="field">הערות שכר<input type="text" id="pn" value="${esc(P.pay_notes || '')}" placeholder="למשל: תוספת ותק, הסכם אישי"></label>
        <button class="btn primary block" id="psv">שמירת תנאי שכר</button></div>
      <section><h3 class="sh">הערכה לחודש הנוכחי</h3>
        <div class="kpis"><div class="kpi"><b>${hhmm(T.net)}</b><span>שעות</span></div><div class="kpi"><b>${hhmm(T.ot125 + T.ot150)}</b><span>נוספות</span></div><div class="kpi"><b>${est ? nis(est.total) : '—'}</b><span>הערכת ברוטו</span></div></div>
        ${est ? `<div class="menu">${[['בסיס', nis(est.base)], [est.type === 'global' ? 'גלובלי / נוספות' : 'שעות נוספות ושבת', nis(est.ot)], ...(est.travel ? [['נסיעות', nis(est.travel)]] : [])].map(([k, v]) => `<div class="lrow kv"><span class="grow"><small>${k}</small><b>${v}</b></span></div>`).join('')}</div>` : '<div class="muted small">מזינים תנאי שכר כדי לראות הערכה</div>'}
        ${(est?.notes || []).map(n => `<div class="arow warn card-like"><span class="aic">${icon('alert', 18)}</span><span class="grow"><small style="white-space:normal;color:var(--ink)">${esc(n)}</small></span></div>`).join('')}
        <div class="small muted">הערכה בלבד, לפני ניכויים. התלוש מגיע מהנהלת החשבונות.</div></section>`;
    $$('[data-pt]', box).forEach(b => b.onclick = () => { collect(); P.pay_type = b.dataset.pt; draw(); });
    $('#psv', box).onclick = async () => { collect();
      const row = { user_id: p.id, pay_type: P.pay_type, hourly_rate: P.pay_type === 'hourly' ? num(P.hourly_rate) : null, monthly_salary: P.pay_type !== 'hourly' ? num(P.monthly_salary) : null,
        global_ot_amount: P.pay_type === 'global' ? num(P.global_ot_amount) : null, global_ot_hours: P.pay_type === 'global' ? num(P.global_ot_hours) : null, travel_per_day: num(P.travel_per_day), pay_notes: P.pay_notes || null, updated_at: new Date().toISOString() };
      const { error } = await sb.from('employee_rates').upsert(row); if (error) return toast(error.message); toast('תנאי השכר נשמרו'); draw(); };
  };
  const num = x => x === '' || x == null ? null : Number(x);
  const collect = () => { const g = id => $('#' + id, box)?.value; if (g('ph') != null) P.hourly_rate = g('ph'); if (g('pm') != null) P.monthly_salary = g('pm'); if (g('pg') != null) P.global_ot_amount = g('pg'); if (g('pgh') != null) P.global_ot_hours = g('pgh'); P.travel_per_day = g('pt'); P.pay_notes = g('pn'); };
  draw();
}

async function hoursTab(box, p) {
  const month = thisMonth(), M = await monthData([p.id], month), R = M[p.id], T = R.totals;
  const [{ data: reqs }, { data: abs }] = await Promise.all([
    sb.from('shift_requests').select('id').eq('user_id', p.id).eq('status', 'pending'),
    sb.from('absences').select('kind,date_from,date_to,status').eq('user_id', p.id).gte('date_to', month + '-01'),
  ]);
  box.innerHTML = `<div class="kpis"><div class="kpi"><b>${T.days}</b><span>ימי עבודה החודש</span></div><div class="kpi"><b>${hhmm(T.net)}</b><span>שעות</span></div><div class="kpi"><b>${hhmm(T.ot125 + T.ot150)}</b><span>נוספות</span></div></div>
    ${(reqs || []).length ? `<a class="arow warn card-like" href="#/attendance/${p.id}"><span class="aic">${icon('clock', 18)}</span><span class="grow"><b>${reqs.length} בקשות תיקון ממתינות</b></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
    ${R.flags.length ? `<div class="small muted">${R.flags.length} הערות החודש (שעות חריגות, כניסה בלי מיקום וכו׳)</div>` : ''}
    ${(abs || []).length ? `<div class="menu">${abs.map(a => `<div class="lrow kv"><span class="grow"><small>${a.status === 'approved' ? 'אושר' : a.status === 'pending' ? 'ממתין' : 'נדחה'}</small><b>${({ vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', unpaid: 'חופש ללא תשלום', other: 'אחר' })[a.kind]} · ${dm(a.date_from)}${a.date_to !== a.date_from ? '–' + dm(a.date_to) : ''}</b></span></div>`).join('')}</div>` : ''}
    <a class="btn ghost block" href="#/attendance/${p.id}">דוח השעות המלא, תיקונים ואישור החודש</a>`;
}
