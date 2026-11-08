// רכש ומלאי: חומרי ניקוי וביגוד/ציוד מגן, ופריטים שנפתחו כאן ("פריט חדש", db/168 + פונקציית stock-item). כניסה למלאי + שרשור לכל בקשה (db/163). בקשה מהקטלוג → לוח הרכש. אישור דו-שלבי כאן (צורך → מעל הסף אישור סופי, db/162) → נדחף למאנדי; "הוזמן" כאן; ספירת מלאי כאן (מנהלים) → לוח המלאי.
import { sb, state, isManager, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, dm, backBtn, replaceHash, mon, signedUrls, zoom, fmtTime } from '../lib/core.js';

const ST = { draft: ['טיוטה', ''], submitted: ['ממתין לאישור', 'warn'], pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'lime'], sent: ['הוזמן', 'lime'], partial: ['התקבל חלקית', 'lime'], received: ['התקבל', 'ok'], rejected: ['נדחה', 'bad'], cancelled: ['בוטל', ''] };
const nis = x => '₪' + Math.round(x || 0).toLocaleString('he-IL');
const low = c => c.min_qty != null && c.stock != null && Number(c.stock) <= Number(c.min_qty);

const isAdmin = () => state.profile?.role === 'admin';
const OPEN = ['submitted', 'pending'];
// שגיאות השרת (db/159) → משפט אחד
const ERR = { received_in_monday: 'הקבלה נרשמה במאנדי. ממשיכים שם', not_ordered: 'הבקשה עוד לא אושרה', bad_photo: 'התמונה לא נשמרה — נסו שוב', bad_input: 'לא נשמר — נסו שוב', empty: 'אין מה לשלוח', too_many: 'הגעת למגבלה של השעה האחרונה — אפשר להמשיך בעוד כמה דקות', forbidden: 'הבקשה לא מחכה לך', already_decided: 'כבר הוחלט', no_lines: 'השורות עוד לא הגיעו — לנסות שוב בעוד רגע', reason_required: 'צריך לכתוב סיבה', not_approved: 'הבקשה עוד לא אושרה', bad_qty: 'כמות לא תקינה', not_found: 'לא נמצא',
  exists: 'כבר יש פריט בשם הזה', bad_name: 'צריך שם לפריט', bad_unit: 'צריך יחידה', bad_category: 'צריך קטגוריה', cat_admin: 'קטגוריה חדשה נפתחת רק ע״י שותף — בחרו מהקיימות', busy: 'כבר נשלח — רגע', monday: 'מאנדי לא ענה — נסו שוב', not_ready: 'לא נשמר — נסו שוב' };
const NOCAT = 'ללא קטגוריה';
const errMsg = e => ERR[(e?.message || '').trim()] || (/fetch|network|load failed/i.test(e?.message || '') ? 'אין קליטה — נסו שוב' : 'לא נשמר — נסו שוב');

