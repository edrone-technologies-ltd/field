// ציוד: מצב הצי והציוד, היסטוריית תקלות, ודיווח תקלה בציוד. מצב הרחפנים מגיע מלוח בריאות הצי במאנדי.
import { sb, state, isManager, cache, enqueue, flush, sheet, uid, $, $$, esc, toast, dm, isoDay, icon, backBtn, replaceHash, signedUrls, zoom, confirmBox } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const KIND = { drone: 'רחפנים', battery: 'סוללות', vehicle: 'רכבים', trailer: 'נגררים', pump: 'משאבות', tank: 'מיכלי מים', generator: 'גנרטורים', other: 'אחר' };
const KIND1 = { drone: 'רחפן', battery: 'סוללה', vehicle: 'רכב', trailer: 'נגרר', pump: 'משאבה', tank: 'מיכל מים', generator: 'גנרטור', other: 'פריט' };
const HEALTH = { ok: ['תקין', 'ok'], warning: ['במעקב', 'warn'], grounded: ['מקורקע', 'bad'], maintenance: ['בטיפול', 'warn'] };
const SVC = { ok: ['טיפול תקין', 'ok'], due: ['טיפול מתקרב', 'warn'], overdue: ['נדרש טיפול', 'bad'], unknown: ['לא נרשם טיפול', ''] };
const RANK = { grounded: 0, maintenance: 1, warning: 2, ok: 3 };
const daysTo = d => d ? Math.round((new Date(d + 'T12:00') - new Date(isoDay() + 'T12:00')) / 864e5) : null;
const ago = d => { const n = -daysTo(d); return n <= 0 ? 'היום' : n === 1 ? 'אתמול' : n < 30 ? `לפני ${n} ימים` : n < 60 ? 'לפני חודש' : `לפני ${Math.round(n / 30)} חודשים`; };
// תוקף (ביטוח / רישוי / טסט): פג או בעוד פחות מ-30 יום = סימון
const dueOf = r => [['ביטוח', r.insurance_until], [r.kind === 'drone' ? 'רישום' : 'רישוי', r.license_until]].filter(([, d]) => d && daysTo(d) <= 30).map(([t, d]) => ({ t, d, n: daysTo(d) }));
const dueTxt = x => x.n < 0 ? `${x.t} פג` : x.n === 0 ? `${x.t} פג היום` : `${x.t} בעוד ${x.n} ימים`;
const issueTxt = (r, i) => String(i.body || '').replace(r.name + ': ', '');

