// תיק לקוח: לקוח (ישות משלמת, מסונכרן מתיק הלקוחות במאנדי) ← אתרים ← פרויקטים. היסטוריית עבודות לכל אתר, אנשי קשר, וקבוצת האם.
import { sb, isManager, icon, $, $$, esc, backBtn, dm, stLabel, isOpenProject, navButtons, isoDay } from '../lib/core.js';
const SITE_SEL = 'id,slug,name,address,contact_name,contact_phone,lat,lng,buildings(id,specs(status))';
const intl = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? d : d.replace(/^0/, '972'); };
const local = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? '0' + d.slice(3) : d; };

const ARCH = 'group_mm5052gw';
const range = p => { const f = p.actual_from || p.planned_from, t = p.actual_to || p.planned_to; return f ? (t && t !== f ? `${dm(f)}–${dm(t)}` : dm(f)) : ''; };
const yr = p => (p.actual_from || p.planned_from || '').slice(0, 4);
const tel = p => String(p || '').replace(/\D/g, '');
const works = n => n === 1 ? 'עבודה אחת' : `${n} עבודות`;

export async function renderClients(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין גישה</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>לקוחות</h1></header><div class="skel tall"></div>`;
  const { data } = await sb.from('clients').select('id,name,grp,monday_group,projects(id,monday_group,status_label,closed_summary,planned_from,actual_from),sites(id)').neq('monday_group', 'group_mm56d34v').order('name');
  const C = (data || []).filter(c => (c.projects || []).length || (c.sites || []).length);
  const groups = new Map(); C.forEach(c => { const k = c.grp || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  const today = new Date().toLocaleDateString('en-CA');
  const row = c => { const ps = c.projects || [], ds = ps.map(p => p.actual_from || p.planned_from).filter(Boolean).sort();
    const next = ds.find(d => d >= today), last = ds.filter(d => d < today).at(-1), live = ps.filter(isOpenProject).length;
    const meta = [next ? `הבאה ${dm(next)}` : last ? `אחרונה ${dm(last)}` : '', ps.length ? works(ps.length) : ''].filter(Boolean).join(' · ');
    return `<a class="lrow" href="#/client/${c.id}" data-n="${esc(c.name)}"><span class="grow"><b>${esc(c.name)}</b>${meta ? `<small>${meta}</small>` : ''}</span>${live ? `<span class="pill ok">${live === 1 ? 'פעיל' : live + ' פעילות'}</span>` : ''}<span class="chev">${icon('chev', 18)}</span></a>`; };
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">לקוחות</h1><span class="count">${C.length}</span></header>
    <div class="stack lg"><input type="search" class="search" id="cq" placeholder="חיפוש לקוח">
      ${[...groups.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1)).map(([g, cs]) => `<section class="stack cgrp">${g ? `<h3 class="sh">קבוצת ${esc(g)}</h3>` : (groups.size > 1 ? '<h3 class="sh">לקוחות</h3>' : '')}<div class="list">${cs.map(row).join('')}</div></section>`).join('')
        || '<div class="empty-line">אין לקוחות</div>'}</div>`;
  $('#cq').oninput = e => { const q = e.target.value.trim(); $$('[data-n]', el).forEach(a => a.hidden = q && !a.dataset.n.includes(q)); $$('.cgrp', el).forEach(g => g.hidden = !$$('[data-n]:not([hidden])', g).length); };
}

