// ציוד: מצב הצי והציוד, היסטוריית תקלות, ודיווח תקלה בציוד. מצב הרחפנים מגיע מלוח בריאות הצי במאנדי.
import { sb, state, isManager, cache, enqueue, sheet, uid, $, $$, esc, toast, dm } from '../lib/core.js';

const KIND = { drone: 'רחפנים', vehicle: 'רכבים', trailer: 'נגררים', pump: 'משאבות', battery: 'סוללות', other: 'אחר' };
const HEALTH = { ok: ['תקין', 'ok'], warning: ['במעקב', 'warn'], grounded: ['מקורקע', 'bad'], maintenance: ['בטיפול', 'warn'] };

export async function renderEquipment(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/menu" aria-label="חזרה"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></a><h1>ציוד</h1></header><div id="el" class="stack"><div class="skel"></div></div>`;
  let rows, iss;
  try {
    const [{ data, error }, { data: i }] = await Promise.all([
      sb.from('equipment').select('*').order('kind').order('name'),
      sb.from('issues').select('id,equipment_id,body,status,created_at,severity').not('equipment_id', 'is', null).order('created_at', { ascending: false }).limit(100),
    ]);
    if (error) throw error; rows = data || []; iss = i || []; await cache.set('equipment', { rows, iss });
  } catch { ({ rows = [], iss = [] } = (await cache.get('equipment')) || {}); }
  const M = isManager();
  const draw = () => {
    const by = {}; rows.forEach(r => (by[r.kind] ||= []).push(r));
    $('#el').innerHTML = Object.entries(KIND).filter(([k]) => by[k]).map(([k, t]) => `<div class="group-h">${t}</div><div class="list">${by[k].map(r => {
      const h = HEALTH[r.health] || ['', '']; const open = iss.filter(i => i.equipment_id === r.id && i.status === 'open').length;
      return `<button class="item" data-e="${r.id}"><span class="dot ${h[1]}"></span><span class="t"><b>${esc(r.name)}</b><small>${h[0]}${r.health_date ? ' · נבדק ' + dm(r.health_date) : ''}${open ? ` · ${open} תקלות פתוחות` : ''}</small></span></button>`;
    }).join('')}</div>`).join('') + (M ? `<button class="btn ghost block" id="add">+ פריט ציוד</button>` : '') + (rows.length ? '' : '<div class="empty">אין ציוד רשום.</div>');
    $$('[data-e]').forEach(b => b.onclick = () => detail(rows.find(r => r.id === b.dataset.e)));
    const a = $('#add'); if (a) a.onclick = addItem;
  };
  function detail(r) {
    const h = HEALTH[r.health] || ['', ''], mine = iss.filter(i => i.equipment_id === r.id);
    const fromMonday = !!r.monday_label;
    sheet(`<div class="row"><h3 class="grow">${esc(r.name)}</h3><span class="pill ${h[1]}">${h[0]}</span></div>
      ${r.serial ? `<div class="small muted">מספר סידורי ${esc(r.serial)}</div>` : ''}
      ${r.health_detail || r.health_note ? `<div class="note" style="white-space:pre-line">${esc(r.health_detail || r.health_note)}</div>` : ''}
      ${fromMonday ? '<div class="small muted">המצב מתעדכן אוטומטית מבדיקת הלוגים של הכלי.</div>'
        : M ? `<div class="chips">${Object.entries(HEALTH).map(([k, v]) => `<button class="chip" data-h="${k}" aria-pressed="${r.health === k}">${v[0]}</button>`).join('')}</div>` : ''}
      <b>תקלות</b>${mine.map(i => `<div class="feed"><span class="pill ${i.status === 'open' ? 'warn' : 'ok'}">${i.status === 'open' ? 'פתוחה' : 'טופלה'}</span><span class="grow"><b>${esc(i.body)}</b><small>${new Date(i.created_at).toLocaleDateString('he-IL')}</small></span></div>`).join('') || '<div class="small muted">אין תקלות רשומות.</div>'}
      <textarea id="eb" placeholder="דיווח תקלה בציוד הזה"></textarea>
      <div class="row"><button class="btn ghost grow" data-close>סגירה</button><button class="btn primary grow" id="es">דיווח</button></div>`, (s, close) => {
      $$('[data-h]', s).forEach(b => b.onclick = async () => { r.health = b.dataset.h; await enqueue({ kind: 'update', table: 'equipment', rowId: r.id, patch: { health: r.health, health_date: new Date().toISOString().slice(0, 10) } }); close(); draw(); });
      $('#es', s).onclick = async () => {
        const body = $('#eb', s).value.trim(); if (!body) return toast('מה התקלה?');
        const row = { id: uid(), equipment_id: r.id, kind: 'equipment', body: `${r.name}: ${body}`, opened_by: state.user.id, status: 'open', severity: 'normal', created_at: new Date().toISOString() };
        iss.unshift(row); const { created_at, ...ins } = row; await enqueue({ kind: 'insert', table: 'issues', row: ins }); close(); toast('התקלה נרשמה'); draw();
      };
    });
  }
  function addItem() {
    sheet(`<h3>פריט ציוד חדש</h3><select id="ak">${Object.entries(KIND).filter(([k]) => k !== 'drone').map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <input type="text" id="an" placeholder="שם (למשל: משאבה 2, טויוטה 12-345-67)"><input type="text" id="as" placeholder="מספר סידורי (לא חובה)">
      <div class="small muted">רחפנים חדשים נוספים במשרד.</div>
      <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="ago">הוספה</button></div>`, (s, close) => {
      $('#ago', s).onclick = async () => {
        const name = $('#an', s).value.trim(); if (!name) return toast('חסר שם');
        const { data, error } = await sb.from('equipment').insert({ kind: $('#ak', s).value, name, serial: $('#as', s).value || null }).select().single();
        if (error) return toast(error.message); rows.push(data); close(); draw();
      };
    });
  }
  draw();
}