export async function renderEquipment(el) {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">ציוד</h1>${isManager() ? `<a class="hbtn" href="#/compliance" aria-label="תוקף ותעודות">${icon('shield', 20)}</a><button class="hbtn" id="add" aria-label="פריט ציוד">${icon('plus', 20)}</button>` : ''}</header><div id="el" class="stack lg"><div class="skel"></div></div>`;
  let rows, iss, days;
  try {
    const since = isoDay(new Date(Date.now() - 120 * 864e5));
    const [{ data, error }, { data: i }, { data: w }] = await Promise.all([
      sb.from('equipment').select('*').order('kind').order('name'),
      sb.from('issues').select('id,equipment_id,body,status,created_at,severity').not('equipment_id', 'is', null).order('created_at', { ascending: false }).limit(100),
      sb.from('work_days').select('id,day,drone_id,vehicle_id,projects(name)').gte('day', since).or('drone_id.not.is.null,vehicle_id.not.is.null').order('day').limit(500),
    ]);
    if (error) throw error; rows = data || []; iss = i || []; days = w || []; await cache.set('equipment', { rows, iss, days });
  } catch { ({ rows = [], iss = [], days = [] } = (await cache.get('equipment')) || {}); }
  const M = isManager(), today = isoDay();
  const use = id => { const mine = days.filter(d => d.drone_id === id || d.vehicle_id === id);
    return { last: mine.filter(d => d.day <= today).pop() || null, next: mine.find(d => d.day > today) || mine.find(d => d.day === today) || null }; };
  const openOf = id => iss.filter(i => i.equipment_id === id && i.status === 'open');
  const draw = () => {
    const by = {}; rows.forEach(r => (by[r.kind] ||= []).push(r));
    Object.values(by).forEach(a => a.sort((x, y) => (RANK[x.health] ?? 3) - (RANK[y.health] ?? 3) || x.name.localeCompare(y.name, 'he')));
    const drones = by.drone || [], gr = rows.filter(r => r.health === 'grounded'), wr = rows.filter(r => ['warning', 'maintenance'].includes(r.health)),
      opn = rows.filter(r => openOf(r.id).length), due = rows.filter(r => dueOf(r).length);
    const ready = drones.filter(r => r.health === 'ok').length;
    const summary = rows.length ? `<div class="kpis eqk">
        <div class="kpi ${drones.length && ready === drones.length ? 'ok' : ''}"><b>${ready}/${drones.length}</b><span>רחפנים מוכנים</span></div>
        <div class="kpi ${gr.length ? 'bad' : ''}"><b>${gr.length}</b><span>מקורקעים</span></div>
        <div class="kpi ${wr.length + opn.length ? 'warn' : ''}"><b>${opn.length}</b><span>תקלות פתוחות</span></div></div>
      ${due.length ? `<div class="alist">${due.map(r => `<button class="arow ${dueOf(r).some(x => x.n < 0) ? 'bad' : 'warn'}" type="button" data-e="${r.id}"><span class="aic">${icon('shield', 18)}</span><span class="grow"><b>${esc(r.name)}</b><small>${dueOf(r).map(dueTxt).join(' · ')}</small></span><span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div>` : ''}` : '';
    const line = r => {
      const h = HEALTH[r.health] || HEALTH.ok, op = openOf(r.id), u = use(r.id);
      const stale = r.kind === 'drone' && r.service_state === 'unknown' && (!r.health_date || -daysTo(r.health_date) > 30);
      const svc = r.kind === 'drone' ? SVC[r.service_state] : null;
      const sub = [r.health_date && !stale ? 'נבדק ' + ago(r.health_date) : '', u.next ? `${u.next.day === today ? 'היום' : 'ב-' + dm(u.next.day)} · ${u.next.projects?.name || ''}` : u.last ? 'יצא ' + ago(u.last.day) : '', r.kind === 'battery' && r.cycles != null ? `${r.cycles} מחזורים` : ''].filter(Boolean);
      return `<button class="lrow eqrow ${h[1]}" data-e="${r.id}"><span class="eqdot ${h[1]}" aria-hidden="true"></span><span class="grow"><b>${esc(r.name)}</b>
        ${op.length ? `<small class="eqiss">${icon('alert', 13)} ${esc(issueTxt(r, op[0]))}${op.length > 1 ? ` · ועוד ${op.length - 1}` : ''}</small>` : r.health !== 'ok' && (r.health_detail || r.health_note) ? `<small class="eqiss">${esc(String(r.health_detail || r.health_note).split('\n')[0])}</small>` : ''}
        ${svc && r.service_state !== 'unknown' ? `<small class="svc ${svc[1]}">${icon('wrench', 13)} ${svc[0]}${r.service_pct != null && r.service_state === 'ok' ? ` · ${Math.max(0, 100 - r.service_pct)}% נותר` : ''}</small>` : ''}
        ${sub.length || stale ? `<small>${stale ? `<span class="stale">${r.health_date ? 'בדיקה אחרונה ' + ago(r.health_date) : 'לא נבדק'}</span>${sub.length ? ' · ' : ''}` : ''}${esc(sub.join(' · '))}</small>` : ''}</span><span class="pill ${h[1]}">${h[0]}</span></button>`;
    };
    const missing = M ? Object.keys(KIND).filter(k => !by[k] && !['drone', 'other'].includes(k)) : [];
    $('#el').innerHTML = summary + Object.entries(KIND).filter(([k]) => by[k]).map(([k, t]) => `<section><div class="sh-row"><h3 class="sh">${t}</h3><span class="count">${by[k].length}</span></div><div class="list">${by[k].map(line).join('')}</div></section>`).join('')
      + (missing.length ? `<div class="chips eqadd">${missing.map(k => `<button class="chip" data-addk="${k}">${icon('plus', 15)} ${KIND1[k]}</button>`).join('')}</div>` : '')
      + (rows.length ? '' : `<div class="ecta"><span class="ei">${icon('drone', 28)}</span><b>עוד אין ציוד</b></div>`);
    // רחפן = יומן טכני מלא (מסך משלו). שאר הציוד — חלון פרטים
    $$('[data-e]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id === b.dataset.e); if (r?.kind === 'drone') location.hash = '#/equipment/' + r.id; else detail(r); });
    $$('[data-addk]').forEach(b => b.onclick = () => addItem(b.dataset.addk));
  };
  const a = $('#add'); if (a) a.onclick = () => addItem();
  function detail(r) {
    const h = HEALTH[r.health] || HEALTH.ok, mine = iss.filter(i => i.equipment_id === r.id), u = use(r.id);
    const fromMonday = !!r.monday_label;
    const up = days.filter(d => (d.drone_id === r.id || d.vehicle_id === r.id) && d.day >= today).slice(0, 4);
    sheet(`<div class="row"><h3 class="grow">${esc(r.name)}</h3><span class="pill ${h[1]}">${h[0]}</span></div>
      <div class="small muted">${esc([r.serial ? 'מס׳ ' + r.serial : '', r.health_date ? 'בדיקה אחרונה ' + dm(r.health_date) + ' · ' + ago(r.health_date) : '', u.last ? 'יצא לאחרונה ' + dm(u.last.day) + (u.last.projects?.name ? ' · ' + u.last.projects.name : '') : ''].filter(Boolean).join(' · '))}</div>
      ${r.health_detail || r.health_note ? `<div class="note pre">${esc(r.health_detail || r.health_note)}</div>` : ''}
      ${dueOf(r).length ? `<div class="alist">${dueOf(r).map(x => `<div class="arow ${x.n < 0 ? 'bad' : 'warn'}"><span class="aic">${icon('shield', 18)}</span><span class="grow"><b>${dueTxt(x)}</b><small>${new Date(x.d).toLocaleDateString('he-IL')}</small></span></div>`).join('')}</div>` : ''}
      ${!fromMonday && M ? `<div class="chips">${Object.entries(HEALTH).map(([k, v]) => `<button class="chip" data-h="${k}" aria-pressed="${r.health === k}">${v[0]}</button>`).join('')}</div>` : ''}
      ${up.length ? `<div class="field">משובץ<div class="list">${up.map(d => `<a class="lrow" href="#/day/${d.id}" data-close><span class="grow"><b>${d.day === today ? 'היום' : dm(d.day)}</b><small>${esc(d.projects?.name || '')}</small></span><span class="chev">${icon('chev', 16)}</span></a>`).join('')}</div></div>` : ''}
      ${mine.length ? `<div class="field">תקלות<div class="list">${mine.slice(0, 8).map(i => `<div class="lrow"><span class="grow"><b>${esc(issueTxt(r, i))}</b><small>${new Date(i.created_at).toLocaleDateString('he-IL')}</small></span>${i.status === 'open' && M ? `<button class="chip" data-fix="${i.id}">${icon('check', 14)} טופל</button>` : `<span class="pill ${i.status === 'open' ? 'warn' : 'ok'}">${i.status === 'open' ? 'פתוחה' : 'טופלה'}</span>`}</div>`).join('')}</div></div>` : ''}
      ${M ? `<details class="fold"><summary><span class="sh">פרטים ותוקף</span></summary><div class="stack">
        <div class="row"><label class="field grow">ביטוח עד<input type="date" id="ein" value="${r.insurance_until || ''}"></label><label class="field grow">${r.kind === 'drone' ? 'רישום עד' : r.kind === 'vehicle' ? 'טסט עד' : 'רישוי עד'}<input type="date" id="eli" value="${r.license_until || ''}"></label></div>
        <div class="row"><label class="field grow">מספר סידורי<input id="ese" value="${esc(r.serial || '')}"></label>${r.kind === 'battery' ? `<label class="field grow">מחזורי טעינה<input type="number" inputmode="numeric" id="ecy" value="${r.cycles ?? ''}"></label>` : ''}</div>
        <button class="btn ghost block" id="esv">שמירה</button></div></details>` : ''}
      <div class="row qtag">${['לא ממריא', 'סוללה', 'מדחס / משאבה', 'צינור / דליפה', 'מצלמה', 'נזק פיזי'].map(t => `<button type="button" class="chip" data-q="${t}">${t}</button>`).join('')}</div>
      <textarea id="eb" rows="2" placeholder="מה התקלה?"></textarea>
      <div class="row"><button class="btn ghost grow" data-close>סגירה</button><button class="btn primary grow" id="es">דיווח תקלה</button></div>`, (s, close) => {
      $$('[data-q]', s).forEach(b => b.onclick = () => { const t = $('#eb', s); t.value = t.value ? t.value + ', ' + b.dataset.q : b.dataset.q; t.focus(); });
      $$('[data-h]', s).forEach(b => b.onclick = async () => { r.health = b.dataset.h; r.health_date = isoDay(); await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch: { health: r.health, health_date: r.health_date } }); close(); toast(`${r.name}: ${HEALTH[r.health][0]}`); draw(); });
      $$('[data-fix]', s).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true; const i = iss.find(x => x.id === b.dataset.fix);
        Object.assign(i, { status: 'closed' }); await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch: { status: 'closed', resolution: 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() } });
        toast('התקלה נסגרה'); close(); draw(); detail(r); });
      const sv = $('#esv', s); if (sv) sv.onclick = async () => { if (sv.disabled) return; sv.disabled = true;
        const patch = { insurance_until: $('#ein', s).value || null, license_until: $('#eli', s).value || null, serial: $('#ese', s).value.trim() || null, ...($('#ecy', s) ? { cycles: $('#ecy', s).value === '' ? null : +$('#ecy', s).value } : {}) };
        Object.assign(r, patch); await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch }); toast('נשמר'); close(); draw(); };
      $('#es', s).onclick = async () => {
        const body = $('#eb', s).value.trim(); if (!body) return $('#eb', s).focus();
        if ($('#es', s).disabled) return; $('#es', s).disabled = true;
        const row = { id: uid(), equipment_id: r.id, kind: 'equipment', body: `${r.name}: ${body}`, opened_by: state.user.id, status: 'open', severity: 'normal', created_at: new Date().toISOString() };
        iss.unshift(row); const { created_at, ...ins } = row; await enqueue({ kind: 'insert', table: 'issues', row: ins }); close(); toast('התקלה נרשמה'); draw();
      };
    });
  }
  function addItem(k0 = 'battery') {
    let kind = k0;
    sheet(`<h3>פריט ציוד חדש</h3><div class="chips">${Object.entries(KIND1).filter(([k]) => k !== 'drone').map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
      <input type="text" id="an" placeholder="שם"><input type="text" id="as" placeholder="מספר סידורי / רישוי">
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="ago">הוספת פריט</button></div>`, (s, close) => {
      const ph = () => { const n = (rows.filter(r => r.kind === kind).length || 0) + 1; $('#an', s).placeholder = `${KIND1[kind]} ${n}`; };
      $$('[data-k]', s).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); ph(); });
      ph(); setTimeout(() => $('#an', s).focus(), 80);
      $('#ago', s).onclick = async () => {
        const name = $('#an', s).value.trim() || $('#an', s).placeholder;
        const go = $('#ago', s); if (go.disabled) return; go.disabled = true;
        const { data, error } = await sb.from('equipment').insert({ kind, name, serial: $('#as', s).value.trim() || null }).select().single();
        if (error) { go.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); } rows.push(data); close(); toast('הפריט נוסף'); draw();
      };
    });
  }
  draw();
  // קישור עמוק לכלי מסוים (#/equipment/<id>) — מההתראות בבית: נפתח ישר הפירוט שלו
  const want = location.hash.split('/')[2];
  if (want) { const r = rows.find(x => x.id === want);
    if (r?.kind === 'drone') return renderDrone(el, r, { rows, iss, days });
    replaceHash('#/equipment', false); if (r) detail(r); }
}

// ---------- יומן טכני לרחפן: טיסות (מתמלא לבד), מאז הטיפול, רכיבים, סוללות, טיפולים ----------
const CK = { motor: 'מנוע', prop: 'פרופלור', pump: 'משאבה', nozzle: 'נחיר', esc: 'בקר מהירות', camera: 'מצלמה', other: 'אחר' };
const SK = { periodic: 'טיפול תקופתי', repair: 'תיקון', component: 'החלפת רכיב', inspection: 'בדיקה' };
const STAGS = ['ניקוי מנועים', 'פרופלורים', 'זרועות וברגים', 'משאבה ופילטר', 'נחירים', 'צנרת', 'קושחה', 'כיול', 'סוללות'];
const hrs = m => { const t = Math.round(m || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
async function renderDrone(el, r, ctx) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/equipment" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">${esc(r.name)}</h1></header><div id="dl" class="stack lg"><div class="skel"></div></div>`;
  const M = isManager(), today = isoDay();
  const [{ data: dd }, { data: sv }, { data: comps }, { data: bats }, { data: st }] = await Promise.all([
    sb.from('drone_days').select('*').eq('equipment_id', r.id).order('day', { ascending: false }).limit(400),
    sb.from('equipment_services').select('*, profiles:by_user(full_name)').eq('equipment_id', r.id).order('done_on', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    sb.from('equipment_components').select('*').eq('drone_id', r.id).is('removed_on', null).order('kind').order('position'),
    sb.from('equipment').select('*').eq('kind', 'battery').eq('drone_id', r.id).order('name'),
    sb.from('app_settings').select('value').eq('key', 'drone_service').maybeSingle(),
  ]);
  const S = { hours: 20, flights: 150, days: 60, ...(st?.value || {}) }, D = dd || [], SV = sv || [], C = comps || [], B = bats || [];
  const pids = [...new Set(D.map(d => d.project_id).filter(Boolean))];
  const { data: pr } = pids.length ? await sb.from('projects').select('id,name').in('id', pids) : { data: [] };
  const PN = id => (pr || []).find(p => p.id === id)?.name || '';
  const sum = (since, incl = false) => D.filter(d => !since || (incl ? d.day >= since : d.day > since)).reduce((a, d) => ({ m: a.m + Number(d.air_minutes || 0), f: a.f + Number(d.flights || 0), n: a.n + 1 }), { m: 0, f: 0, n: 0 });
  const last = SV.find(x => ['periodic', 'inspection'].includes(x.kind)), since = sum(last?.done_on), life = sum(null);
  const ddays = last ? -daysTo(last.done_on) : null;
  // מה נגמר ראשון: שעות / טיסות / ימים
  const left = last ? [[S.hours * 60 - since.m, x => `${hrs(x)} שעות`, since.m / (S.hours * 60)], [S.flights - since.f, x => `${Math.round(x)} טיסות`, since.f / S.flights], [S.days - ddays, x => `${Math.round(x)} ימים`, ddays / S.days]].filter((_, i) => +[S.hours, S.flights, S.days][i] > 0).sort((a, b) => b[2] - a[2])[0] || null : null;
  const pct = left ? Math.round(left[2] * 100) : null;
  const h = HEALTH[r.health] || HEALTH.ok, svs = SVC[r.service_state || 'unknown'];
  const tone = !last ? '' : pct >= 100 ? 'bad' : pct >= (S.warn_pct || 85) ? 'warn' : 'ok';
  const compUse = c => { const u = sum(c.installed_on, true); return { m: Number(c.base_minutes || 0) + u.m, f: u.f }; };
  const compPct = c => { const u = compUse(c); return Math.round(Math.max(c.replace_hours ? u.m / 60 / c.replace_hours : 0, c.replace_cycles ? u.f / c.replace_cycles : 0) * 100); };
  const batCycles = b => Math.round(Number(b.cycles || 0) + (b.cycles_at ? sum(b.cycles_at).f : 0) / Math.max(1, B.length));
  const dueC = C.filter(c => compPct(c) >= 85).sort((a, b) => compPct(b) - compPct(a));
  const op = (ctx.iss || []).filter(i => i.equipment_id === r.id && i.status === 'open');
  const meter = (p, t) => `<span class="meter ${t}"><i style="width:${Math.max(3, Math.min(100, p))}%"></i></span>`;
  const urls = await signedUrls('field', SV.map(x => x.photo_path).filter(Boolean)).catch(() => ({}));
  $('#dl').innerHTML = `
    <div class="card stack dhero ${tone}">
      <div class="row"><span class="eqdot ${h[1]}"></span><b class="grow">${h[0]}</b>${r.service_state && r.service_state !== 'unknown' ? `<span class="pill ${svs[1]}">${svs[0]}</span>` : ''}</div>
      ${last ? `<div class="dnext"><b>${left[0] > 0 ? 'טיפול הבא בעוד ' + left[1](left[0]) : 'עבר מועד הטיפול'}</b><small>טיפול אחרון ${dm(last.done_on)} · ${ddays === 0 ? 'היום' : `לפני ${ddays} ימים`}</small></div>${meter(pct, tone)}` : `<div class="dnext"><b>עוד לא נרשם טיפול</b></div>`}
      ${dueC.map(c => `<button type="button" class="arow ${compPct(c) >= 100 ? 'bad' : 'warn'}" data-rc="${c.id}"><span class="aic">${icon('wrench', 16)}</span><span class="grow"><b>${compPct(c) >= 100 ? 'להחליף' : 'בקרוב להחליף'} ${esc(CK[c.kind])}${c.position ? ' ' + esc(c.position) : ''}</b><small>${compPct(c)}% מהסף</small></span><span class="chev">${icon('chev', 16)}</span></button>`).join('')}
      <button class="btn primary block" id="svc">${icon('wrench', 18)} רישום טיפול</button>
    </div>
    <div class="kpis"><div class="kpi"><b>${hrs(since.m)}</b><span>${last ? 'שעות מאז הטיפול' : 'שעות אוויר'}</span></div><div class="kpi"><b>${since.f}</b><span>${last ? 'טיסות מאז' : 'טיסות'}</span></div>${last ? `<div class="kpi"><b>${hrs(life.m)}</b><span>סה״כ שעות</span></div>` : `<div class="kpi"><b>${life.n}</b><span>ימי טיסה</span></div>`}</div>
    ${op.length ? `<section><h3 class="sh">תקלות פתוחות</h3><div class="list">${op.map(i => `<div class="lrow"><span class="aic warn">${icon('alert', 16)}</span><span class="grow"><b>${esc(issueTxt(r, i))}</b><small>${new Date(i.created_at).toLocaleDateString('he-IL')}</small></span>${M ? `<button class="chip" data-fix="${i.id}">${icon('check', 14)} טופל</button>` : ''}</div>`).join('')}</div></section>` : ''}
    <section><div class="sh-row"><h3 class="sh">רכיבים</h3>${M ? `<button class="more" type="button" id="cadd">${icon('plus', 16)} רכיב</button>` : ''}</div>
      ${C.length ? `<div class="list">${C.map(c => { const u = compUse(c), p = compPct(c), t = p >= 100 ? 'bad' : p >= 85 ? 'warn' : 'ok';
        return `<button type="button" class="lrow stockrow" data-c="${c.id}"><span class="grow"><b>${esc(CK[c.kind])}${c.position ? ' ' + esc(c.position) : ''}</b><small>${esc([c.serial ? 'מס׳ ' + c.serial : '', `${hrs(u.m)} ש׳ · ${u.f} טיסות`, 'מ-' + dm(c.installed_on)].filter(Boolean).join(' · '))}</small>${c.replace_hours || c.replace_cycles ? meter(p, t) : ''}</span>${p >= 100 ? '<span class="pill bad">להחליף</span>' : p >= 85 ? '<span class="pill warn">בקרוב</span>' : ''}</button>`; }).join('')}</div>`
        : M ? `<button class="btn ghost block" id="cadd2">${icon('plus', 18)} מנועים, פרופלורים, משאבה, נחיר</button>` : ''}</section>
    <section><div class="sh-row"><h3 class="sh">סוללות</h3>${M ? `<button class="more" type="button" id="badd">${icon('plus', 16)} סוללה</button>` : ''}</div>
      ${B.length ? `<div class="list">${B.map(b => { const n = batCycles(b), p = b.replace_cycles ? Math.round(n / b.replace_cycles * 100) : null, t = p >= 100 ? 'bad' : p >= 85 ? 'warn' : 'ok';
        return `<button type="button" class="lrow stockrow" data-b="${b.id}"><span class="grow"><b>${esc(b.name)}</b><small>${esc([b.serial ? 'מס׳ ' + b.serial : '', `~${n} מחזורים${b.replace_cycles ? ' מתוך ' + b.replace_cycles : ''}`].filter(Boolean).join(' · '))}</small>${p != null ? meter(p, t) : ''}</span>${p >= 100 ? '<span class="pill bad">להחליף</span>' : ''}</button>`; }).join('')}</div>`
        : M ? `<button class="btn ghost block" id="badd2">${icon('plus', 18)} סוללות של הכלי</button>` : ''}</section>
    <section><div class="sh-row"><h3 class="sh">יומן טיסות</h3><span class="count">${life.n}</span></div>
      ${D.length ? `<div class="list">${D.slice(0, 5).map(d => `<div class="lrow"><span class="datebox"><b>${+d.day.slice(8)}.${+d.day.slice(5, 7)}</b></span><span class="grow"><b>${d.flights != null ? d.flights + ' טיסות' : '—'}${d.air_minutes != null ? ' · ' + hrs(d.air_minutes) + ' ש׳' : ''}</b><small>${esc(PN(d.project_id) || (d.from_logs ? 'מהלוגים' : ''))}${d.from_logs && d.project_id ? ' · מהלוגים' : ''}</small></span>${d.work_day_id ? `<a class="chev" href="#/day/${d.work_day_id}" aria-label="יום השטח">${icon('chev', 16)}</a>` : ''}</div>`).join('')}</div>
        ${D.length > 5 ? `<details class="fold"><summary><span class="sh">עוד ${D.length - 5} ימים</span></summary><div class="list">${D.slice(5).map(d => `<div class="lrow kv"><span class="grow"><small>${dm(d.day)} · ${esc(PN(d.project_id))}</small><b>${d.flights ?? '—'} טיסות · ${hrs(d.air_minutes)} ש׳</b></span></div>`).join('')}</div></details>` : ''}`
        : '<div class="empty-line">הטיסות נרשמות לבד מימי השטח</div>'}</section>
    ${SV.length ? `<section><h3 class="sh">טיפולים</h3><div class="list">${SV.map(x => `<div class="lrow">${x.photo_path && urls[x.photo_path] ? `<img class="svimg" src="${esc(urls[x.photo_path])}" alt="" data-z="${esc(urls[x.photo_path])}">` : `<span class="mic">${icon('wrench', 18)}</span>`}<span class="grow"><b>${SK[x.kind]} · ${dm(x.done_on)}</b>${x.body ? `<small>${esc(x.body)}</small>` : ''}<small>${esc(x.profiles?.full_name || '')}</small></span></div>`).join('')}</div></section>` : ''}
    ${M ? `<details class="fold"><summary><span class="sh">מצב ופרטים</span></summary><div class="stack">
      <div class="chips">${Object.entries(HEALTH).map(([k, v]) => `<button class="chip" data-h="${k}" aria-pressed="${r.health === k}">${v[0]}</button>`).join('')}</div>
      <div class="row"><label class="field grow">ביטוח עד<input type="date" id="ein" value="${r.insurance_until || ''}"></label><label class="field grow">רישום עד<input type="date" id="eli" value="${r.license_until || ''}"></label></div>
      <button class="btn ghost block" id="esv">שמירה</button></div></details>` : ''}
    <button class="btn ghost block" id="rep">${icon('alert', 18)} דיווח תקלה</button>`;
  const again = async () => { await flush().catch(() => {}); const { data } = await sb.from('equipment').select('*').eq('id', r.id).single(); renderDrone(el, data || r, ctx); };
  $$('[data-z]', el).forEach(i => i.onclick = () => zoom(i.dataset.z, 'טיפול'));
  $('#svc').onclick = () => serviceSheet(r, C, again);
  $$('[data-rc]', el).forEach(b => b.onclick = () => serviceSheet(r, C, again, { kind: 'component', comp: b.dataset.rc }));
  $('#rep').onclick = () => issueSheet(r, ctx, again);
  $$('[data-fix]', el).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
    await enqueue({ kind: 'update', table: 'issues', rowId: b.dataset.fix, patch: { status: 'closed', resolution: 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() } });
    const i = (ctx.iss || []).find(x => x.id === b.dataset.fix); if (i) i.status = 'closed'; toast('התקלה נסגרה'); again(); });
  ['#cadd', '#cadd2'].forEach(k => { const b = $(k); if (b) b.onclick = () => compSheet(r, null, again); });
  $$('[data-c]', el).forEach(b => b.onclick = () => M && compSheet(r, C.find(c => c.id === b.dataset.c), again));
  ['#badd', '#badd2'].forEach(k => { const b = $(k); if (b) b.onclick = () => batSheet(r, null, B, again); });
  $$('[data-b]', el).forEach(b => b.onclick = () => M && batSheet(r, B.find(x => x.id === b.dataset.b), B, again, batCycles(B.find(x => x.id === b.dataset.b))));
  $$('[data-h]', el).forEach(b => b.onclick = async () => { await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch: { health: b.dataset.h, health_date: isoDay() } }); toast(`${r.name}: ${HEALTH[b.dataset.h][0]}`); again(); });
  const es = $('#esv'); if (es) es.onclick = async () => { await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch: { insurance_until: $('#ein').value || null, license_until: $('#eli').value || null } }); toast('נשמר'); again(); };
}

