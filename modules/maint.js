// אחזקת ציוד קרקע (db/176-177, מבנה.md גרסה 2): כרטיס כלי, טיפול לפי צ'ק-ליסט או "לפי צורך", היסטוריה, ואישור מנהל.
// נקרא מ-equipment.js בלבד: #/equipment/<id> (כרטיס) · #/equipment/<id>/service (טיפול). אישורים = מקטע במסך "ציוד".
// כתיבה: רק דרך התור (enqueue). הרמה, needs_approval, תקלות על ✗ וקרקוע על ✗ קריטי — בשרת (טריגרים ב-176).
import { sb, state, isManager, cache, enqueue, sheet, uid, $, $$, esc, toast, dm, isoDay, icon, goBack, haptic } from '../lib/core.js';
import { outbox } from '../lib/store.js';

export const GROUND = ['vehicle', 'trailer', 'pump', 'generator', 'tank', 'filter', 'heater', 'other'];
export const isGround = r => !!r && GROUND.includes(r.kind);
const canService = () => ['admin', 'ops_manager', 'crew_lead'].includes(state.profile?.role);
// אישור: מנהל, ולא על טיפול שהוא עצמו רשם (חוץ מ-admin). השרת מנקה אישור עצמי (db/176)
const canApprove = x => isManager() && (state.profile?.role === 'admin' || x.by_user !== state.user?.id);
// מנהל תפעול ומעלה רשאי לרשום מד נמוך מהקיים (תיקון טעות). השרת אוכף (db/176)
const senior = () => ['admin', 'ops_manager'].includes(state.profile?.role);
const LVL = { small: 'טיפול קטן', large: 'טיפול גדול', asneeded: 'טיפול לפי צורך' };
const HEALTH = { ok: ['תקין', 'ok'], warning: ['במעקב', 'warn'], grounded: ['לא כשיר', 'bad'], maintenance: ['בטיפול', 'warn'] };
const RES = { ok: '✓', fail: '✗', na: 'לא רלוונטי' };

// ---------- עזרים ----------
const daysTo = d => d ? Math.round((new Date(d + 'T12:00') - new Date(isoDay() + 'T12:00')) / 864e5) : null;
const span = n => n < 14 ? (n === 1 ? 'יום' : `${n} ימים`) : n < 60 ? (Math.round(n / 7) === 2 ? 'שבועיים' : `${Math.round(n / 7)} שבועות`) : Math.round(n / 30) === 2 ? 'חודשיים' : `${Math.round(n / 30)} חודשים`;
const dmy = d => d ? dm(d) + (d.slice(0, 4) !== isoDay().slice(0, 4) ? '.' + d.slice(2, 4) : '') : '';
// מספר / מזהה / מק"ט: מונו, משמאל לימין, מבודד
const num = s => `<bdi dir="ltr" class="mt-num">${esc(s)}</bdi>`;
// טקסט מעורב (שמן, מק"ט, יחידות): כל רצף לטיני או מספרי מבודד משמאל לימין
// (על הטקסט הגולמי, לפני esc; סוגריים נשארים בהקשר העברי כדי שלא יתהפכו)
const bidi = s => String(s ?? '').split(/([A-Za-z0-9][A-Za-z0-9.\-–/+×°,: ]*[A-Za-z0-9]|[A-Za-z0-9])/).map((p, i) => i % 2 ? `<bdi dir="ltr">${esc(p)}</bdi>` : esc(p)).join('');
const back = (href) => `<a class="back" href="${href}" data-gb aria-label="חזרה">${icon('back', 20)}</a>`;
const bindBack = (el, fb) => $$('[data-gb]', el).forEach(a => a.onclick = e => { e.preventDefault(); goBack(fb); });
const isVeh = r => ['vehicle'].includes(r.kind);

// סטטוס הטיפול הבא (מחושב בשרת: maint_due_on / maint_due_level / service_state)
export function dueOf(r, hasTpl = !!r.maint_due_on) {
  if (!hasTpl && !r.maint_due_on) return { t: LVL.asneeded, tone: '', sub: '' };
  if (!r.maint_due_on) return { t: 'עוד לא נרשם טיפול', tone: 'warn', sub: '' };
  const n = daysTo(r.maint_due_on), lvl = LVL[r.maint_due_level] || 'טיפול';
  const tone = r.service_state === 'overdue' || n <= 0 ? 'bad' : r.service_state === 'due' || n <= 30 ? 'warn' : 'ok';
  return { t: n < 0 ? `${lvl} באיחור של ${span(-n)}` : n === 0 ? `${lvl} היום` : `${lvl} בעוד ${span(n)}`, tone, sub: 'יעד ' + dmy(r.maint_due_on), n };
}
// שורה קטנה ברשימת הציוד (equipment.js)
export const maintSmall = r => isGround(r) && r.maint_due_on ? (d => `<small class="svc ${d.tone}">${icon('wrench', 13)} ${esc(d.t)}</small>`)(dueOf(r)) : '';

// טסט / רישוי / ביטוח
const expiry = r => [[isVeh(r) || r.kind === 'trailer' ? 'טסט' : 'רישוי', r.license_until], ['ביטוח', r.insurance_until]].filter(([, d]) => d)
  .map(([t, d]) => { const n = daysTo(d); return { t, d, n, tone: n < 0 ? 'bad' : n <= 30 ? 'warn' : 'ok' }; });

