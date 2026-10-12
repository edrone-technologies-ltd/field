// התקדמות לפי אזור (חזית) ו"מ״ר לשעה". האזורים מגיעים מהאפיון (db/112 project_zones) — אין שדה מ״ר ידני.
// סגירת יום: צ׳יפ לכל חזית של המבנים של היום, מסומן מראש לפי המשימות שבוצעו. פרויקט: פס לכל מבנה + % כולל. דוחות: "תפוקה".
import { sb, cache, isManager, icon, esc, nf, $, $$ } from '../lib/core.js';

export const zkey = z => z.b + '|' + z.k;
export async function loadZones(pid) {
  try { const { data, error } = await sb.rpc('project_zones', { p: pid }); if (error) throw error; await cache.set('zones:' + pid, data).catch(() => {}); return data; }
  catch { return (await cache.get('zones:' + pid).catch(() => null)) || null; }
}

// ---------- סגירת יום ----------
// אילו אזורים מוצגים: של המבנים במשימות הביצוע של היום; בלי מבנה ביום (דוח ידני) — כל מה שעוד לא הושלם בפרויקט
export function dayZones(Zs, tasks, dayId) {
  const Z = Zs?.zones || [], before = new Set((Zs?.done || []).filter(x => x.wd !== dayId).map(zkey));
  const B = new Set(tasks.filter(t => t.phase === 'ביצוע' && t.building_id).map(t => t.building_id));
  return Z.filter(z => (!B.size || B.has(z.b)) && !before.has(zkey(z)));
}
// מילוי מראש: מה שכבר נשמר ליום הזה; אחרת — החזיתות של משימות הביצוע שסומנו "בוצע" (משימה שהיא חלק 1/3 של חזית — עוד לא)
export function zonePrefill(Zs, tasks, dayId) {
  const mine = (Zs?.done || []).filter(x => x.wd === dayId).map(zkey); if (mine.length) return mine;
  const Z = dayZones(Zs, tasks, dayId), out = [];
  for (const t of tasks.filter(t => t.phase === 'ביצוע' && t.building_id && t.status === 'done')) {
    const m = String(t.title || '').match(/\((\d+)\/(\d+)\)/); if (m && +m[1] < +m[2]) continue;
    const zs = Z.filter(z => z.b === t.building_id), f = t.facades || [];
    const pick = f.length ? zs.filter(z => f.includes(z.dir)) : zs.filter(z => z.k === 'all');
    (pick.length ? pick : zs.length === 1 ? zs : []).forEach(z => out.push(zkey(z)));
  }
  return [...new Set(out)];
}
export function zonesHtml(list, sel) {
  if (!list.length) return '';
  const multi = new Set(list.map(z => z.b)).size > 1, m2 = list.filter(z => sel.includes(zkey(z))).reduce((s, z) => s + Number(z.m2 || 0), 0);
  return `<div class="sec zsec"><div class="row"><h3 class="grow">מה הושלם היום</h3>${m2 ? `<span class="pill lime" id="zm2">${nf(Math.round(m2))} מ״ר</span>` : '<span id="zm2"></span>'}</div>
    <div class="chips">${list.map(z => `<button type="button" class="chip zchip" data-z="${esc(zkey(z))}" aria-pressed="${sel.includes(zkey(z))}">${esc(multi ? z.bn + ' · ' + z.t : z.t)}${z.m2 ? `<small>${nf(Math.round(z.m2))}</small>` : ''}</button>`).join('')}</div></div>`;
}
export function bindZones(root, list, sel, onChange) {
  $$('[data-z]', root).forEach(b => b.onclick = () => {
    const k = b.dataset.z, L = sel().slice(); L.includes(k) ? L.splice(L.indexOf(k), 1) : L.push(k); onChange(L);
    b.setAttribute('aria-pressed', L.includes(k));
    const m2 = list.filter(z => L.includes(zkey(z))).reduce((s, z) => s + Number(z.m2 || 0), 0), p = $('#zm2', root);
    if (p) { p.className = m2 ? 'pill lime' : ''; p.textContent = m2 ? nf(Math.round(m2)) + ' מ״ר' : ''; }
  });
}
export const zonesPayload = keys => keys.map(k => { const [b, ...r] = k.split('|'); return { b, k: r.join('|') }; });

