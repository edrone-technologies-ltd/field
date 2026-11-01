// רכש ומלאי: חומרי ניקוי וביגוד/ציוד מגן בלבד. בקשה מהקטלוג → לוח הרכש. אישור דו-שלבי כאן (צורך → מעל הסף אישור סופי, db/162) → נדחף למאנדי; "הוזמן" כאן; ספירת מלאי כאן (מנהלים) → לוח המלאי.
import { sb, state, isManager, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, dm, backBtn, replaceHash, mon } from '../lib/core.js';

const ST = { draft: ['טיוטה', ''], submitted: ['ממתין לאישור', 'warn'], pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'lime'], sent: ['הוזמן', 'lime'], partial: ['התקבל חלקית', 'lime'], received: ['התקבל', 'ok'], rejected: ['נדחה', 'bad'], cancelled: ['בוטל', ''] };
const nis = x => '₪' + Math.round(x || 0).toLocaleString('he-IL');
const low = c => c.min_qty != null && c.stock != null && Number(c.stock) <= Number(c.min_qty);

const isAdmin = () => state.profile?.role === 'admin';
const OPEN = ['submitted', 'pending'];
// שגיאות השרת (db/159) → משפט אחד
const ERR = { forbidden: 'הבקשה לא מחכה לך', already_decided: 'כבר הוחלט', no_lines: 'השורות עוד לא הגיעו — לנסות שוב בעוד רגע', reason_required: 'צריך לכתוב סיבה', not_approved: 'הבקשה עוד לא אושרה', bad_qty: 'כמות לא תקינה', not_found: 'לא נמצא' };
const errMsg = e => ERR[(e?.message || '').trim()] || (/fetch|network|load failed/i.test(e?.message || '') ? 'אין קליטה — נסו שוב' : 'לא נשמר — נסו שוב');