const css = () => { if ($('#mt-css')) return; const s = document.createElement('style'); s.id = 'mt-css'; s.textContent = `
.mt-num{font-family:var(--f-mono);direction:ltr;unicode-bidi:isolate}
.mt-hero{display:flex;flex-direction:column;gap:12px}
.mt-hero.ok{border-color:color-mix(in srgb,var(--ok) 40%,var(--line))} .mt-hero.warn{border-color:color-mix(in srgb,var(--warn) 55%,var(--line))} .mt-hero.bad{border-color:color-mix(in srgb,var(--bad) 55%,var(--line))}
.mt-due{display:flex;align-items:center;gap:10px} .mt-due b{font-size:1.15rem;display:block} .mt-due small{color:var(--muted);display:block}
.mt-due .mt-ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:var(--card2);color:var(--muted)}
.mt-due.ok .mt-ic{background:var(--okbg);color:var(--ok)} .mt-due.warn .mt-ic{background:var(--warnbg);color:var(--warn)} .mt-due.bad .mt-ic{background:var(--badbg);color:var(--bad)}
.mt-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mt-kv>div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 10px;min-width:0}
.mt-kv small{display:block;color:var(--muted);font-size:.78rem} .mt-kv b{display:block;font-size:.95rem;overflow-wrap:anywhere}
.mt-kv .warn b{color:var(--warn)} .mt-kv .bad b{color:var(--bad)}
.mt-it{display:flex;flex-direction:column;gap:8px;padding:12px}
.mt-it.fail{border-color:color-mix(in srgb,var(--bad) 55%,var(--line))} .mt-it.ok{border-color:color-mix(in srgb,var(--ok) 35%,var(--line))} .mt-it.na{opacity:.75}
.mt-h{display:flex;align-items:flex-start;gap:8px} .mt-h b{flex:1;font-size:1rem;line-height:1.3}
.mt-n{flex:none;min-width:26px;height:26px;border-radius:8px;background:var(--card2);display:grid;place-items:center;font:700 .8rem var(--f-mono)}
.mt-act{font-size:.92rem;line-height:1.45;color:var(--ink)}
.mt-mat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.mt-mat>div{background:var(--card2);border-radius:10px;padding:6px 9px;min-width:0} .mt-mat small{display:block;color:var(--muted);font-size:.74rem} .mt-mat b{display:block;font-size:.88rem;font-weight:600;overflow-wrap:anywhere}
.mt-meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:.84rem;color:var(--muted)} .mt-meta b{color:var(--ink);font-weight:600}
.mt-res{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.mt-res button{min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);font:inherit;font-weight:600;cursor:pointer;color:var(--ink)}
.mt-res button[data-r=ok][aria-pressed=true]{background:var(--okbg);border-color:var(--ok);color:var(--ok)}
.mt-res button[data-r=fail][aria-pressed=true]{background:var(--badbg);border-color:var(--bad);color:var(--bad)}
.mt-res button[data-r=na][aria-pressed=true]{background:var(--card2);border-color:var(--muted)}
#ms [aria-invalid=true],#ms [aria-invalid=true] button{border-color:var(--bad)!important}
.mt-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mt-two button{min-height:56px;border-radius:14px;border:1px solid var(--line);background:var(--card);font:inherit;cursor:pointer;color:var(--ink);padding:6px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.mt-two button small{color:var(--muted);font-size:.78rem} .mt-two button[aria-pressed=true]{background:var(--limebg);border-color:var(--lime);font-weight:700}
.mt-part{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
.mt-part .seg{align-self:stretch} .mt-part .seg button{flex:1;min-height:40px;font-size:.88rem}
.mt-prog{font:700 .9rem var(--f-mono);direction:ltr;unicode-bidi:isolate;color:var(--muted)}
.mt-spec{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);gap:4px 8px;font-size:.84rem;align-items:start}
.mt-spec .h{color:var(--muted);font-size:.76rem} .mt-spec b{font-weight:600}
.mt-sv-r{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)} .mt-sv-r:last-child{border-bottom:0}
.mt-sv-r .mt-rs{flex:none;min-width:24px;font-weight:800} .mt-sv-r .mt-rs.fail{color:var(--bad)} .mt-sv-r .mt-rs.ok{color:var(--ok)} .mt-sv-r .mt-rs.na{color:var(--muted)}
.mt-x{flex:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--muted)}
`; document.head.appendChild(s); };

// ---------- נתונים ----------
async function loadTpl(model) {
  if (!model) return [];
  const k = 'maint-tpl:' + model;
  try {
    const { data, error } = await sb.from('maint_templates').select('*, maint_template_items(*)').eq('model', model).eq('active', true);
    if (error) throw error;
    const T = (data || []).map(t => ({ ...t, maint_template_items: (t.maint_template_items || []).slice().sort((a, b) => a.sort - b.sort) }));
    cache.set(k, T).catch(() => {}); return T;
  } catch { return (await cache.get(k).catch(() => null)) || []; }
}
// רישומים שעוד בתור (בלי קליטה): מוצגים בהיסטוריה עם "ממתין לשליחה"
async function queued(eid) {
  try { return (await outbox.all()).filter(x => x.kind === 'insert' && x.table === 'equipment_services' && (!eid || x.row?.equipment_id === eid)).map(x => ({ ...x.row, __q: true })); }
  catch { return []; }
}
const SVSEL = '*, profiles:by_user(full_name), appr:approved_by(full_name)';
const partsTxt = p => { const a = (p || []).filter(x => x.status !== 'to_order').length, b = (p || []).filter(x => x.status === 'to_order').length;
  return [a ? `${a} הוחלפו` : '', b ? `${b} להזמין` : ''].filter(Boolean).join(' · '); };
