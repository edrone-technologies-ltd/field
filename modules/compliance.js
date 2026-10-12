// תוקף ותעודות (#/compliance, מנהלים): אנשים × תעודות וציוד × בדיקות בארבעה מצבים — בתוקף / ברבעון הקרוב / עד 30 יום / פג.
// מחשב: מטריצה. טלפון: רשימה לפי דחיפות. לחיצה = המסך שבו מחדשים (מסמכי העובד / היומן של הכלי).
// כאן גם "לא לשבץ באתר הזה" (site_bans, db/122) — נקרא מדף הפרויקט.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, dm, isoDay, backBtn, confirmBox, ROLE_HE } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const daysTo = d => Math.round((new Date(d + 'T12:00') - new Date(isoDay() + 'T12:00')) / 864e5);
const RANK = { bad: 0, soon: 1, q: 2, ok: 3, na: 4 };
const ST = { bad: 'פג תוקף', soon: 'עד 30 יום', q: 'ברבעון הקרוב', ok: 'בתוקף' };
const stOf = d => { if (!d) return 'na'; const n = daysTo(d); return n < 0 ? 'bad' : n <= 30 ? 'soon' : n <= 90 ? 'q' : 'ok'; };
const yy = d => `${dm(d)}.${d.slice(2, 4)}`;
const when = d => { const n = daysTo(d); return n < -1 ? `פג לפני ${-n} ימים` : n === -1 ? 'פג אתמול' : n === 0 ? 'פג היום' : n === 1 ? 'פג מחר' : n <= 30 ? `בעוד ${n} ימים` : `עד ${yy(d)}`; };
const cellTxt = (s, d) => s === 'bad' ? 'פג ' + dm(d) : s === 'soon' ? `${daysTo(d)} ימים` : d ? yy(d) : '';
const SVC = { ok: ['ok', 'תקין'], due: ['soon', 'טיפול מתקרב'], overdue: ['bad', 'נדרש טיפול'] };
const latest = (xs) => xs.reduce((m, x) => !m || x > m ? x : m, null);