export async function renderPurchase(el) {
  let mine = new Set();
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">רכש ומלאי</h1><button class="hbtn" id="padd" aria-label="בקשת רכש">${icon('plus', 20)}</button></header>
    <div id="pb" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: reqs }, { data: cat }] = await Promise.all([
    sb.from('purchase_requests').select('id,title,requested_by,project_id,needed_by,notes,status,monday_item_id,monday_stage,decided_at,decision_note,need_at,created_at,updated_at, purchase_lines(name,qty,unit), profiles:requested_by(full_name), projects(name)').order('created_at', { ascending: false }).limit(40),
    sb.from('catalog_items').select('monday_item_id,name,unit,order_unit,units_per_order,min_qty,stock,sku,supplier_name,is_material,in_app,category').eq('in_app', true).order('is_material', { ascending: false }).order('name'),
    isAdmin() ? sb.rpc('purchase_todo') : Promise.resolve({ data: [] }),   // רק מה שמחכה לי עכשיו (db/162)
  ]).then(([a, b, t]) => (mine = new Set(t.data || []), [a, b]));
  const lows = (cat || []).filter(low);
  const todo = (reqs || []).filter(r => mine.has(r.id)), rest = (reqs || []).filter(r => !todo.includes(r));
  const reqRow = r => { const [t, c] = OPEN.includes(r.status) && r.need_at ? ['צורך אושר', 'warn'] : ST[r.status] || ['', ''];
    return `<button type="button" class="lrow" data-req="${r.id}"><span class="grow"><b>${esc(r.title)}</b><small>${dm(r.created_at.slice(0, 10))} · ${esc(r.profiles?.full_name || '')}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''}</small>
      <small>${esc((r.purchase_lines || []).map(l => `${l.name} ×${l.qty}`).join(' · '))}</small></span><span class="pill ${c}">${t}</span></button>`; };
  $('#pb').innerHTML = `
    ${isManager() && (cat || []).length ? `<button class="btn primary block" id="pin">${icon('plus', 18)} כניסה למלאי</button>` : ''}
    ${todo.length ? `<section><div class="sh-row"><h3 class="sh">לאישורך</h3><span class="count">${todo.length}</span></div><div class="list">${todo.map(reqRow).join('')}</div></section>` : ''}
    ${lows.length > 1 ? `<button class="btn primary block" id="plow">${icon('cart', 18)} הזמנת כל החסרים (${lows.length})</button>` : ''}
    ${lows.length ? `<section><h3 class="sh">מתחת למינימום</h3><div class="alist">${lows.map(c => `<button class="arow warn" type="button" data-quick="${c.monday_item_id}"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(c.name)}</b><small>במלאי ${c.stock} ${esc(c.unit || '')} · מינימום ${c.min_qty}</small></span><span class="pill warn">להזמין</span></button>`).join('')}</div></section>` : ''}
    ${rest.length ? `<section><h3 class="sh">הבקשות${isManager() ? '' : ' שלי'}</h3><div class="list">${rest.map(reqRow).join('')}</div></section>` : todo.length || lows.length ? '' : `<div class="ecta"><span class="ei">${icon('cart', 28)}</span><b>המלאי תקין</b><button class="btn primary" id="pnew">${icon('plus', 18)} בקשת רכש</button></div>`}
    ${(cat || []).length || isManager() ? `<section><div class="sh-row"><h3 class="sh">מלאי</h3>${(cat || []).length ? `<span class="count">${cat.length}</span>` : ''}${isManager() ? `<button type="button" class="btn ghost sm more" id="pnewitem">${icon('plus', 16)} פריט חדש</button>` : ''}</div>
      ${byCat(cat || []).map(([k, list], _, all) => `${all.length > 1 ? `<h4 class="pr-cat">${esc(k)}</h4>` : ''}<div class="list">${list.map(c => { const pct = c.min_qty ? Math.min(100, Math.round(Number(c.stock || 0) / (Number(c.min_qty) * 2) * 100)) : null;
      return `<button type="button" class="lrow stockrow" data-stock="${c.monday_item_id}"><span class="grow"><b>${esc(c.name)}</b>${pct != null ? `<span class="meter ${low(c) ? 'warn' : 'ok'}"><i style="width:${Math.max(4, pct)}%"></i></span>` : ''}</span><span class="pill ${low(c) ? 'warn' : 'ok'}">${c.stock ?? '—'} ${esc(c.unit || '')}</span></button>`; }).join('')}</div>`).join('')}</section>` : ''}`;
  if (/^#\/purchase\/new/.test(location.hash)) { replaceHash('#/purchase', false); newRequest(cat || []); }   // מה"+" — בלי כפתור במסך
  const again = () => renderPurchase($('#app'));
  $$('[data-quick]').forEach(b => b.onclick = () => newRequest(cat || [], b.dataset.quick));
  $$('[data-stock]').forEach(b => b.onclick = () => stockSheet((cat || []).find(c => c.monday_item_id === b.dataset.stock), cat || [], again));
  const pin = $('#pin'); if (pin) pin.onclick = () => stockSheet(null, cat || [], again);
  const pni = $('#pnewitem'); if (pni) pni.onclick = () => newItemSheet(again);
  $$('[data-req]').forEach(b => b.onclick = () => requestSheet((reqs || []).find(r => r.id === b.dataset.req), again));
  ['#padd', '#pnew'].forEach(k => { const b = $(k); if (b) b.onclick = () => newRequest(cat || []); });
  const pl = $('#plow'); if (pl) pl.onclick = () => newRequest(cat || [], lows.map(c => c.monday_item_id));
}