const svSum = x => { const I = x.items || [], f = I.filter(i => i.result === 'fail').length, ok = I.filter(i => i.result === 'ok').length;
  return [I.length ? `${ok}/${I.length} ✓` : '', f ? `${f} ✗` : '', partsTxt(x.parts)].filter(Boolean).join(' · '); };
const svPill = x => x.__q ? '<span class="pill">ממתין לשליחה</span>' : x.needs_approval && !x.approved_at ? '<span class="pill warn">ממתין לאישור</span>' : x.approved_at ? '<span class="pill ok">אושר</span>' : '';

// ---------- כרטיס כלי ----------
export async function renderMaintCard(el, r, ctx = {}) {
  css();
  const M = isManager(), today = isoDay(), rows = ctx.rows || [];
  el.innerHTML = `<header class="phead">${back('#/equipment')}<h1 class="grow">${esc(r.name)}</h1>${r.code ? `<span class="pill">${num(r.code)}</span>` : ''}</header><div id="mc" class="stack lg"><div class="skel tall"></div><div class="skel"></div></div>`;
  bindBack(el, '#/equipment');
  let T = [], SV = [];
  const ck = 'maint:' + r.id;
  try {
    const [t, { data, error }] = await Promise.all([loadTpl(r.model), sb.from('equipment_services').select(SVSEL).eq('equipment_id', r.id).order('done_on', { ascending: false }).order('created_at', { ascending: false }).limit(40)]);
    if (error) throw error; T = t; SV = data || []; cache.set(ck, { SV }).catch(() => {});
  } catch { T = await loadTpl(r.model); ({ SV = [] } = (await cache.get(ck).catch(() => null)) || {}); }
  const Q = await queued(r.id), ids = new Set(SV.map(x => x.id));
  const H = [...Q.filter(x => !ids.has(x.id)), ...SV];
  const hasTpl = T.length > 0, h = HEALTH[r.health] || HEALTH.ok;
  const lastAny = H.find(x => x.done_on);
  // בלי תבנית (לפי צורך): הכותרת = הטיפול האחרון, לא חזרה על שם הכפתור
  const d = !hasTpl && !r.maint_due_on ? { t: lastAny ? `טיפול אחרון לפני ${span(Math.max(1, -daysTo(lastAny.done_on)))}` : 'עוד לא נרשם טיפול', tone: '', sub: lastAny ? dmy(lastAny.done_on) : '' } : dueOf(r, hasTpl);
  const parent = rows.find(x => x.id === r.parent_id), kids = rows.filter(x => x.parent_id === r.id);
  const iss = (ctx.iss || []).filter(i => i.equipment_id === r.id && i.status === 'open');
  const ex = expiry(r);
  const last = H.find(x => x.level === 'small' || x.level === 'large');
  const meter = isVeh(r) ? (r.odometer_km != null ? [`ק״מ`, `${Number(r.odometer_km).toLocaleString('en-US')}`, r.odometer_at] : null) : (r.hour_meter != null ? ['שעות מנוע', String(r.hour_meter), r.hour_meter_at] : null);
  const kv = [
    r.code && ['מספר', num(r.code)],
    r.model && ['דגם', bidi(r.model)],
    parent && ['מותקן על', `<a href="#/equipment/${parent.id}" style="color:inherit">${esc(parent.name)} ›</a>`],
    r.plate && ['רישוי', num(r.plate)],
    meter && [meter[0], `${num(meter[1])}${meter[2] ? ` <small>${dm(meter[2])}</small>` : ''}`],
    ...ex.map(x => [x.t + ' עד', `${num(dmy(x.d))}`, x.tone]),
  ].filter(Boolean);
  $('#mc').innerHTML = `
    <div class="card mt-hero ${d.tone}">
      <div class="mt-due ${d.tone}"><span class="mt-ic">${icon('wrench', 20)}</span><span class="grow"><b>${esc(d.t)}</b>${d.sub || (hasTpl && last) ? `<small>${esc([d.sub, hasTpl && last ? 'אחרון ' + dmy(last.done_on) : ''].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="pill ${h[1]}">${h[0]}</span></div>
      ${r.health !== 'ok' && r.health_note ? `<div class="small muted">${esc(r.health_note)}</div>` : ''}
      ${canService() ? (hasTpl ? `<button class="btn primary block" id="mgo">${icon('wrench', 18)} התחל טיפול</button>` : `<button class="btn primary block" id="mgo">${icon('wrench', 18)} טיפול לפי צורך</button>`) : ''}
    </div>
    ${kv.length ? `<div class="mt-kv">${kv.map(([k, v, t]) => `<div class="${t || ''}"><small>${k}</small><b>${v}</b></div>`).join('')}</div>` : ''}
    ${ex.some(x => x.tone !== 'ok') ? `<div class="alist">${ex.filter(x => x.tone !== 'ok').map(x => `<div class="arow ${x.tone}"><span class="aic">${icon('shield', 18)}</span><span class="grow"><b>${x.n < 0 ? `${x.t} פג` : `${x.t} בעוד ${span(x.n)}`}</b><small>${num(dmy(x.d))}</small></span></div>`).join('')}</div>` : ''}
    ${kids.length ? `<section><h3 class="sh">מותקן עליו</h3><div class="list">${kids.map(k => `<a class="lrow slim" href="#/equipment/${k.id}"><span class="grow"><b>${esc(k.name)}</b>${maintSmall(k)}</span><span class="chev">${icon('chev', 16)}</span></a>`).join('')}</div></section>` : ''}
    ${iss.length ? `<section><h3 class="sh">תקלות פתוחות</h3><div class="list">${iss.map(i => `<div class="lrow" role="button" tabindex="0" data-iss="${i.id}"><span class="aic warn">${icon('alert', 16)}</span><span class="grow"><b>${esc(String(i.body || '').replace(r.name + ': ', '').replace(r.name + ' · ', ''))}</b><small>${dm(i.created_at.slice(0, 10))}</small></span></div>`).join('')}</div></section>` : ''}
    <section><div class="sh-row"><h3 class="sh">היסטוריית טיפולים</h3>${H.length ? `<span class="count">${H.length}</span>` : ''}</div>
      ${H.length ? `<div class="list">${H.map(x => `<button type="button" class="lrow" data-sv="${x.id}"><span class="mic">${icon('wrench', 18)}</span><span class="grow"><b>${LVL[x.level] || 'טיפול'} · ${dmy(x.done_on)}</b><small>${esc([x.profiles?.full_name, svSum(x)].filter(Boolean).join(' · ') || (x.body || '').slice(0, 80))}</small></span>${svPill(x)}</button>`).join('')}</div>`
        : '<div class="empty-line">עוד לא נרשם טיפול</div>'}</section>
    ${M ? `<details class="fold"><summary><span class="sh">מצב ותוקף</span></summary><div class="stack">
      <div class="chips">${Object.entries(HEALTH).map(([k, v]) => `<button class="chip" data-h="${k}" aria-pressed="${r.health === k}">${v[0]}</button>`).join('')}</div>
      <div class="row"><label class="field grow">${isVeh(r) || r.kind === 'trailer' ? 'טסט עד' : 'רישוי עד'}<input type="date" id="eli" value="${r.license_until || ''}"></label><label class="field grow">ביטוח עד<input type="date" id="ein" value="${r.insurance_until || ''}"></label></div>
      <button class="btn ghost block" id="esv">שמירה</button></div></details>` : ''}
    <button class="btn ghost block" id="mrep">${icon('alert', 18)} דיווח תקלה</button>`;
  const again = async () => { let data = null; try { ({ data } = await sb.from('equipment').select('*').eq('id', r.id).maybeSingle()); } catch { /* */ } renderMaintCard(el, data || r, ctx); };
  const go = $('#mgo'); if (go) go.onclick = () => { location.hash = `#/equipment/${r.id}/service`; };
  $$('[data-sv]', el).forEach(b => b.onclick = () => openService(H.find(x => x.id === b.dataset.sv), r, { after: again }));
  $$('[data-iss]', el).forEach(b => b.onclick = () => { const i = iss.find(x => x.id === b.dataset.iss); import('../lib/issue.js').then(m => m.openIssue(i, { here: 'eq:' + r.id, after: again })); });
  $$('[data-h]', el).forEach(b => b.onclick = async () => { r.health = b.dataset.h; await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch: { health: r.health, health_date: today } }); toast(`${r.name}: ${HEALTH[r.health][0]}`); renderMaintCard(el, r, ctx); });
  const es = $('#esv'); if (es) es.onclick = async () => { if (es.disabled) return; es.disabled = true;
    const patch = { license_until: $('#eli').value || null, insurance_until: $('#ein').value || null }; Object.assign(r, patch);
    await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch }); toast('נשמר'); renderMaintCard(el, r, ctx); };
  $('#mrep').onclick = () => sheet(`<h3>תקלה · ${esc(r.name)}</h3>
    <textarea id="eb" rows="3" placeholder="מה התקלה?"></textarea>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="es">דיווח תקלה</button></div>`, (s, close) => {
    setTimeout(() => $('#eb', s)?.focus(), 80);
    $('#es', s).onclick = async () => { const body = $('#eb', s).value.trim(); if (!body) return $('#eb', s).focus();
      if ($('#es', s).disabled) return; $('#es', s).disabled = true;
      const row = { id: uid(), equipment_id: r.id, kind: 'equipment', body: `${r.name}: ${body}`, opened_by: state.user.id, status: 'open', severity: 'normal' };
      (ctx.iss ||= []).unshift({ ...row, created_at: new Date().toISOString() }); await enqueue({ kind: 'insert', table: 'issues', row }); close(); toast('התקלה נרשמה'); renderMaintCard(el, r, ctx); };
  });
}

