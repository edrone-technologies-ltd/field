// תכנית עבודה כמסמך: יום אחרי יום — מה עושים (כתוב) + תמונות מהאפיון, מדוחות קודמים ומהשטח.
// המנהל כותב ומשבץ תמונות; הצוות רואה את אותו מסמך (ובמסך היום — את היום שלו). ניתן להדפסה כ-PDF מטעם E-Drone.
import { sb, state, isManager, sheet, icon, $, $$, esc, nf, toast, signedUrls, thumbUrls, zoom, dm, dayLabel, isoDay, confirmBox } from '../lib/core.js';
import { hideMoneyText as noMoney$, moneyPart } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { FACADE_MARKS, FP_REASONS, fpZ, saveFacadeMark, doneStatus, facName } from '../lib/facade.js';
export { FACADE_MARKS, loadFacadeProgress, saveFacadeMark } from '../lib/facade.js';
import { errText } from '../lib/audit.js';
import { shareIcon, sharePrint } from '../lib/share.js';
import { terms, serviceOf } from '../lib/service.js';

const KIND = { facade: 'אפיון', site: 'אפיון', obstacle: 'מכשול', before: 'לפני', after: 'אחרי', general: 'שטח', report: 'דוח קודם' };

// כל התמונות של הפרויקט: אפיון האתר, ימי שטח, ודוחות קודמים (מאנדי)
async function pool(p) {
  const [{ data: ph }, { data: reps }] = await Promise.all([
    sb.from('photos').select('storage_path,kind,building_id,created_at').or(`project_id.eq.${p.id}${p.site_id ? `,site_id.eq.${p.site_id}` : ''}`).in('kind', ['facade', 'site', 'obstacle', 'before', 'after', 'general']).order('created_at'),
    sb.from('field_reports').select('report_date,photos').eq('project_id', p.id).order('report_date')]);
  const list = (ph || []).map(x => ({ ref: 'f:' + x.storage_path, kind: x.kind, b: x.building_id }))
    .concat((reps || []).flatMap(r => (r.photos || []).filter(Boolean).map(path => ({ ref: 'm:' + path, kind: 'report', d: r.report_date }))));
  const seen = new Set(); return list.filter(x => !seen.has(x.ref) && seen.add(x.ref));
}
async function urlsFor(refs) {
  const f = refs.filter(r => r.startsWith('f:')).map(r => r.slice(2)), m = refs.filter(r => r.startsWith('m:')).map(r => r.slice(2));
  const [a, b] = await Promise.all([signedUrls('field', f), signedUrls('media', m)]);
  return Object.fromEntries(refs.map(r => [r, (r.startsWith('f:') ? a[r.slice(2)] : b[r.slice(2)]) || '']));
}
// טקסט ברירת מחדל ליום — מהמשימות שנבנו מהאפיון
// (דגשי האפיון מופיעים פעם אחת בראש התכנית — לא חוזרים בכל יום)
const draft = ts => ts.map(t => `• ${tTitle(t)}${t.method ? ` — ${t.method}` : ''}`).join('\n');
// כותרות המשימות מהמנוע כוללות "(1/2) · חצי יום" — מי שלא רואה ימים מקבל אותן בלעדיהן
const tTitle = t => seesDays() ? t.title : String(t.title || '').replace(/ \(\d+\/\d+\)/, '').replace(/ · (חצי יום|חלק מהיום)$/, '');

// ---------- תכנית לפי חזיתות (v149) ----------
// דגל אחד: האם עובד שטח (crew / crew_lead) רואה ימים לחזית וסך ימים. אביחי 03/11: לא — המספרים רק למנהל (admin / ops_manager).
// לכן הטקסט שנשמר ב-plan_days.body בלי מספרים, והמספרים ("יום 1 מתוך 2", "חצי יום") נגזרים בזמן התצוגה מהאפיון.
export const CREW_SEES_DAYS = false;
const seesDays = () => CREW_SEES_DAYS || isManager();
const ARW = { 'צפון': '↑', 'מזרח': '→', 'דרום': '↓', 'מערב': '←' };
const facLabel = x => x.t && x.t !== 'חזית מצילום' ? x.t : x.dir ? 'חזית ' + x.dir : 'חזית';
const zk = (b, k) => b + '|' + k;
// רצפים לטיניים/מספריים בתוך עברית — מבודדים. מפצלים את הטקסט הגולמי ורק אז מבריחים (לא רגקס על ישויות HTML)
const bidi = t => String(t ?? '').split(/([A-Za-z0-9][A-Za-z0-9.\/:+-]*)/).map((x, i) => i % 2 ? `<bdi dir="ltr">${esc(x)}</bdi>` : esc(x)).join('');
const lines = t => bidi(t).replace(/\n/g, '<br>');

