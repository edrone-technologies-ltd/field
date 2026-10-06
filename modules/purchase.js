// רכש ומלאי: מצב מלאי מהקטלוג במאנדי, בקשת רכש (פריטים מהקטלוג + פריט חופשי) → נשלחת ללוח הרכש לאישור; הסטטוס חוזר לכאן.
import { sb, state, isManager, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, dm } from '../lib/core.js';

const ST = { draft: ['טיוטה', ''], submitted: ['נשלח לאישור', 'warn'], pending: ['ממתין לאישור מנכ"ל', 'warn'], approved: ['אושר', 'lime'], sent: ['נשלח לספק', 'lime'], partial: ['התקבל חלקית', 'lime'], received: ['התקבל', 'ok'], rejected: ['נדחה', 'bad'], cancelled: ['בוטל', ''] };
const nis = x => '₪' + Math.round(x || 0).toLocaleString('he-IL');
const low = c => c.min_qty != null && c.stock != null && Number(c.stock) <= Number(c.min_qty);

export async function renderPurchase(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">רכש ומלאי</h1></header>
    <button class="btn primary block big" id="newreq">${icon('plus', 20)} בקשת רכש חדשה</button><div id="pb" class="stack lg"><div class="skel"></div></div>`;
  const [{ data: reqs }, { data: cat }] = await Promise.all([
    sb.from('purchase_requests').select('*, purchase_lines(name,qty,unit), profiles:requested_by(full_name), projects(name)').order('created_at', { ascending: false }).limit(40),
    sb.from('catalog_items').select('*').order('is_material', { ascending: false }).order('name'),
  ]);
  const lows = (cat || []).filter(low);
  $('#pb').innerHTML = `
    ${lows.length ? `<section><h3 class="sh">מתחת למינימום</h3><div class="alist">${lows.map(c => `<button class="arow warn" data-quick="${c.monday_item_id}" style="width:100%;border:0;font:inherit;text-align:right;cursor:pointer"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${esc(c.name)}</b><small>במלאי ${c.stock} ${esc(c.unit || '')} · מינימום ${c.min_qty}</small></span><span class="pill warn">להזמין</span></button>`).join('')}</div></section>` : ''}
    <section><h3 class="sh">הבקשות${isManager() ? '' : ' שלי'}</h3><div class="list">${(reqs || []).map(r => { const [t, c] = ST[r.status] || ['', ''];
      return `<div class="lrow"><span class="grow"><b>${esc(r.title)}</b><small>${dm(r.created_at.slice(0, 10))} · ${esc(r.profiles?.full_name || '')}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''} · ${nis(r.total)}</small>
        <small>${esc((r.purchase_lines || []).map(l => `${l.name} ×${l.qty}`).join(' · '))}</small></span><span class="pill ${c}">${t}</span></div>`; }).join('') || '<div class="muted small">עוד אין בקשות</div>'}</div></section>
    <details class="fold"><summary><span class="sh">מצב מלאי</span><span class="count">${(cat || []).length}</span></summary><div class="list">${(cat || []).map(c => `<div class="lrow kv"><span class="grow"><small>${esc(c.supplier_name || '')}${c.sku ? ' · ' + esc(c.sku) : ''}</small><b>${esc(c.name)}</b></span><span class="pill ${low(c) ? 'warn' : 'ok'}">${c.stock ?? '—'} ${esc(c.unit || '')}</span></div>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">המלאי מתעדכן ממאנדי: צריכה מהדוחות היומיים וקבלת סחורה בלוח הרכש.</div></details>`;
  $('#newreq').onclick = () => newRequest(cat || []);
  $$('[data-quick]').forEach(b => b.onclick = () => newRequest(cat || [], b.dataset.quick));
}

async function newRequest(cat, preselect) {
  const { data: projects } = await sb.from('projects').select('id,name,status_label,monday_group').neq('monday_group', 'group_mm5052gw').order('name');
  const Q = {}; if (preselect) { const c = cat.find(x => x.monday_item_id === preselect); Q[preselect] = Math.max(1, Math.ceil(((c.min_qty || 0) * 2 - (c.stock || 0)) / (c.units_per_order || 1))); }
  const free = [];
  const total = () => cat.reduce((t, c) => t + (Q[c.monday_item_id] || 0) * Number(c.price_per_order || 0), 0) + free.reduce((t, f) => t + f.qty * (f.price || 0), 0);
  sheet(`<h3>בקשת רכש</h3>
    <div class="list" id="ci">${cat.map(c => `<div class="lrow"><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.order_unit || c.unit || '')}${c.price_per_order ? ' · ' + nis(c.price_per_order) : ''} · במלאי ${c.stock ?? '—'}${low(c) ? ' · <span style="color:var(--warn)">נמוך</span>' : ''}</small></span>
      <span class="qty"><button type="button" data-m="${c.monday_item_id}">−</button><b id="q-${c.monday_item_id}">${Q[c.monday_item_id] || 0}</b><button type="button" data-p="${c.monday_item_id}">+</button></span></div>`).join('')}</div>
    <button class="btn ghost block" id="addfree">${icon('plus', 18)} פריט שלא בקטלוג</button><div id="fl" class="list"></div>
    <label class="field">לאיזה פרויקט (לא חובה)<select id="rp"><option value="">כללי / מלאי</option>${(projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field">נדרש עד<input type="date" id="rd"></label>
    <label class="field">הערות לספק / למאשר<textarea id="rn" rows="2"></textarea></label>
    <div class="row"><b class="grow">סה״כ לפני מע״מ</b><b id="tot">${nis(total())}</b></div><div class="small muted" id="thr"></div>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="rgo">שליחה לאישור</button></div>`, (s, close) => {
    const upd = () => { $('#tot', s).textContent = nis(total()); $('#thr', s).textContent = total() > 1000 ? 'מעל ₪1,000 — עובר לאישור המנכ"ל במאנדי' : 'עובר לאישור במאנדי'; };
    $$('[data-p]', s).forEach(b => b.onclick = () => { const k = b.dataset.p; Q[k] = (Q[k] || 0) + 1; $('#q-' + k, s).textContent = Q[k]; upd(); });
    $$('[data-m]', s).forEach(b => b.onclick = () => { const k = b.dataset.m; Q[k] = Math.max(0, (Q[k] || 0) - 1); $('#q-' + k, s).textContent = Q[k]; upd(); });
    $('#addfree', s).onclick = () => {
      const i = free.length; free.push({ name: '', qty: 1, price: null });
      $('#fl', s).insertAdjacentHTML('beforeend', `<div class="row"><input type="text" placeholder="מה צריך" data-fn="${i}" class="grow"><input type="number" placeholder="כמות" value="1" data-fq="${i}" style="width:70px"><input type="number" placeholder="₪ ליח׳" data-fp="${i}" style="width:84px"></div>`);
      $(`[data-fn="${i}"]`, s).oninput = e => free[i].name = e.target.value; $(`[data-fq="${i}"]`, s).oninput = e => { free[i].qty = +e.target.value || 0; upd(); }; $(`[data-fp="${i}"]`, s).oninput = e => { free[i].price = +e.target.value || null; upd(); };
    };
    upd();
    $('#rgo', s).onclick = async () => {
      const lines = cat.filter(c => Q[c.monday_item_id] > 0).map(c => ({ catalog_monday_id: c.monday_item_id, name: c.name, qty: Q[c.monday_item_id], unit: c.order_unit || c.unit, unit_price: c.price_per_order }))
        .concat(free.filter(f => f.name.trim() && f.qty > 0).map(f => ({ catalog_monday_id: null, name: f.name.trim(), qty: f.qty, unit: null, unit_price: f.price })));
      if (!lines.length) return toast('לא נבחרו פריטים');
      const proj = (projects || []).find(p => p.id === $('#rp', s).value);
      const id = uid(), title = `${lines.map(l => l.name).slice(0, 2).join(' + ')}${lines.length > 2 ? ` ועוד ${lines.length - 2}` : ''}${proj ? ' — ' + proj.name : ''}`;
      await enqueue({ kind: 'insert', table: 'purchase_requests', row: { id, title, requested_by: state.user.id, project_id: proj?.id || null, needed_by: $('#rd', s).value || null, notes: $('#rn', s).value.trim() || null, total: Math.round(total() * 100) / 100 } });
      for (const l of lines) await enqueue({ kind: 'insert', table: 'purchase_lines', row: { id: uid(), request_id: id, ...l } });
      close(); toast('הבקשה נשלחה — תופיע במאנדי לאישור תוך כמה דקות'); await flush(); renderPurchase($('#app'));
    };
  });
}