// ---------- רישום טיפול (פירוט + אישור מנהל) ----------
export function openService(x, r, { after } = {}) {
  if (!x) return; css();
  const I = x.items || [], P = x.parts || [], M = canApprove(x), wait = x.needs_approval && !x.approved_at && !x.__q;
  const meter = x.odometer_km != null ? `ק״מ ${num(x.odometer_km)}` : x.hour_meter != null ? `שעות מנוע ${num(x.hour_meter)}` : '';
  sheet(`<div class="row"><h3 class="grow">${LVL[x.level] || 'טיפול'} · ${esc(r?.name || '')}</h3>${svPill(x)}</div>
    <div class="small muted">${[dmy(x.done_on), esc(x.profiles?.full_name || ''), meter, x.oil_used ? 'שמן: ' + (x.oil_used === 'mfr' ? 'יצרן' : 'שדית') : ''].filter(Boolean).join(' · ')}</div>
    ${x.approved_at ? `<div class="small muted">אושר ע״י ${esc(x.appr?.full_name || '')} · ${dm(x.approved_at.slice(0, 10))}</div>` : ''}
    ${I.length ? `<div class="card">${I.map(i => `<div class="mt-sv-r"><span class="mt-rs ${i.result || ''}">${i.result === 'na' ? '—' : RES[i.result] || '·'}</span><span class="grow"><b>${bidi(i.assembly)}</b>${i.value ? ` <small>${bidi(i.need_value || '')}: ${num(i.value)}</small>` : ''}${i.note ? `<small class="muted" style="display:block">${esc(i.note)}</small>` : ''}</span></div>`).join('')}</div>` : ''}
    ${x.body && !I.length ? `<div class="note pre">${esc(x.body)}</div>` : ''}
    ${P.length ? `<div class="field">חלקים<div class="list">${P.map(p => `<div class="lrow slim"><span class="grow"><b>${bidi(p.name)}</b>${p.part_no && p.part_no !== p.name ? `<small>${bidi(p.part_no)}</small>` : ''}</span><span class="pill ${p.status === 'to_order' ? 'warn' : 'ok'}">${p.status === 'to_order' ? 'להזמין' : 'הוחלף'}</span></div>`).join('')}</div></div>` : ''}
    ${x.defects ? `<div class="field">ליקויים<div class="note pre">${esc(x.defects)}</div></div>` : ''}
    ${wait && isManager() && !M ? '<div class="small muted">ממתין לאישור של מנהל אחר</div>' : ''}
    <div class="row-btns"><button class="btn ghost" data-close>סגירה</button>${wait && M ? `<button class="btn primary" id="sapv">${icon('check', 18)} אישור</button>` : ''}</div>`, (s, close) => {
    const b = $('#sapv', s); if (b) b.onclick = async () => { if (b.disabled) return; b.disabled = true; await approve(x, r); close(); after?.(); };
  });
}
// אישור: approved_by/approved_at (השרת מאמת מנהל). חלקים להזמנה → בקשת רכש בתהליך הקיים (כמו purchase.js)
async function approve(x, r) {
  await enqueue({ kind: 'update', table: 'equipment_services', rowId: x.id, patch: { approved_by: state.user.id, approved_at: new Date().toISOString() } });
  x.approved_at = new Date().toISOString(); x.approved_by = state.user.id;
  const order = (x.parts || []).filter(p => p.status === 'to_order');
  if (order.length) {
    const id = uid(), name = r?.name || 'ציוד';
    await enqueue({ kind: 'insert', table: 'purchase_requests', row: { id, title: `חלפים · ${name}`, requested_by: state.user.id, project_id: null, needed_by: null, notes: `${LVL[x.level] || 'טיפול'} ${dmy(x.done_on)}${r?.code ? ' · ' + r.code : ''}` } });
    for (const p of order) await enqueue({ kind: 'insert', table: 'purchase_lines', row: { id: uid(), request_id: id, catalog_monday_id: p.catalog_item_id || null, name: [p.name, p.part_no && p.part_no !== p.name ? p.part_no : ''].filter(Boolean).join(' · ').slice(0, 200), qty: Number(p.qty) || 1, unit: null } });
  }
  haptic('success'); toast(order.length ? 'אושר · נפתחה בקשת רכש' : 'אושר', 2400, 'success');
}

