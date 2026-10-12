// הוצאות שטח: צילום קבלה → קטגוריה, סכום, פרויקט → אישור מנהל → נכנס לעלות הפרויקט (ולמאנדי) ולייצוא להנהלת החשבונות.
import { sb, state, isManager, can, cache, enqueue, flush, sheet, uid, icon, $, $$, esc, toast, ask, dm, signedUrls, isoDay, backBtn, replaceHash } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { errText } from '../lib/audit.js';

export const CATS = { fuel: 'דלק', parking: 'חניה', toll: 'כביש אגרה', food: 'אוכל', lodging: 'לינה', materials: 'חומרים / ציוד קטן', other: 'אחר' };
const ST = { pending: ['ממתין לאישור', 'warn'], approved: ['אושר', 'ok'], rejected: ['נדחה', 'bad'] };
const nis = x => '₪' + Number(x || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

export async function renderExpenses(el) {
  const M = can('finance');   // הוצאות של אחרים ואישורן = כספים בלבד
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">הוצאות</h1>${M ? '<button class="btn ghost sm" id="xls">ייצוא</button>' : ''}<button class="hbtn" id="xadd" aria-label="הוצאה חדשה">${icon('plus', 20)}</button></header>
    <div id="xb" class="stack lg"><div class="skel"></div></div>`;
  const since = isoDay(new Date(Date.now() - 60 * 864e5));
  const { data: rows } = await sb.from('expenses').select('*, profiles:user_id(full_name), projects(name)').gte('day', since).order('day', { ascending: false }).order('created_at', { ascending: false });
  const mine = (rows || []).filter(r => r.user_id === state.user.id), pend = M ? (rows || []).filter(r => r.status === 'pending' && r.user_id !== state.user.id) : [];
  const urls = await signedUrls('field', (rows || []).map(r => r.receipt_path).filter(Boolean)).catch(() => ({}));
  const row = (r, decide) => { const [t, c] = ST[r.status];
    return `<div class="lrow xrow">${r.receipt_path && urls[r.receipt_path] ? `<img src="${esc(urls[r.receipt_path])}" alt="קבלה" data-z="${esc(urls[r.receipt_path])}">` : `<span class="rep-ph">${icon('report', 20)}</span>`}
      <span class="grow"><b>${nis(r.amount)} · ${CATS[r.category]}</b><small>${dm(r.day)}${r.vendor ? ' · ' + esc(r.vendor) : ''}${r.projects?.name ? ' · ' + esc(r.projects.name) : ''}${decide ? ' · ' + esc(r.profiles?.full_name || '') : ''}</small>
      ${r.note ? `<small>${esc(r.note)}</small>` : ''}${r.manager_reply ? `<small class="mreply">תגובה: ${esc(r.manager_reply)}</small>` : ''}${M && r.morning_status === 'sent' ? `<small class="ok">במורנינג ${icon('check', 12)}</small>` : M && r.morning_error && r.morning_tries >= 5 ? '<small class="err">לא נשלח למורנינג</small>' : ''}</span>
      ${decide ? `<span class="stack tight"><button class="chip" data-ok="${r.id}">אישור</button><button class="chip" data-no="${r.id}">דחייה</button></span>` : `<span class="pill ${c}">${t}</span>`}</div>`; };
  const monthTot = mine.filter(r => r.day.slice(0, 7) === isoDay().slice(0, 7) && r.status !== 'rejected').reduce((t, r) => t + Number(r.amount), 0);
  $('#xb').innerHTML = `${pend.length ? `<section><div class="sh-row"><h3 class="sh">לאישור</h3>${pend.length > 1 ? `<button class="more" type="button" id="okall">${icon('check', 16)} אישור הכל · ${nis(pend.reduce((t, r) => t + Number(r.amount), 0))}</button>` : '<span class="count">1</span>'}</div><div class="list">${pend.map(r => row(r, true)).join('')}</div></section>` : ''}
    ${mine.length ? `<section><div class="sh-row"><h3 class="sh">שלי</h3>${monthTot ? `<span class="more">החודש ${nis(monthTot)}</span>` : ''}</div><div class="list">${mine.map(r => row(r, false)).join('')}</div></section>`
      : pend.length ? '' : `<label class="ecta"><span class="ei">${icon('receipt', 28)}</span><span class="btn primary">${icon('photo', 18)} צילום קבלה</span><input type="file" accept="image/*" capture="environment" id="xcam" hidden></label>`}
    ${M && (rows || []).length ? `<details class="fold"><summary><span class="sh">כל ההוצאות (60 יום)</span><span class="count">${(rows || []).length}</span></summary><div class="list">${(rows || []).map(r => row(r, false).replace('</b><small>', `</b><small>${esc(r.profiles?.full_name || '')} · `)).join('')}</div></details>` : ''}`;
  const reload = () => renderExpenses(el);
  $('#xadd').onclick = () => newExpense(null, reload);
  const cam = $('#xcam'); if (cam) cam.onchange = e => { const f = e.target.files[0]; if (f) newExpense(null, reload, null, f); };
  const oa = $('#okall'); if (oa) oa.onclick = async () => { if (oa.disabled) return; oa.disabled = true;
    const { error } = await sb.from('expenses').update({ status: 'approved', manager_id: state.user.id, decided_at: new Date().toISOString() }).in('id', pend.map(r => r.id));
    if (error) { oa.disabled = false; return toast(errText(error)); } toast(`אושרו ${pend.length}`); reload(); };
  if (/^#\/expenses\/new/.test(location.hash)) { replaceHash('#/expenses', false); newExpense(null, reload); }   // מה"+" — בלי כפתור במסך
  $$('[data-z]', el).forEach(i => i.onclick = async () => (await import('../lib/core.js')).zoom(i.dataset.z, 'קבלה'));
  // אישור/דחייה: נועלים את שני הכפתורים של השורה עד תשובת השרת
  const lock = (b, on) => b.parentElement.querySelectorAll('button').forEach(x => x.disabled = on);
  $$('[data-ok]', el).forEach(b => b.onclick = async () => { if (b.disabled) return; lock(b, true);
    const { error } = await sb.from('expenses').update({ status: 'approved', manager_id: state.user.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.ok); if (error) { lock(b, false); return toast(errText(error)); } toast('אושר'); reload(); });
  $$('[data-no]', el).forEach(b => b.onclick = async () => { const r = await ask('למה נדחה?', { ok: 'דחייה' }); if (r == null || b.disabled) return; lock(b, true);
    const { error } = await sb.from('expenses').update({ status: 'rejected', manager_id: state.user.id, manager_reply: r, decided_at: new Date().toISOString() }).eq('id', b.dataset.no); if (error) { lock(b, false); return toast(errText(error)); } toast('נדחה — העובד קיבל הודעה'); reload(); });
  const x = $('#xls'); if (x) x.onclick = () => exportXls(rows || []).catch(() => toast('הייצוא לא הצליח — בדקו קליטה ונסו שוב'));
}

const LAST = 'edrone-exp-last';
const lastGet = () => { try { return JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { return {}; } };
export async function newExpense(projectId, done, back, file0 = null) {
  const L = lastGet();
  let cat = CATS[L.cat] && L.cat !== 'other' ? L.cat : 'fuel', file = file0, prevUrl = null;   // "אחר" אף פעם לא ברירת מחדל
  if (!projectId) {   // ברירת מחדל: הפרויקט של המשמרת הפתוחה / של יום השטח היום
    projectId = (await cache.get('open-shift').catch(() => null))?.project_id || null;
    if (!projectId) try { const { data } = await sb.from('work_days').select('project_id,work_day_crew!inner(user_id)').eq('day', isoDay()).eq('work_day_crew.user_id', state.user.id).limit(1); projectId = data?.[0]?.project_id || null; } catch { /* */ }
  }
  const [{ data: projects }, { data: vehicles }] = await Promise.all([sb.rpc('reportable_projects'), sb.from('equipment').select('id,name').eq('kind', 'vehicle')]);
  sheet(`<h3>הוצאה חדשה</h3>
    <label class="rcpt" id="rcl"><img id="rci" alt="" hidden><span class="rcph" id="rcn">${icon('photo', 22)} צילום קבלה</span><input type="file" accept="image/*" capture="environment" id="rc" hidden></label>
    <div class="chips">${Object.entries(CATS).map(([k, t]) => `<button class="chip" data-c="${k}" aria-pressed="${k === cat}">${t}</button>`).join('')}</div>
    <div class="row"><label class="field grow">סכום (₪)<input type="number" inputmode="decimal" step="0.01" id="xa"></label><label class="field grow">תאריך<input type="date" id="xd" value="${isoDay()}"></label></div>
    <label class="field">ספק / מקום<input type="text" id="xv" placeholder="למשל: פז, חניון עזריאלי"></label>
    <div id="fuel" class="row"><label class="field grow">ליטרים<input type="number" inputmode="decimal" id="xl"></label><label class="field grow">ק״מ ברכב<input type="number" inputmode="numeric" id="xo"></label></div>
    ${(vehicles || []).length ? `<label class="field" id="veh">רכב<select id="xr"><option value="">—</option>${vehicles.map(v => `<option value="${v.id}" ${v.id === L.veh ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field">פרויקט<select id="xp"><option value="">כללי</option>${(projects || []).map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field">הערה<input type="text" id="xn"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="xgo">שליחה לאישור</button></div>`, (s, close) => {
    const pic = () => { const i = $('#rci', s); if (prevUrl) URL.revokeObjectURL(prevUrl); prevUrl = file ? URL.createObjectURL(file) : null; i.hidden = !file; if (file) i.src = prevUrl;
      $('#rcn', s).innerHTML = file ? `${icon('check', 18)} הקבלה צולמה · החלפה` : `${icon('photo', 22)} צילום קבלה`; $('#rcl', s).classList.toggle('on', !!file);
      $('#xgo', s).textContent = file ? 'שליחה' : 'שליחה בלי קבלה'; };
    pic(); setTimeout(() => $('#xa', s)?.focus(), 120);
    const sync = () => { $('#fuel', s).hidden = cat !== 'fuel'; const v = $('#veh', s); if (v) v.hidden = cat !== 'fuel'; };
    $$('[data-c]', s).forEach(b => b.onclick = () => { cat = b.dataset.c; $$('[data-c]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); sync(); }); sync();
    $('#rc', s).onchange = e => { file = e.target.files[0] || file; pic(); $('#xa', s)?.focus(); };
    $('#xgo', s).onclick = async () => {
      const amount = +$('#xa', s).value; if (!(amount > 0)) return toast('חסר סכום');
      const go = $('#xgo', s); if (go.disabled) return; go.disabled = true;
      const id = uid(); let receipt_path = null;
      if (file) { receipt_path = `${state.user.id}/receipts/${id}.jpg`; await enqueue({ kind: 'file', path: receipt_path, blob: await shrink(file, 1800, 0.8), type: 'image/jpeg' }); }
      await enqueue({ kind: 'insert', table: 'expenses', row: { id, user_id: state.user.id, category: cat, amount, day: $('#xd', s).value, vendor: $('#xv', s).value.trim() || null, note: $('#xn', s).value.trim() || null,
        project_id: $('#xp', s).value || null, vehicle_id: $('#xr', s)?.value || null, liters: cat === 'fuel' ? (+$('#xl', s).value || null) : null, odometer: cat === 'fuel' ? (+$('#xo', s).value || null) : null, receipt_path } });
      try { localStorage.setItem(LAST, JSON.stringify({ cat, veh: $('#xr', s)?.value || L.veh || '' })); } catch { /* */ }
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      close(); toast('ההוצאה נשלחה לאישור'); await flush(); done && done();
    };
  }, { back });
}

async function exportXls(rows) {
  if (!window.XLSX) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  const X = window.XLSX, ok = rows.filter(r => r.status === 'approved');
  const data = [['תאריך', 'עובד', 'קטגוריה', 'סכום ₪', 'ספק', 'פרויקט', 'ליטרים', 'ק״מ', 'הערה', 'קבלה']].concat(ok.map(r => [r.day, r.profiles?.full_name || '', CATS[r.category], Number(r.amount), r.vendor || '', r.projects?.name || '', r.liters || '', r.odometer || '', r.note || '', r.receipt_path ? 'יש' : 'אין']));
  data.push([], ['סה״כ', '', '', ok.reduce((t, r) => t + Number(r.amount), 0)]);
  const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; const ws = X.utils.aoa_to_sheet(data); ws['!views'] = [{ RTL: true }]; ws['!cols'] = [11, 16, 14, 10, 18, 26, 8, 8, 24, 7].map(w => ({ wch: w }));
  X.utils.book_append_sheet(wb, ws, 'הוצאות מאושרות'); X.writeFile(wb, `הוצאות-שטח-${isoDay().slice(0, 7)}.xlsx`);
}
