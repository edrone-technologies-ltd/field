// קליטת עובד: צ'קליסט שמחושב מהנתונים (onboarding_status בשרת). העובד רואה מה עליו לעשות; המנהל רואה הכל ומסמן "ציוד נמסר".
import { sb, state, isManager, icon, $, $$, esc, toast, backBtn, enablePush } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const GO = { training: '#/kb', sign: '#/kb', push: 'push', id: 'office', form101: 'office', drive: 'office', height: 'office' };

export async function status(u) { const { data } = await sb.rpc('onboarding_status', { u }); return data || []; }

function list(items, { mgr, u, redraw }) {
  return `<div class="list onb">${items.map(x => {
    const act = x.done ? '' : mgr ? (x.key === 'equipment' ? `<button class="chip" data-mark="equipment">סימון נמסר</button>` : x.key === 'personal' ? `<a class="chip" href="#/staff/${u}/info">להשלמה</a>` : ['id', 'form101', 'contract', 'drive', 'height'].includes(x.key) ? `<a class="chip" href="#/staff/${u}/docs">העלאה</a>` : '')
      : GO[x.key] === 'push' ? `<button class="chip" data-push>הפעלה</button>` : GO[x.key] === 'office' || x.who === 'office' ? '<span class="small muted">להעביר למשרד</span>' : GO[x.key] ? `<a class="chip" href="${GO[x.key]}">למעבר</a>` : '';
    return `<div class="lrow"><span class="tick ${x.done ? 'on' : ''}">${x.done ? icon('check', 16) : ''}</span><span class="grow"><b>${esc(x.title)}</b>${x.missing?.length ? `<small>חסר: ${esc(x.missing.join(' · '))}</small>` : ''}</span>${act}</div>`;
  }).join('')}</div>`;
}
function bind(box, u, redraw) {
  const p = $('[data-push]', box); if (p) p.onclick = async () => { if (p.disabled) return; p.disabled = true;
    try { await enablePush(); toast('ההתראות הופעלו'); redraw(); } catch (e) { p.disabled = false; toast(errText(e, 'ההתראות לא הופעלו — בדקו את הרשאות הטלפון')); } };
  $$('[data-mark]', box).forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
    const { error } = await sb.from('onboarding_marks').upsert({ user_id: u, key: b.dataset.mark, done_by: state.user.id });
    if (error) { b.disabled = false; return toast(errText(error)); } toast('סומן'); redraw();
  });
}
const ring = (d, n) => `<div class="ring" style="--p:${Math.round(d / n * 100)}"><b>${d}/${n}</b></div>`;