// ---------- בקשה: פרטים, ולמאשר — אישור / דחייה בלי לצאת מהאפליקציה ----------
async function requestSheet(r, done) {
  if (!r) return;
  let d = null;
  // שרשור (db/163): שלבים עם מי ומתי, הודעות, ושורות לקבלה — לכל מי שרואה את הבקשה. בלי ₪
  const [rv, tr] = await Promise.all([isAdmin() ? sb.rpc('purchase_review', { p_id: r.id }) : Promise.resolve({ data: null }), sb.rpc('purchase_thread', { p_id: r.id })]);
  if (rv.error) return toast(errMsg(rv.error)); d = rv.data;
  const th = tr.data || { events: [], lines: [] };
  const urls = await signedUrls('field', (th.events || []).map(e => e.photo_path).filter(Boolean), 3600);
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
      <li>כשהסחורה מגיעה: לוחצים "התקבל" ומסמנים כמה הגיע מכל פריט. המלאי מתעדכן לבד, גם במאנדי</li></ol>
      ${status === 'approved' && d?.can_order ? `<button class="btn primary block" id="rord">${icon('check', 18)} הוזמן</button>` : ''}</section>` : '';
  sheet(`<div class="pr-head"><h3 class="grow">${esc(r.title)}</h3><span class="pill ${c}">${t}</span></div>
    ${meta ? `<p class="pr-meta">${meta}</p>` : ''}
    <div class="list">${lines.map(l => `<div class="lrow"><span class="grow"><b>${esc(l.name)}</b>${l.stock != null ? `<small>במלאי ${Number(l.stock)} ${esc(l.stock_unit || '')}</small>` : ''}</span><b class="pr-q">×${Number(l.qty)} <small>${esc(l.unit || '')}</small></b></div>`).join('')}</div>
    ${isAdmin() && d?.total != null ? `<p class="pr-tot"><span>סה״כ לפני מע״מ</span><b>${d.price_unknown ? 'מחיר לא ידוע' : nis(d.total)}</b></p>` : ''}
    ${(d?.notes || r.notes) ? `<p class="pr-note">${esc(d?.notes || r.notes)}</p>` : ''}
    ${status === 'rejected' && (d?.decision_note || r.decision_note) ? `<p class="pr-note bad">סיבת הדחייה: ${esc(d?.decision_note || r.decision_note)}</p>` : ''}
    ${why ? `<p class="pr-why">${why}</p>` : ''}
    ${timeline(th, status)}
    ${after}
    ${th.can_receive ? `<button class="btn primary block" id="rrcv">${icon('check', 18)} התקבל</button>` : th.monday_receipt && isManager() ? `<p class="pr-why">הקבלה נרשמה במאנדי. ממשיכים שם</p>` : ''}
    ${thread(th, urls)}
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
    $$('[data-zoom]', s).forEach(i => i.onclick = () => zoom(i.src, 'תמונה'));
    const rcv = $('#rrcv', s); if (rcv) rcv.onclick = () => { close(); receiveSheet(r, th, done); };
    bindComposer(s, r.id, () => { close(); done(); setTimeout(() => requestSheet(r, done), 200); });
    const ord = $('#rord', s);
    if (ord) ord.onclick = async () => { if (ord.disabled) return; ord.disabled = true; ord.classList.add('busy');
      const { error } = await sb.rpc('purchase_mark_ordered', { p_id: r.id });
      ord.disabled = false; ord.classList.remove('busy');
      if (error) return toast(errMsg(error), 4000, 'error');
      toast('סומן: הוזמן'); close(); done(); };
  });
}

