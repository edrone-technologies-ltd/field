// רכש ומלאי: חומרי ניקוי וביגוד/ציוד מגן בלבד. בקשה מהקטלוג → נשלחת ללוח הרכש לאישור; הסטטוס חוזר לכאן.
import { sb, state, isManager, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, dm, backBtn, replaceHash } from '../lib/core.js';

const ST = { draft: ['טיוטה', ''], submitted: ['ממתין לאישור', 'warn'], pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'lime'], sent: ['נשלח לספק', 'lime'], partial: ['התקבל חלקית', 'lime'], received: ['התקבל', 'ok'], rejected: ['נדחה', 'bad'], cancelled: ['בוטל', ''] };
const nis = x => '₪' + Math.round(x || 0).toLocaleString('he-IL');
const low = c => c.min_qty != null && c.stock != null && Number(c.stock) <= Number(c.min_qty);

export async function renderPurchase(el) {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">רכש ומלאי</h1><button class="hbtn" id="padd" aria-label="בקשת רכש">${icon('plus', 20)}</button></header>
    <div id="pb" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: reqs }, { data: cat }] = await Promise.all([
    sb.from('purchase_requests').select('*, purchase_lines(name,qty,unit), profiles:requested_by(full_name), projects(name)').order('created_at', { ascending: false }).limit(40),
    sb.from('catalog_items').select('*').eq('in_app', true).order('is_material', { ascending: false }).order('name'),
  ]);
  const lows = (cat || []).filter(low);
  $('#pb').innerHTML = `
    ${lows.length > 1 ? `<button class="btn primary block" id="plow">${icon('cart', 18)} הזמנת כל החסרים (${lows.length})</button>` : ''}
    ${lows.length ? `<section><h3 class="sh">מתחת למינימום</h3><div class="alist">${lows.map(c => `<button class="arow warn" type="button" data-quick="${c.monday_item_id}"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(c.name)}</b><small>במלאי ${c.stock} ${esc(c.unit || '')} · מינימום ${c.min_qty}</small></span><span class="pill warn">להזמין</span></button>`).join('')}</div></section>` : ''}
    ${(reqs || []).length ? `<section><h3 class="sh">הבקשות${isManager() ? '' : ' שלי'}</h3><div class="list">${reqs.map(r => { const [t, c] = ST[r.status] || ['', ''];
      const open = isManager() && r.monday_item_id && ['submitted', 'pending'].includes(r.status), tag = open ? 'a' : 'div';
      return `<${tag} class="lrow"${open ? ` href="https://edroneil-force.monday.com/boards/5099908084/pulses/${esc(r.monday_item_id)}" target="_blank" rel="noopener"` : ''}><span class="grow"><b>${esc(r.title)}</b><small>${dm(r.created_at.slice(0, 10))} · ${esc(r.profiles?.full_name || '')}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''}</small>
        <small>${esc((r.purchase_lines || []).map(l => `${l.name} ×${l.qty}`).join(' · '))}</small></span><span class="pill ${c}">${t}</span></${tag}>`; }).join('')}</div></section>` : lows.length ? '' : `<div class="ecta"><span class="ei">${icon('cart', 28)}</span><b>המלאי תקין</b><button class="btn primary" id="pnew">${icon('plus', 18)} בקשת רכש</button></div>`}
    ${(cat || []).length ? `<section><div class="sh-row"><h3 class="sh">מלאי</h3><span class="count">${cat.length}</span></div><div class="list">${[...cat].sort((a, b) => low(b) - low(a)).map(c => { const pct = c.min_qty ? Math.min(100, Math.round(Number(c.stock || 0) / (Number(c.min_qty) * 2) * 100)) : null;
      return `<button type="button" class="lrow stockrow" data-quick="${c.monday_item_id}"><span class="grow"><b>${esc(c.name)}</b>${pct != null ? `<span class="meter ${low(c) ? 'warn' : 'ok'}"><i style="width:${Math.max(4, pct)}%"></i></span>` : ''}</span><span class="pill ${low(c) ? 'warn' : 'ok'}">${c.stock ?? '—'} ${esc(c.unit || '')}</span></button>`; }).join('')}</div></section>` : ''}`;
  if (/^#\/purchase\/new/.test(location.hash)) { replaceHash('#/purchase', false); newRequest(cat || []); }   // מה"+" — בלי כפתור במסך
  $$('[data-quick]').forEach(b => b.onclick = () => newRequest(cat || [], b.dataset.quick));
  ['#padd', '#pnew'].forEach(k => { const b = $(k); if (b) b.onclick = () => newRequest(cat || []); });
  const pl = $('#plow'); if (pl) pl.onclick = () => newRequest(cat || [], lows.map(c => c.monday_item_id));
}

