// קליטת עובד: צ'קליסט שמחושב מהנתונים (onboarding_status בשרת). העובד רואה מה עליו לעשות; המנהל רואה הכל ומסמן "ציוד נמסר".
import { sb, state, isManager, icon, $, $$, esc, toast, backBtn, enablePush } from '../lib/core.js';

const GO = { training: '#/kb', sign: '#/kb', push: 'push', id: 'office', form101: 'office', drive: 'office', height: 'office' };

export async function status(u) { const { data } = await sb.rpc('onboarding_status', { u }); return data || []; }

function list(items, { mgr, u, redraw }) {
  return `<div class="list onb">${items.map(x => {
    const act = x.done ? '' : mgr ? (x.key === 'equipment' ? `<button class="chip" data-mark="equipment">סימון נמסר</button>` : x.key === 'personal' ? `<a class="chip" href="#/staff/${u}/info">להשלמה</a>` : ['id', 'form101', 'contract', 'drive', 'height'].includes(x.key) ? `<a class="chip" href="#/staff/${u}/docs">העלאה</a>` : '')
      : GO[x.key] === 'push' ? `<button class="chip" data-push>הפעלה</button>` : GO[x.key] === 'office' || x.who === 'office' ? '<span class="small muted">להעביר למשרד</span>' : GO[x.key] ? `<a class="chip" href="${GO[x.key]}">למעבר</a>` : '';
    return `<div class="lrow"><span class="tick ${x.done ? 'on' : ''}">${x.done ? '✓' : ''}</span><span class="grow"><b>${esc(x.title)}</b>${x.missing?.length ? `<small>חסר: ${esc(x.missing.join(' · '))}</small>` : ''}${x.key === 'consent' && !x.done && !mgr ? '<small>מאשרים בכניסה הראשונה למשמרת</small>' : ''}</span>${act}</div>`;
  }).join('')}</div>`;
}
function bind(box, u, redraw) {
  const p = $('[data-push]', box); if (p) p.onclick = async () => { try { await enablePush(); toast('ההתראות הופעלו'); redraw(); } catch (e) { toast(e.message); } };
  $$('[data-mark]', box).forEach(b => b.onclick = async () => {
    const { error } = await sb.from('onboarding_marks').upsert({ user_id: u, key: b.dataset.mark, done_by: state.user.id });
    if (error) return toast(error.message); toast('סומן'); redraw();
  });
}
const ring = (d, n) => `<div class="ring" style="--p:${Math.round(d / n * 100)}"><b>${d}/${n}</b></div>`;

// מסך "הקליטה שלי"
export async function renderOnboarding(el) {
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>הקליטה שלי</h1></header><div class="skel"></div>`;
  const items = await status(state.user.id), d = items.filter(x => x.done).length;
  el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>הקליטה שלי</h1></header>
    <div class="stack lg"><div class="card row">${ring(d, items.length)}<div class="grow"><b>${d === items.length ? 'הכל מוכן — ברוך הבא לצוות' : 'מה עוד חסר כדי להתחיל לעבוד'}</b><div class="small muted">מסמכים מעבירים למשרד; הדרכות, חתימות והתראות — מכאן</div></div></div>
      <div id="ol">${list(items, { mgr: false, u: state.user.id })}</div></div>`;
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
  box.innerHTML = `<a class="promo" href="#/onboarding"><span class="mic">${icon('clipboard', 20)}</span><span class="grow"><b>השלמת קליטה · ${d}/${items.length}</b><small>הבא: ${esc(mine[0].title)}</small></span><button class="x" aria-label="אחר כך">×</button></a>`;
  $('.x', box).onclick = e => { e.preventDefault(); try { localStorage.setItem('onb-hide', Date.now() + 7 * 864e5); } catch { /* */ } box.innerHTML = ''; document.body.classList.remove('onb-active'); };
}

// לשונית בכרטיס העובד (מנהלים)
export async function onboardingTab(box, u) {
  const items = await status(u), d = items.filter(x => x.done).length;
  box.innerHTML = `<div class="card row">${ring(d, items.length)}<div class="grow"><b>${d === items.length ? 'הקליטה הושלמה' : `חסרים ${items.length - d} סעיפים`}</b><div class="small muted">מתעדכן לבד מהמסמכים, ההדרכות והצוותים</div></div></div>${list(items, { mgr: isManager(), u })}`;
  bind(box, u, () => onboardingTab(box, u));
}