export async function renderPurchase(el) {
  let mine = new Set();
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">רכש ומלאי</h1><button class="hbtn" id="padd" aria-label="בקשת רכש">${icon('plus', 20)}</button></header>
    <div id="pb" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: reqs }, { data: cat }] = await Promise.all([
    sb.from('purchase_requests').select('id,title,requested_by,project_id,needed_by,notes,status,monday_item_id,monday_stage,decided_at,decision_note,need_at,created_at,updated_at, purchase_lines(name,qty,unit), profiles:requested_by(full_name), projects(name)').order('created_at', { ascending: false }).limit(40),
    sb.from('catalog_items').select('monday_item_id,name,unit,order_unit,units_per_order,min_qty,stock,sku,supplier_name,is_material,in_app').eq('in_app', true).order('is_material', { ascending: false }).order('name'),
    isAdmin() ? sb.rpc('purchase_todo') : Promise.resolve({ data: [] }),   // רק מה שמחכה לי עכשיו (db/162)
  ]).then(([a, b, t]) => (mine = new Set(t.data || []), [a, b]));
  const lows = (cat || []).filter(low);
  const todo = (reqs || []).filter(r => mine.has(r.id)), rest = (reqs || []).filter(r => !todo.includes(r));
  const reqRow = r => { const [t, c] = OPEN.includes(r.status) && r.need_at ? ['צורך אושר', 'warn'] : ST[r.status] || ['', ''];
    return `<button type="button" class="lrow" data-req="${r.id}"><span class="grow"><b>${esc(r.title)}</b><small>${dm(r.created_at.slice(0, 10))} · ${esc(r.profiles?.full_name || '')}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''}</small>
      <small>${esc((r.purchase_lines || []).map(l => `${l.name} ×${l.qty}`).join(' · '))}</small></span><span class="pill ${c}">${t}</span></button>`; };
  $('#pb').innerHTML = `
    ${todo.length ? `<section><div class="sh-row"><h3 class="sh">לאישורך</h3><span class="count">${todo.length}</span></div><div class="list">${todo.map(reqRow).join('')}</div></section>` : ''}
    ${lows.length > 1 ? `<button class="btn primary block" id="plow">${icon('cart', 18)} הזמנת כל החסרים (${lows.length})</button>` : ''}
    ${lows.length ? `<section><h3 class="sh">מתחת למינימום</h3><div class="alist">${lows.map(c => `<button class="arow warn" type="button" data-quick="${c.monday_item_id}"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(c.name)}</b><small>במלאי ${c.stock} ${esc(c.unit || '')} · מינימום ${c.min_qty}</small></span><span class="pill warn">להזמין</span></button>`).join('')}</div></section>` : ''}
    ${rest.length ? `<section><h3 class="sh">הבקשות${isManager() ? '' : ' שלי'}</h3><div class="list">${rest.map(reqRow).join('')}</div></section>` : todo.length || lows.length ? '' : `<div class="ecta"><span class="ei">${icon('cart', 28)}</span><b>המלאי תקין</b><button class="btn primary" id="pnew">${icon('plus', 18)} בקשת רכש</button></div>`}
    ${(cat || []).length ? `<section><div class="sh-row"><h3 class="sh">מלאי</h3><span class="count">${cat.length}</span></div><div class="list">${[...cat].sort((a, b) => low(b) - low(a)).map(c => { const pct = c.min_qty ? Math.min(100, Math.round(Number(c.stock || 0) / (Number(c.min_qty) * 2) * 100)) : null;
      return `<button type="button" class="lrow stockrow" data-stock="${c.monday_item_id}"><span class="grow"><b>${esc(c.name)}</b>${pct != null ? `<span class="meter ${low(c) ? 'warn' : 'ok'}"><i style="width:${Math.max(4, pct)}%"></i></span>` : ''}</span><span class="pill ${low(c) ? 'warn' : 'ok'}">${c.stock ?? '—'} ${esc(c.unit || '')}</span></button>`; }).join('')}</div></section>` : ''}`;
  if (/^#\/purchase\/new/.test(location.hash)) { replaceHash('#/purchase', false); newRequest(cat || []); }   // מה"+" — בלי כפתור במסך
  const again = () => renderPurchase($('#app'));
  $$('[data-quick]').forEach(b => b.onclick = () => newRequest(cat || [], b.dataset.quick));
  $$('[data-stock]').forEach(b => b.onclick = () => stockSheet((cat || []).find(c => c.monday_item_id === b.dataset.stock), cat || [], again));
  $$('[data-req]').forEach(b => b.onclick = () => requestSheet((reqs || []).find(r => r.id === b.dataset.req), again));
  ['#padd', '#pnew'].forEach(k => { const b = $(k); if (b) b.onclick = () => newRequest(cat || []); });
  const pl = $('#plow'); if (pl) pl.onclick = () => newRequest(cat || [], lows.map(c => c.monday_item_id));
}