// רישום טיפול: סוג (ברירת מחדל תקופתי), מה נעשה בתגיות, החלפת רכיב עם מספר סידורי חדש, תמונה
function serviceSheet(r, C, done, pre = {}) {
  let kind = pre.kind || 'periodic', file = null, comp = pre.comp || null; const tags = new Set();
  sheet(`<h3>רישום טיפול · ${esc(r.name)}</h3>
    <div class="chips">${Object.entries(SK).map(([k, t]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
    <div class="chips" id="stg">${STAGS.map(t => `<button type="button" class="chip" data-t="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
    <div id="scomp" ${kind === 'component' ? '' : 'hidden'}>${C.length ? `<div class="field">איזה רכיב<div class="chips">${C.map(c => `<button type="button" class="chip" data-cp="${c.id}" aria-pressed="${c.id === comp}">${esc(CK[c.kind])}${c.position ? ' ' + esc(c.position) : ''}</button>`).join('')}</div></div>` : ''}
      <div class="row"><label class="field grow">${C.length ? 'מספר סידורי חדש' : 'רכיב חדש — מספר סידורי'}<input id="sns" placeholder="לא חובה"></label>${C.length ? '' : `<label class="field grow">סוג<select id="snk">${Object.entries(CK).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>`}</div></div>
    <textarea id="sb" rows="2" placeholder="מה נעשה (לא חובה)"></textarea>
    <div class="row"><label class="field grow">תאריך<input type="date" id="sd" value="${isoDay()}" max="${isoDay()}"></label>
      <label class="btn ghost grow sph">${icon('photo', 18)} <span id="spn">תמונה</span><input type="file" accept="image/*" capture="environment" id="sf" hidden></label></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="sgo">שמירת הטיפול</button></div>`, (s, close) => {
    $$('[data-k]', s).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#scomp', s).hidden = kind !== 'component'; });
    $$('[data-t]', s).forEach(b => b.onclick = () => { const t = b.dataset.t; tags.has(t) ? tags.delete(t) : tags.add(t); b.setAttribute('aria-pressed', tags.has(t)); });
    $$('[data-cp]', s).forEach(b => b.onclick = () => { comp = b.dataset.cp; $$('[data-cp]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#sns', s).focus(); });
    $('#sf', s).onchange = e => { file = e.target.files[0] || null; $('#spn', s).textContent = file ? 'צולם ✓' : 'תמונה'; };
    $('#sgo', s).onclick = async () => {
      const go = $('#sgo', s); if (go.disabled) return;
      const sn = $('#sns', s)?.value.trim() || null, day = $('#sd', s).value || isoDay();
      if (kind === 'component' && C.length && !comp) return toast('איזה רכיב הוחלף?');
      go.disabled = true;
      const id = uid(); let photo_path = null;
      if (file) { const { shrink } = await import('../lib/store.js'); photo_path = `${state.user.id}/service/${id}.jpg`; await enqueue({ kind: 'file', path: photo_path, blob: await shrink(file, 1800, 0.8), type: 'image/jpeg' }); }
      const old = C.find(c => c.id === comp);
      const body = [[...tags].join(', '), old ? `הוחלף ${CK[old.kind]}${old.position ? ' ' + old.position : ''}${old.serial ? ` (${old.serial}→${sn || '?'})` : sn ? ` → ${sn}` : ''}` : '', $('#sb', s).value.trim()].filter(Boolean).join(' · ') || null;
      await enqueue({ kind: 'insert', table: 'equipment_services', row: { id, equipment_id: r.id, kind, body, done_on: day, by_user: state.user.id, photo_path } });
      if (kind === 'component') {
        if (old) await enqueue({ kind: 'update', table: 'equipment_components', rowId: old.id, patch: { removed_on: day } });
        if (old || sn) await enqueue({ kind: 'insert', table: 'equipment_components', row: { id: uid(), drone_id: r.id, kind: old?.kind || $('#snk', s)?.value || 'other', position: old?.position || null, serial: sn, installed_on: day, replace_hours: old?.replace_hours ?? null, replace_cycles: old?.replace_cycles ?? null } });
      }
      close(); toast('הטיפול נרשם'); done();
    };
  });
}
function compSheet(r, c, done) {
  sheet(`<h3>${c ? 'רכיב' : 'רכיב חדש'}</h3>
    <div class="row"><label class="field grow">סוג<select id="ck">${Object.entries(CK).map(([k, t]) => `<option value="${k}" ${c?.kind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="field grow">מיקום<input id="cpo" value="${esc(c?.position || '')}" placeholder="למשל M1"></label></div>
    <label class="field">מספר סידורי<input id="cse" value="${esc(c?.serial || '')}"></label>
    <div class="row"><label class="field grow">הותקן<input type="date" id="cin" value="${c?.installed_on || isoDay()}"></label><label class="field grow">שעות שכבר היו עליו<input type="number" inputmode="decimal" id="cbm" value="${c ? Math.round((c.base_minutes || 0) / 6) / 10 : ''}" placeholder="0"></label></div>
    <div class="row"><label class="field grow">להחליף אחרי (שעות)<input type="number" inputmode="decimal" id="crh" value="${c?.replace_hours ?? ''}"></label><label class="field grow">או אחרי (טיסות)<input type="number" inputmode="numeric" id="crc" value="${c?.replace_cycles ?? ''}"></label></div>
    <div class="row-btns">${c ? '<button class="btn ghost" id="crm">הוסר</button>' : '<button class="btn ghost" data-close>ביטול</button>'}<button class="btn primary" id="cgo">שמירת הרכיב</button></div>`, (s, close) => {
    const val = () => ({ kind: $('#ck', s).value, position: $('#cpo', s).value.trim() || null, serial: $('#cse', s).value.trim() || null, installed_on: $('#cin', s).value || isoDay(),
      base_minutes: Math.round(Number($('#cbm', s).value || 0) * 60), replace_hours: $('#crh', s).value === '' ? null : +$('#crh', s).value, replace_cycles: $('#crc', s).value === '' ? null : +$('#crc', s).value });
    $('#cgo', s).onclick = async () => { const go = $('#cgo', s); if (go.disabled) return; go.disabled = true;
      await enqueue(c ? { kind: 'update', table: 'equipment_components', rowId: c.id, patch: val() } : { kind: 'insert', table: 'equipment_components', row: { id: uid(), drone_id: r.id, ...val() } }); close(); toast('נשמר'); done(); };
    const rm = $('#crm', s); if (rm) rm.onclick = async () => { if (!(await confirmBox('הרכיב הוסר מהכלי?', { ok: 'הוסר' }))) return;
      await enqueue({ kind: 'update', table: 'equipment_components', rowId: c.id, patch: { removed_on: isoDay() } }); toast('הוסר'); done(); };
  });
}
function batSheet(r, b, B, done, est) {
  sheet(`<h3>${b ? esc(b.name) : 'סוללה חדשה'}</h3>
    <div class="row"><label class="field grow">שם<input id="bn" value="${esc(b?.name || `סוללה ${B.length + 1} · ${r.name.split(' ')[0]}`)}"></label><label class="field grow">מספר סידורי<input id="bs" value="${esc(b?.serial || '')}"></label></div>
    <div class="row"><label class="field grow">מחזורים עכשיו<input type="number" inputmode="numeric" id="bc" value="${b ? est : 0}"></label><label class="field grow">להחליף אחרי<input type="number" inputmode="numeric" id="br" value="${b?.replace_cycles ?? 300}"></label></div>
    <div class="row-btns">${b ? '<button class="btn ghost" id="bx">הוצאה מהכלי</button>' : '<button class="btn ghost" data-close>ביטול</button>'}<button class="btn primary" id="bgo">שמירת הסוללה</button></div>`, (s, close) => {
    $('#bgo', s).onclick = async () => { const go = $('#bgo', s); if (go.disabled) return; go.disabled = true;
      const v = { name: $('#bn', s).value.trim() || 'סוללה', serial: $('#bs', s).value.trim() || null, cycles: +$('#bc', s).value || 0, cycles_at: isoDay(), replace_cycles: $('#br', s).value === '' ? null : +$('#br', s).value };
      if (b) await enqueue({ kind: 'update', table: 'equipment', rowId: b.id, patch: v });
      else { const { error } = await sb.from('equipment').insert({ kind: 'battery', drone_id: r.id, ...v }); if (error) { go.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); } }
      close(); toast('נשמר'); done(); };
    const x = $('#bx', s); if (x) x.onclick = async () => { await enqueue({ kind: 'update', table: 'equipment', rowId: b.id, patch: { drone_id: null } }); close(); toast('הסוללה הוצאה מהכלי'); done(); };
  });
}
function issueSheet(r, ctx, done) {
  sheet(`<h3>תקלה · ${esc(r.name)}</h3>
    <div class="row qtag">${['לא ממריא', 'רעידות', 'מנוע', 'סוללה', 'משאבה / ריסוס', 'צינור / דליפה', 'מצלמה', 'נזק פיזי'].map(t => `<button type="button" class="chip" data-q="${t}">${t}</button>`).join('')}</div>
    <textarea id="eb" rows="2" placeholder="מה התקלה?"></textarea>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="es">דיווח תקלה</button></div>`, (s, close) => {
    $$('[data-q]', s).forEach(b => b.onclick = () => { const t = $('#eb', s); t.value = t.value ? t.value + ', ' + b.dataset.q : b.dataset.q; t.focus(); });
    $('#es', s).onclick = async () => {
      const body = $('#eb', s).value.trim(); if (!body) return $('#eb', s).focus();
      if ($('#es', s).disabled) return; $('#es', s).disabled = true;
      const row = { id: uid(), equipment_id: r.id, kind: 'equipment', body: `${r.name}: ${body}`, opened_by: state.user.id, status: 'open', severity: 'normal' };
      (ctx.iss ||= []).unshift({ ...row, created_at: new Date().toISOString() }); await enqueue({ kind: 'insert', table: 'issues', row }); close(); toast('התקלה נרשמה'); done();
    };
  });
}