// ---------- שרשור הבקשה ----------
// ציר זמן קבוע לפי שלבי הרכש. כל שלב: מי ומתי. נדחה/בוטל — סוף הציר
const EV = { submitted: 'הוגש', need_ok: 'צורך אושר', approved: 'אושר', ordered: 'הוזמן', received_partial: 'התקבל חלקית', received: 'התקבל', rejected: 'נדחה', cancelled: 'בוטל' };
function timeline(th, status) {
  const ev = th.events || [], first = k => ev.find(e => e.kind === k), lastOf = ks => [...ev].reverse().find(e => ks.includes(e.kind));
  const step = (label, e, extra = '') => `<li class="${e ? 'done' : ''}"><b>${label}</b>${e ? `<small>${esc(e.who || (e.body === 'סומן במאנדי' ? 'במאנדי' : ''))}${e.who || e.body === 'סומן במאנדי' ? ' · ' : ''}<bdi dir="ltr">${fmtTime(e.at)}</bdi>${extra}</small>` : ''}</li>`;
  const end = first('rejected') || first('cancelled');
  const rc = lastOf(['received', 'received_partial']);
  const stocked = th.moves > 0 ? { who: '', at: th.monday_at && !th.moves_pending ? th.monday_at : th.stocked_at } : null;
  const rows = [step('הוגש', first('submitted')),
    first('need_ok') || OPEN.includes(status) ? step('צורך אושר', first('need_ok')) : '',
    end ? `<li class="done end"><b>${EV[end.kind]}</b><small>${esc(end.who || '')}${end.who ? ' · ' : ''}<bdi dir="ltr">${fmtTime(end.at)}</bdi></small></li>` : step('אושר', first('approved')),
    end ? '' : step('הוזמן', first('ordered')),
    end ? '' : step(rc ? EV[rc.kind] : 'התקבל', rc),
    end ? '' : `<li class="${stocked ? 'done' : ''}"><b>נכנס למלאי</b>${stocked ? `<small><bdi dir="ltr">${fmtTime(stocked.at)}</bdi> · ${th.moves_pending ? 'מתעדכן במאנדי' : 'עודכן בלוח המלאי'}</small>` : ''}</li>`];
  return `<ol class="pr-tl">${rows.join('')}</ol>`;
}
function thread(th, urls) {
  const items = (th.events || []).filter(e => e.kind === 'message' || ((e.kind === 'received' || e.kind === 'received_partial') && e.body) || (e.kind === 'rejected' && e.body));
  const bub = e => e.kind === 'message'
    ? `<div class="msg ${e.mine ? 'me' : ''}">${e.mine ? '' : `<div class="who">${esc(e.who || '')}</div>`}${e.body ? `<div class="tx">${esc(e.body)}</div>` : ''}${e.photo_path && urls[e.photo_path] ? `<img src="${esc(urls[e.photo_path])}" alt="תמונה" loading="lazy" data-zoom>` : ''}<div class="when"><bdi dir="ltr">${fmtTime(e.at)}</bdi></div></div>`
    : `<div class="rpsys pr-sys">${icon(e.kind === 'rejected' ? 'x' : 'check', 15)} <span><b>${EV[e.kind]}</b> · ${esc(e.body)}${e.who ? ' · ' + esc(e.who) : ''}${e.photo_path && urls[e.photo_path] ? ` · <a href="#" data-zoomsrc="${esc(urls[e.photo_path])}">תעודת משלוח</a>` : ''}</span></div>`;
  return `<section class="pr-thread"><h4 class="sh">שרשור</h4>${items.length ? `<div class="chat">${items.map(bub).join('')}</div>` : ''}
    <div class="rpcomp"><label class="cbtn" aria-label="צירוף תמונה">${icon('photo', 22)}<input type="file" accept="image/*" id="pm-f"></label>
      <textarea id="pm-t" rows="1" maxlength="1000" placeholder="הודעה בבקשה…" aria-label="הודעה"></textarea>
      <button class="cbtn send" id="pm-s" aria-label="שליחה">${icon('send', 20)}</button></div><div id="pm-pv" class="rppv" hidden></div></section>`;
}
// תמונה: הדלי field, התיקייה שלי/requests (policies קיימים). עולה קודם, ורק אז ההודעה
async function upPhoto(file) {
  const { shrink } = await import('../lib/store.js'); const blob = await shrink(file);
  const path = `${state.user.id}/requests/${uid()}.jpg`;
  const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
  return path;
}
function bindComposer(s, id, again) {
  $$('[data-zoomsrc]', s).forEach(a => a.onclick = e => { e.preventDefault(); zoom(a.dataset.zoomsrc, 'תעודת משלוח'); });
  const f = $('#pm-f', s), t = $('#pm-t', s), send = $('#pm-s', s), pv = $('#pm-pv', s); let file = null;
  if (!send) return;
  t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; };
  f.onchange = () => { file = f.files[0] || null; f.value = ''; pv.hidden = !file; pv.innerHTML = file ? `<small>תמונה צורפה</small> <button type="button" class="chip" id="pm-x">בלי תמונה</button>` : '';
    const x = $('#pm-x', s); if (x) x.onclick = () => { file = null; pv.hidden = true; pv.innerHTML = ''; }; };
  send.onclick = async () => {
    const body = t.value.trim().slice(0, 1000) || null; if ((!body && !file) || send.disabled) return;
    send.disabled = true; let path = null;
    if (file) try { path = await upPhoto(file); } catch { send.disabled = false; return toast('התמונה לא עלתה — נסו שוב'); }
    const { error } = await sb.rpc('purchase_msg', { p_id: id, p_body: body, p_photo: path });
    send.disabled = false; if (error) return toast(errMsg(error), 4000, 'error');
    again();
  };
}