export async function newRequest(cat, preselect) {
  if (!cat) { const { data } = await sb.from('catalog_items').select('*').eq('in_app', true).order('is_material', { ascending: false }).order('name'); cat = data || []; }
  const { data: projects } = await sb.from('projects').select('id,name,status_label,monday_group').neq('monday_group', 'group_mm5052gw').order('name');
  // כמות מוצעת = עד פעמיים המינימום. בלי בחירה מראש — כל מה שמתחת למינימום כבר בסל
  // כמות מוצעת (ביחידות הזמנה — קרטון/גלון): מה שחסר עד המינימום + יחידת הזמנה אחת מעליו, כדי שלא נהיה שוב "נמוך" ביום ההגעה.
  // (היה: עד פעמיים המינימום → Assert Lemon: 10 קרטונים = 20 גלון למינימום של 10)
  const per = c => Number(c.units_per_order || 1), Q = {}, want = c => Math.max(1, Math.ceil(Math.max(0, Number(c.min_qty || 0) - Number(c.stock || 0)) / per(c)) + 1);
  const eq = c => per(c) > 1 && c.unit ? ` = ${(Q[c.monday_item_id] || 0) * per(c)} ${c.unit}` : '';
  for (const k of preselect ? [].concat(preselect) : cat.filter(low).map(c => c.monday_item_id)) { const c = cat.find(x => x.monday_item_id === k); if (c) Q[k] = want(c); }
  cat = [...cat].sort((a, b) => (Q[b.monday_item_id] ? 1 : 0) - (Q[a.monday_item_id] ? 1 : 0) || low(b) - low(a));
  const free = [];
  const total = () => cat.reduce((t, c) => t + (Q[c.monday_item_id] || 0) * Number(c.price_per_order || 0), 0) + free.reduce((t, f) => t + f.qty * (f.price || 0), 0);
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
      const lines = cat.filter(c => Q[c.monday_item_id] > 0).map(c => ({ catalog_monday_id: c.monday_item_id, name: c.name, qty: Q[c.monday_item_id], unit: c.order_unit || c.unit, unit_price: c.price_per_order }))
;
      if (!lines.length) return toast('לא נבחרו פריטים');
      const go = $('#rgo', s); if (go.disabled) return; go.disabled = true;
      const proj = (projects || []).find(p => p.id === $('#rp', s).value);
      const id = uid(), title = `${lines.map(l => l.name).slice(0, 2).join(' + ')}${lines.length > 2 ? ` ועוד ${lines.length - 2}` : ''}${proj ? ' — ' + proj.name : ''}`;
      await enqueue({ kind: 'insert', table: 'purchase_requests', row: { id, title, requested_by: state.user.id, project_id: proj?.id || null, needed_by: $('#rd', s).value || null, notes: $('#rn', s).value.trim() || null, total: Math.round(total() * 100) / 100 } });
      for (const l of lines) await enqueue({ kind: 'insert', table: 'purchase_lines', row: { id: uid(), request_id: id, ...l } });
      close(); toast('הבקשה נשלחה'); await flush(); renderPurchase($('#app'));
    };
  });
}
