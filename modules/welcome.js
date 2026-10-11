// קבלת פנים לעובד חדש (מסך מלא, החלקה): שלום + התפקיד → התקנה למסך הבית (לפי מכשיר) → התראות → 3 החלקות "מה עושים כאן" → הדבר הראשון שלך.
// מופעל פעם אחת (profiles.welcomed_at). באייפון בספארי: עד ההתקנה בלבד — ההמשך באפליקציה ממסך הבית (שם ההתראות עובדות).
import { sb, state, $, $$, esc, icon, ROLE_HE, FIELD_HE, enablePush, pushState, pushSupported, isStandalone, haptic, isoDay, dayLabel } from '../lib/core.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
const UA_ = () => navigator.userAgent;
export const device = () => {
  const UA = UA_();
  const ios = /iphone|ipad|ipod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const android = /android/i.test(UA);
  const inapp = /FBAN|FBAV|Instagram|Line\/|LinkedInApp|GSA\//i.test(UA);
  const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(UA) && !inapp;
  return { ios, android, inapp, safari, mobile: ios || android, standalone: isStandalone() };
};
// אירוע ההתקנה של כרום (אנדרואיד) — נשמר כאן; app.js יכול לחשוף גם window.__bip
let bip = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e; });
addEventListener('appinstalled', () => ls('edrone-installed', '1'));
// מצב ההתראות עם תקרת זמן (serviceWorker.ready יכול להיתקע — לא מעכבים את קבלת הפנים)
const pst = () => Promise.race([pushState(), new Promise(r => setTimeout(() => r('unsupported'), 2500))]).catch(() => 'unsupported');
const first = () => String(state.profile?.full_name || '').trim().split(/\s+/)[0] || '';