// ---------- בקשה: פרטים, ולמאשר — אישור / דחייה בלי לצאת מהאפליקציה ----------
async function requestSheet(r, done) {
  if (!r) return;
  let d = null;
  if (isAdmin()) { const { data, error } = await sb.rpc('purchase_review', { p_id: r.id }); if (error) return toast(errMsg(error)); d = data; }
  const lines = d?.lines || r.purchase_lines || [], status = d?.status || r.status, [t, c] = OPEN.includes(status) && (r.need_at || d?.need_done_by) ? ['צורך אושר', 'warn'] : ST[status] || ['', ''];   // כמו בשורה ברשימה
  const meta = [r.profiles?.full_name || d?.requester, r.projects?.name || d?.project, (d?.needed_by || r.needed_by) ? 'נדרש עד ' + dm(d?.needed_by || r.needed_by) : ''].filter(Boolean).map(esc).join(' · ');
  const canAct = !!d?.can_act && OPEN.includes(status), fin = !!d?.approve_final;
  // הסף ושמות המאשרים — מההגדרה בשרת (app_settings.purchase_approval), לא קשיחים
  const why = !isAdmin() || !OPEN.includes(status) ? ''
    // שורה בלי מחיר בקטלוג → הסכום לא ידוע → עובר לבכיר גם מתחת לסף (db/162)
    : canAct ? (fin ? '' : d.price_unknown ? `מחיר לא ידוע · עובר ל${esc((d.senior_name || '').split(' ')[0])}` : `מעל ${nis(d.limit)} · אחרי אישור הצורך עובר ל${esc(d.senior_name || '')}`)
    : d?.waiting_name ? `מחכה ל${esc(d.waiting_name)}${d.price_unknown ? ' · מחיר לא ידוע' : ''}${d.need_done_by ? ` · צורך אושר ע״י ${esc(d.need_done_by)}` : ''}` : '';
  const sup = [...new Set(lines.map(l => l.supplier).filter(Boolean))].join(', ');
  const after = isAdmin() && ['approved', 'sent', 'partial'].includes(status) ? `<section class="pr-next"><h4>מה עכשיו</h4><ol>
      <li class="${status !== 'approved' ? 'done' : ''}">מזמינים מ${esc(sup || 'הספק')} בטלפון או בוואטסאפ, ומסמנים "הוזמן"</li>
      <li>כשהסחורה מגיעה: ${mon('במאנדי ממלאים "התקבל" בכל שורה ומסמנים שלב "התקבל". המלאי מתעדכן לבד', 'מעדכנים את המלאי')}</li></ol>
      ${status === 'approved' && d?.can_order ? `<button class="btn primary block" id="rord">${icon('check', 18)} הוזמן</button>` : ''}</section>` : '';
  sheet(`<div class="pr-head"><h3 class="grow">${esc(r.title)}</h3><span class="pill ${c}">${t}</span></div>
    ${meta ? `<p class="pr-meta">${meta}</p>` : ''}
    <div class="list">${lines.map(l => `<div class="lrow"><span class="grow"><b>${esc(l.name)}</b>${l.stock != null ? `<small>במלאי ${Number(l.stock)} ${esc(l.stock_unit || '')}</small>` : ''}</span><b class="pr-q">×${Number(l.qty)} <small>${esc(l.unit || '')}</small></b></div>`).join('')}</div>
    ${isAdmin() && d?.total != null ? `<p class="pr-tot"><span>סה״כ לפני מע״מ</span><b>${d.price_unknown ? 'מחיר לא ידוע' : nis(d.total)}</b></p>` : ''}
    ${(d?.notes || r.notes) ? `<p class="pr-note">${esc(d?.notes || r.notes)}</p>` : ''}
    ${status === 'rejected' && (d?.decision_note || r.decision_note) ? `<p class="pr-note bad">סיבת הדחייה: ${esc(d?.decision_note || r.decision_note)}</p>` : ''}
    ${why ? `<p class="pr-why">${why}</p>` : ''}
    ${after}
    ${canAct ? `<div id="rj" hidden><label class="field">סיבת הדחייה<textarea id="rjn" rows="2" maxlength="300"></textarea></label></div>
      <div class="row-btns"><button class="btn ghost" id="rno">דחייה</button><button class="btn primary" id="rok">${icon('check', 18)} ${fin ? 'אישור' : 'אישור צורך'}</button></div>`
      : `<div class="row-btns"><button class="btn ghost" data-close>סגירה</button></div>`}
    ${isAdmin() && r.monday_item_id ? `<a class="pr-mon" href="https://edroneil-force.monday.com/boards/5099908084/pulses/${esc(r.monday_item_id)}" target="_blank" rel="noopener">פתיחה במאנדי</a>` : ''}`, (s, close) => {
    const decide = async (ok, btn) => {
      const note = ok ? null : $('#rjn', s).value.trim();
      if (!ok && !note) { $('#rjn', s).focus(); return toast('צריך לכתוב סיבה'); }
      if (btn.disabled) return; btn.disabled = true; btn.classList.add('busy');
      const { error } = await sb.rpc('purchase_decide', { p_id: r.id, p_approve: ok, p_note: note });
      btn.disabled = false; btn.classList.remove('busy');
      if (error) { toast(errMsg(error), 4000, 'error'); if (/already_decided/.test(error.message)) { close(); done(); } return; }
      toast(!ok ? 'נדחה · המבקש קיבל הודעה' : fin ? 'אושר · המבקש קיבל הודעה' : `אושר צורך · עבר ל${d.senior_name || 'אישור סופי'}`); close(); done();
      if (ok && fin) setTimeout(() => requestSheet({ ...r, status: 'approved' }, done), 250);   // מיד אחרי האישור הסופי: מה עכשיו
    };
    const no = $('#rno', s), yes = $('#rok', s);
    if (no) no.onclick = () => { const box = $('#rj', s); if (!box.hidden) return decide(false, no);
      box.hidden = false; no.textContent = 'שליחת הדחייה'; no.classList.replace('ghost', 'danger'); $('#rjn', s).focus();
      if (yes) { yes.innerHTML = 'ביטול'; yes.className = 'btn ghost'; yes.onclick = close; } };
    if (yes) yes.onclick = () => decide(true, yes);
    const ord = $('#rord', s);
    if (ord) ord.onclick = async () => { if (ord.disabled) return; ord.disabled = true; ord.classList.add('busy');
      const { error } = await sb.rpc('purchase_mark_ordered', { p_id: r.id });
      ord.disabled = false; ord.classList.remove('busy');
      if (error) return toast(errMsg(error), 4000, 'error');
      toast('סומן: הוזמן'); close(); done(); };
  });
}