// ---------- "התקבל" בבקשה: כמה הגיע מכל שורה (ברירת מחדל: מה שנשאר להגיע) → כניסה למלאי לכל שורה ----------
function receiveSheet(r, th, done) {
  const L = (th.lines || []).map(l => ({ ...l, left: Math.max(0, Number(l.qty) - Number(l.received_qty || 0)) }));
  const Q = Object.fromEntries(L.map(l => [l.id, l.left]));
  const cid = uid();   // מזהה לחיצה אחד לחלון: שמירה חוזרת אחרי תשובה שאבדה לא קולטת פעמיים (db/163)
  const eq = l => Number(l.conv) > 1 && l.stock_unit ? `= ${Math.round(Q[l.id] * Number(l.conv) * 100) / 100} ${esc(l.stock_unit)}` : '';
  let file = null;
  sheet(`<h3>התקבל · ${esc(r.title)}</h3>
    <p class="pr-meta">כמה הגיע מכל פריט. מה שלא הגיע — 0, והבקשה נשארת פתוחה</p>
    <div class="list">${L.map(l => `<div class="lrow"><span class="grow"><b>${esc(l.name)}</b><small>הוזמנו ${Number(l.qty)} ${esc(l.unit || '')}${Number(l.received_qty) ? ` · כבר הגיעו ${Number(l.received_qty)}` : ''}${l.in_stock ? '' : ' · לא במלאי'}</small></span>
      <span class="qty"><button type="button" data-m="${l.id}" aria-label="פחות">−</button><b id="q-${l.id}">${Q[l.id]}</b><button type="button" data-p="${l.id}" aria-label="יותר">+</button></span><small class="qeq" id="qe-${l.id}">${eq(l)}</small></div>`).join('')}</div>
    <label class="field">הערה (לא חובה)<input id="rcn" maxlength="300"></label>
    <label class="field pr-file">${icon('photo', 18)} <span id="rcfl">צילום תעודת משלוח (לא חובה)</span><input type="file" accept="image/*" id="rcf"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="rcgo">${icon('check', 18)} עדכון מלאי</button></div>`, (s, close) => {
    const set = (id, v) => { Q[id] = Math.max(0, Math.round(v * 100) / 100); $('#q-' + id, s).textContent = Q[id]; $('#qe-' + id, s).textContent = eq(L.find(l => l.id === id)); };
    $$('[data-p]', s).forEach(b => b.onclick = () => set(b.dataset.p, Q[b.dataset.p] + 1));
    $$('[data-m]', s).forEach(b => b.onclick = () => set(b.dataset.m, Q[b.dataset.m] - 1));
    $('#rcf', s).onchange = e => { file = e.target.files[0] || null; $('#rcfl', s).textContent = file ? 'תעודת משלוח צורפה' : 'צילום תעודת משלוח (לא חובה)'; };
    $('#rcgo', s).onclick = async () => {
      const go = $('#rcgo', s); if (go.disabled) return;
      if (!L.some(l => Q[l.id] > 0)) return toast('לא סומן שום דבר שהגיע');
      go.disabled = true; go.classList.add('busy'); let path = null;
      if (file) try { path = await upPhoto(file); } catch { toast('התמונה לא עלתה — נשמר בלעדיה'); }
      const { data, error } = await sb.rpc('purchase_receive', { p_id: r.id, p_lines: L.map(l => ({ line_id: l.id, qty: Q[l.id] })), p_note: $('#rcn', s).value.trim() || null, p_photo: path, p_client: cid });
      go.disabled = false; go.classList.remove('busy');
      if (error) return toast(errMsg(error), 4000, 'error');
      toast(data?.status === 'received' ? 'התקבל · המלאי עודכן' : 'התקבל חלקית · המלאי עודכן'); close(); done();
    };
  });
}