// סמל המותג כ-SVG (חד בכל גודל; האייקון הקיים כולל מסגרת לבנה/שחורה של maskable)
export const MARK = `<svg class="wl-mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="26" fill="#c9ec7f"/><g stroke="#3d3f40" stroke-width="7" stroke-linecap="round" fill="none"><path d="M33 33l34 34M67 33L33 67"/><path d="M19 30a14 14 0 0 1 11-11M81 30a14 14 0 0 0-11-11M19 70a14 14 0 0 0 11 11M81 70a14 14 0 0 1-11 11"/></g><g fill="#3d3f40"><circle cx="50" cy="50" r="13"/><circle cx="31" cy="31" r="6"/><circle cx="69" cy="31" r="6"/><circle cx="31" cy="69" r="6"/><circle cx="69" cy="69" r="6"/></g></svg>`;
// ---------- איורים (CSS/SVG בלבד, בלי תמונות) ----------
const DRONE = `<svg class="wl-drone" viewBox="0 0 120 70" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M30 35h60M60 35v12"/><path d="M18 22h24M78 22h24"/><path d="M30 22v13M90 22v13"/></g><rect x="46" y="28" width="28" height="16" rx="7" fill="currentColor"/><path d="M60 47c-6 8-6 14 0 18 6-4 6-10 0-18z" fill="#7fb2ff" opacity=".9"/></svg>`;
const SHARE = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const ADDSQ = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
const DOTS = `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
const mock = (h) => `<div class="wl-mock">${h}</div>`;
const mrow = (ic, b, s, tone = '') => `<div class="wl-mrow ${tone}"><span class="wl-mic">${icon(ic, 18)}</span><span><b>${b}</b>${s ? `<small>${s}</small>` : ''}</span></div>`;

// "מה עושים כאן" — שלוש החלקות לכל תפקיד
const ST = {
  field: [
    { art: mock(`${mrow('calendar', 'מחר · 06:30', 'מגדלי הים · צוות 1')}<div class="wl-mbtn">אישור הגעה ✓</div>`), t: 'השיבוץ שלך', s: 'איפה, מתי ועם מי — ומאשרים בלחיצה' },
    { art: mock(`<div class="wl-go">${icon('send', 26)}<b>יוצאים לדרך</b></div>${mrow('clock', 'השעות נרשמות לבד', 'יציאה · הגעה · סיום')}`), t: 'יום שטח בכפתור אחד', s: 'יציאה, הגעה וסיום — בלי טפסים' },
    { art: mock(`<div class="wl-ph"><i></i><i></i><i></i><i></i></div>${mrow('report', 'הדוח היומי מוכן', '12 תמונות · 3 חזיתות', 'ok')}`), t: 'מצלמים — הדוח נבנה', s: 'לפני ואחרי, תקלה או הוצאה — בלחיצה על הפלוס' },
  ],
  lead: [
    { art: mock(`${mrow('calendar', 'מחר · 06:30', 'מגדלי הים · אתה ראש הצוות')}${mrow('users', 'הצוות אישר', 'סטניסלב ✓ · חיים ✓', 'ok')}`), t: 'הצוות שלך מוכן', s: 'שיבוץ, אישורי הגעה ותכנית העבודה' },
    { art: mock(`<div class="wl-go">${icon('drone', 26)}<b>פותחים יום</b></div>${mrow('sun', 'רוח 14 קמ״ש · אפשר לטוס', '', 'ok')}`), t: 'יום שטח מהשטח', s: 'מזג אוויר, ציוד ומשימות — הכל במסך אחד' },
    { art: mock(`${mrow('report', 'דוח יומי', 'נוצר מהתמונות', 'ok')}${mrow('pen', 'החתמת לקוח', 'בסיום העבודה')}`), t: 'סוגרים יום, הלקוח חותם', s: 'הדוח והסיכום יוצאים לבד' },
  ],
  ops: [
    { art: mock(`<div class="wl-wk">${['א', 'ב', 'ג', 'ד', 'ה'].map((d, i) => `<span><small>${d}</small><i class="${i === 1 ? 'b' : i === 3 ? 'c' : ''}"></i><i class="${i === 2 ? 'b' : ''}"></i></span>`).join('')}</div>`), t: 'לוח השיבוץ', s: 'גוררים צוות לפרויקט — כולם מקבלים הודעה' },
    { art: mock(`${mrow('alert', 'רחפן 2 מקורקע', 'יום ג׳ · מגדלי הים', 'bad')}${mrow('users', 'חסר מטיס', 'יום ה׳', 'warn')}`), t: 'מה דורש טיפול', s: 'שבוע קדימה — לפני שזה הופך לבעיה' },
    { art: mock(`${mrow('clipboard', 'אפיון', '4 חזיתות · 6 ימי עבודה')}${mrow('users', 'דוח ביקור', '2 תיקונים לצוות', 'ok')}`), t: 'אפיונים וביקורים', s: 'מהסיור בשטח ישר לתכנית ולמשימות' },
  ],
  admin: [
    { art: mock(`<div class="wl-kpi"><span><b>3</b><small>צוותים בשטח</small></span><span><b>12</b><small>ימי עבודה השבוע</small></span></div>${mrow('activity', 'הכל בזמן אמת', '')}`), t: 'כל העסק בכף היד', s: 'מי בשטח, מה התקדם, מה תקוע' },
    { art: mock(`<div class="wl-sync"><b>מאנדי</b>${icon('sync', 30)}<b>שטח</b></div>`), t: 'מאנדי מסונכרן', s: 'הנתונים זורמים לבד — בלי העתקות' },
    { art: mock(`<div class="wl-fun">${[['הוזמנו', 100], ['נכנסו', 80], ['התקינו', 60], ['התראות', 45]].map(([l, w]) => `<span><small>${l}</small><i style="--w:${w}%"></i></span>`).join('')}</div>`), t: 'ההשקה במעקב', s: 'מי נכנס, התקין והפעיל התראות' },
  ],
};
export const storiesFor = (role = state.profile?.role) => role === 'admin' ? ST.admin : role === 'ops_manager' ? ST.ops : role === 'crew_lead' ? ST.lead : ST.field;

// ---------- השקופיות ----------
function sHello(team) {
  const p = state.profile, role = [ROLE_HE[p.role], p.field_role && FIELD_HE[p.field_role]].filter(Boolean).join(' · ');
  return { k: 'hello', cls: 'wl-hero', art: `<div class="wl-orbit">${MARK}<span class="wl-fly">${DRONE}</span></div>`,
    t: `${first() ? `היי ${esc(first())},` : 'היי,'} ברוך הבא לצוות`, s: 'E-Drone · רחפנים לשטיפת חזיתות ומתקנים בגובה',
    extra: `<div class="wl-role">${esc(role)}${team ? ` · ${esc(team)}` : ''}</div>`, btn: 'בואו נתחיל' };
}
function sInstall() {
  const d = device();
  if (d.ios && !d.safari) return { k: 'install', art: `<div class="wl-big">${icon('send', 46)}</div>`, t: 'פותחים בספארי', s: 'ההתקנה וההתראות באייפון עובדות רק מספארי',
    extra: `<button class="btn ghost block" data-copy>${icon('file', 18)} העתקת הקישור</button>`, btn: 'המשך', alt: 'אחר כך' };
  if (d.ios) return { k: 'install', cls: 'wl-ios', art: `<div class="wl-steps3">
      <span><i>${SHARE}</i><b>שיתוף</b></span><em>←</em><span><i>${ADDSQ}</i><b>הוסף למסך הבית</b></span><em>←</em><span><i class="t">הוסף</i><b>אישור</b></span></div>
      <div class="wl-safari"><span></span><span class="on">${SHARE}</span><span></span></div><div class="wl-point" aria-hidden="true">↓</div>`,
    t: 'מוסיפים למסך הבית', s: 'כך מקבלים התראות באייפון', btn: 'הוספתי', alt: 'אחר כך', iosAdd: true };
  return { k: 'install', art: `<div class="wl-orbit sm">${MARK}</div>`, t: 'מתקינים בלחיצה', s: 'אייקון במסך הבית, נפתח כמו אפליקציה',
    extra: `<div class="wl-hint" data-manual hidden>${DOTS} בתפריט הדפדפן ← "התקנת אפליקציה"</div>`, btn: 'התקנה', alt: 'אחר כך', bip: true };
}
const sPush = () => ({ k: 'push', art: `<div class="wl-lock"><div class="wl-time">06:12</div><div class="wl-note">${MARK}<span><b>E-Drone שטח</b><small>שובצת למחר 06:30 · מגדלי הים</small></span></div></div>`,
  t: 'לא מפספסים כלום', s: 'שיבוץ, הודעה מהמשרד או שינוי בלו״ז', btn: 'הפעלת התראות', alt: 'אחר כך', push: true });
const sOpenNow = () => ({ k: 'opennow', art: `<div class="wl-home"><span></span><span></span><span class="me">${MARK}</span><span></span></div>`,
  t: 'עכשיו פותחים מהמסך הבית', s: 'נכנסים עם הטלפון והקוד מההודעה', btn: 'סגירה', end: true });
function sGo(thing) {
  return { k: 'go', cls: 'wl-gos', art: `<div class="wl-burst" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${(i % 3) * 60}ms"></i>`).join('')}</div><div class="wl-big ok">${icon('check', 52)}</div>`,
    t: 'מוכנים', s: thing ? '' : 'הכל במקום — מתחילים', extra: thing ? `<a class="wl-first" href="${thing.href}" data-go><span class="wl-mic">${icon(thing.ic, 20)}</span><span><small>${esc(thing.lbl)}</small><b>${esc(thing.t)}</b></span>${icon('chev', 18)}</a>` : '',
    btn: 'יאללה', end: true, done: true };
}