// ---------- שורת מלאי: עדכון כמות (ספירה) או בקשת רכש ----------
function stockSheet(c, cat, done) {
  if (!c) return;
  const can = isManager(), cur = c.stock == null ? 0 : Number(c.stock);
  if (!can) return newRequest(cat, c.monday_item_id);
  sheet(`<h3>${esc(c.name)}</h3>
    <p class="pr-meta">במלאי ${c.stock ?? '—'} ${esc(c.unit || '')}${c.min_qty != null ? ` · מינימום ${Number(c.min_qty)}` : ''}</p>
    <label class="field">כמה יש עכשיו${c.unit ? ` (${esc(c.unit)})` : ''}
      <span class="qty pr-count"><button type="button" id="sm" aria-label="פחות">−</button><input id="sq" type="number" inputmode="decimal" min="0" step="any" value="${cur}"><button type="button" id="sp" aria-label="יותר">+</button></span></label>
    <div class="row-btns"><button class="btn ghost" id="sbuy">${icon('cart', 18)} בקשת רכש</button><button class="btn primary" id="sgo">עדכון מלאי</button></div>`, (s, close) => {
    const q = $('#sq', s), val = () => Number(String(q.value).replace(',', '.'));
    $('#sm', s).onclick = () => { q.value = Math.max(0, (val() || 0) - 1); };
    $('#sp', s).onclick = () => { q.value = (val() || 0) + 1; };
    q.onfocus = () => q.select();
    $('#sbuy', s).onclick = () => { close(); newRequest(cat, c.monday_item_id); };
    $('#sgo', s).onclick = async () => {
      const v = val(), go = $('#sgo', s);
      if (!Number.isFinite(v) || v < 0 || q.value === '') { q.focus(); return toast('כמות לא תקינה'); }
      if (go.disabled) return; go.disabled = true; go.classList.add('busy');
      const { error } = await sb.rpc('stock_set', { p_item: c.monday_item_id, p_qty: v });
      go.disabled = false; go.classList.remove('busy');
      if (error) return toast(errMsg(error), 4000, 'error');
      toast(`המלאי עודכן: ${v} ${c.unit || ''}`); close(); done();
    };
  });
}