// מסך "הקליטה שלי": שני חלקים נפרדים וברורים — מה עליך (עם כפתור לכל צעד) ומה המשרד משלים (לידיעה בלבד)
const OFFICE = ['personal', 'id', 'form101', 'contract', 'drive', 'pilot', 'height', 'team', 'equipment'];
const STEP = {
  training: { ic: 'play', help: x => x.missing?.length ? x.missing.join(' · ') : 'הדרכות חובה במרכז הידע', btn: 'להדרכות', href: '#/kb' },
  sign: { ic: 'file', help: x => x.missing?.length ? x.missing.join(' · ') : 'נהלים לחתימה', btn: 'לחתימה', href: '#/kb' },
  push: { ic: 'chat', help: () => 'כדי לדעת על משימה, שיבוץ או הודעה', btn: 'הפעלה', push: true },
  consent: { ic: 'clock', help: () => 'מאשרים פעם אחת, בכניסה הראשונה למשמרת', btn: 'למשמרת', href: '#/' },
};
const short = t => t.replace(/ \(.*\)/, '');
export async function renderOnboarding(el) {
  if (/^#\/onboarding\/launch/.test(location.hash)) return renderLaunch(el);
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1 class="grow">לפני שמתחילים</h1></header><div class="skel"></div>`;
  const items = await status(state.user.id);
  const mine = items.filter(x => ['training', 'sign', 'push'].includes(x.key) && !x.done);
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1 class="grow">לפני שמתחילים</h1></header>
    <div class="stack onbpage">${mine.length ? mine.map(x => { const t = STEP[x.key] || { ic: 'clipboard', help: () => '', btn: '' };
      return `<div class="step"><span class="sic">${icon(t.ic, 20)}</span><span class="grow"><b>${esc(x.title)}</b>${x.missing?.length ? `<small>${esc(x.missing.join(' · '))}</small>` : ''}</span>${t.push ? `<button class="btn primary sm" data-push>${t.btn}</button>` : t.href ? `<a class="btn primary sm" href="${t.href}">${t.btn}</a>` : ''}</div>`; }).join('')
      : `<div class="donenote">${icon('check', 18)} הכל מוכן</div>`}</div>`;
  bind(el, state.user.id, () => renderOnboarding(el));
}

// כרטיס בבית — רק כשיש משהו שהעובד עצמו יכול לעשות
export async function onboardingHome(box) {
  if (!box) return;
  try { if (localStorage.getItem('onb-hide') > Date.now()) return; } catch { /* */ }
  const items = await status(state.user.id).catch(() => []);
  const mine = items.filter(x => !x.done && x.who === 'self' && !['id', 'form101', 'drive', 'height'].includes(x.key));
  if (!mine.length) { box.innerHTML = ''; document.body.classList.remove('onb-active'); return; }
  document.body.classList.add('onb-active');   // הכרטיס הזה מכסה גם התראות והדרכות — לא מציגים שלושה כרטיסים דומים
  const d = items.filter(x => x.done).length;
  box.innerHTML = `<a class="promo" href="#/onboarding"><span class="mic">${icon('clipboard', 20)}</span><span class="grow"><b>השלמת קליטה · ${d}/${items.length}</b><small>הבא: ${esc(mine[0].title)}</small></span><button class="x" aria-label="אחר כך">${icon('x', 18)}</button></a>`;
  $('.x', box).onclick = e => { e.preventDefault(); try { localStorage.setItem('onb-hide', Date.now() + 7 * 864e5); } catch { /* */ } box.innerHTML = ''; document.body.classList.remove('onb-active'); };
}

// לשונית בכרטיס העובד (מנהלים)
export async function onboardingTab(box, u) {
  const items = await status(u), d = items.filter(x => x.done).length;
  box.innerHTML = `<div class="card row">${ring(d, items.length)}<div class="grow"><b>${d === items.length ? 'הקליטה הושלמה' : `חסרים ${items.length - d} סעיפים`}</b></div></div>${list(items, { mgr: isManager(), u })}`;
  bind(box, u, () => onboardingTab(box, u));
}

// ---------- השקה (admin): הזמנות + מי נכנס / התקין / הפעיל התראות ----------
// הזמנה = קישור אישי (כניסה בלחיצה) + קוד 6 ספרות (לאפליקציית מסך הבית באייפון). השליחה — מהטלפון של המנהל (שיתוף / וואטסאפ), לא מהשרת.
const appBase = () => location.href.split('#')[0].replace(/[^/]*$/, '');
const firstName = n => String(n || '').trim().split(/\s+/)[0];
const waPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d ? '972' + d.replace(/^0|^972/, '') : ''; };
const inviteText = (r, link) => `היי ${firstName(r.name)}, ברוך הבא ל-E-Drone שטח — האפליקציה של הצוות.\n\nכניסה בלחיצה:\n${link}\n\nבאייפון: פותחים בספארי ← שיתוף ← "הוסף למסך הבית", ובאפליקציה נכנסים עם הטלפון והקוד ${r.code}`;
const NUDGE = {
  login: r => `היי ${firstName(r.name)}, עוד לא נכנסת לאפליקציית השטח. הקישור בהודעה הקודמת — לחיצה אחת ואתה בפנים.`,
  install: r => `היי ${firstName(r.name)}, כדאי להוסיף את E-Drone שטח למסך הבית — ${/iPhone/.test(r.device || '') ? 'בספארי: שיתוף ← "הוסף למסך הבית"' : 'בתפריט הדפדפן ← "התקנת אפליקציה"'}. ככה מקבלים התראות על שיבוץ והודעות.`,
  push: r => `היי ${firstName(r.name)}, ההתראות באפליקציה עדיין כבויות — פותחים את E-Drone שטח ← עוד ← התראות לטלפון ← הפעלה. ככה לא מפספסים שיבוץ.`,
};
const STEPS = [['invited', 'send', 'הוזמן'], ['in', 'key', 'נכנס'], ['installed', 'home', 'התקין'], ['push', 'chat', 'התראות']];
const flags = r => ({ invited: !!r.invited || !!r.first_in, in: !!r.first_in, installed: !!r.installed, push: !!r.push });
const nextGap = r => { const f = flags(r); return !f.invited ? 'invite' : !f.in ? 'login' : !f.installed && /iPhone|Android/.test(r.device || '') ? 'install' : !f.push ? 'push' : ''; };

