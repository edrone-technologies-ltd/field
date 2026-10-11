// "מחכה לך": כל מה שדורש את תשומת הלב של המשתמש — ברשימה אחת קומפקטית בראש הבית, במקום ערימת כרטיסים.
// הוקרה › הודעת הנהלה › קליטה (כוללת הדרכות חובה) › הדרכה › התראות. שורה אחת לכל דבר, לחיצה = לשם.
import { sb, state, icon, esc, toast, pushState, enablePush, sheet, isOpenProject } from '../lib/core.js';
import { errText } from '../lib/audit.js';

async function newsRows() {
  const [{ data: list }, { data: reads }] = await Promise.all([
    sb.from('announcements').select('id,kind,title,recipient_id,require_ack,created_by,created_at').gte('created_at', new Date(Date.now() - 21 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(10),
    sb.from('announcement_reads').select('ann_id,ack_at').eq('user_id', state.user.id)]);
  const R = new Map((reads || []).map(r => [r.ann_id, r]));
  const due = (list || []).filter(a => a.created_by !== state.user.id && (!R.has(a.id) || (a.require_ack && !R.get(a.id).ack_at)));
  const out = [], kudo = due.find(a => a.kind === 'kudos' && a.recipient_id === state.user.id);
  if (kudo) out.push({ k: 'kudos', tone: 'gold', ic: '★', title: 'כל הכבוד!', sub: kudo.title, href: '#/news' });
  const news = due.filter(a => a !== kudo && a.kind === 'news');
  if (news.length) out.push({ k: 'news', tone: news.some(a => a.require_ack) ? 'warn' : '', ic: icon('inbox', 18), title: news.length > 1 ? `${news.length} הודעות הנהלה` : 'הודעת הנהלה' + (news[0].require_ack ? ' — לאישור' : ''), sub: news[0].title, href: '#/news' });
  return out;
}
async function onbRows() {
  if (!['crew', 'crew_lead'].includes(state.profile.role)) return [];   // קליטה = עובדי שטח בלבד
  const { status } = await import('./onboarding.js');
  const items = await status(state.user.id);
  const mine = items.filter(x => !x.done && ['training', 'sign'].includes(x.key));   // רק צעדים שהעובד עושה בעצמו (התראות — שורה משלה)
  if (!mine.length) return [];
  return [{ k: 'onb', tone: '', ic: icon('clipboard', 18), title: 'לפני שמתחילים', sub: mine.length > 1 ? `${mine.length} צעדים קצרים` : mine[0].title, href: '#/onboarding' }];
}
async function kbRows() {
  const { kbDone } = await import('./knowledge.js');
  const [{ data: req }, { data: v }] = await Promise.all([
    sb.from('kb_items').select('id,title,quiz,sign_required,cert_months,required,cert_required,auto_done').or('required.eq.true,cert_required.eq.true'),
    sb.from('kb_views').select('item_id,confirmed_at,passed_at,signed_at').eq('user_id', state.user.id)]);
  const vm = new Map((v || []).map(x => [x.item_id, x]));
  const pushOn = (await pushState().catch(() => '')) === 'on';
  const due = (req || []).filter(x => !x.auto_done && !kbDone(x, vm.get(x.id)) && (x.required || ['crew', 'crew_lead'].includes(state.profile.role)));
  return due.length ? [{ k: 'kb', tone: '', ic: icon('play', 18), title: due.length > 1 ? `${due.length} הדרכות לצפייה` : 'הדרכה לצפייה', sub: due[0].title, href: due.length > 1 ? '#/kb' : `#/kb/${due[0].id}` }] : [];
}
// הנהלה: פרויקט שמתוכנן במאנדי ל-10 הימים הקרובים ועוד לא שובץ לו צוות באפליקציה
async function schedRows() {
  if (!['admin', 'ops_manager'].includes(state.profile.role)) return [];
  const t = new Date(), iso = d => d.toISOString().slice(0, 10), today = iso(t), lim = iso(new Date(Date.now() + 10 * 864e5));
  const { data } = await sb.from('projects').select('id,name,status_label,monday_group,closed_summary,planned_from,planned_to,work_days(day,status)').neq('monday_group', 'group_mm5052gw')
    .not('planned_from', 'is', null).lte('planned_from', lim).gte('planned_to', today);
  const need = (data || []).filter(isOpenProject).filter(p => !(p.work_days || []).some(d => d.day >= today && d.status !== 'done'))
    .sort((a, b) => a.planned_from < b.planned_from ? -1 : 1);
  if (!need.length) return [];
  const dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`;
  return need.length === 1 ? [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `לשבץ צוות · ${dm(need[0].planned_from)}`, sub: need[0].name, href: `#/p/${need[0].id}` }]
    : [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `${need.length} פרויקטים לשיבוץ צוות`, sub: need.map(p => `${dm(p.planned_from)} ${p.name.split(' — ')[0]}`).join(' · '),
        list: need.map(p => ({ href: `#/p/${p.id}`, t: p.name, s: dm(p.planned_from) + (p.planned_to && p.planned_to !== p.planned_from ? '–' + dm(p.planned_to) : '') })) }];
}
async function tourRows() {
  if (state.profile.role !== 'ops_manager') return [];
  const { data: it } = await sb.from('kb_items').select('id').eq('video_url', '#/tour/ops').maybeSingle(); if (!it) return [];
  const { data: v } = await sb.from('kb_views').select('item_id').eq('item_id', it.id).eq('user_id', state.user.id).maybeSingle();
  return v ? [] : [{ k: 'tour', tone: '', ic: icon('play', 18), title: 'הדרכה: 5 דקות להכרת האפליקציה', sub: 'לו״ז, שיבוץ, תכניות וביקורות', href: '#/tour/ops' }];
}
async function pushRows() {
  const st = await pushState();
  if (st === 'off') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'התראות כבויות', sub: '', btn: 'הפעלה' }];
  if (st === 'install') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'להתקין למסך הבית', sub: '', href: '#/menu' }];   // הוראות ההתקנה — בתפריט "עוד"
  return [];
}