// חזיתות האתר בסדר העבודה: מבנים לפי sort/code, ובתוך מבנה לפי סדר facade_days (= סדר הצילום, או הסדר שהמנהל קבע).
// אותו כלל כמו build_work_plan (db/096b): רק אפיון שהושלם עם ימים; מבנה בלי ימים לפי חזית = יחידה אחת. כך יום N כאן = יום N במשימות.
export async function siteUnits(siteId) {
  const { data: bs, error } = await sb.from('buildings').select('id,name,sort,code,specs(id,status,days_expected,facade_days,facades)').eq('site_id', siteId);
  if (error) throw error;
  const B = (bs || []).sort((a, b) => (a.sort ?? 1e9) - (b.sort ?? 1e9) || String(a.code ?? '').localeCompare(String(b.code ?? '')));
  const units = [], specs = []; let expected = 0;
  for (const b of B) for (const sp of [].concat(b.specs || []).filter(x => x?.status === 'done' && Number(x.days_expected) > 0)) {
    expected += Number(sp.days_expected); specs.push({ id: sp.id, b: b.id, bn: b.name, fd: Array.isArray(sp.facade_days) ? sp.facade_days : [] });
    const fd = (Array.isArray(sp.facade_days) ? sp.facade_days : []).filter(x => Number(x.d) > 0);
    if (fd.length) {
      const L = fd.map(facLabel), cnt = {}, at = {}; L.forEach(l => cnt[l] = (cnt[l] || 0) + 1);
      fd.forEach((x, i) => { const l = L[i]; at[l] = (at[l] || 0) + 1;
        units.push({ b: b.id, bn: b.name, spec: sp.id, k: x.k, keys: [zk(b.id, x.k)], t: cnt[l] > 1 ? `${l} (${at[l]})` : l, dir: x.dir || null, n: String(x.n || '').trim(), d: Number(x.d) }); });
    } else {
      const fs = sp.facades || [];
      units.push({ b: b.id, bn: b.name, spec: sp.id, k: null, keys: (fs.length ? fs : ['all']).map(f => zk(b.id, f)), t: fs.length ? fs.map(f => 'חזית ' + f).join(', ') : 'כל החזיתות', dir: fs.length === 1 ? fs[0] : null, n: '', d: Number(sp.days_expected) });
    }
  }
  // תמונת החזית: k של חזית מצילום = photos.id
  const ids = units.map(u => u.k).filter(k => /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(k || ''));
  if (ids.length) { const { data } = await sb.from('photos').select('id,storage_path').in('id', ids); const P = new Map((data || []).map(x => [x.id, x.storage_path])); units.forEach(u => { if (P.has(u.k)) u.path = P.get(u.k); }); }
  return { units, specs, expected };
}
// חלוקה לימים: יחידה של יום — 1; חזית של 1.5 = יום מלא + חצי שמשתלב עם החזית הבאה. days[n-1] = [{u, take, i, m}]
export function packDays(units) {
  const days = []; let cur = null, cap = 0;
  for (const u of units) { let rem = u.d; const segs = [];
    while (rem > 0.001) { if (cap <= 0.001) { cur = []; days.push(cur); cap = 1; } const take = Math.min(rem, cap), sg = { u, take }; cur.push(sg); segs.push(sg); rem -= take; cap -= take; }
    segs.forEach((sg, i) => { sg.i = i + 1; sg.m = segs.length; });
  }
  return days;
}
// מספרים לחזית ביום (רק למי שרואה ימים)
const segDays = sg => [sg.m > 1 ? `יום ${sg.i} מתוך ${sg.m}` : '', sg.take < 1 ? (sg.take <= 0.5 ? 'חצי יום' : 'חלק מהיום') : ''].filter(Boolean).join(' · ');
// גוף היום שנשמר: מבנה · חזית · הערה — בלי מספרים (העובד רואה אותו)
const segLine = sg => [sg.u.bn, sg.u.t, sg.u.n].filter(Boolean).join(' · ');
const dayBody = segs => segs.map(segLine).join('\n');
const dayPhotos = segs => [...new Set(segs.map(sg => sg.u.path && 'f:' + sg.u.path).filter(Boolean))];
const fmtDays = v => nf(Math.round(v * 10) / 10);

