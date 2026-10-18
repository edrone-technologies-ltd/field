// עלויות (#/costs) — אדמין / מודול כספים בלבד. עלות לכל יום שטח: עבודה (מהנוכחות × שכר × מקדם מעסיק, או הערכה לפי התכנון),
// נסיעה (ק״מ × עלות לק״מ), חומר (גלונים × מחיר מהקטלוג), הוצאות שאושרו. סיכום לשבוע ולפרויקט, מול המחיר — רווח צפוי.
// כל הנתונים מ-cost_report (db/129, security definer, חוסם כל מי שאין לו כספים). מנהל תפעול לא מגיע לכאן ולא רואה את הכפתור.
import { sb, state, can, $, $$, esc, icon, isoDay, dm, HE_D1, toast, sheet, backBtn, replaceHash } from '../lib/core.js';
import { errText } from '../lib/audit.js';

export const canCost = () => can('finance') || state.profile?.role === 'admin';
const ils = n => n == null ? '—' : '₪' + Math.round(n).toLocaleString('he-IL');
const hh = x => { if (x == null) return '—'; const m = Math.round(x * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const sunday = s => addDays(s, -new Date(s + 'T12:00:00').getDay());
const sd = d => `${HE_D1[new Date(d + 'T12:00').getDay()]} ${dm(d)}`;
const done = x => x.status === 'done';
// מקור העלות: בפועל = נסגר ויש שכר מהנוכחות; נסגר בלי נוכחות = שכר משוער; פתוח = משוער
const src = x => done(x) ? (x.labor != null ? 'בפועל' : 'נסגר · שכר משוער') : 'משוער';
const ppl = n => !n ? 'בלי צוות' : n === 1 ? 'איש אחד' : `${n} אנשים`;
// עבודה: בפועל כשיש עלות מהנוכחות; אחרת ההערכה
const labor = x => x.labor ?? x.labor_est ?? 0;
const sum = (xs, f) => xs.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const pct = (price, cost) => price > 0 ? Math.round((price - cost) / price * 100) : null;
const tone = m => m == null ? '' : m < 15 ? 'bad' : m < 30 ? 'warn' : 'ok';

async function report(args) {
  const { data, error } = await sb.rpc('cost_report', args);
  if (error) throw error;
  return data || { days: [], projects: {}, params: {} };
}

// סיכום פרויקט: מה כבר עלה (ימים שנסגרו) + מה עוד צפוי (ימים פתוחים לפי התכנון) מול המחיר
function rollProject(days, P) {
  const D = days.filter(done), O = days.filter(x => !done(x));
  const act = sum(D, x => x.total), rest = sum(O, x => x.total_est), fc = act + rest;
  const price = Number(P?.price_net) || 0, est = Number(P?.est_cost) || 0;
  return { act, rest, fc, price, est, m: pct(price, fc), estH: sum(days, x => x.est_h), actH: D.some(x => x.act_h != null) ? sum(D, x => x.act_h) : null, nd: D.length, n: days.length };
}

// ---------- גיליון פירוט ליום ----------
export function dayCostSheet(x, P, params = {}) {
  const lines = [
    ['עבודה', x.labor != null ? 'בפועל, מהנוכחות' : `הערכה · ${ppl(x.crew)}`, labor(x)],
    ['נסיעה', x.km ? `${Math.round(x.km)} ק״מ ${x.km_src === 'odo' ? 'מהמונה' : 'משוער'} × ₪${params.per_km ?? ''}` : 'אין מיקום לאתר', x.travel],
    x.material != null ? ['חומר', `${x.gal} גל׳ ${esc(x.mat || '')} × ₪${x.unit}`, x.material] : null,
    x.exp ? ['הוצאות שאושרו', 'בלי דלק', x.exp] : null,
  ].filter(Boolean);
  sheet(`<h3 class="sh">${esc(P?.name || 'יום שטח')} · ${sd(x.day)}</h3>
    <div class="cx-big"><b>${ils(x.total)}</b><span class="pill ${done(x) && x.labor != null ? 'ok' : ''}">${src(x)}</span></div>
    <div class="menu">${lines.map(([t, s, v]) => `<div class="lrow"><span class="grow"><b>${t}</b><small>${s}</small></span><b>${ils(v)}</b></div>`).join('')}</div>
    <div class="kpis"><div class="kpi"><b>${hh(x.est_h)}</b><span>שעות באתר · מתוכנן</span></div><div class="kpi"><b>${hh(x.act_h)}</b><span>שעות באתר · בפועל</span></div>${x.paid_h != null ? `<div class="kpi"><b>${hh(x.paid_h)}</b><span>שעות משולמות</span></div>` : ''}</div>
    ${x.no_rate ? `<a class="arow warn" href="#/staff" data-close><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>${x.no_rate === 1 ? 'לאחד בצוות' : `ל-${x.no_rate} בצוות`} אין שכר במערכת</b><small>העלות לא כוללת אותם</small></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}
    <div class="row-btns"><a class="btn ghost" href="#/day/${x.id}" data-close>ליום השטח</a><button class="btn primary" data-close>סגירה</button></div>`);
}

// ---------- בתוך סיכום הפרויקט ----------
export async function projectCost(box, pid) {
  if (!box || !canCost()) return;
  let R; try { R = await report({ p: pid }); } catch { box.innerHTML = ''; return; }
  const days = R.days || [], P = R.projects?.[pid] || {};
  if (!days.length) { box.innerHTML = ''; return; }
  const r = rollProject(days, P);
  box.innerHTML = `<section class="cx"><div class="sh-row"><h3 class="sh">עלות בפועל</h3><a class="more" href="#/costs">כל העלויות</a></div>
    <div class="kpis plain"><div class="kpi"><b>${ils(r.act)}</b><span>${r.nd ? `עד היום · ${r.nd === 1 ? 'יום אחד' : r.nd + ' ימים'}` : 'עוד לא נסגר יום'}</span></div>
      <div class="kpi"><b>${ils(r.fc)}</b><span>צפי לפרויקט</span></div>
      ${r.m != null ? `<div class="kpi ${tone(r.m)}"><b>${r.m}%</b><span>רווח צפוי</span></div>` : r.est ? `<div class="kpi"><b>${ils(r.est)}</b><span>מתוכנן במאנדי</span></div>` : ''}</div>
    ${r.price ? `<div class="cx-bar" title="עלות מול מחיר"><i style="width:${Math.min(100, r.act / r.price * 100)}%"></i><i class="rest" style="width:${Math.max(0, Math.min(100 - r.act / r.price * 100, r.rest / r.price * 100))}%"></i></div>
      <div class="small muted">מחיר ${ils(r.price)}${r.est ? ` · מתוכנן במאנדי ${ils(r.est)}` : ''} · ${r.actH != null ? `שעות באתר ${hh(r.actH)} מתוך ${hh(r.estH)} מתוכננות` : `${hh(r.estH)} שעות באתר מתוכננות`}</div>` : `<div class="small muted">${r.actH != null ? `שעות באתר ${hh(r.actH)} מתוך ${hh(r.estH)} מתוכננות` : `${hh(r.estH)} שעות באתר מתוכננות`}</div>`}
    <div class="list">${days.map((x, i) => `<button class="lrow" data-cx="${i}"><span class="datebox"><b>${+x.day.slice(8)}</b><small>${HE_D1[new Date(x.day + 'T12:00').getDay()]}</small></span>
      <span class="grow"><b>עלות היום ${ils(x.total)}</b><small>${[src(x), `עבודה ${ils(labor(x))}`, x.travel ? `נסיעה ${ils(x.travel)}` : '', x.material ? `חומר ${ils(x.material)}` : ''].filter(Boolean).join(' · ')}</small></span>
      ${x.no_rate ? '<span class="pill warn">חסר שכר</span>' : ''}<span class="chev">${icon('chev', 18)}</span></button>`).join('')}</div></section>`;
  $$('[data-cx]', box).forEach(b => b.onclick = () => dayCostSheet(days[+b.dataset.cx], P, R.params));
}

// ---------- המסך: שבוע + פרויקטים ----------
export async function renderCosts(el, w0) {
  if (!canCost()) { el.innerHTML = `<header class="phead">${backBtn('#/menu')}</header><div class="empty-card"><span class="ei">${icon('shield', 26)}</span><span><b>אין לך גישה למסך הזה</b></span></div>`; return; }
  let w = /^\d{4}-\d\d-\d\d$/.test(w0 || '') ? sunday(w0) : sunday(isoDay());
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">עלויות</h1><button class="chip" id="cxkm">₪ לק״מ</button></header>
    <div class="stack" id="cxb"><div class="skel tall"></div></div>`;
  let R;
  const load = async () => {
    // 8 שבועות אחורה ושבועיים קדימה מהשבוע שנבחר — לגרף השבועות ולפרויקטים
    try { R = await report({ d_from: addDays(w, -49), d_to: addDays(w, 20) }); } catch (e) { $('#cxb', el).innerHTML = `<div class="empty-card"><span class="ei">${icon('alert', 26)}</span><span><b>הנתונים לא נטענו</b><small>${esc(errText(e, 'נסו שוב'))}</small></span></div>`; return; }
    draw();
  };
  const draw = () => {
    const box = $('#cxb', el); if (!box) return;
    const days = R.days || [], P = R.projects || {};
    $('#cxkm', el).textContent = `₪${R.params?.per_km ?? '—'} לק״מ`;
    const wk = days.filter(x => x.day >= w && x.day <= addDays(w, 6));
    const weeks = []; for (let i = -7; i <= 2; i++) { const s = addDays(w, i * 7), xs = days.filter(x => x.day >= s && x.day <= addDays(s, 6)); weeks.push({ s, t: sum(xs, x => done(x) ? x.total : x.total_est), d: xs.every(done) && xs.length, n: xs.length }); }
    const mx = Math.max(1, ...weeks.map(x => x.t));
    const T = { all: sum(wk, x => done(x) ? x.total : x.total_est), lab: sum(wk, labor), tr: sum(wk, x => x.travel), mat: sum(wk, x => x.material), ex: sum(wk, x => x.exp) };
    const ids = [...new Set(days.map(x => x.project_id))];
    const projs = ids.map(id => ({ id, P: P[id] || {}, r: rollProject(days.filter(x => x.project_id === id), P[id]), wk: wk.some(x => x.project_id === id) }))
      .sort((a, b) => (b.wk - a.wk) || (b.r.fc - a.r.fc));
    const est = sum(wk, x => x.est_h), act = sum(wk.filter(done), x => x.act_h), noRate = wk.some(x => x.no_rate);
    box.innerHTML = `
      <div class="dkwk cx-wk" role="group" aria-label="שבוע"><button type="button" class="dkic" id="cxp" aria-label="שבוע קודם">‹</button><button type="button" class="dkwl" id="cxt">${dm(w)}–${dm(addDays(w, 6))}${w === sunday(isoDay()) ? ' · השבוע' : ''}</button><button type="button" class="dkic" id="cxn" aria-label="שבוע הבא">›</button></div>
      <div class="cx-big"><b>${ils(T.all)}</b><span class="muted">${wk.length ? `${wk.length === 1 ? 'יום שטח אחד' : wk.length + ' ימי שטח'}${wk.some(x => !done(x)) ? ' · כולל הערכה לימים פתוחים' : ''}` : 'אין ימי שטח בשבוע'}</span></div>
      ${wk.length ? `<div class="kpis"><div class="kpi"><b>${ils(T.lab)}</b><span>עבודה</span></div><div class="kpi"><b>${ils(T.tr)}</b><span>נסיעה</span></div>${T.mat ? `<div class="kpi"><b>${ils(T.mat)}</b><span>חומר</span></div>` : ''}${T.ex ? `<div class="kpi"><b>${ils(T.ex)}</b><span>הוצאות</span></div>` : ''}</div>
        <div class="small muted">שעות באתר: ${hh(est)} מתוכננות${act ? ` · ${hh(act)} בפועל בימים שנסגרו` : ''}</div>
        ${noRate ? `<a class="arow warn" href="#/staff"><span class="aic">${icon('alert', 18)}</span><span class="grow"><b>יש בצוות מי שאין לו שכר במערכת</b><small>העלות לא כוללת אותם</small></span><span class="chev">${icon('chev', 18)}</span></a>` : ''}` : ''}
      <section><h3 class="sh">לפי שבוע</h3><div class="cx-weeks">${weeks.map(x => `<button class="cx-w ${x.s === w ? 'on' : ''}" data-w="${x.s}" aria-label="${dm(x.s)}"><span class="cx-col"><i class="${x.d ? '' : 'est'}" style="height:${Math.max(x.t ? 4 : 0, x.t / mx * 100)}%"></i></span><small>${dm(x.s)}</small></button>`).join('')}</div></section>
      ${wk.length ? `<section><h3 class="sh">ימי השבוע</h3><div class="list">${wk.map(x => `<button class="lrow" data-d="${x.id}"><span class="datebox ${x.day === isoDay() ? 'now' : ''}"><b>${+x.day.slice(8)}</b><small>${HE_D1[new Date(x.day + 'T12:00').getDay()]}</small></span>
        <span class="grow"><b>${esc(P[x.project_id]?.name || 'יום שטח')}</b><small>${[src(x), ppl(x.crew), `באתר ${hh(done(x) ? x.act_h : x.est_h)}${done(x) ? ` מתוך ${hh(x.est_h)}` : ''}`].join(' · ')}</small></span><b>${ils(done(x) ? x.total : x.total_est)}</b></button>`).join('')}</div></section>` : ''}
      <section><h3 class="sh">פרויקטים</h3><div class="list">${projs.map(({ id, P: p, r }) => `<a class="lrow" href="#/p/${id}/s"><span class="grow"><b>${esc(p.name || '')}</b><small>${[`${r.nd}/${r.n} ימים`, `עד היום ${ils(r.act)}`, `צפי ${ils(r.fc)}`, r.price ? `מחיר ${ils(r.price)}` : r.est ? `מאנדי ${ils(r.est)}` : ''].filter(Boolean).join(' · ')}</small></span>
        ${r.m != null ? `<span class="pill ${tone(r.m)}">${r.m}%</span>` : ''}<span class="chev">${icon('chev', 18)}</span></a>`).join('') || '<div class="empty-line">אין ימי שטח בתקופה</div>'}</div></section>`;
    const go = s => { if (s === w) return; w = s; replaceHash('#/costs/' + w, false); load(); };
    $('#cxp', box).onclick = () => { w = addDays(w, -7); replaceHash('#/costs/' + w, false); load(); };
    $('#cxn', box).onclick = () => { w = addDays(w, 7); replaceHash('#/costs/' + w, false); load(); };
    $('#cxt', box).onclick = () => { if (w !== sunday(isoDay())) { w = sunday(isoDay()); replaceHash('#/costs', false); load(); } };
    $$('[data-w]', box).forEach(b => b.onclick = () => go(b.dataset.w));
    $$('[data-d]', box).forEach(b => b.onclick = () => { const x = days.find(d => d.id === b.dataset.d); dayCostSheet(x, P[x.project_id], R.params); });
  };
  $('#cxkm', el).onclick = () => sheet(`<h3 class="sh">עלות לק״מ</h3>
    <label class="field">₪ לק״מ (דלק ובלאי)<input type="number" id="pk" inputmode="decimal" step="0.1" min="0" max="20" value="${R?.params?.per_km ?? 1.5}"></label>
    <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="pkgo">שמירה</button></div>`, (s, close) => {
    $('#pk', s).focus(); $('#pk', s).select?.();
    $('#pkgo', s).onclick = async e => { const v = Number($('#pk', s).value); if (!(v >= 0 && v <= 20)) return toast('מספר בין 0 ל-20');
      e.target.disabled = true; const { error } = await sb.rpc('set_cost_params', { per_km: v });
      if (error) { e.target.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
      close(); toast('נשמר'); load(); };
  });
  await load();
}
