// הוצאות שטח: צילום קבלה → קטגוריה, סכום, פרויקט → אישור מנהל → נכנס לעלות הפרויקט (ולמאנדי) ולייצוא להנהלת החשבונות.
import { sb, state, isManager, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, ask, dm, signedUrls } from '../lib/core.js';
import { shrink } from '../lib/store.js';

export const CATS = { fuel: 'דלק', parking: 'חניה', toll: 'כביש אגרה', food: 'אוכל', lodging: 'לינה', materials: 'חומרים / ציוד קטן', other: 'אחר' };
const ST = { pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'ok'], rejected: ['נדחה', 'bad'] };
const nis = x => '₪' + Number(x || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

export async function renderExpenses(el) {
  const M = isManager();
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">הוצאות</h1>${M ? '<button class="btn ghost sm" id="xls">ייצוא</button>' : ''}</header>
    <button class="btn primary block big" id="newx">${icon('plus', 20)} הוצאה חדשה</button><div id="xb" class="stack lg"><div class="skel"></div></div>`;
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const { data: rows } = await sb.from('expenses').select('*, profiles:user_id(full_name), projects(name)').gte('day', since).order('day', { ascending: false }).order('created_at', { ascending: false });
  const mine = (rows || []).filter(r => r.user_id === state.user.id), pend = M ? (rows || []).filter(r => r.status === 'pending' && r.user_id !== state.user.id) : [];
  const urls = await signedUrls('field', (rows || []).map(r => r.receipt_path).filter(Boolean)).catch(() => ({}));
  const row = (r, decide) => { const [t, c] = ST[r.status];
    return `<div class="lrow xrow">${r.receipt_path && urls[r.receipt_path] ? `<img src="${esc(urls[r.receipt_path])}" alt="קבלה" data-z="${esc(urls[r.receipt_path])}">` : `<span class="rep-ph">${icon('report', 20)}</span>`}
      <span class="grow"><b>${nis(r.amount)} · ${CATS[r.category]}</b><small>${dm(r.day)}${r.vendor ? ' · ' + esc(r.vendor) : ''}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''}${decide ? ' · ' + esc(r.profiles?.full_name || '') : ''}</small>
      ${r.note ? `<small>${esc(r.note)}</small>` : ''}${r.manager_reply ? `<small class="mreply">תגובה: ${esc(r.manager_reply)}</small>` : ''}</span>
      ${decide ? `<span class="stack" style="gap:4px"><button class="chip" data-ok="${r.id}">אישור</button><button class="chip" data-no="${r.id}">דחייה</button></span>` : `<span class="pill ${c}">${t}</span>`}</div>`; };
  const monthTot = mine.filter(r => r.day.slice(0, 7) === new Date().toISOString().slice(0, 7) && r.status !== 'rejected').reduce((t, r) => t + Number(r.amount), 0);
  $('#xb').innerHTML = `${pend.length ? `<section><div class="sh-row"><h3 class="sh">לאישור</h3><span class="count">${pend.length}</span></div><div class="list">${pend.map(r => row(r, true)).join('')}</div></section>` : ''}
    <section><div class="sh-row"><h3 class="sh">שלי</h3><span class="more">החודש ${nis(monthTot)}</span></div><div class="list">${mine.map(r => row(r, false)).join('') || '<div class="muted small">עוד אין הוצאות</div>'}</div></section>
    ${M ? `<details class="fold"><summary><span class="sh">כל ההוצאות (60 יום)</span><span class="count">${(rows || []).length}</span></summary><div class="list">${(rows || []).map(r => row(r, false).replace('</b><small>', `</b><small>${esc(r.profiles?.full_name || '')} · `)).join('')}</div></details>` : ''}`;
  const reload = () => renderExpenses(el);
  $('#newx').onclick = () => newExpense(null, reload);
  $$('[data-z]', el).forEach(i => i.onclick = async () => (await import('../lib/core.js')).zoom(i.dataset.z, 'קבלה'));
  $$('[data-ok]', el).forEach(b => b.onclick = async () => { const { error } = await sb.from('expenses').update({ status: 'approved', manager_id: state.user.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.ok); if (error) return toast(error.message); toast('אושר'); reload(); });
  $$('[data-no]', el).forEach(b => b.onclick = async () => { const r = await ask('למה נדחה?', { ok: 'דחייה' }); if (r == null) return;
    const { error } = await sb.from('expenses').update({ status: 'rejected', manager_id: state.user.id, manager_reply: r, decided_at: new Date().toISOString() }).eq('id', b.dataset.no); if (error) return toast(error.message); reload(); });
  const x = $('#xls'); if (x) x.onclick = () => exportXls(rows || []);
}

export async function newExpense(projectId, done, back) {
  let cat = 'fuel', file = null;
  const [{ data: projects }, { data: vehicles }] = await Promise.all([sb.rpc('reportable_projects'), sb.from('equipment').select('id,name').eq('kind', 'vehicle')]);
  sheet(`<h3>הוצאה חדשה</h3>
    <label class="btn ghost block" style="position:relative">${icon('plus', 18)} <span id="rcn">צילום קבלה</span><input type="file" accept="image/*" capture="environment" id="rc" style="position:absolute;inset:0;opacity:0"></label>
    <div class="chips">${Object.entries(CATS).map(([k, t]) => `<button class="chip" data-c="${k}" aria-pressed="${k === cat}">${t}</button>`).join('')}</div>
    <div class="row"><label class="field grow">סכום (₪)<input type="number" inputmode="decimal" step="0.01" id="xa"></label><label class="field grow">תאריך<input type="date" id="xd" value="${new Date().toISOString().slice(0, 10)}"></label></div>
    <label class="field">ספק / מקום<input type="text" id="xv" placeholder="למשל: פז, חניון עזריאלי"></label>
    <div id="fuel" class="row"><label class="field grow">ליטרים<input type="number" inputmode="decimal" id="xl"></label><label class="field grow">ק"מ ברכב<input type="number" inputmode="numeric" id="xo"></label></div>
    ${(vehicles || []).length ? `<label class="field" id="veh">רכב<select id="xr"><option value="">—</option>${vehicles.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field">פרויקט<select id="xp"><option value="">כללי</option>${(projects || []).map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field">הערה<input type="text" id="xn"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="xgo">שליחה</button></div>`, (s, close) => {
    const sync = () => { $('#fuel', s).hidden = cat !== 'fuel'; const v = $('#veh', s); if (v) v.hidden = cat !== 'fuel'; };
    $$('[data-c]', s).forEach(b => b.onclick = () => { cat = b.dataset.c; $$('[data-c]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); sync(); }); sync();
    $('#rc', s).onchange = e => { file = e.target.files[0]; $('#rcn', s).textContent = file ? 'הקבלה צולמה ✓' : 'צילום קבלה'; };
    $('#xgo', s).onclick = async () => {
      const amount = +$('#xa', s).value; if (!(amount > 0)) return toast('חסר סכום');
      if (!file && !(await (await import('../lib/core.js')).confirmBox('בלי קבלה?', { body: 'בלי צילום קבלה ההוצאה עלולה לא להיות מוכרת.', ok: 'לשלוח בכל זאת' }))) return;
      const id = uid(); let receipt_path = null;
      if (file) { receipt_path = `${state.user.id}/receipts/${id}.jpg`; await enqueue({ kind: 'file', path: receipt_path, blob: await shrink(file, 1800, 0.8), type: 'image/jpeg' }); }
      await enqueue({ kind: 'insert', table: 'expenses', row: { id, user_id: state.user.id, category: cat, amount, day: $('#xd', s).value, vendor: $('#xv', s).value.trim() || null, note: $('#xn', s).value.trim() || null,
        project_id: $('#xp', s).value || null, vehicle_id: $('#xr', s)?.value || null, liters: cat === 'fuel' ? (+$('#xl', s).value || null) : null, odometer: cat === 'fuel' ? (+$('#xo', s).value || null) : null, receipt_path } });
      close(); toast('ההוצאה נשלחה לאישור'); await flush(); done && done();
    };
  }, { back });
}

async function exportXls(rows) {
  if (!window.XLSX) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  const X = window.XLSX, ok = rows.filter(r => r.status === 'approved');
  const data = [['תאריך', 'עובד', 'קטגוריה', 'סכום ₪', 'ספק', 'פרויקט', 'ליטרים', 'ק"מ', 'הערה', 'קבלה']].concat(ok.map(r => [r.day, r.profiles?.full_name || '', CATS[r.category], Number(r.amount), r.vendor || '', r.projects?.name || '', r.liters || '', r.odometer || '', r.note || '', r.receipt_path ? 'יש' : 'אין']));
  data.push([], ['סה״כ', '', '', ok.reduce((t, r) => t + Number(r.amount), 0)]);
  const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; const ws = X.utils.aoa_to_sheet(data); ws['!views'] = [{ RTL: true }]; ws['!cols'] = [11, 16, 14, 10, 18, 26, 8, 8, 24, 7].map(w => ({ wch: w }));
  X.utils.book_append_sheet(wb, ws, 'הוצאות מאושרות'); X.writeFile(wb, `הוצאות-שטח-${new Date().toISOString().slice(0, 7)}.xlsx`);
}