// ---------- אישורים (מקטע במסך "ציוד", מנהל) ----------
export async function loadPending() {
  if (!isManager()) return [];
  try {
    const { data, error } = await sb.from('equipment_services').select(SVSEL).eq('needs_approval', true).is('approved_at', null).order('created_at').limit(50);
    if (error) throw error; return data || [];
  } catch { return []; }
}
export const pendingSection = (P, rows) => P.length ? `<section><div class="sh-row"><h3 class="sh">טיפולים לאישור</h3><span class="count">${P.length}</span></div><div class="list">${P.map(x => { const e = rows.find(r => r.id === x.equipment_id);
  return `<button type="button" class="lrow" data-apv="${x.id}"><span class="aic warn">${icon('wrench', 16)}</span><span class="grow"><b>${esc(e?.name || '')} · ${LVL[x.level] || 'טיפול'}</b><small>${esc([dmy(x.done_on), x.profiles?.full_name, partsTxt(x.parts)].filter(Boolean).join(' · '))}</small></span><span class="chev">${icon('chev', 16)}</span></button>`; }).join('')}</div></section>` : '';

// ---------- מסך הטיפול ----------
export async function renderMaintService(el, r) {
  css();
  const fb = '#/equipment/' + r.id;
  el.innerHTML = `<header class="phead">${back(fb)}<h1 class="grow">${esc(r.name)}</h1><span class="mt-prog" id="mprog"></span></header><div id="ms" class="stack lg"><div class="skel tall"></div></div>`;
  bindBack(el, fb);
  if (!canService()) { $('#ms').innerHTML = `<div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>טיפול נרשם ע״י ראש צוות ומעלה</b></span></div>`; return; }
  const T = await loadTpl(r.model);
  const by = Object.fromEntries(T.map(t => [t.level, t]));
  const DK = 'edrone-maint:' + r.id;
  let D = null; try { D = JSON.parse(localStorage.getItem(DK) || 'null'); } catch { /* */ }
  const auto = T.length ? (by[r.maint_due_level] ? r.maint_due_level : by.large ? 'large' : 'small') : 'asneeded';
  if (!D || (D.level !== 'asneeded' && !by[D.level])) D = null;
  D ||= { level: auto, res: {}, oil: null, parts: null, defects: '', hm: '', day: isoDay(), body: '' };
  const save = () => { try { localStorage.setItem(DK, JSON.stringify(D)); } catch { /* */ } };
  const tpl = () => by[D.level] || null;
  const items = () => tpl()?.maint_template_items || [];
  // חלקים מהתבנית: כל שורה עם מק"ט, מסומנת "הוחלף". מסירים / מסמנים "להזמין"
  const seedParts = () => items().filter(i => i.part_no).map(i => ({ k: 's' + i.sort, name: i.assembly, part_no: i.part_no, qty: 1, status: 'replaced', catalog_item_id: i.catalog_item_id || null }));
  if (!D.parts) D.parts = seedParts();
  const oilRows = () => items().some(i => i.mfr_material || i.supplier_material);
  const done = () => items().filter(i => D.res[i.sort]?.r).length;
  const anyFail = () => items().some(i => D.res[i.sort]?.r === 'fail');
  const prog = () => { const p = $('#mprog'); if (p) p.textContent = tpl() ? `${done()}/${items().length}` : ''; };

  const itemHtml = i => { const x = D.res[i.sort] || {}, mat = i.mfr_material || i.supplier_material || i.mfr_qty || i.supplier_qty;
    const ref = i.manual_ref ? (/^https?:/.test(i.manual_ref) ? `<a href="${esc(i.manual_ref)}" target="_blank" rel="noopener">${icon('book', 14)} ספר יצרן</a>` : `<a href="#/kb/${esc(i.manual_ref)}">${icon('book', 14)} ספר יצרן</a>`) : '';
    return `<div class="card mt-it ${x.r || ''}" data-it="${i.sort}">
      <div class="mt-h"><span class="mt-n">${i.sort}</span><b>${bidi(i.assembly)}</b>${i.critical ? '<span class="pill bad">קריטי</span>' : ''}</div>
      <div class="mt-act">${bidi(i.action)}</div>
      ${mat ? `<div class="mt-mat"><div><small>יצרן</small><b>${bidi([i.mfr_material, i.mfr_qty].filter(Boolean).join(' · ') || '—')}</b></div><div><small>שדית</small><b>${bidi([i.supplier_material, i.supplier_qty].filter(Boolean).join(' · ') || '—')}</b></div></div>` : ''}
      ${i.torque_nm != null || i.part_no || ref ? `<div class="mt-meta">${i.torque_nm != null ? `<span>מומנט <b>${num(i.torque_nm + ' Nm')}</b></span>` : ''}${i.part_no ? `<span>מק״ט <b>${bidi(i.part_no)}</b></span>` : ''}${ref}</div>` : ''}
      <div class="mt-res" role="group" aria-label="${esc(i.assembly)}">${Object.entries(RES).map(([k, t]) => `<button type="button" data-r="${k}" aria-pressed="${x.r === k}">${t}</button>`).join('')}</div>
      ${i.need_value ? `<label class="field">${bidi(i.need_value)}<input type="text" inputmode="decimal" dir="ltr" data-v value="${esc(x.v || '')}"></label>` : ''}
      <textarea rows="2" data-n placeholder="מה לא תקין?" ${x.r === 'fail' ? '' : 'hidden'}>${esc(x.n || '')}</textarea>
    </div>`; };
  const partHtml = (p, n) => `<div class="card mt-part" data-p="${n}">
      <div class="row">${p.k ? `<span class="grow"><b>${bidi(p.name)}</b>${p.part_no ? `<small class="muted" style="display:block">${bidi(p.part_no)}</small>` : ''}</span>` : `<input class="grow" type="text" data-pn value="${esc(p.name)}" placeholder="איזה חלק">`}
        <button type="button" class="mt-x" data-px aria-label="הסרה">${icon('x', 18)}</button></div>
      <div class="seg" role="group">${[['replaced', 'הוחלף'], ['to_order', 'צריך להזמין']].map(([k, t]) => `<button type="button" data-ps="${k}" aria-pressed="${p.status === k}">${t}</button>`).join('')}</div>
    </div>`;
  const meterLbl = isVeh(r) ? 'ק״מ במד' : 'שעות מנוע', meterNow = isVeh(r) ? r.odometer_km : r.hour_meter;
  const draw = () => {
    const t = tpl();
    $('#ms').innerHTML = `
      ${T.length ? `<div class="seg" role="group" aria-label="רמת טיפול">${['small', 'large'].filter(k => by[k]).map(k => `<button type="button" data-lv="${k}" aria-pressed="${D.level === k}" style="flex:1;min-height:40px">${LVL[k]}</button>`).join('')}</div>` : `<div class="card"><b>${LVL.asneeded}</b></div>`}
      ${t?.safety_note ? `<div class="must"><div class="mh">${icon('alert', 18)} <b>בטיחות</b></div><div class="mb">${bidi(t.safety_note)}</div></div>` : ''}
      <div class="row"><label class="field grow">${meterLbl}<input type="number" inputmode="decimal" dir="ltr" id="mhm" value="${esc(D.hm)}" placeholder="${meterNow != null ? esc(meterNow) : ''}"></label>
        <label class="field grow">תאריך<input type="date" id="mday" value="${D.day}" max="${isoDay()}"></label></div>
      ${t ? `<section class="stack"><div class="sh-row"><h3 class="sh">צ׳ק-ליסט</h3><span class="count">${items().length}</span></div>${items().map(itemHtml).join('')}</section>` : `<label class="field">מה נעשה<textarea id="mbody" rows="3">${esc(D.body)}</textarea></label>`}
      ${t && oilRows() ? `<section class="stack"><h3 class="sh">איזה שמן הכנסת?</h3><div class="mt-two" id="moil">${[['mfr', 'יצרן'], ['supplier', 'שדית']].map(([k, l]) => `<button type="button" data-oil="${k}" aria-pressed="${D.oil === k}"><b>${l}</b></button>`).join('')}</div></section>` : ''}
      <section class="stack"><div class="sh-row"><h3 class="sh">חלקים</h3><button type="button" class="more" id="madd">${icon('plus', 16)} חלק</button></div>
        <div class="stack" id="mparts" style="gap:8px">${D.parts.map(partHtml).join('')}</div></section>
      <label class="field">ליקויים<textarea id="mdef" rows="2" placeholder="לא חובה">${esc(D.defects)}</textarea><small id="mdefh" ${anyFail() ? '' : 'hidden'}>ליקוי שסימנתם ✗ כבר נפתח כתקלה — כאן רק ממצאים נוספים</small></label>
      <button class="btn primary block" id="mfin">${icon('check', 18)} סיום</button>`;
    $('#mhm').min = !senior() && meterNow != null ? meterNow : 0;
    prog(); bind();
  };
  const bind = () => {
    $$('[data-lv]').forEach(b => b.onclick = () => { if (D.level === b.dataset.lv) return; D.level = b.dataset.lv; D.res = {}; D.parts = seedParts(); save(); draw(); });
    $$('[data-it]').forEach(c => { const k = c.dataset.it;
      $$('[data-r]', c).forEach(b => b.onclick = () => { const x = (D.res[k] ||= {}); x.r = x.r === b.dataset.r ? null : b.dataset.r; save();
        c.className = `card mt-it ${x.r || ''}`; $$('[data-r]', c).forEach(y => y.setAttribute('aria-pressed', x.r === y.dataset.r));
        const n = $('[data-n]', c); n.hidden = x.r !== 'fail'; const h = $('#mdefh'); if (h) h.hidden = !anyFail(); if (x.r === 'fail') { n.focus(); haptic('warn'); } else haptic('tap');
        $('[data-r]', c).closest('.mt-res').removeAttribute('aria-invalid'); prog(); });
      const v = $('[data-v]', c); if (v) v.oninput = () => { (D.res[k] ||= {}).v = v.value.trim(); v.removeAttribute('aria-invalid'); save(); };
      const n = $('[data-n]', c); n.oninput = () => { (D.res[k] ||= {}).n = n.value; n.removeAttribute('aria-invalid'); save(); };
    });
    $$('[data-oil]').forEach(b => b.onclick = () => { D.oil = b.dataset.oil; save(); $$('[data-oil]').forEach(y => y.setAttribute('aria-pressed', y === b)); $('#moil').removeAttribute('aria-invalid'); });
    const parts = () => { $('#mparts').innerHTML = D.parts.map(partHtml).join(''); bindParts(); };
    const bindParts = () => $$('[data-p]').forEach(c => { const p = D.parts[+c.dataset.p];
      $$('[data-ps]', c).forEach(b => b.onclick = () => { p.status = b.dataset.ps; save(); $$('[data-ps]', c).forEach(y => y.setAttribute('aria-pressed', y === b)); });
      $('[data-px]', c).onclick = () => { D.parts.splice(+c.dataset.p, 1); save(); parts(); };
      const pn = $('[data-pn]', c); if (pn) pn.oninput = () => { p.name = pn.value; save(); }; });
    bindParts();
    $('#madd').onclick = () => { D.parts.push({ name: '', part_no: null, qty: 1, status: 'replaced', catalog_item_id: null }); save(); parts(); $$('[data-pn]').pop()?.focus(); };
    $('#mhm').oninput = e => { D.hm = e.target.value; e.target.removeAttribute('aria-invalid'); save(); };
    $('#mday').onchange = e => { D.day = e.target.value || isoDay(); e.target.removeAttribute('aria-invalid'); save(); };
    $('#mdef').oninput = e => { D.defects = e.target.value; save(); };
    const mb = $('#mbody'); if (mb) mb.oninput = () => { D.body = mb.value; mb.removeAttribute('aria-invalid'); save(); };
    $('#mfin').onclick = finish;
  };
  const bad = (node, msg) => { node?.setAttribute('aria-invalid', 'true'); node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => node?.focus?.(), 300); haptic('warn'); toast(msg); };
  async function finish() {
    const fin = $('#mfin'); if (fin.disabled) return;
    const t = tpl(), I = items();
    if (t) {
      const miss = I.filter(i => !D.res[i.sort]?.r);
      if (miss.length) { const c = $(`[data-it="${miss[0].sort}"]`); return bad($('.mt-res', c), miss.length === 1 ? 'נשארה שורה אחת' : `נשארו ${miss.length} שורות`); }
      const nf = I.find(i => D.res[i.sort].r === 'fail' && !(D.res[i.sort].n || '').trim());
      if (nf) return bad($(`[data-it="${nf.sort}"] [data-n]`), 'מה לא תקין?');
      const nv = I.find(i => i.need_value && D.res[i.sort].r === 'ok' && !(D.res[i.sort].v || '').trim());
      if (nv) return bad($(`[data-it="${nv.sort}"] [data-v]`), 'חסר ערך');
      if (oilRows() && !D.oil && I.some(i => (i.mfr_material || i.supplier_material) && D.res[i.sort].r === 'ok')) return bad($('#moil'), 'איזה שמן הכנסת?');
    } else if (!D.body.trim() && !D.parts.some(p => p.name.trim()) && !D.defects.trim()) return bad($('#mbody'), 'מה נעשה?');
    // אותם כללים כמו בשרת (equipment_service_maint_guard): בלי תאריך עתידי, בלי מד שלילי או נמוך מהקיים
    if ((D.day || '') > isoDay()) return bad($('#mday'), 'תאריך הטיפול לא יכול להיות בעתיד');
    const hm0 = D.hm === '' ? null : Number(D.hm);
    if (hm0 != null && (Number.isNaN(hm0) || hm0 < 0)) return bad($('#mhm'), 'המספר במד לא תקין');
    if (hm0 != null && meterNow != null && hm0 < Number(meterNow) && !senior()) return bad($('#mhm'), `${meterLbl} נמוך מהקיים בכלי (${meterNow})`);
    const parts = D.parts.filter(p => (p.name || '').trim()).map(p => ({ name: p.name.trim(), part_no: p.part_no || null, qty: p.qty || 1, status: p.status, catalog_item_id: p.catalog_item_id || null }));
    const snap = I.map(i => ({ item_id: i.id, sort: i.sort, assembly: i.assembly, action: i.action, mfr_material: i.mfr_material, mfr_qty: i.mfr_qty, supplier_material: i.supplier_material, supplier_qty: i.supplier_qty,
      torque_nm: i.torque_nm, part_no: i.part_no, critical: !!i.critical, need_value: i.need_value, result: D.res[i.sort].r, value: (D.res[i.sort].v || '').trim() || null, note: (D.res[i.sort].n || '').trim() || null }));
    const f = snap.filter(i => i.result === 'fail'), hm = D.hm === '' ? null : Number(D.hm);
    const body = t ? [`${LVL[D.level]} · ${snap.filter(i => i.result === 'ok').length}/${snap.length} ✓`, f.length ? `✗ ${f.map(i => i.assembly).join(', ')}` : ''].filter(Boolean).join(' · ') : D.body.trim() || null;
    fin.disabled = true;
    const id = uid(), day = D.day || isoDay();
    await enqueue({ kind: 'insert', table: 'equipment_services', row: { id, equipment_id: r.id, kind: 'periodic', level: D.level, template_id: t?.id || null, done_on: day, by_user: state.user.id,
      hour_meter: isVeh(r) || hm == null || Number.isNaN(hm) ? null : hm, odometer_km: isVeh(r) && hm != null && !Number.isNaN(hm) ? Math.round(hm) : null,
      items: snap, oil_used: t && oilRows() ? D.oil : null, parts, defects: D.defects.trim() || null, body } });
    // ליקוי שנמצא בטיפול = תקלה (✗ בשורה נפתח כתקלה בשרת; כאן רק טקסט הליקויים החופשי)
    // ✗ בשורות כבר נפתח כתקלה בשרת; תקלה מהטקסט החופשי רק כשאין ✗, למניעת כפילות
    if (D.defects.trim() && !f.length) await enqueue({ kind: 'insert', table: 'issues', row: { id: uid(), equipment_id: r.id, kind: 'equipment', body: `${r.name}: ${D.defects.trim()}`.slice(0, 1000), opened_by: state.user.id, status: 'open', severity: 'normal' } });
    try { localStorage.removeItem(DK); } catch { /* */ }
    haptic('success');
    toast(parts.length ? 'הטיפול נשמר · נשלח לאישור מנהל' : f.length ? 'הטיפול נשמר · נפתחו תקלות' : 'הטיפול נשמר', 2600, 'success');
    goBack(fb);
  }
  draw();
}