// ---------- מסך הפרויקט: פס לכל מבנה + % כולל ----------
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
export async function progressCard(box, pid, { started = false } = {}) {
  if (!box) return;
  const Zs = await loadZones(pid); const Z = Zs?.zones || [];
  if (!Z.length) return;
  const done = new Map((Zs.done || []).map(x => [zkey(x), x]));
  if (!done.size && !started) return;
  const B = []; Z.forEach(z => { let b = B.find(x => x.id === z.b); if (!b) B.push(b = { id: z.b, name: z.bn, z: [] }); b.z.push(z); });
  const area = Z.every(z => z.m2), tot = area ? Z.reduce((s, z) => s + Number(z.m2), 0) : Z.length;
  const dn = area ? Z.filter(z => done.has(zkey(z))).reduce((s, z) => s + Number(z.m2), 0) : Z.filter(z => done.has(zkey(z))).length;
  const P = pct(dn, tot), dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`;
  box.innerHTML = `<section class="zprog card stack"><div class="row"><div class="ring" style="--p:${P}"><b>${P}%</b></div>
      <div class="grow"><b>התקדמות בשטח</b><div class="small muted">${area ? `${nf(Math.round(dn))} מתוך ${nf(Math.round(tot))} מ״ר` : `${dn} מתוך ${tot} חזיתות`}</div></div></div>
    ${B.map(b => { const bt = area ? b.z.reduce((s, z) => s + Number(z.m2), 0) : b.z.length, bd = area ? b.z.filter(z => done.has(zkey(z))).reduce((s, z) => s + Number(z.m2), 0) : b.z.filter(z => done.has(zkey(z))).length;
      return `<div class="zb"><div class="row"><b class="grow">${esc(b.name)}</b><span class="small muted">${pct(bd, bt)}%</span></div><div class="progress"><i style="width:${pct(bd, bt)}%"></i></div>
        ${b.z.length > 1 || b.z[0].k !== 'all' ? `<div class="zfs">${b.z.map(z => { const d = done.get(zkey(z)); return `<span class="zf${d ? ' on' : ''}">${d ? icon('check', 12) : ''}${esc(z.t.replace(/^חזית /, ''))}${d ? `<small>${dm(d.day)}</small>` : ''}</span>`; }).join('')}</div>` : ''}</div>`; }).join('')}
  </section>`;
}

// ---------- מ״ר לשעה ----------
const rateTxt = r => r?.rate != null ? nf(r.rate) : '—';
const DIMS = [['lead', 'לפי ראש צוות'], ['drone', 'לפי רחפן'], ['height', 'לפי גובה'], ['service', 'לפי שירות'], ['project', 'לפי פרויקט']];
function dimRows(rows, max) {
  return rows.map(r => `<div class="zr"><span class="grow"><b>${esc(r.label)}</b><small>${nf(r.m2)} מ״ר · ${nf(r.hours)} ש׳ · ${r.days} ימים</small></span>
    <span class="zrv"><b>${rateTxt(r)}</b><i style="width:${max ? Math.round((r.rate || 0) / max * 100) : 0}%"></i></span></div>`).join('');
}
// סיכום הפרויקט (מנהלים): מ״ר שהושלם, מ״ר לשעה, ופירוק לפי ראש צוות / רחפן / גובה
export async function projectRate(box, pid) {
  if (!box || !isManager()) return;
  const { data } = await sb.rpc('productivity', { p: pid }).catch(() => ({ data: null }));
  const t = data?.total?.[0]; if (!t) return;
  const sub = DIMS.slice(0, 3).map(([k, l]) => (data[k] || []).length > 1 ? `<details class="fold"><summary><span class="sh">${l}</span></summary><div class="zlist">${dimRows(data[k], Math.max(...data[k].map(r => r.rate || 0)))}</div></details>` : '').join('');
  box.innerHTML = `<div class="kpis"><div class="kpi"><b>${nf(t.m2)}</b><span>מ״ר הושלמו</span></div><div class="kpi"><b>${rateTxt(t)}</b><span>מ״ר לשעת צוות</span></div></div>${sub}`;
}
// מסך הדוחות (מנהלים): "תפוקה" — 90 הימים האחרונים
export async function prodSection(box) {
  if (!box || !isManager()) return;
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const { data } = await sb.rpc('productivity', { since }).catch(() => ({ data: null }));
  const t = data?.total?.[0]; if (!t) return;
  let dim = 'lead';
  const draw = () => { const rows = data[dim] || [], max = Math.max(0, ...rows.map(r => r.rate || 0));
    box.innerHTML = `<section class="stack zprod"><div class="sh-row"><h3 class="sh">תפוקה</h3><span class="small muted">90 יום</span></div>
      <div class="kpis"><div class="kpi"><b>${rateTxt(t)}</b><span>מ״ר לשעת צוות</span></div><div class="kpi"><b>${nf(t.m2)}</b><span>מ״ר הושלמו</span></div><div class="kpi"><b>${t.days}</b><span>ימי שטח</span></div></div>
      <div class="chips">${DIMS.map(([k, l]) => `<button type="button" class="chip" data-zd="${k}" aria-pressed="${k === dim}">${l.replace('לפי ', '')}</button>`).join('')}</div>
      <div class="zlist">${dimRows(rows, max)}</div></section>`;
    $$('[data-zd]', box).forEach(b => b.onclick = () => { dim = b.dataset.zd; draw(); });
  };
  draw();
}