export async function newRequest(cat, preselect) {
  if (!cat) { const { data } = await sb.from('catalog_items').select('monday_item_id,name,unit,order_unit,units_per_order,min_qty,stock,sku,supplier_name,is_material,in_app').eq('in_app', true).order('is_material', { ascending: false }).order('name'); cat = data || []; }
  const { data: projects } = await sb.from('projects').select('id,name,status_label,monday_group').neq('monday_group', 'group_mm5052gw').order('name');
  // כמות מוצעת = עד פעמיים המינימום. בלי בחירה מראש — כל מה שמתחת למינימום כבר בסל
  // כמות מוצעת (ביחידות הזמנה — קרטון/גלון): מה שחסר עד המינימום + יחידת הזמנה אחת מעליו, כדי שלא נהיה שוב "נמוך" ביום ההגעה.
  // (היה: עד פעמיים המינימום → Assert Lemon: 10 קרטונים = 20 גלון למינימום של 10)
  const per = c => Number(c.units_per_order || 1), Q = {}, want = c => Math.max(1, Math.ceil(Math.max(0, Number(c.min_qty || 0) - Number(c.stock || 0)) / per(c)) + 1);
  const eq = c => per(c) > 1 && c.unit ? ` = ${(Q[c.monday_item_id] || 0) * per(c)} ${c.unit}` : '';
  for (const k of preselect ? [].concat(preselect) : cat.filter(low).map(c => c.monday_item_id)) { const c = cat.find(x => x.monday_item_id === k); if (c) Q[k] = want(c); }
  cat = [...cat].sort((a, b) => (Q[b.monday_item_id] ? 1 : 0) - (Q[a.monday_item_id] ? 1 : 0) || low(b) - low(a));
  const free = [];
  sheet(`<h3>בקשת רכש</h3>
    <div class="list" id="ci">${cat.map(c => `<div class="lrow"><span class="grow"><b>${esc(c.name)}</b><small>${[esc(c.order_unit || ''), `במלאי ${c.stock ?? '—'}`].filter(Boolean).join(' · ')}${low(c) ? ' · <span class="issue">נמוך</span>' : ''}</small></span>
      <span class="qty"><button type="button" data-m="${c.monday_item_id}">−</button><b id="q-${c.monday_item_id}">${Q[c.monday_item_id] || 0}</b><button type="button" data-p="${c.monday_item_id}">+</button></span>${per(c) > 1 && c.unit ? `<small class="qeq" id="qe-${c.monday_item_id}">${eq(c)}</small>` : ''}</div>`).join('')}</div>
    <label class="field">לאיזה פרויקט (לא חובה)<select id="rp"><option value="">כללי / מלאי</option>${(projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field">נדרש עד<input type="date" id="rd" value="${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}"></label>
    <label class="field">הערות<textarea id="rn" rows="2"></textarea></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="rgo">שליחת הבקשה</button></div>`, (s, close) => {
    const upd = () => cat.forEach(c => { const e = $('#qe-' + c.monday_item_id, s); if (e) e.textContent = eq(c); });
    $$('[data-p]', s).forEach(b => b.onclick = () => { const k = b.dataset.p; Q[k] = (Q[k] || 0) + 1; $('#q-' + k, s).textContent = Q[k]; upd(); });
    $$('[data-m]', s).forEach(b => b.onclick = () => { const k = b.dataset.m; Q[k] = Math.max(0, (Q[k] || 0) - 1); $('#q-' + k, s).textContent = Q[k]; upd(); });
    upd();
    $('#rgo', s).onclick = async () => {
      const lines = cat.filter(c => Q[c.monday_item_id] > 0).map(c => ({ catalog_monday_id: c.monday_item_id, name: c.name, qty: Q[c.monday_item_id], unit: c.order_unit || c.unit }))   // מחיר וסכום — השרת ממלא (לא נשלח למכשיר)
;
      if (!lines.length) return toast('לא נבחרו פריטים');
      const go = $('#rgo', s); if (go.disabled) return; go.disabled = true;
      const proj = (projects || []).find(p => p.id === $('#rp', s).value);
      const id = uid(), title = `${lines.map(l => l.name).slice(0, 2).join(' + ')}${lines.length > 2 ? ` ועוד ${lines.length - 2}` : ''}${proj ? ' — ' + proj.name : ''}`;
      await enqueue({ kind: 'insert', table: 'purchase_requests', row: { id, title, requested_by: state.user.id, project_id: proj?.id || null, needed_by: $('#rd', s).value || null, notes: $('#rn', s).value.trim() || null } });
      for (const l of lines) await enqueue({ kind: 'insert', table: 'purchase_lines', row: { id: uid(), request_id: id, ...l } });
      close(); toast('הבקשה נשלחה'); await flush(); renderPurchase($('#app'));
    };
  });
}