export async function renderPlan(el, pid, print = false) {
  el.innerHTML = '<div class="skel tall"></div>';
  const M = isManager();
  const [{ data: p }, { data: tasks }, { data: days }, { data: rows }] = await Promise.all([
    sb.from('projects').select('id,name,client_name,site_id,service,sites(name,address,contact_name,contact_phone,service)').eq('id', pid).single(),
    sb.from('tasks').select('id,title,day_no,method,instructions,risk,building_id,work_day_id,status').eq('project_id', pid).neq('phase', 'מעקב').neq('status', 'dropped').order('day_no').order('seq'),
    sb.from('work_days').select('id,day,status,report_time,kind,drone_id').eq('project_id', pid).neq('kind', 'report').order('day'),
    sb.from('plan_days').select('*').eq('project_id', pid).order('day_no')]);
  if (!p) { el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תכנית עבודה</h1></header><div class="empty-line">הפרויקט לא נמצא</div>`; return; }
  // אין תכנית ויש אתר עם אפיון שהושלם → נבנית לבד (בדרך כלל השרת כבר בנה אותה בשיוך/בסיום האפיון); הטקסט נשאר לעריכה
  if (M && !print && p.site_id && !(tasks || []).some(t => t.day_no) && !(rows || []).length && !el.dataset.autoplan) {
    el.dataset.autoplan = pid;
    let n = 0; try { n = (await sb.rpc('generate_work_plan', { p: pid })).data; } catch { /* בלי קליטה — מוצג מה שיש */ }
    if (n > 0) return renderPlan(el, pid, print);
  }
  delete el.dataset.autoplan;
  const [P, FU, Zs] = await Promise.all([pool(p), p.site_id ? siteUnits(p.site_id).catch(() => null) : null,
    p.site_id ? sb.rpc('project_zones', { p: pid }).then(r => r.data, () => null) : null]);
  const FD = FU ? packDays(FU.units) : [];
  const doneK = new Map((Zs?.done || []).map(x => [zk(x.b, x.k), x.day]));
  const isDone = u => u.keys.every(k => doneK.has(k));
  const R = new Map((rows || []).map(r => [r.day_no, r]));
  const nums = [...new Set([...(tasks || []).map(t => t.day_no).filter(Boolean), ...R.keys()])].sort((a, b) => a - b);
  const sched = (days || []).filter(d => d.kind !== 'report');
  const dateOf = n => { const ts = (tasks || []).filter(t => t.day_no === n && t.work_day_id); const wd = ts.length && sched.find(d => d.id === ts[0].work_day_id); return wd || sched[n - 1] || null; };
  // תמונות ליום: מה שנבחר; אחרת הצעה אוטומטית — תמונות האפיון של המבנים של אותו יום
  const photosOf = n => { const r = R.get(n); if (r && (r.photos || []).length) return r.photos;
    const bs = new Set((tasks || []).filter(t => t.day_no === n).map(t => t.building_id).filter(Boolean));
    return P.filter(x => x.b && bs.has(x.b) && x.kind === 'facade').slice(0, 4).map(x => x.ref); };
  const U = await urlsFor([...new Set(nums.flatMap(photosOf))]);
  const s = p.sites;
  const notes = [...new Set((tasks || []).map(t => noMoney$(t.instructions)).filter(Boolean))], risks = [...new Set((tasks || []).map(t => t.risk).filter(Boolean))];
  const load = await loadout(p, nums.length, days || []).catch(() => '');
  // התקדמות + בדיקת התאמה (מנהל): חזיתות שסומנו "בוצע" ביום השטח (work_days.zones_done), וסך הימים בתכנית מול האפיון
  const nU = FU?.units.length || 0, nDone = nU ? FU.units.filter(isDone).length : 0;
  const expDays = FU ? Math.ceil(FU.expected - 0.001) : 0;
  const prog = M && nU ? `<div class="pprog"><div class="progress"><i style="width:${Math.round(nDone / nU * 100)}%"></i></div><span><bdi dir="ltr" class="pnum">${nDone}</bdi> מתוך <bdi dir="ltr" class="pnum">${nU}</bdi> חזיתות בוצעו</span></div>` : '';
  const mism = M && FU && FU.expected > 0 && nums.length && nums.length !== expDays
    ? `<div class="pwarn">${icon('alert', 16)}<span>בתכנית <bdi dir="ltr" class="pnum">${nums.length}</bdi> ימים · באפיון <bdi dir="ltr" class="pnum">${fmtDays(FU.expected)}</bdi></span></div>` : '';
  const brief = load + (notes.length || risks.length ? `<section class="pbrief"><b>דגשים מהאפיון</b>${notes.map(x => `<div>${esc(x).replace(/\n/g, '<br>')}</div>`).join('')}${risks.map(x => `<div class="warn">${icon('alert', 14)} ${esc(x)}</div>`).join('')}</section>` : '');

  const dayCard = n => {
    const ts = (tasks || []).filter(t => t.day_no === n), wd = dateOf(n), body = R.get(n)?.body ?? draft(ts), ph = photosOf(n);
    return `<section class="pday" data-n="${n}">
      <div class="pdh"><span class="pdn">${n}</span><div class="grow"><b>יום ${n}</b><small>${wd ? `${dayLabel(wd.day)}${wd.report_time ? ' · יציאה ' + wd.report_time.slice(0, 5) : ''}` : 'עוד לא שובץ'}</small></div>
        ${M && !print ? `<button class="chip sm" data-pick="${n}">${icon('photo', 16)} תמונות</button>` : ''}</div>
      ${M && !print ? `<textarea class="pbody" data-body="${n}" rows="${Math.max(3, body.split('\n').length + 1)}" placeholder="מה עושים ביום הזה">${esc(noMoney$(body))}</textarea>`
        : FD[n - 1] && body.trim() === dayBody(FD[n - 1]) ? ''   // טקסט שנבנה מהאפיון ולא נערך = רשימת החזיתות שמתחת
        : `<div class="ptext">${lines(noMoney$(body)) || '<span class="muted">—</span>'}</div>`}
      ${facRows(n)}
      ${ph.length ? `<div class="pphotos">${ph.map(r => U[r] ? `<img src="${esc(U[r])}" alt="" data-z>` : '').join('')}</div>` : M && !print ? `<button class="pempty" data-pick="${n}">${icon('photo', 22)}<span>שיבוץ תמונות</span></button>` : ''}
    </section>`;
  };
  // החזיתות של היום (מהאפיון): שם · כיוון · הערה · ✓ אם בוצעה. מספרי ימים — רק למי שרואה ימים
  function facRows(n) {
    const segs = FD[n - 1]; if (!segs?.length) return '';
    return `<div class="pfacs">${segs.map(sg => { const u = sg.u, d = isDone(u), dd = seesDays() ? segDays(sg) : '';
      return `<div class="pf${d ? ' on' : ''}"><span class="pfk" aria-label="${d ? 'בוצע' : 'לא בוצע'}">${d ? icon('check', 14) : ''}</span><span class="grow">${bidi(u.bn)} · ${bidi(u.t)}${u.n ? `<small>${bidi(u.n)}</small>` : ''}</span>${dd ? `<small class="pfd">${bidi(dd)}</small>` : ''}</div>`; }).join('')}</div>`;
  }
  const head = `<div class="plhead"><div class="grow"><small class="eyebrow">תכנית עבודה</small><h1>${esc(p.name)}</h1>
      <small>${esc(s?.address || '')}${nums.length && seesDays() ? `${s?.address ? ' · ' : ''}<bdi dir="ltr" class="pnum">${nums.length}</bdi> ימי עבודה` : ''}</small></div></div>
    ${s?.contact_name || s?.contact_phone ? `<div class="small muted">איש קשר באתר: ${esc(s.contact_name || '')}${s.contact_phone ? ` · <a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a>` : ''}</div>` : ''}`;

  el.innerHTML = `<header class="phead"><a class="back" href="#/p/${pid}/t" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">תכנית עבודה</h1>
      ${nums.length && M ? `<a class="hbtn" href="#/plan/${pid}/print" aria-label="PDF">${icon('file', 20)}</a>` : ''}</header>
    <div class="stack lg plan">${head}${prog}${mism}
      ${brief}${nums.length ? nums.map(dayCard).join('') : '<div class="empty-line">אין תכנית עדיין</div>'}
      ${M ? `<div class="row-btns">${p.site_id && nU ? `<button class="btn ghost" id="pgen">בניית תכנית מהאפיון</button>` : ''}<button class="btn ghost" id="padd">${icon('plus', 18)} יום</button></div>` : ''}
    </div>`;
  if (print && M) return printView(el, p, nums, dayCard, brief);   // PDF — רק למנהל; לעובד יש את המסך

  $$('[data-z]', el).forEach(i => i.onclick = () => zoom(i.src, ''));
  if (!M) return;
  const save = async (n, patch) => {
    const { error } = await sb.from('plan_days').upsert({ project_id: pid, day_no: n, ...patch, updated_by: state.user.id, updated_at: new Date().toISOString() });
    if (error) { toast(errText(error, 'לא נשמר — נסו שוב')); return false; } R.set(n, { ...(R.get(n) || { photos: [] }), ...patch }); return true;
  };
  // הטקסט נשמר תוך כדי הקלדה (השהיה קצרה) ובעזיבת השדה; התיבה גדלה עם הטקסט
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
  $$('[data-body]', el).forEach(t => { grow(t); let tm;
    const hid = moneyPart(R.get(+t.dataset.body)?.body ?? '');   // משפט כספי שהוסתר — חוזר לסוף בשמירה
    const go = () => { clearTimeout(tm); const n = +t.dataset.body; return save(n, { body: t.value + (hid ? '\n' + hid : ''), photos: R.get(n)?.photos?.length ? R.get(n).photos : photosOf(n) }); };
    t.oninput = () => { grow(t); clearTimeout(tm); tm = setTimeout(go, 900); addEventListener('hashchange', () => tm && go(), { once: true }); }; t.onchange = go; });
  $$('[data-pick]', el).forEach(b => b.onclick = () => picker(+b.dataset.pick));
  $('#padd').onclick = async e => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; const n = (nums.at(-1) || 0) + 1; if (await save(n, { body: '', photos: [] })) renderPlan(el, pid); else b.disabled = false; };
  // בניית תכנית מהאפיון: סדר העבודה (המנהל מסדר בחצים, ברירת מחדל = סדר הצילום) → המשימות נבנות מחדש באותו סדר → יום לכל plan_days
  const g = $('#pgen'); if (g) g.onclick = async () => {
    if (g.disabled) return;
    const had = (rows || []).filter(r => String(r.body || '').trim() || (r.photos || []).length);
    if (had.length && !(await confirmBox('יש כבר תכנית. להחליף?', { body: '(ההחלפה נרשמת)', ok: 'החלפה' }))) return;
    orderSheet(FU, async order => {
      g.disabled = true;
      try {
        // 1. הסדר נשמר באפיון (סדר facade_days של כל מבנה) — כך גם המשימות, ההתקדמות והבנייה הבאה הולכות לפיו
        for (const sp of FU.specs) {
          const ks = order.filter(u => u.spec === sp.id && u.k != null).map(u => u.k);
          const cur = sp.fd.filter(x => Number(x.d) > 0).map(x => x.k);
          if (ks.join() === cur.join()) continue;
          const by = new Map(sp.fd.map(x => [x.k, x])), rest = sp.fd.filter(x => !(Number(x.d) > 0));
          const { error } = await sb.from('specs').update({ facade_days: [...ks.map(k => by.get(k)), ...rest] }).eq('id', sp.id);
          if (error) throw error;
        }
        // 2. מה שהיה — נשמר כקובץ לפני ההחלפה (plan_days לא ביומן הפעולות בשרת)
        if (had.length) {
          const blob = new Blob([JSON.stringify({ project_id: pid, at: new Date().toISOString(), by: state.user.id, rows: had })], { type: 'application/json' });
          const { error } = await sb.storage.from('field').upload(`${state.user.id}/plan-backup/${pid}/${Date.now()}.json`, blob, { contentType: 'application/json' });
          if (error) throw error;
        }
        // 3. המשימות נבנות מחדש מאותו אפיון (אותה חלוקה לימים)
        const { error: e3 } = await sb.rpc('generate_work_plan', { p: pid }); if (e3) throw e3;
        // 4. יום לכל plan_days: טקסט (בלי מספרים) + תמונות החזיתות
        const PD = packDays(order), now = new Date().toISOString();
        const { error: e4 } = await sb.from('plan_days').upsert(PD.map((segs, i) => ({ project_id: pid, day_no: i + 1, body: dayBody(segs), photos: dayPhotos(segs), updated_by: state.user.id, updated_at: now })));
        if (e4) throw e4;
        toast(`נבנו ${PD.length} ימי עבודה`); renderPlan(el, pid);
      } catch (er) { g.disabled = false; toast(errText(er, 'התכנית לא נבנתה — נסו שוב'), 4000); }
    });
  };

  // בוחר תמונות: כל תמונות הפרויקט לפי מקור, סימון/ביטול, + צילום חדש
  async function picker(n) {
    const sel = new Set(photosOf(n)), PU = await urlsFor(P.map(x => x.ref));
    const groups = [['מהאפיון', P.filter(x => ['facade', 'site', 'obstacle'].includes(x.kind))], ['מדוחות קודמים', P.filter(x => x.kind === 'report')], ['מהשטח', P.filter(x => ['before', 'after', 'general'].includes(x.kind))]].filter(g => g[1].length);
    sheet(`<h3>תמונות ליום ${n}</h3>
      ${groups.map(([t, xs]) => `<div class="small muted">${t} · ${xs.length}</div><div class="pick">${xs.map(x => PU[x.ref] ? `<button type="button" class="pk" data-r="${esc(x.ref)}" aria-pressed="${sel.has(x.ref)}"><img src="${esc(PU[x.ref])}" alt="" loading="lazy"></button>` : '').join('')}</div>`).join('') || '<div class="empty-line">אין תמונות בפרויקט</div>'}
      <label class="btn ghost block">${icon('photo', 18)} צילום / העלאה<input type="file" accept="image/*" multiple id="pup" hidden></label>
      <button class="btn primary block" id="pok">שמירה</button>`, (sh, close) => {
      $$('[data-r]', sh).forEach(b => b.onclick = () => { const r = b.dataset.r; sel.has(r) ? sel.delete(r) : sel.add(r); b.setAttribute('aria-pressed', sel.has(r)); });
      $('#pup', sh).onchange = async e => {
        toast('מעלה…');
        for (const file of e.target.files) {
          try { const blob = await shrink(file), path = `${state.user.id}/plan/${crypto.randomUUID()}.jpg`;
            const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
            await sb.from('photos').insert({ storage_path: path, project_id: pid, site_id: p.site_id, kind: 'site', uploaded_by: state.user.id, caption: 'תכנית עבודה' });
            sel.add('f:' + path);
          } catch (er) { toast(errText(er, 'התמונה לא עלתה — נסו שוב')); }
        }
        await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' }); close(); renderPlan(el, pid);
      };
      $('#pok', sh).onclick = async () => { const b = $('#pok', sh); if (b.disabled) return; b.disabled = true;
        if (await save(n, { photos: [...sel], body: R.get(n)?.body ?? $(`[data-body="${n}"]`)?.value ?? '' })) { close(); toast('נשמר'); renderPlan(el, pid); } else b.disabled = false; };
    });
  }
}

// סדר העבודה לפי חזיתות: רשימה לפי מבנה, חצים למעלה/למטה (בתוך המבנה). ברירת המחדל = הסדר השמור (סדר הצילום)
async function orderSheet(FU, done) {
  const L = FU.units.slice();
  const U = await thumbUrls('field', L.map(u => u.path).filter(Boolean)).catch(() => ({}));
  sheet(`<h3>סדר העבודה</h3><div class="ford" id="ford"></div>
    <div class="row-btns"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn primary" id="fordok">בנייה</button></div>`, (sh, close) => {
    const box = $('#ford', sh);
    const draw = (focus) => {
      let lastB = null;
      box.innerHTML = L.map((u, i) => { const head = u.b !== lastB ? `<div class="fordb">${bidi(u.bn)}</div>` : ''; lastB = u.b;
        const up = i > 0 && L[i - 1].b === u.b, dn = i < L.length - 1 && L[i + 1].b === u.b, src = u.path && U[u.path]?.t;
        return `${head}<div class="fordr">${src ? `<img src="${esc(src)}" alt="">` : `<span class="fordc">${u.dir ? esc(ARW[u.dir] || '') : ''}</span>`}
          <span class="grow"><b>${bidi(u.t)}</b>${u.n ? `<small>${bidi(u.n)}</small>` : ''}</span>
          ${seesDays() ? `<small class="pfd"><bdi dir="ltr" class="pnum">${fmtDays(u.d)}</bdi> ${u.d === 1 ? 'יום' : 'ימים'}</small>` : ''}
          <button type="button" class="hbtn" data-mv="${i}" data-d="-1" ${up ? '' : 'disabled'} aria-label="למעלה">${icon('M12 19V5 M5 12l7-7 7 7', 18)}</button>
          <button type="button" class="hbtn" data-mv="${i}" data-d="1" ${dn ? '' : 'disabled'} aria-label="למטה">${icon('M12 5v14 M5 12l7 7 7-7', 18)}</button></div>`; }).join('');
      $$('[data-mv]', box).forEach(b => b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [L[i], L[j]] = [L[j], L[i]]; draw(`[data-mv="${j}"][data-d="${b.dataset.d}"]`); });
      if (focus) { const f = box.querySelector(focus); (f && !f.disabled ? f : box.querySelector(`[data-mv="${focus.match(/\d+/)[0]}"]:not([disabled])`))?.focus(); }
    };
    draw();
    $('#fordok', sh).onclick = () => { close(); done(L); };
  });
}