// הדבר הראשון שלך: יום השטח הקרוב → הדרכת חובה → (מנהלים) לוח ההשקה/הבית
async function firstThing() {
  const me = state.user.id, t = isoDay();
  try {
    const sel = 'id,day,report_time,status,projects(name)';
    const [a, b] = await Promise.all([
      sb.from('work_days').select(sel + ',work_day_crew!inner(user_id)').eq('work_day_crew.user_id', me).gte('day', t).neq('status', 'cancelled').order('day').limit(1),
      sb.from('work_days').select(sel).eq('crew_lead_id', me).gte('day', t).neq('status', 'cancelled').order('day').limit(1)]);
    const d = [...(a.data || []), ...(b.data || [])].sort((x, y) => x.day.localeCompare(y.day))[0];
    if (d) return { href: `#/day/${d.id}`, ic: 'calendar', lbl: `${dayLabel(d.day)}${d.report_time ? ' · ' + String(d.report_time).slice(0, 5) : ''}`, t: d.projects?.name || 'יום שטח' };
  } catch { /* */ }
  try {
    const { status } = await import('./onboarding.js');
    const it = (await status(me)).find(x => !x.done && ['training', 'sign'].includes(x.key));
    if (it) return { href: '#/onboarding', ic: 'play', lbl: 'הצעד הבא', t: it.missing?.[0] || it.title };
  } catch { /* */ }
  if (state.profile.role === 'admin') return { href: '#/onboarding/launch', ic: 'activity', lbl: 'ההשקה', t: 'מי כבר בפנים' };
  return null;
}
async function myTeam() {
  try { const me = state.user.id; const { data } = await sb.from('teams').select('name').eq('active', true).or(`pilot_id.eq.${me},operator_id.eq.${me}`).limit(1); return data?.[0]?.name || ''; } catch { return ''; }
}

