// תיק לקוח: לקוח (ישות משלמת, מסונכרן מתיק הלקוחות במאנדי) ← אתרים ← פרויקטים. היסטוריית עבודות לכל אתר, אנשי קשר, וקבוצת האם.
import { sb, isManager, icon, $, $$, esc, backBtn, dm, stLabel } from '../lib/core.js';

const ARCH = 'group_mm5052gw';
const range = p => { const f = p.actual_from || p.planned_from, t = p.actual_to || p.planned_to; return f ? (t && t !== f ? `${dm(f)}–${dm(t)}` : dm(f)) : ''; };
const yr = p => (p.actual_from || p.planned_from || '').slice(0, 4);
const tel = p => String(p || '').replace(/\D/g, '');

export async function renderClients(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>לקוחות</h1></header><div class="skel tall"></div>`;
  const { data } = await sb.from('clients').select('id,name,grp,monday_group,projects(id,monday_group,status_label,planned_from,actual_from),sites(id)').neq('monday_group', 'group_mm56d34v').order('name');
  const C = (data || []).filter(c => (c.projects || []).length || (c.sites || []).length);
  const groups = new Map(); C.forEach(c => { const k = c.grp || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  const row = c => { const ps = c.projects || [], active = ps.filter(p => p.monday_group !== ARCH && !String(p.status_label || '').startsWith('הסתיים') && p.status_label !== 'שולם ✓').length, last = ps.map(p => p.actual_from || p.planned_from).filter(Boolean).sort().at(-1);
    return `<a class="lrow" href="#/client/${c.id}" data-n="${esc(c.name)}"><span class="grow"><b>${esc(c.name)}</b><small>${(c.sites || []).length} אתרים · ${ps.length} עבודות${active ? ` · ${active} פעילות` : ''}${last ? ` · אחרונה ${dm(last)}` : ''}</small></span><span class="chev">${icon('chev', 18)}</span></a>`; };
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">לקוחות</h1><span class="count">${C.length}</span></header>
    <div class="stack lg"><input type="search" class="search" id="cq" placeholder="חיפוש לקוח">
      ${[...groups.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1)).map(([g, cs]) => `<section class="stack cgrp">${g ? `<h3 class="sh">קבוצת ${esc(g)}</h3>` : (groups.size > 1 ? '<h3 class="sh">לקוחות</h3>' : '')}<div class="list">${cs.map(row).join('')}</div></section>`).join('')
        || '<div class="empty">אין עדיין לקוחות עם עבודות.</div>'}</div>`;
  $('#cq').oninput = e => { const q = e.target.value.trim(); $$('[data-n]', el).forEach(a => a.hidden = q && !a.dataset.n.includes(q)); $$('.cgrp', el).forEach(g => g.hidden = !$$('[data-n]:not([hidden])', g).length); };
}

export async function renderClient(el, id) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1>תיק לקוח</h1></header><div class="skel tall"></div>`;
  const { data: c } = await sb.from('clients').select('*').eq('id', id).maybeSingle();
  if (!c) { el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1>תיק לקוח</h1></header><div class="empty">הלקוח לא נמצא.</div>`; return; }
  const [{ data: ps }, { data: sites }, { data: sib }] = await Promise.all([
    sb.from('projects').select('id,name,site_id,status_label,monday_group,planned_from,planned_to,actual_from,actual_to,field_days_actual,work_days(status)').eq('client_id', id),
    sb.from('sites').select('id,slug,name,address,contact_name,contact_phone').eq('client_id', id),
    c.grp ? sb.from('clients').select('id,name').eq('grp', c.grp).neq('id', id).order('name') : Promise.resolve({ data: [] })]);
  const P = (ps || []).sort((a, b) => ((b.actual_from || b.planned_from || '') > (a.actual_from || a.planned_from || '') ? 1 : -1));
  // אתרים: מהלקוח עצמו + אתרים של הפרויקטים שלו; פרויקט בלי אתר — תחת "בלי אתר"
  const S = new Map((sites || []).map(s => [s.id, { ...s, projects: [] }]));
  const noSite = [];
  for (const p of P) { if (p.site_id && !S.has(p.site_id)) S.set(p.site_id, { id: p.site_id, name: '', projects: [] }); (p.site_id ? S.get(p.site_id).projects : noSite).push(p); }
  const missing = [...S.values()].filter(s => !s.name).map(s => s.id);
  if (missing.length) { const { data: ms } = await sb.from('sites').select('id,slug,name,address,contact_name,contact_phone').in('id', missing); (ms || []).forEach(m => Object.assign(S.get(m.id), m)); }
  const days = p => Math.max(Number(p.field_days_actual || 0), (p.work_days || []).filter(w => w.status === 'done').length);
  const prow = p => `<a class="lrow" href="#/p/${p.id}"><span class="grow"><b>${esc(p.name)}</b><small>${[range(p), days(p) ? `${days(p)} ימי שטח` : ''].filter(Boolean).join(' · ')}</small></span><span class="pill ${p.monday_group === ARCH ? '' : String(p.status_label || '').startsWith('הסתיים') || p.status_label === 'שולם ✓' ? 'ok' : 'lime'}">${p.monday_group === ARCH ? 'ארכיון' : esc(stLabel(p.status_label))}</span></a>`;
  const active = P.filter(p => p.monday_group !== ARCH && !String(p.status_label || '').startsWith('הסתיים') && p.status_label !== 'שולם ✓');
  const years = [...new Set(P.map(yr).filter(Boolean))];
  el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1 class="grow">${esc(c.name)}</h1></header>
    <div class="stack lg">
      <div class="card stack" style="gap:4px">${c.grp ? `<small class="muted">קבוצת ${esc(c.grp)}</small>` : ''}${c.hp ? `<small>ח.פ <bdi dir="ltr">${esc(c.hp)}</bdi></small>` : ''}
        ${c.notes ? `<small class="muted">${esc(c.notes)}</small>` : ''}</div>
      <div class="kpis"><div class="kpi"><b>${P.length}</b><span>עבודות</span></div><div class="kpi"><b>${S.size}</b><span>אתרים</span></div><div class="kpi"><b>${active.length}</b><span>פעילות עכשיו</span></div></div>
      <div id="cctc"></div>
      ${[...S.values()].map(s => `<section class="stack"><div class="sh-row"><h3 class="sh">${esc(s.name)}</h3>${s.slug ? `<a class="more" href="#/site/${esc(s.slug)}">לאתר</a>` : ''}</div>
        ${s.address || s.contact_name ? `<div class="small muted">${esc([s.address, s.contact_name].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="list">${s.projects.map(prow).join('') || '<div class="small muted" style="padding:12px">עוד אין עבודות באתר</div>'}</div></section>`).join('')}
      ${noSite.length ? `<section class="stack"><h3 class="sh">עבודות בלי אתר</h3><div class="list">${noSite.map(prow).join('')}</div></section>` : ''}
      ${years.length > 1 ? `<div class="small muted">עבודות לפי שנה: ${years.map(y => `${y} — ${P.filter(p => yr(p) === y).length}`).join(' · ')}</div>` : ''}
      ${(sib || []).length ? `<section class="stack"><h3 class="sh">עוד בקבוצת ${esc(c.grp)}</h3><div class="list">${sib.map(x => `<a class="lrow" href="#/client/${x.id}"><span class="grow">${esc(x.name)}</span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
    </div>`;
  import('../lib/contacts.js').then(m => m.renderContacts($('#cctc'), { clientId: c.id, org: c.name }));
}