// ---------- מלאי: חלון אחד, שתי לשוניות — "התקבל חומר" (מוסיף, ברירת מחדל) ו"ספירה" (מחליף). c ריק = בוחרים פריט ----------
// קבוצות לפי קטגוריה (= הקבוצה בלוח המלאי). בתוך קבוצה: מתחת למינימום קודם. "ללא קטגוריה" בסוף
function byCat(cat) {
  const m = new Map();
  for (const c of cat) { const k = (c.category || '').trim() || NOCAT; if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  for (const l of m.values()) l.sort((a, b) => low(b) - low(a));
  return [...m.entries()].sort(([a], [b]) => (a === NOCAT) - (b === NOCAT) || a.localeCompare(b, 'he'));
}

// ---------- פריט חדש: שם · יחידה · קטגוריה · כמות התחלתית. נוצר קודם בלוח המלאי במאנדי (פונקציית stock-item), לכן רק עם קליטה ----------
async function newItemSheet(done) {
  if (!isManager()) return;
  if (!navigator.onLine) return toast('פריט חדש נפתח רק עם קליטה', 4000, 'error');
  // הצעות: כל הקטגוריות והיחידות שכבר קיימות בקטלוג (גם מה שלא מוצג במסך)
  const { data: all } = await sb.from('catalog_items').select('unit,category');
  const uniq = k => [...new Set((all || []).map(x => (x[k] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
  const cats = uniq('category'), units = uniq('unit');
  let cid = uid(), q = 0;
  sheet(`<h3>פריט חדש</h3>
    <label class="field">שם הפריט<input id="ni-n" maxlength="80" autocomplete="off" placeholder="למשל: כפפות ניטריל"></label>
    <div class="field">קטגוריה${cats.length ? `<div class="chips" id="ni-cc">${cats.map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>` : ''}
      ${isAdmin() || !cats.length ? `<input id="ni-c" maxlength="40" autocomplete="off" placeholder="${cats.length ? 'או קטגוריה חדשה' : 'למשל: ציוד בטיחות'}">` : '<input id="ni-c" type="hidden">'}</div>
    <label class="field">יחידה<input id="ni-u" maxlength="20" autocomplete="off" list="ni-ul" placeholder="יחידה / גלון / זוג"><datalist id="ni-ul">${units.map(u => `<option value="${esc(u)}">`).join('')}</datalist></label>
    <label class="field">כמות התחלתית
      <span class="qty pr-count"><button type="button" id="ni-m" aria-label="פחות">−</button><input id="ni-q" type="number" inputmode="decimal" min="0" step="any" value="0"><button type="button" id="ni-p" aria-label="יותר">+</button></span></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="ni-go">${icon('plus', 18)} פתיחת הפריט</button></div>`, (s, close) => {
    const n = $('#ni-n', s), c = $('#ni-c', s), u = $('#ni-u', s), qi = $('#ni-q', s);
    const val = () => Number(String(qi.value).replace(',', '.'));
    const mark = () => $$('[data-cat]', s).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === c.value.trim())));
    $$('[data-cat]', s).forEach(b => b.onclick = () => { c.value = b.dataset.cat; mark(); });
    c.oninput = mark;
    $('#ni-m', s).onclick = () => { qi.value = Math.max(0, (val() || 0) - 1); };
    $('#ni-p', s).onclick = () => { qi.value = (val() || 0) + 1; };
    qi.onfocus = () => qi.select();
    $$('[data-close]', s).forEach(b => b.onclick = close);
    setTimeout(() => n.focus(), 50);
    $('#ni-go', s).onclick = async () => {
      const go = $('#ni-go', s); if (go.disabled) return;
      const name = n.value.trim(), cat = c.value.trim(), unit = u.value.trim(); q = val();
      if (name.length < 2) { n.focus(); return toast('צריך שם לפריט'); }
      if (!cat) { c.focus(); return toast('צריך קטגוריה'); }
      if (!unit) { u.focus(); return toast('צריך יחידה'); }
      if (!Number.isFinite(q) || qi.value === '' || q < 0) { qi.focus(); return toast('כמות לא תקינה'); }
      if (!navigator.onLine) return toast('פריט חדש נפתח רק עם קליטה', 4000, 'error');
      go.disabled = true; go.classList.add('busy');
      let data = null, code = '';
      try {
        const r = await sb.functions.invoke('stock-item', { body: { name, unit, category: cat, qty: q, client: cid } });
        data = r.data;
        if (r.error) { try { code = (await r.error.context?.json())?.error || ''; } catch { /* */ } code = code || 'net'; }
      } catch { code = 'net'; }
      go.disabled = false; go.classList.remove('busy');
      if (code) {
        // שגיאת תוכן → לחיצה חדשה אחרי תיקון. תקלת רשת / מאנדי → אותו מזהה, כדי שניסיון חוזר לא יפתח פריט שני
        if (['exists', 'bad_name', 'bad_unit', 'bad_category', 'cat_admin', 'bad_qty', 'too_many'].includes(code)) cid = uid();
        return toast(code === 'net' ? 'אין קליטה — נסו שוב' : ERR[code] || 'לא נשמר — נסו שוב', 4000, 'error');
      }
      close();
      if (data?.dry) return toast(`בדיקה: "${data.name}" לא נפתח במאנדי (משתמש בדיקה)`);
      toast(`נפתח: ${data?.name || name}${q > 0 ? ` · ${q} ${data?.unit || unit}` : ''}`);
      done();
    };
  });
}

function stockSheet(c, cat, done, tab = 'in') {
  if (c && !isManager()) return newRequest(cat, c.monday_item_id);
  if (!isManager()) return;
  const per = x => Number(x?.units_per_order || 0) > 1 ? Number(x.units_per_order) : 1;
  let file = null, fixMode = false;
  const cid = uid();   // מזהה לחיצה לכניסה למלאי (ניסיון חוזר באותו חלון = אותו מזהה)
  sheet(`<div id="stk"></div>`, (s, close) => {
    const box = $('#stk', s);
    const draw = () => {
      const byOrder = c && per(c) > 1 && c.order_unit;
      box.innerHTML = `<h3>${c ? esc(c.name) : 'כניסה למלאי'}</h3>
        ${c ? `<p class="pr-meta">במלאי ${c.stock ?? '—'} ${esc(c.unit || '')}${c.min_qty != null ? ` · מינימום ${Number(c.min_qty)}` : ''}</p>` : ''}
        <div class="tabs" role="tablist"><button role="tab" data-tab="in" aria-selected="${tab === 'in'}">התקבל חומר</button><button role="tab" data-tab="count" aria-selected="${tab === 'count'}">ספירה</button></div>
        ${!c ? `<label class="field">איזה פריט<select id="si"><option value="">בחירה…</option>${cat.map(x => `<option value="${x.monday_item_id}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}
        ${c && tab === 'in' ? `
          <p class="pr-hint">${fixMode ? 'תיקון כניסה שגויה: כמה להוריד, ולמה. נרשם כתנועה נפרדת, שום דבר לא נמחק' : 'מה שהגיע נוסף למה שיש במלאי'}</p>
          <label class="field">${fixMode ? 'כמה להוריד' : 'כמה הגיע'}${(byOrder && !fixMode) ? ` · ${esc(c.order_unit)}` : c.unit ? ` · ${esc(c.unit)}` : ''}
            <span class="qty pr-count"><button type="button" id="sm" aria-label="פחות">−</button><input id="sq" type="number" inputmode="decimal" min="0" step="any" value="${fixMode ? '' : 1}"><button type="button" id="sp" aria-label="יותר">+</button></span>
            ${(byOrder && !fixMode) ? `<small class="qeq" id="sqe"></small>` : ''}</label>
          ${fixMode ? `<label class="field">סיבה<input id="sr" maxlength="300" placeholder="למשל: נרשם פעמיים"></label>` : `
          <label class="field">ספק (לא חובה)<input id="ss" maxlength="120" value="${esc(c.supplier_name || '')}"></label>
          <label class="field">הערה (לא חובה)<input id="sn" maxlength="300"></label>
          <label class="field pr-file">${icon('photo', 18)} <span id="sfl">${file ? 'תעודת משלוח צורפה' : 'צילום תעודת משלוח (לא חובה)'}</span><input type="file" accept="image/*" id="sf"></label>`}
          <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn ${fixMode ? 'danger' : 'primary'}" id="sgo">${fixMode ? 'רישום תיקון' : `${icon('plus', 18)} הוספה למלאי`}</button></div>
          ${isAdmin() ? `<button type="button" class="pr-link" id="sfix">${fixMode ? 'חזרה לכניסה רגילה' : 'תיקון כניסה שגויה (admin)'}</button>` : ''}` : ''}
        ${c && tab === 'count' ? `
          <p class="pr-hint">ספירה: כמה יש עכשיו בפועל. המספר מחליף את מה שרשום</p>
          <label class="field">כמה יש עכשיו${c.unit ? ` (${esc(c.unit)})` : ''}
            <span class="qty pr-count"><button type="button" id="sm" aria-label="פחות">−</button><input id="sq" type="number" inputmode="decimal" min="0" step="any" value="${c.stock == null ? 0 : Number(c.stock)}"><button type="button" id="sp" aria-label="יותר">+</button></span></label>
          <div class="row-btns"><button class="btn ghost" id="sbuy">${icon('cart', 18)} בקשת רכש</button><button class="btn primary" id="sgo">עדכון מלאי</button></div>` : ''}`;
      $$('[data-tab]', box).forEach(b => b.onclick = () => { tab = b.dataset.tab; fixMode = false; draw(); });
      const si = $('#si', box); if (si) si.onchange = () => { c = cat.find(x => x.monday_item_id === si.value) || null; draw(); };
      $$('[data-close]', box).forEach(b => b.onclick = close);
      if (!c) return;
      const q = $('#sq', box), val = () => Number(String(q.value).replace(',', '.'));
      const upd = () => { const e = $('#sqe', box); if (e) e.textContent = `= ${Math.round((val() || 0) * per(c) * 100) / 100} ${c.unit || ''}`; };
      $('#sm', box).onclick = () => { q.value = Math.max(0, (val() || 0) - 1); upd(); };
      $('#sp', box).onclick = () => { q.value = (val() || 0) + 1; upd(); };
      q.oninput = upd; q.onfocus = () => q.select(); upd();
      const buy = $('#sbuy', box); if (buy) buy.onclick = () => { close(); newRequest(cat, c.monday_item_id); };
      const fx = $('#sfix', box); if (fx) fx.onclick = () => { fixMode = !fixMode; draw(); };
      const sf = $('#sf', box); if (sf) sf.onchange = e => { file = e.target.files[0] || null; $('#sfl', box).textContent = file ? 'תעודת משלוח צורפה' : 'צילום תעודת משלוח (לא חובה)'; };
      $('#sgo', box).onclick = async () => {
        const v = val(), go = $('#sgo', box);
        if (!Number.isFinite(v) || q.value === '' || v < 0 || (tab === 'in' && v <= 0)) { q.focus(); return toast('כמות לא תקינה'); }
        if (go.disabled) return;
        let res;
        if (tab === 'count') res = await (go.disabled = true, sb.rpc('stock_set', { p_item: c.monday_item_id, p_qty: v }));
        else if (fixMode) { const why = $('#sr', box).value.trim(); if (!why) { $('#sr', box).focus(); return toast('צריך לכתוב סיבה'); }
          go.disabled = true; res = await sb.rpc('stock_fix', { p_item: c.monday_item_id, p_qty: v, p_reason: why }); }
        else { go.disabled = true; go.classList.add('busy'); let path = null;
          if (file) try { path = await upPhoto(file); } catch { toast('התמונה לא עלתה — נשמר בלעדיה'); }
          res = await sb.rpc('stock_in', { p_item: c.monday_item_id, p_qty: v, p_by_order: !!byOrder, p_supplier: $('#ss', box).value.trim() || null, p_note: $('#sn', box).value.trim() || null, p_photo: path, p_client: cid }); }
        go.disabled = false; go.classList.remove('busy');
        if (res.error) return toast(errMsg(res.error), 4000, 'error');
        toast(tab === 'count' ? `המלאי עודכן: ${v} ${c.unit || ''}` : fixMode ? `נרשם תיקון: −${v} ${c.unit || ''}` : `נוסף למלאי · עכשיו ${res.data?.stock ?? ''} ${c.unit || ''}`); close(); done();
      };
    };
    draw();
  });
}

export async function newRequest(cat, preselect) {
  if (!cat) { const { data } = await sb.from('catalog_items').select('monday_item_id,name,unit,order_unit,units_per_order,min_qty,stock,sku,supplier_name,is_material,in_app,category').eq('in_app', true).order('is_material', { ascending: false }).order('name'); cat = data || []; }
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