// ---------- נגן ההחלקות (גם להדרכות המהירות במרכז הידע) ----------
export function play(slides, { onDone, onSkip, label = 'קבלת פנים' } = {}) {
  document.querySelector('.wl')?.remove();
  const w = document.createElement('div'); w.className = 'wl'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', label);
  w.innerHTML = `<button class="wl-x" aria-label="סגירה">${icon('x', 20)}</button>
    <div class="wl-track">${slides.map((s, i) => `<section class="wl-s ${s.cls || ''}" data-i="${i}" data-k="${s.k || ''}">
      <div class="wl-art">${s.art || ''}</div>
      <div class="wl-txt"><h2>${s.t}</h2>${s.s ? `<p>${s.s}</p>` : ''}${s.extra || ''}</div>
      <div class="wl-act"><button class="btn primary block big" data-next>${esc(s.btn || 'הבא')}</button>${s.alt ? `<button class="wl-alt" data-alt>${esc(s.alt)}</button>` : '<span class="wl-alt"></span>'}</div>
    </section>`).join('')}</div>
    ${slides.length > 1 ? `<div class="wl-dots">${slides.map((_, i) => `<i data-d="${i}"></i>`).join('')}</div>` : ''}`;
  document.body.appendChild(w); document.body.classList.add('wl-open');
  requestAnimationFrame(() => w.classList.add('in'));
  const track = $('.wl-track', w), S = $$('.wl-s', w);
  let cur = 0, closed = false;
  const dots = () => $$('.wl-dots i', w).forEach((d, i) => d.classList.toggle('on', i === cur));
  const go = i => { if (i >= S.length) return finish(true); cur = Math.max(0, i); S[cur].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'start', block: 'nearest' }); };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio > .6) { cur = +e.target.dataset.i; dots(); S[cur].classList.add('seen'); slides[cur].onShow?.(S[cur]); } }), { root: track, threshold: [.6] });
  S.forEach(s => io.observe(s)); dots(); S[0].classList.add('seen');
  function finish(ok) {
    if (closed) return; closed = true; io.disconnect();
    w.classList.remove('in'); w.classList.add('out'); document.body.classList.remove('wl-open');
    setTimeout(() => w.remove(), 260);
    (ok ? onDone : onSkip)?.();
  }
  $('.wl-x', w).onclick = () => finish(false);
  S.forEach((el, i) => {
    const s = slides[i];
    $('[data-next]', el).onclick = async e => { haptic('tap'); const b = e.currentTarget; if (s.action) { b.disabled = true; const r = await s.action(el, b).catch(() => false); b.disabled = false; if (r === 'stay') return; }
      if (s.end) return finish(true); go(i + 1); };
    const a = $('[data-alt]', el); if (a) a.onclick = () => { s.onAlt?.(); go(i + (s.altSkip || 1)); };
    $$('[data-go]', el).forEach(x => x.onclick = () => finish(true));
  });
  return { go, close: () => finish(false), el: w };
}