async function renderLaunch(el, filter = '') {
  const { ROLE_HE, initials, sheet, timeAgo } = await import('../lib/core.js');
  if (state.profile.role !== 'admin') { el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">השקה</h1></header><div class="empty-line">להנהלה בלבד</div>`; return; }
  if (!el.querySelector('.lnch')) el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">השקה</h1><button class="hbtn" id="lnew" aria-label="עובד חדש">${icon('plus', 20)}</button></header><div class="skel tall"></div>`;
  const { data, error } = await sb.rpc('launch_status');
  if (error) { el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">השקה</h1></header><div class="empty-line">${esc(errText(error, 'הנתונים לא נטענו — נסו שוב'))}</div>`; return; }
  const R = data || [], N = R.length || 1;
  const cnt = k => R.filter(r => flags(r)[k]).length;
  const F = { '': () => true, login: r => !flags(r).in, install: r => flags(r).in && !flags(r).installed, push: r => flags(r).in && !flags(r).push };
  const list = R.filter(F[filter] || F['']).sort((a, b) => (nextGap(a) ? 0 : 1) - (nextGap(b) ? 0 : 1) || String(a.name).localeCompare(b.name, 'he'));
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">השקה</h1><button class="hbtn" id="lnew" aria-label="עובד חדש">${icon('plus', 20)}</button></header>
    <div class="stack lg lnch">
      <div class="lfun">${STEPS.map(([k, ic, t]) => { const c = cnt(k); return `<div class="lf ${c === R.length && R.length ? 'full' : ''}"><span class="lf-ic">${icon(ic, 18)}</span><b>${c}<small>/${R.length}</small></b><span class="lf-t">${t}</span><i style="--w:${Math.round(c / N * 100)}%"></i></div>`; }).join('')}</div>
      <div class="chips scroll">${[['', 'הכל'], ['login', 'לא נכנסו'], ['install', 'בלי התקנה'], ['push', 'בלי התראות']].map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${t}${k ? ` · ${R.filter(F[k]).length}` : ''}</button>`).join('')}</div>
      <div class="list">${list.map(r => { const f = flags(r), g = nextGap(r);
        return `<button class="lrow lp" data-u="${r.id}"><span class="avatar">${esc(initials(r.name))}</span>
          <span class="grow"><b>${esc(r.name)}</b><small>${esc([ROLE_HE[r.role], r.seen ? 'נראה ' + timeAgo(r.seen) : r.invited ? 'הוזמן ' + timeAgo(r.invited) : null].filter(Boolean).join(' · '))}</small>
          <span class="lsteps">${STEPS.map(([k, ic, t]) => `<i class="${f[k] ? 'on' : ''}" title="${t}" aria-label="${t}: ${f[k] ? 'כן' : 'עוד לא'}">${icon(ic, 13)}</i>`).join('')}</span></span>
          ${g === 'invite' ? '<span class="chip primary">הזמנה</span>' : g ? '<span class="chip">תזכורת</span>' : `<span class="pill ok">${icon('check', 14)}</span>`}</button>`; }).join('') || '<div class="empty-line">אין כאן אף אחד</div>'}</div>
    </div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => renderLaunch(el, b.dataset.f));
  $('#lnew', el).onclick = () => newPerson(el, filter);
  $$('[data-u]', el).forEach(b => b.onclick = () => person(R.find(r => r.id === b.dataset.u), el, filter));

  function person(r, el, filter) {
    const f = flags(r), g = nextGap(r);
    sheet(`<div class="row"><span class="avatar lg">${esc(initials(r.name))}</span><div class="grow"><h3 style="margin:0">${esc(r.name)}</h3><small class="muted">${esc([ROLE_HE[r.role], r.phone, r.device].filter(Boolean).join(' · '))}</small></div></div>
      <div class="ltl">${STEPS.map(([k, ic, t]) => { const at = k === 'invited' ? r.invited : k === 'in' ? r.first_in : k === 'push' ? r.push_ok : null;
        return `<div class="${f[k] ? 'on' : ''}"><i>${icon(f[k] ? 'check' : ic, 15)}</i><b>${t}</b><small>${f[k] ? (at ? timeAgo(at) : '✓') : 'עוד לא'}</small></div>`; }).join('')}</div>
      ${r.onb ? `<div class="small muted">קליטה ${r.onb.d}/${r.onb.n}${r.welcomed ? ' · עבר קבלת פנים' : ''}</div>` : ''}
      ${g && g !== 'invite' ? `<button class="btn ghost block" id="lnudge">${icon('chat', 18)} תזכורת בוואטסאפ</button>` : ''}
      <button class="btn ${g === 'invite' ? 'primary' : 'ghost'} block" id="linv">${icon('send', 18)} ${r.invited ? 'קישור וקוד חדשים' : 'הזמנה'}</button>`, (s, close) => {
      const nd = $('#lnudge', s); if (nd) nd.onclick = () => { close(); shareText(NUDGE[g](r), r.phone); };
      $('#linv', s).onclick = async () => { const b = $('#linv', s); if (b.disabled) return; b.disabled = true; b.textContent = 'יוצר…';
        const res = await invite({ user_id: r.id }); b.disabled = false;
        if (!res) { b.textContent = 'נסו שוב'; return; } close(); showInvite(res); renderLaunch(el, filter); };
    });
  }
}
async function invite(body) {
  const { data, error } = await sb.functions.invoke('invite', { body: { action: 'create', ...body } });
  if (error || !data?.token) { let m = 'ההזמנה לא נוצרה — נסו שוב'; try { m = (await error?.context?.json())?.error || m; } catch { /* */ } toast(m, 3500); return null; }
  return data;
}
async function shareText(text, phone) {
  if (navigator.share && /iphone|android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); } catch { /* */ }
  const w = waPhone(phone); toast(w ? 'ההודעה הועתקה — הדביקו בצ׳אט' : 'ההודעה הועתקה', 3000);
  if (w) open(`https://wa.me/${w}`, '_blank', 'noopener');
}
async function showInvite(r) {
  const { sheet } = await import('../lib/core.js');
  const link = `${appBase()}join.html#${r.token}`, text = inviteText(r, link);
  sheet(`<h3>ההזמנה של ${esc(firstName(r.name))} מוכנה</h3>
    <div class="linvc"><div><small>קוד</small><b dir="ltr">${esc(r.code)}</b></div><div><small>טלפון</small><b dir="ltr">${esc(r.phone || '—')}</b></div></div>
    <textarea id="lit" rows="7">${esc(text)}</textarea>
    <button class="btn primary block big" id="lsh">${icon('send', 18)} שליחה</button>
    <button class="btn ghost block" id="lcp">${icon('file', 18)} העתקה</button>`, (s, close) => {
    $('#lsh', s).onclick = () => { shareText($('#lit', s).value, r.phone); };
    $('#lcp', s).onclick = async () => { try { await navigator.clipboard.writeText($('#lit', s).value); toast('הועתק'); } catch { $('#lit', s).select(); } };
  });
}
async function newPerson(el, filter) {
  const { sheet, ROLE_HE, FIELD_HE } = await import('../lib/core.js');
  const f = { role: 'crew', field_role: null };
  sheet(`<h3>עובד חדש</h3>
    <label class="field">שם מלא<input id="nn" autocomplete="off" placeholder="שם ושם משפחה"></label>
    <label class="field">טלפון נייד<input id="np" type="tel" inputmode="tel" dir="ltr" placeholder="050-0000000"></label>
    <div class="field">תפקיד<div class="chips">${['crew', 'crew_lead', 'surveyor', 'ops_manager', 'admin'].map(r => `<button type="button" class="chip" data-r="${r}" aria-pressed="${r === f.role}">${ROLE_HE[r]}</button>`).join('')}</div></div>
    <div class="field">בשטח<div class="chips">${Object.entries(FIELD_HE).map(([k, t]) => `<button type="button" class="chip" data-fr="${k}" aria-pressed="false">${t}</button>`).join('')}</div></div>
    <button class="btn primary block big" id="nsv">${icon('send', 18)} יצירה והזמנה</button>`, (s, close) => {
    $$('[data-r]', s).forEach(b => b.onclick = () => { f.role = b.dataset.r; $$('[data-r]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $$('[data-fr]', s).forEach(b => b.onclick = () => { f.field_role = f.field_role === b.dataset.fr ? null : b.dataset.fr; $$('[data-fr]', s).forEach(x => x.setAttribute('aria-pressed', x.dataset.fr === f.field_role)); });
    $('#nsv', s).onclick = async () => {
      const name = $('#nn', s).value.trim(), phone = $('#np', s).value.replace(/\D/g, '');
      if (!name) return toast('חסר שם'); if (!/^05\d{8}$/.test(phone)) return toast('מספר נייד לא תקין');
      const b = $('#nsv', s); if (b.disabled) return; b.disabled = true; b.textContent = 'יוצר…';
      const res = await invite({ name, phone, role: f.role, field_role: f.field_role }); b.disabled = false; b.innerHTML = `${icon('send', 18)} יצירה והזמנה`;
      if (!res) return; close(); showInvite(res); renderLaunch(el, filter);
    };
  });
}