export async function renderCompliance(el) {
  if (!isManager()) { el.innerHTML = '<div class="empty-line">למנהלים בלבד</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">תוקף ותעודות</h1></header><div id="cp" class="stack lg"><div class="skel"></div><div class="skel"></div></div>`;
  const admin = state.profile.role === 'admin';
  const [{ data: ppl }, { data: docs }, { data: eq }, { data: bans }] = await Promise.all([
    sb.rpc('profiles_full').select('id,full_name,role,is_pilot,pilot_license_expiry,is_active').eq('is_active', true),
    sb.from('employee_docs').select('user_id,kind,title,expires_on').not('expires_on', 'is', null),
    sb.from('equipment').select('id,name,kind,insurance_until,license_until,service_state,health').order('name'),
    sb.from('site_bans').select('site_id,user_id,reason,sites(name)'),
  ]);
  const people = (ppl || []).filter(p => admin || p.role !== 'admin');
  const isH = d => /גובה/.test(d.title || ''), isPL = d => d.kind === 'license' && /מטיס/.test(d.title || '');
  const other = [...new Set((docs || []).filter(d => !isH(d) && !isPL(d)).map(d => (d.title || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
  const docOf = (u, f) => latest((docs || []).filter(d => d.user_id === u && f(d)).map(d => d.expires_on));
  const anyPilot = people.some(p => p.is_pilot);

  // תא = { s: מצב, d: תאריך, t: טקסט, href }
  const pCols = [
    ...(anyPilot ? [{ k: 'pl', t: 'רישיון מטיס', cell: p => { if (!p.is_pilot) return null; const d = p.pilot_license_expiry || docOf(p.id, isPL); return { s: stOf(d), d, t: d ? null : 'לא הוזן', href: `#/staff/${p.id}` }; } }] : []),
    { k: 'h', t: 'תעודת גובה', cell: p => { const d = docOf(p.id, isH); return d ? { s: stOf(d), d, href: `#/staff/${p.id}/docs` } : { s: 'na', t: '—', href: `#/staff/${p.id}/docs` }; } },
    ...other.map(t => ({ k: 'o:' + t, t, cell: p => { const d = docOf(p.id, x => (x.title || '').trim() === t); return d ? { s: stOf(d), d, href: `#/staff/${p.id}/docs` } : null; } })),
  ];
  const items = (eq || []).filter(e => e.kind === 'drone' || e.insurance_until || e.license_until);
  const eCols = [
    { k: 'ins', t: 'ביטוח', cell: e => ({ s: stOf(e.insurance_until), d: e.insurance_until, t: e.insurance_until ? null : 'לא הוזן' }) },
    { k: 'lic', t: items.every(e => e.kind === 'drone') ? 'רישום' : 'רישום / רישוי', cell: e => ({ s: stOf(e.license_until), d: e.license_until, t: e.license_until ? null : 'לא הוזן' }) },
    { k: 'svc', t: 'טיפול', cell: e => e.kind !== 'drone' ? null : SVC[e.service_state] ? { s: SVC[e.service_state][0], t: SVC[e.service_state][1] } : { s: 'na', t: 'לא נרשם' } },
  ].map(c => ({ ...c, cell: e => { const x = c.cell(e); return x && { ...x, href: `#/equipment/${e.id}` }; } }));

  // כל התאים → רשימת דחיפות + מונים
  const all = [];
  people.forEach(p => pCols.forEach(c => { const x = c.cell(p); if (x) all.push({ ...x, who: p.full_name, what: c.t }); }));
  items.forEach(e => eCols.forEach(c => { const x = c.cell(e); if (x) all.push({ ...x, who: e.name, what: c.t, eq: true }); }));
  const N = { bad: 0, soon: 0, q: 0, ok: 0 }; all.forEach(x => { if (x.s in N) N[x.s]++; });
  // דחוף לפי סדר; בסוף — תאריך שלא הוזן (בלי תאריך אין חסימה בשיבוץ)
  const urgent = all.filter(x => ['bad', 'soon', 'q'].includes(x.s) || x.t === 'לא הוזן').sort((a, b) => RANK[a.s] - RANK[b.s] || (a.d && b.d ? a.d.localeCompare(b.d) : a.d ? -1 : 1));

  const cell = x => !x ? '<td class="cpc"></td>' : `<td class="cpc"><a class="cpv s-${x.s}" href="${x.href}" title="${esc(ST[x.s] || '')}">${esc(x.t ?? cellTxt(x.s, x.d))}</a></td>`;
  const table = (title, cols, rows, name, sub) => rows.length ? `<section><h3 class="sh">${title}</h3><div class="cpx"><table class="cpt"><thead><tr><th></th>${cols.map(c => `<th>${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><th><b>${esc(name(r))}</b><small>${esc(sub(r))}</small></th>${cols.map(c => cell(c.cell(r))).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  const sortedPeople = [...people].sort((a, b) => worst(pCols, a) - worst(pCols, b) || a.full_name.localeCompare(b.full_name, 'he'));
  const sortedItems = [...items].sort((a, b) => worst(eCols, a) - worst(eCols, b) || a.name.localeCompare(b.name, 'he'));
  const banList = (bans || []).map(b => ({ ...b, who: people.find(p => p.id === b.user_id)?.full_name || '' })).filter(b => b.who);

  $('#cp').innerHTML = `<div class="cpk">${Object.entries(ST).map(([k, t]) => `<div class="cpkpi s-${k}"><b>${N[k]}</b><span>${t}</span></div>`).join('')}</div>
    <div class="cp-ls">${urgent.length ? `<div class="list">${urgent.map(x => `<a class="lrow cprow" href="${x.href}"><span class="cpdot s-${x.s}" aria-hidden="true"></span><span class="mic">${icon(x.eq ? 'drone' : 'users', 18)}</span><span class="grow"><b>${esc(x.who)} · ${esc(x.what)}</b><small>${esc(x.d ? when(x.d) : x.t || ST[x.s])}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div>`
      : `<div class="empty-card"><span class="ei">${icon('check', 26)}</span><span><b>הכל בתוקף</b></span></div>`}</div>
    <div class="cp-mx">${table('אנשים', pCols, sortedPeople, p => p.full_name, p => ROLE_HE[p.role] || '')}${table('ציוד', eCols, sortedItems, e => e.name, e => e.health === 'grounded' ? 'מקורקע' : '')}</div>
    ${banList.length ? `<section><h3 class="sh">לא לשבץ</h3><div class="list">${banList.map(b => `<div class="lrow"><span class="mic bad-ic">${icon('x', 18)}</span><span class="grow"><b>${esc(b.who)} · ${esc(b.sites?.name || '')}</b><small>${esc(b.reason)}</small></span></div>`).join('')}</div></section>` : ''}`;
}
function worst(cols, r) { return Math.min(4, ...cols.map(c => { const x = c.cell(r); return x ? RANK[x.s] : 4; })); }

// ---------- לא לשבץ באתר הזה ----------
// el: שורת kv בדף הפרויקט (מוסתרת עד שנטען). team: האנשים שאפשר לשבץ
export async function banRow(el, siteId, siteName, team) {
  const { data, error } = await sb.from('site_bans').select('user_id,reason').eq('site_id', siteId);
  if (error) return;
  const nm = u => team.find(x => x.id === u)?.full_name || '';
  const B = (data || []).filter(b => nm(b.user_id));
  el.innerHTML = B.length
    ? `<span class="mic bad-ic">${icon('x', 19)}</span><span class="grow"><small>לא לשבץ באתר</small><b>${B.map(b => esc(nm(b.user_id))).join(' · ')}</b></span><span class="chev">${icon('chev', 18)}</span>`
    : `<span class="mic">${icon('x', 19)}</span><span class="grow"><span class="muted">לא לשבץ באתר הזה…</span></span>`;
  el.hidden = false;
  el.onclick = () => banSheet(siteId, siteName, team, B, () => banRow(el, siteId, siteName, team));
}

const REASONS = ['הלקוח ביקש', 'אירוע בטיחות', 'אין אישור כניסה'];
function banSheet(siteId, siteName, team, B, done) {
  const banned = new Set(B.map(b => b.user_id)), nm = u => team.find(x => x.id === u)?.full_name || '';
  const free = team.filter(x => !banned.has(x.id));
  sheet(`<h3>לא לשבץ · ${esc(siteName)}</h3>
    ${B.length ? `<div class="list">${B.map(b => `<div class="lrow"><span class="grow"><b>${esc(nm(b.user_id))}</b><small>${esc(b.reason)}</small></span><button class="chip" data-un="${b.user_id}">הסרה</button></div>`).join('')}</div>` : ''}
    ${free.length ? `<label class="field">מי<select id="bu"><option value="">בחירה…</option>${free.map(x => `<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></label>
    <div class="field">סיבה<div class="chips">${REASONS.map(r => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div><input type="text" id="br" maxlength="120"></div>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="bgo">חסימה באתר</button></div>` : '<div class="row"><button class="btn ghost grow" data-close>סגירה</button></div>'}`, (s, close) => {
    $$('[data-r]', s).forEach(c => c.onclick = () => { $('#br', s).value = c.dataset.r; $$('[data-r]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $$('[data-un]', s).forEach(b => b.onclick = async () => {
      if (!await confirmBox(`להחזיר את ${nm(b.dataset.un)} לשיבוץ באתר?`, { ok: 'הסרה' })) return;
      const { error } = await sb.from('site_bans').delete().eq('site_id', siteId).eq('user_id', b.dataset.un);
      if (error) return toast(errText(error)); close(); toast('הוסר — אפשר לשבץ שוב'); done();
    });
    const go = $('#bgo', s); if (!go) return;
    go.onclick = async () => {
      const u = $('#bu', s).value, reason = $('#br', s).value.trim();
      if (!u) { $('#bu', s).focus(); return toast('את מי?'); }
      if (!reason) { $('#br', s).focus(); return toast('מה הסיבה?'); }
      if (go.disabled) return; go.disabled = true;
      const { error } = await sb.from('site_bans').insert({ site_id: siteId, user_id: u, reason });
      if (error) { go.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
      // כבר משובץ בימים הקרובים באתר? — שיידעו להחליף
      const { data: pr } = await sb.from('projects').select('id').eq('site_id', siteId);
      const ids = (pr || []).map(x => x.id); let n = 0;
      if (ids.length) { const { data: w } = await sb.from('work_days').select('id,crew_lead_id,work_day_crew(user_id)').in('project_id', ids).gte('day', isoDay()).not('status', 'in', '(done,cancelled)');
        n = (w || []).filter(x => x.crew_lead_id === u || (x.work_day_crew || []).some(c => c.user_id === u)).length; }
      close(); n ? toast(`נחסם · ${nm(u)} עדיין משובץ ב-${n} ימים באתר — להחליף בשיבוץ`, 5000, 'warn') : toast('נחסם — לא יופיע בשיבוץ לאתר'); done();
    };
  });
}