// ---------- הזרימה ----------
async function enableAndCheck(el, b) {
  try { await enablePush(); } catch {
    const d = device(); const st = await pst();
    const msg = st === 'denied' ? (d.ios ? 'חסום: הגדרות ← E-Drone ← עדכונים' : 'חסום: נעילה שליד הכתובת ← הרשאות ← התראות') : 'לא הופעל — נסו שוב';
    let h = $('.wl-err', el); if (!h) { h = document.createElement('div'); h.className = 'wl-err'; $('.wl-txt', el).appendChild(h); } h.textContent = msg;
    return 'stay';
  }
  ls('edrone-wl-push', '1'); haptic('success');
  $('.wl-note', el)?.classList.add('ok'); b.textContent = 'פועל ✓';
  await new Promise(r => setTimeout(r, 650));
}
async function install(el, b) {
  const ev = bip || window.__bip;
  if (ev) { try { ev.prompt(); } catch { /* */ } const r = await Promise.race([ev.userChoice, new Promise(ok => setTimeout(() => ok({}), 30000))]).catch(() => ({})); bip = null; window.__bip = null; if (r.outcome === 'accepted') { ls('edrone-installed', '1'); return; } return 'stay'; }
  const h = $('[data-manual]', el); if (h && h.hidden) { h.hidden = false; b.textContent = 'המשך'; return 'stay'; }
}

export async function openWelcome({ mini = false } = {}) {
  const d = device(), st = pushSupported() ? await pst() : 'unsupported';
  const [team, thing] = await Promise.all([mini ? '' : myTeam(), firstThing()]);
  const slides = [];
  if (!mini) slides.push(sHello(team));
  if (d.mobile && !d.standalone && !ls('edrone-installed')) {
    const s = sInstall();
    if (s.bip) s.action = install;
    if (s.iosAdd) { s.end = false; s.action = () => { ls('edrone-wl-ios', '1'); }; s.altSkip = 2; }   // "הוספתי" → "פותחים מהמסך הבית"; "אחר כך" → ממשיכים בדפדפן
    if (s.k === 'install' && !s.iosAdd && d.ios) s.onShow = el => { const c = $('[data-copy]', el); if (c) c.onclick = () => navigator.clipboard?.writeText(location.href.split('#')[0]).then(() => { c.textContent = 'הועתק ✓'; }).catch(() => {}); };
    slides.push(s);
    if (s.iosAdd) slides.push(sOpenNow());
  }
  if (st === 'off' || st === 'denied') { const p = sPush(); p.action = enableAndCheck; p.onAlt = () => ls('edrone-wl-push', '1'); slides.push(p); }
  if (!mini) storiesFor().forEach(x => slides.push({ ...x, k: 'story', btn: 'הבא' }));
  const g = sGo(thing); slides.push(g);
  if (slides.length === 1 && mini) return;
  const done = () => { ls('edrone-welcomed', '1'); markWhatsNewSeen(); sb.rpc('mark_welcomed').then(() => {}, () => {}); state.profile.welcomed_at = state.profile.welcomed_at || new Date().toISOString(); };
  // "סיימתי" נרשם כשמגיעים לשקופית האחרונה — גם אם נסגר משם
  g.onShow = () => { done(); haptic('success'); };
  const opened = slides.findIndex(s => s.k === 'opennow');
  if (opened >= 0) slides[opened].onShow = () => ls('edrone-wl-ios', '1');
  play(slides, { onSkip: () => { try { sessionStorage.setItem('edrone-wl-skip', '1'); } catch { /* */ } } });
}

// נקרא אחרי הכניסה (hook ב-app.js). פעם אחת לעובד; במכשיר מותקן עם התראות כבויות — רק שקופית ההתראות
export async function maybeWelcome() {
  if (!state.profile || document.querySelector('.wl,.tourfs') || ls('edrone-onb-skip')) return;   // edrone-onb-skip = משתמשי QA
  try { if (sessionStorage.getItem('edrone-wl-skip')) return; } catch { /* */ }
  if (isStandalone()) ls('edrone-installed', '1');
  if (state.profile.role === 'partner') return;
  if (!state.profile.welcomed_at && !ls('edrone-welcomed')) {
    // מי שכבר השתמש באפליקציה לפני ההשקה (12.10.2026) לא מקבל "ברוך הבא" — רק "מה חדש"
    if (state.profile.last_seen_at && state.profile.last_seen_at < '2026-10-12') { ls('edrone-welcomed', '1'); sb.rpc('mark_welcomed').then(() => {}, () => {}); }
    else return openWelcome();
  }
  if (isStandalone() && !ls('edrone-wl-push') && pushSupported() && await pst() === 'off') { ls('edrone-wl-push', '1'); return openWelcome({ mini: true }); }
  return maybeWhatsNew();
}