// כל מה שמחכה למשתמש עצמו (הודעות, הדרכות, קליטה, התראות, שיבוץ שחסר)
export async function attentionItems() {
  const parts = await Promise.all([tourRows(), schedRows(), newsRows(), onbRows(), kbRows(), pushRows()].map(p => p.catch(() => [])));
  let items = parts.flat();
  if (items.some(x => x.k === 'onb')) items = items.filter(x => x.k !== 'kb');   // הקליטה כבר מפנה להדרכות החובה
  return items;
}
// "דורש טיפול" — רשימה אחת לכל המסך: הכי חמור קודם, 5 ראשונים ו"עוד" שנפתח במקום
const RANK = { bad: 0, gold: 1, warn: 2, '': 3 };
export const sortNeeds = items => items.slice().sort((a, b) => (RANK[a.tone] ?? 3) - (RANK[b.tone] ?? 3));
// שורה לחיצה רק כשיש לה לאן להוביל (href) או מה לעשות (list / act / btn). אחרת — שורת מידע בלי חץ ובלי מראה לחיץ
const nrow = (x, i, hide) => {
  const go = x.href || x.list || x.act || x.btn, tag = x.href ? 'a' : go ? 'button' : 'div';
  return `<${tag} class="arow ${x.tone || ''}"${x.href ? ` href="${x.href}"${/^https?:/.test(x.href) ? ' target="_blank" rel="noopener"' : ''}` : go ? ' type="button"' : ''} data-ni="${i}"${hide ? ' hidden' : ''}><span class="aic">${x.ic}</span><span class="grow"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.btn ? `<span class="btn ghost sm">${x.btn}</span>` : go ? `<span class="chev">${icon('chev', 18)}</span>` : ''}</${tag}>`;
};
export function needsList(items, { title = 'דורש טיפול', limit = 5, id = 'needs', head = true } = {}) {
  if (!items.length) return '';
  const more = items.length - limit;
  return `<section id="${id}">${head ? `<div class="sh-row"><h3 class="sh">${title}</h3><span class="count">${items.length}</span></div>` : ''}
    <div class="alist">${items.map((x, i) => nrow(x, i, i >= limit)).join('')}${more > 0 ? `<button class="arow more-row" data-nmore>עוד ${more}</button>` : ''}</div></section>`;
}
export function bindNeeds(root, items, redraw) {
  root.querySelectorAll('[data-nmore]').forEach(b => b.onclick = () => { root.querySelectorAll('[data-ni][hidden]').forEach(r => r.hidden = false); b.remove(); });
  root.querySelectorAll('[data-ni]').forEach(a => { const x = items[+a.dataset.ni]; if (!x) return;
    if (x.k === 'push' && x.btn) a.onclick = async e => { e.preventDefault(); if (a.disabled) return; a.disabled = true;
      try { await enablePush(); toast('ההתראות הופעלו'); a.remove(); redraw?.(); } catch (err) { a.disabled = false; toast(errText(err, 'ההתראות לא הופעלו — בדקו את הרשאות הטלפון')); } };
    // כמה פרויקטים ממתינים — רשימה קצרה של בדיוק אותם פרויקטים
    else if (x.list) a.onclick = e => { e.preventDefault(); sheet(`<h3>${esc(x.title)}</h3><div class="list">${x.list.map(l => `<a class="lrow" href="${l.href}" data-close><span class="grow"><b>${esc(l.t)}</b>${l.s ? `<small>${esc(l.s)}</small>` : ''}</span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div><button class="btn ghost block" data-close>סגירה</button>`); };
    // פעולה במקום (למשל: תור השליחה) — נועלים עד שהיא נפתחת
    else if (x.act) a.onclick = async e => { e.preventDefault(); if (a.disabled) return; a.disabled = true; try { await x.act(); } catch (err) { toast(errText(err)); } finally { a.disabled = false; } };
  });
}
export async function attention(box) {
  if (!box) return;
  const items = sortNeeds(await attentionItems());
  box.innerHTML = needsList(items, { title: 'מחכה לך' });
  bindNeeds(box, items, () => attention(box));
}
