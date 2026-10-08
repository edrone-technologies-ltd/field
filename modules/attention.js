// "מחכה לך": כל מה שדורש את תשומת הלב של המשתמש — ברשימה אחת קומפקטית בראש הבית, במקום ערימת כרטיסים.
// הוקרה › הודעת הנהלה › קליטה (כוללת הדרכות חובה) › הדרכה › התראות. שורה אחת לכל דבר, לחיצה = לשם.
import { sb, state, icon, esc, toast, pushState, enablePush } from '../lib/core.js';

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
  const { data } = await sb.from('projects').select('id,name,planned_from,planned_to,work_days(day,status)').neq('monday_group', 'group_mm5052gw')
    .not('planned_from', 'is', null).lte('planned_from', lim).gte('planned_to', today);
  const need = (data || []).filter(p => !(p.work_days || []).some(d => d.day >= today && d.status !== 'done'))
    .sort((a, b) => a.planned_from < b.planned_from ? -1 : 1);
  if (!need.length) return [];
  const dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`;
  return need.length === 1 ? [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `לשבץ צוות · ${dm(need[0].planned_from)}`, sub: need[0].name, href: `#/p/${need[0].id}` }]
    : [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `${need.length} פרויקטים לשיבוץ צוות`, sub: need.map(p => `${dm(p.planned_from)} ${p.name.split(' — ')[0]}`).join(' · '), href: '#/projects' }];
}
async function pushRows() {
  const st = await pushState();
  if (st === 'off') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'התראות כבויות', sub: 'בלי זה לא תדעו על משימה או שיבוץ', btn: 'הפעלה' }];
  if (st === 'install') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'להתקין למסך הבית', sub: 'רק כך אפשר לקבל התראות באייפון', href: '#/kb' }];
  return [];
}

export async function attention(box) {
  if (!box) return;
  const parts = await Promise.all([schedRows(), newsRows(), onbRows(), kbRows(), pushRows()].map(p => p.catch(() => [])));
  let items = parts.flat();
  if (items.some(x => x.k === 'onb')) items = items.filter(x => x.k !== 'kb');   // הקליטה כבר מפנה להדרכות החובה
  if (!items.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<section class="attn"><div class="sh-row"><h3 class="sh">מחכה לך</h3>${items.length > 1 ? `<span class="count">${items.length}</span>` : ''}</div>
    <div class="alist">${items.slice(0, 5).map((x, i) => `<a class="arow ${x.tone}" ${x.href ? `href="${x.href}"` : 'role="button" tabindex="0"'} data-i="${i}"><span class="aic">${x.ic}</span><span class="grow"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span>${x.btn ? `<span class="btn primary sm">${x.btn}</span>` : `<span class="chev">${icon('chev', 18)}</span>`}</a>`).join('')}</div></section>`;
  box.querySelectorAll('[data-i]').forEach(a => { const x = items[+a.dataset.i]; if (x.k === 'push' && x.btn) a.onclick = async e => { e.preventDefault(); try { await enablePush(); toast('ההתראות הופעלו'); attention(box); } catch (err) { toast(err.message); } }; });
}