// "מה להעמיס" — נגזר מהאפיונים שהושלמו באתר + הרחפן ששובץ. קריאה בלבד, בלי מספרים מומצאים
async function loadout(p, ndays, days) {
  if (!p.site_id) return '';
  const droneIds = [...new Set(days.map(d => d.drone_id).filter(Boolean))];
  const [{ data: bs }, { data: dr }] = await Promise.all([
    sb.from('buildings').select('floors,specs(status,method,material,floors,site_ops,hydrants,power,service_type)').eq('site_id', p.site_id),
    droneIds.length ? sb.from('equipment').select('name').in('id', droneIds) : Promise.resolve({ data: [] })]);
  const S = (bs || []).flatMap(b => (Array.isArray(b.specs) ? b.specs : [b.specs]).filter(x => x?.status === 'done').map(x => ({ ...x, fl: Number(x.floors ?? b.floors) || 0 })));
  if (!S.length) return '';
  const t = terms(serviceOf(p, S.find(x => x.service_type)?.service_type));   // פנלים על גג — בלי "קומות"; סריקה — בלי "שטיפה"
  const O = S.map(x => x.site_ops || {}), has = (k, v) => O.some(o => o[k] === v), any = k => [...new Set(O.flatMap(o => o[k] || []))];
  const M = new Set(S.map(x => x.method).filter(Boolean)), mats = [...new Set(S.map(x => x.material).filter(m => m && m !== 'אחר'))];
  const fl = Math.max(0, ...S.map(x => x.fl)), haz = any('hazards');
  const L = [];
  if (M.has('רחפן') || M.has('משולב') || !M.size) L.push(['רחפן', (dr || []).map(x => x.name).join(', ') || (t.wash ? 'שטיפה' : t.work)]);
  if (M.has('סנפלינג') || M.has('משולב')) L.push(['סנפלינג', 'ציוד גלישה ועיגון']);
  if (mats.length) L.push(['חומר ניקוי', mats.join(' · ') + (ndays && seesDays() ? ` · ל-${ndays} ימי עבודה` : '')]);
  if (has('water', 'מכלית')) L.push(['מים', 'מכלית — אין מקור באתר']);
  else if (has('water', 'הידרנט')) L.push(['מים', 'מתאם הידרנט']);
  else if (has('water', 'ברז באתר')) L.push(['מים', 'מחבר לברז']);
  else if (S.some(x => x.hydrants)) L.push(['מים', 'מתאם הידרנט']);   // אפיונים מלפני 096
  // צינור הלחץ והמשאבה קבועים על הנגרר — לא בהעמסה. סחיבה רחוקה — כהערה
  if (has('access', 'רחוק — סחיבה')) L.push(['גישה', 'רחוק — סחיבה' + (t.roof ? ' · עבודה על גג' : fl ? ` · גובה ${fl} קומות` : '')]);
  if (has('power', 'גנרטור')) L.push(['חשמל', 'גנרטור · כבל מאריך · עמדת חשמל ניידת']);
  else if (has('power', 'שקע באתר') || S.some(x => x.power)) L.push(['חשמל', 'שקע באתר — בלי גנרטור · כבל מאריך']);
  L.push(['בטיחות', ['ציוד מגן אישי', 'ערכת עזרה ראשונה', 'מערכת קשר', haz.includes('הולכי רגל') && 'גידור מעבר הולכי רגל', has('launch', 'גג') && 'עבודה מהגג — רתמות'].filter(Boolean).join(' · ')]);
  return `<section class="pload"><b>מה להעמיס</b>${L.map(([k, v]) => `<div class="pl"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>`;
}

// הדפסה: אותו מסמך בתבנית הדוחות של החברה, בלי שדות עריכה
async function printView(el, p, nums, dayCard, brief) {
  const { data: co } = await sb.from('app_settings').select('value').eq('key', 'company').maybeSingle();
  const c = co?.value || {}, coLine = [c.phone, c.email, c.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/plan/${p.id}" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">תכנית עבודה</b><button class="btn ghost sm" id="print">הדפסה</button><button class="btn primary sm" id="plsh">${shareIcon(16)} PDF</button></div>
    <div class="creport vrep"><div class="pg flow"><div class="pad">
      <div class="vhead"><img src="logo.png" alt="E-Drone"></div>
      <div class="rsec">WORK PLAN</div><h2>${esc(p.name)}</h2><div class="rule"></div>
      ${brief}${nums.map(n => dayCard(n)).join('')}
      <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div>
    </div></div></div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
  $('#plsh').onclick = e => sharePrint(e.currentTarget, $('.creport', el), `תכנית עבודה - ${p.name}`, `תכנית עבודה · ${p.name}`);
}

// תכנית היום של יום שטח (נשמר במטמון של היום — עובד גם בלי קליטה). null = אין תכנית
export async function dayPlan(day) {
  if (!day?.project_id) return null;
  const [{ data: ts, error: e1 }, { data: days, error: e2 }] = await Promise.all([
    sb.from('tasks').select('day_no,work_day_id').eq('project_id', day.project_id).neq('phase', 'מעקב').not('day_no', 'is', null),
    sb.from('work_days').select('id,day,kind').eq('project_id', day.project_id).order('day')]);
  if (e1 || e2) throw e1 || e2;
  const n = (ts || []).find(t => t.work_day_id === day.id)?.day_no || ((days || []).filter(d => d.kind !== 'report').findIndex(d => d.id === day.id) + 1);
  if (!n) return null;
  const [{ data: r, error }, facs] = await Promise.all([
    sb.from('plan_days').select('body,photos').eq('project_id', day.project_id).eq('day_no', n).maybeSingle(),
    dayFacs(day, n).catch(() => null)]);
  if (error) throw error;
  const auto = facs?.auto; delete facs?.auto;
  return (r && (r.body || (r.photos || []).length)) || facs?.list.length
    ? { body: r?.body || '', photos: r?.photos || [], facs: facs?.list || [], auto: auto || '' } : null;
}
// החזיתות של יום N בתכנית — לפי האפיון והסדר השמור (נשמר במטמון היום: עובד גם בלי קליטה)
async function dayFacs(day, n) {
  const sid = day.projects?.site_id || (await sb.from('projects').select('site_id').eq('id', day.project_id).maybeSingle()).data?.site_id;
  if (!sid) return null;
  const segs = packDays((await siteUnits(sid)).units)[n - 1] || [];
  return { list: segs.map(sg => ({ bn: sg.u.bn, t: sg.u.t, dir: sg.u.dir, n: sg.u.n, keys: sg.u.keys, path: sg.u.path || null, i: sg.i, m: sg.m, take: sg.take })), auto: dayBody(segs) };
}
// סימון לכל חזית ביום השטח (ADR 0007): טבלת facade_progress — שורה לכל (יום, מבנה, חזית), כותב יחיד, דרך התור (עובד בלי קליטה).
// לעובד שני כפתורים בלבד: "בוצע" / "תקלה". "חלקי" אוטומטי (מקטע שאינו האחרון של חזית רב-יומית). "לא בוצע" + סיבה — בסגירת היום.
// המפתח: zkey = building_id|k — k יציב מהאפיון (photos.id לחזית מצילום, שם הכיוון לחזית בלי צילום, plan_images.id לגיליון, all)
// הטבלה עוד לא קיימת בשרת (המיגרציה לא רצה) → o.fp = null והכפתורים לא מוצגים (FACADE_MARKS = false מחזיר את המצב הקודם מיד)
// הסימון עצמו (טבלה, תור, סטטוס) ב-lib/facade.js — משותף למסך היום ולסגירת היום

// בלוק "תכנית היום" למסך יום השטח. r = תכנית מהמטמון (undefined = לטעון). מחזיר את התכנית שהוצגה
// o.can = מי שמשובץ ביום או מנהל (מסמן); o.fp = סימוני facade_progress של הפרויקט (null = לפני המיגרציה);
// o.done = Map(zkey → {wd, day}) — zones_done הישן, רק כשאין o.fp; o.lead / o.closed — מי מבטל סימון (מי שסימן עד הסגירה, ראש הצוות, מנהל);
// o.onIssue(f) / o.onPhoto(f, files) — תקלה וצילום מכרטיס החזית (המסך שקורא מוסיף מבנה + מפתח חזית); o.onChange() — שמירת המצב המקומי
export async function planForDay(box, day, r, o = {}) {
  if (!box || !day?.project_id) return r;
  if (r === undefined) r = await dayPlan(day);
  if (!r) { box.innerHTML = ''; return r; }
  const F = r.facs || [];
  // טקסט שנבנה מהאפיון ולא נערך = בדיוק רשימת החזיתות; מוצג רק כשהמנהל כתב משהו משלו
  const body = r.body && !(F.length && r.body.trim() === (r.auto || '').trim()) ? r.body : '';
  const fPaths = new Set(F.map(f => f.path && 'f:' + f.path).filter(Boolean)), extra = (r.photos || []).filter(x => !fPaths.has(x));
  const [U, T] = await Promise.all([urlsFor(extra).catch(() => ({})), signedUrls('field', F.map(f => f.path).filter(Boolean)).catch(() => ({}))]);
  const marks = FACADE_MARKS && Array.isArray(o.fp), me = state.user.id;
  const keyOne = f => f.keys.length === 1 ? f.keys[0].split('|').slice(1).join('|') : null;
  const st = f => {   // מצב החזית ביום הזה: mine = שורות היום; before = הושלמה ביום אחר
    if (!marks) { const D = o.done || new Map(), on = f.keys.every(k => D.has(k)), mine = f.keys.some(k => D.get(k)?.wd === day.id); return { on, before: on && !mine, day: D.get(f.keys[0])?.day, can: false }; }
    const today = f.keys.map(k => o.fp.find(x => x.work_day_id === day.id && fpZ(x) === k)).filter(Boolean);
    const on = today.length === f.keys.length && today.every(x => x.status !== 'skipped'), skip = today.find(x => x.status === 'skipped');
    const prev = !today.length && f.keys.every(k => o.fp.some(x => x.work_day_id !== day.id && fpZ(x) === k && x.status === 'done'));
    const undo = on && ((today.every(x => x.marked_by === me) && !o.closed) || isManager() || o.lead);   // כמו fp_can_unmark בשרת
    return { on, skip, before: prev, day: prev ? o.fp.find(x => fpZ(x) === f.keys[0] && x.status === 'done')?.day : null, can: o.can && !prev && (!on || undo) };
  };
  const draw = () => {
    box.innerHTML = `<section class="stack"><div class="sh-row"><h3 class="sh">תכנית היום</h3><a class="more" href="#/plan/${day.project_id}">כל התכנית</a></div>
      ${F.length ? `<div class="dfacs">${F.map((f, i) => { const S = st(f), on = S.on || S.before, src = f.path && T[f.path];
        const dd = seesDays() ? segDays(f) : '';
        return `<div class="dfac${on ? ' on' : ''}">${src ? `<button type="button" class="dfimg" data-fz="${i}"><img src="${esc(src)}" alt="" loading="lazy"></button>` : `<span class="dfimg cmp">${f.dir ? esc(ARW[f.dir] || '') : ''}</span>`}
          <div class="grow dfx"><b>${bidi(f.bn)} · ${bidi(f.t)}</b>${f.dir ? `<span class="dfdir"><span class="ar" aria-hidden="true">${ARW[f.dir] || ''}</span>${esc(f.dir)}</span>` : ''}${f.n ? `<small>${bidi(f.n)}</small>` : ''}${dd ? `<small class="pfd">${bidi(dd)}</small>` : ''}${S.skip ? `<small class="dfskip">לא בוצע · ${esc(FP_REASONS[S.skip.reason] || '')}</small>` : ''}</div>
          ${marks || on ? `<div class="dfacts"><button type="button" class="dfmark" data-fm="${i}" aria-pressed="${on}" ${marks && S.can ? '' : 'disabled'}>${on ? `${icon('check', 16)}<span>בוצע</span>${S.before && S.day ? `<small>${esc(dm(S.day))}</small>` : ''}` : '<span>בוצע</span>'}</button>
          ${marks && !S.before ? `<button type="button" class="dfiss" data-fi="${i}" ${o.can ? '' : 'disabled'} aria-label="תקלה בחזית">${icon('alert', 18)}</button>` : ''}
          ${marks && S.on && o.can && o.onPhoto ? `<label class="dfcam" aria-label="צילום אחרי">${icon('photo', 18)}<input type="file" accept="image/*" capture="environment" multiple data-fp="${i}" hidden></label>` : ''}</div>` : ''}</div>`; }).join('')}</div>` : ''}
      ${body || extra.some(x => U[x]) ? `<div class="card stack">${body ? `<div class="ptext">${lines(noMoney$(body))}</div>` : ''}
      ${extra.some(x => U[x]) ? `<div class="pphotos">${extra.map(x => U[x] ? `<img src="${esc(U[x])}" alt="" data-z>` : '').join('')}</div>` : ''}</div>` : ''}</section>`;
    $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.src, ''));
    const G = F.map((f, i) => ({ i, src: f.path && T[f.path], title: [f.bn, f.t, f.n].filter(Boolean).join(' · ') })).filter(x => x.src);
    $$('[data-fz]', box).forEach(b => b.onclick = () => { const g = G.find(x => x.i === +b.dataset.fz); zoom(g.src, g.title, G); });
    $$('[data-fm]', box).forEach(b => b.onclick = async () => {
      if (b.disabled || !marks) return; b.disabled = true; const f = F[+b.dataset.fm], S = st(f);
      try { await saveFacadeMark({ day, keys: f.keys, status: doneStatus(f), del: S.on, label: facName(f), fp: o.fp }); o.onChange?.(); }
      catch (e) { toast(e?.quota ? 'אין מקום בטלפון — לא נשמר' : 'לא נשמר — נסו שוב', 3500, 'error'); }
      draw();
    });
    $$('[data-fi]', box).forEach(b => b.onclick = () => { const f = F[+b.dataset.fi]; o.onIssue?.({ building_id: f.keys[0].split('|')[0], facade_key: keyOne(f), label: facName(f) }); });
    $$('[data-fp]', box).forEach(inp => inp.onchange = async () => { const f = F[+inp.dataset.fp], files = [...inp.files]; inp.value = '';
      if (files.length) await o.onPhoto?.({ building_id: f.keys[0].split('|')[0], facade_key: keyOne(f), label: facName(f) }, files); });
  };
  box._draw = draw;   // המסך שקורא מצייר מחדש אחרי סימון ממקום אחר (סגירת היום)
  draw();
  return r;
}