export async function renderClient(el, id) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">אין גישה</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1>תיק לקוח</h1></header><div class="skel tall"></div>`;
  const { data: c } = await sb.from('clients').select('*').eq('id', id).maybeSingle();
  if (!c) { el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1>תיק לקוח</h1></header><div class="empty-line">הלקוח לא נמצא</div>`; return; }
  const [{ data: ps }, { data: sites }, { data: sib }] = await Promise.all([
    sb.from('projects').select('id,name,site_id,status_label,monday_group,closed_summary,planned_from,planned_to,actual_from,actual_to,field_days_actual,work_days(status)').eq('client_id', id),
    sb.from('sites').select(SITE_SEL).eq('client_id', id).eq('is_active', true).is('merged_into', null),
    c.grp ? sb.from('clients').select('id,name').eq('grp', c.grp).neq('id', id).order('name') : Promise.resolve({ data: [] })]);
  const P = (ps || []).sort((a, b) => ((b.actual_from || b.planned_from || '') > (a.actual_from || a.planned_from || '') ? 1 : -1));
  // אתרים: מהלקוח עצמו + אתרים של הפרויקטים שלו; פרויקט בלי אתר — תחת "בלי אתר"
  const S = new Map((sites || []).map(s => [s.id, { ...s, projects: [] }]));
  const noSite = [];
  for (const p of P) { if (p.site_id && !S.has(p.site_id)) S.set(p.site_id, { id: p.site_id, name: '', projects: [] }); (p.site_id ? S.get(p.site_id).projects : noSite).push(p); }
  const missing = [...S.values()].filter(s => !s.name).map(s => s.id);
  if (missing.length) { const { data: ms } = await sb.from('sites').select(SITE_SEL).in('id', missing); (ms || []).forEach(m => Object.assign(S.get(m.id), m)); }
  // היסטוריה: דוחות ביקור + החתמות של כל העבודות — ציר זמן אחד
  const pids = P.map(p => p.id), pname = new Map(P.map(p => [p.id, p.name]));
  const [{ data: vs }, { data: sg }] = pids.length ? await Promise.all([
    sb.from('project_visits').select('id,project_id,kind,visit_date,rating').in('project_id', pids),
    sb.from('project_signoffs').select('id,project_id,signer_name,created_at,rating,full_ok').in('project_id', pids)]) : [{ data: [] }, { data: [] }];
  const { KIND: VK } = await import('./visits.js');
  const H = [...(vs || []).map(v => ({ d: v.visit_date, t: VK[v.kind] || 'ביקור', s: pname.get(v.project_id), href: `#/visit/${v.id}`, r: v.rating })),
    ...(sg || []).map(x => ({ d: isoDay(new Date(x.created_at)), t: 'החתמת לקוח' + (x.signer_name ? ' · ' + x.signer_name : ''), s: pname.get(x.project_id), href: `#/p/${x.project_id}`, r: x.rating })),
    ...P.filter(p => p.actual_from || p.planned_from).map(p => ({ d: p.actual_from || p.planned_from, t: isOpenProject(p) ? 'עבודה מתוכננת' : 'עבודה', s: p.name, href: `#/p/${p.id}` }))]
    .sort((a, b) => (a.d < b.d ? 1 : -1));
  const rates = [...(vs || []), ...(sg || [])].map(x => x.rating).filter(Boolean), avg = rates.length ? rates.reduce((t, x) => t + x, 0) / rates.length : 0;
  // איש קשר ראשי לפעולה בלחיצה: איש קשר פעיל של הלקוח, אחרת איש הקשר מהאתר
  const { data: cts } = await sb.from('contacts').select('name,phone,role').eq('client_id', id).eq('active', true).not('phone', 'is', null).limit(1);
  const main = cts?.[0] || [...S.values()].filter(s => s.contact_phone).map(s => ({ name: s.contact_name, phone: s.contact_phone, role: s.name }))[0];
  const days = p => Math.max(Number(p.field_days_actual || 0), (p.work_days || []).filter(w => w.status === 'done').length);
  const prow = p => `<a class="lrow" href="#/p/${p.id}"><span class="grow"><b>${esc(p.name)}</b><small>${[range(p), days(p) ? `${days(p)} ימי שטח` : ''].filter(Boolean).join(' · ')}</small></span><span class="pill ${p.monday_group === ARCH ? '' : String(p.status_label || '').startsWith('הסתיים') || p.status_label === 'שולם ✓' ? 'ok' : 'lime'}">${p.monday_group === ARCH ? 'ארכיון' : esc(stLabel(p.status_label))}</span></a>`;
  const active = P.filter(isOpenProject);
  const years = [...new Set(P.map(yr).filter(Boolean))];
  el.innerHTML = `<header class="phead">${backBtn('#/clients')}<h1 class="grow">${esc(c.name)}</h1></header>
    <div class="stack lg">
      ${c.grp || c.hp || c.notes ? `<div class="card stack tight">${c.grp ? `<small class="muted">קבוצת ${esc(c.grp)}</small>` : ''}${c.hp ? `<small>ח.פ <bdi dir="ltr">${esc(c.hp)}</bdi></small>` : ''}
        ${c.notes ? `<small class="muted clamp3">${esc(c.notes)}</small>` : ''}</div>` : ''}
      ${main ? `<div class="c360 card"><span class="grow"><small class="muted">${esc(main.role || 'איש קשר')}</small><b>${esc(main.name || '')}</b></span>
        <a class="cact" href="tel:${local(main.phone)}">${icon('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2', 20)}<small>חיוג</small></a>
        <a class="cact wa" href="https://wa.me/${intl(main.phone)}" target="_blank" rel="noopener">${icon('M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z', 20)}<small>וואטסאפ</small></a></div>` : ''}
      ${(() => { const k = [[P.length, 'עבודות'], [S.size, 'אתרים'], [active.length, 'פעילות עכשיו'], [avg ? avg.toFixed(1) + '★' : 0, 'שביעות רצון']].filter(([v]) => v); return k.length ? `<div class="kpis">${k.map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''; })()}
      <div id="cctc"></div>
      ${[...S.values()].map(s => { const B = s.buildings || [], dn = B.filter(b => (b.specs?.[0] || b.specs)?.status === 'done').length, touched = B.some(b => ((b.specs?.[0] || b.specs)?.status || 'new') !== 'new');
        return `<section class="stack csite"><div class="sh-row"><h3 class="sh">${esc(s.name)}</h3>${s.slug && touched ? `<a class="pill ${dn === B.length ? 'ok' : dn ? 'warn' : ''}" href="#/site/${esc(s.slug)}">אפיון ${dn}/${B.length}</a>` : s.slug ? `<a class="more" href="#/site/${esc(s.slug)}">לאתר</a>` : ''}</div>
        ${s.address ? `<div class="small muted">${esc(s.address)}</div>` : ''}
        ${s.contact_phone ? `<div class="row csct"><span class="grow small"><b>${esc(s.contact_name || '')}</b> <bdi dir="ltr" class="muted">${esc(local(s.contact_phone))}</bdi></span><a class="chip sm" href="tel:${local(s.contact_phone)}">חיוג</a><a class="chip sm" href="https://wa.me/${intl(s.contact_phone)}" target="_blank" rel="noopener">וואטסאפ</a></div>` : ''}
        ${s.lat ? navButtons(s.lat, s.lng, s.address || s.name) : ''}
        ${s.projects.length ? `<div class="list">${s.projects.map(prow).join('')}</div>` : '<div class="empty-line">אין עבודות</div>'}</section>`; }).join('')}
      ${noSite.length ? `<section class="stack"><h3 class="sh">עבודות בלי אתר</h3><div class="list">${noSite.map(prow).join('')}</div></section>` : ''}
      ${H.length > 2 || (vs || []).length || (sg || []).length ? `<details class="fold"${H.length <= 6 ? ' open' : ''}><summary><span class="sh">היסטוריה</span><span class="count">${H.length}</span></summary><div class="list ctl">${H.map(h => `<a class="lrow" href="${h.href}"><span class="cdt">${dm(h.d)}${years.length > 1 ? `<small>${h.d.slice(0, 4)}</small>` : ''}</span><span class="grow"><b>${esc(h.t)}</b><small>${esc(h.s || '')}</small></span>${h.r ? `<span class="muted small">${'★'.repeat(h.r)}</span>` : ''}</a>`).join('')}</div></details>` : ''}
      ${(sib || []).length ? `<section class="stack"><h3 class="sh">עוד בקבוצת ${esc(c.grp)}</h3><div class="list">${sib.map(x => `<a class="lrow" href="#/client/${x.id}"><span class="grow">${esc(x.name)}</span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
    </div>`;
  import('../lib/contacts.js').then(m => m.renderContacts($('#cctc'), { clientId: c.id, org: c.name }));
}