// ---------- מה חדש: אחרי עדכון, פעם אחת לכל מהדורה, עד 3 פריטים (לפי תפקיד) ----------
// להוספת מהדורה: פריט חדש בראש הרשימה עם id חדש. ok = למי זה רלוונטי (ברירת מחדל: כולם)
const M = () => ['admin', 'ops_manager'].includes(state.profile?.role), FIELD = () => ['crew', 'crew_lead'].includes(state.profile?.role);
export const WHATS_NEW = [
  { id: '2026-10-12', items: [
    { ic: 'calendar', c: 'a', t: 'היום הבא שלך — ישר בבית', s: 'מתי, לאן, עם מי ותחזית לטיסה', ok: () => !M() },
    { ic: 'calendar', c: 'a', t: 'לו״ז שבועיים במבט', s: 'פס ימים צבוע — לחיצה פותחת את היום', ok: FIELD },
    { ic: 'clipboard', c: 'b', t: 'אפיון מהיר יותר', s: 'הקלטה קולית, ומילוי מראש ממבנה שכבר אופיין', ok: () => M() || state.profile?.role === 'surveyor' },
    { ic: 'map', c: 'c', t: 'מרכז ידע חדש', s: 'מסלול עבודה מליד ועד חתימה, ומדריכים מהירים' },
    { ic: 'send', c: 'b', t: 'השקה והזמנות', s: 'קישור כניסה אישי לכל עובד, ומעקב מי כבר בפנים', ok: () => state.profile?.role === 'admin' },
  ] },
];
export function markWhatsNewSeen() { if (WHATS_NEW[0]) ls('edrone-wn', WHATS_NEW[0].id); }
export async function maybeWhatsNew({ force = false } = {}) {
  const cur = WHATS_NEW[0]; if (!cur || !state.profile) return;
  if (!force && (ls('edrone-wn') === cur.id || ls('edrone-onb-skip') || document.querySelector('.wl,.tourfs') || !$('#sheet')?.hidden)) return;
  const items = cur.items.filter(x => !x.ok || x.ok()).slice(0, 3); markWhatsNewSeen();
  if (!items.length) return;
  const { sheet } = await import('../lib/core.js');
  sheet(`<div class="wn"><div class="wn-h"><span class="wn-spark">${icon('star', 22)}</span><h3>מה חדש</h3></div>
    ${items.map((x, i) => `<div class="wn-i" style="--i:${i}"><span class="wn-ic wn-${x.c || 'a'}">${icon(x.ic, 24)}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></div>`).join('')}
    <button class="btn primary block big" data-close>מעולה</button></div>`);
}

// מדריך "התקנה והתראות" (ממרכז הידע / מהתפריט): רק מה שעוד חסר במכשיר הזה
export async function playSetup() {
  const d = device(), st = pushSupported() ? await pst() : 'unsupported', slides = [];
  if (d.mobile && !d.standalone) { const s = sInstall(); if (s.bip) s.action = install; if (s.iosAdd) { s.action = () => { ls('edrone-wl-ios', '1'); }; s.altSkip = 2; } slides.push(s); if (s.iosAdd) slides.push(sOpenNow()); }
  if (st === 'off' || st === 'denied') { const p = sPush(); p.action = enableAndCheck; slides.push(p); }
  slides.push({ k: 'end', art: `<div class="wl-big ok">${icon('check', 52)}</div>`, t: st === 'on' || !slides.length ? 'הכל פועל' : 'זהו', s: st === 'on' ? 'האפליקציה מותקנת וההתראות פועלות' : '', btn: 'סגירה', end: true });
  play(slides, { label: 'התקנה והתראות' });
}
