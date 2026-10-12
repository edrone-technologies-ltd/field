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
  if (news.length) out.push({ k: 'news', tone: news.some(a => a.require_ack) ? 'warn' : '', ic: icon('inbox', 18), title: news.length > 1 ? `${news.length} עדכוני הנהלה` : 'עדכון מההנהלה' + (news[0].require_ack ? ' — לאישור' : ''), sub: news[0].title, href: '#/news' });
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
    sb.from('kb_items').select('id,title,quiz,sign_required,cert_months,required,cert_required,auto_done,roles').or('required.eq.true,cert_required.eq.true'),
    sb.from('kb_views').select('item_id,confirmed_at,passed_at,signed_at').eq('user_id', state.user.id)]);
  const vm = new Map((v || []).map(x => [x.item_id, x]));
  const pushOn = (await pushState().catch(() => '')) === 'on';
  const mine = x => !x.roles?.length || x.roles.includes(state.profile.role) || x.roles.includes(state.profile.field_role);   // הדרכה לתפקיד אחר — לא אצלי
  const due = (req || []).filter(x => mine(x) && !x.auto_done && !kbDone(x, vm.get(x.id)) && (x.required || ['crew', 'crew_lead'].includes(state.profile.role)));
  return due.length ? [{ k: 'kb', tone: '', ic: icon('play', 18), title: due.length > 1 ? `${due.length} הדרכות לצפייה` : 'הדרכה לצפייה', sub: due[0].title, href: due.length > 1 ? '#/kb' : `#/kb/${due[0].id}` }] : [];
}
// הנהלה: פרויקט שמתוכנן במאנדי ל-10 הימים הקרובים ועוד לא שובץ לו צוות באפליקציה
async function schedRows() {
  if (!['admin', 'ops_manager'].includes(state.profile.role)) return [];
  const t = new Date(), iso = d => d.toISOString().slice(0, 10), today = iso(t), lim = iso(new Date(Date.now() + 10 * 864e5));
  const { data } = await sb.from('projects').select('id,name,status_label,monday_group,closed_summary,planned_from,planned_to,work_days(day,status)').or('monday_group.is.null,monday_group.neq.group_mm5052gw')
    .not('planned_from', 'is', null).lte('planned_from', lim).gte('planned_to', today);
  const need = (data || []).filter(isOpenProject).filter(p => !(p.work_days || []).some(d => d.day >= today && d.status !== 'done'))
    .sort((a, b) => a.planned_from < b.planned_from ? -1 : 1);
  if (!need.length) return [];
  const dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`;
  const go = p => `#/p/${p.id}/sch/${p.planned_from >= today ? p.planned_from : today}`;   // ישר לגיליון השיבוץ
  return need.length === 1 ? [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `לשבץ צוות · ${dm(need[0].planned_from)}`, sub: need[0].name, href: go(need[0]) }]
    : [{ k: 'sched', tone: 'warn', ic: icon('calendar', 18), title: `${need.length} פרויקטים לשיבוץ צוות`, sub: need.map(p => `${dm(p.planned_from)} ${p.name.split(' — ')[0]}`).join(' · '),
        list: need.map(p => ({ href: go(p), t: p.name, s: dm(p.planned_from) + (p.planned_to && p.planned_to !== p.planned_from ? '–' + dm(p.planned_to) : '') })) }];
}
// הנהלה: תעודות והסמכות של העובדים (עבודה בגובה, רישיונות) שפגות ב-30 הימים הקרובים או כבר פגו. רישיון מטיס מהפרופיל — בהתראות המערכת
async function certRows() {
  if (!['admin', 'ops_manager'].includes(state.profile.role)) return [];
  const today = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const [{ data: docs }, { data: ppl }] = await Promise.all([
    sb.from('employee_docs').select('user_id,kind,title,expires_on').in('kind', ['certificate', 'license']).not('expires_on', 'is', null),
    sb.rpc('profiles_full').select('id,full_name,is_pilot,pilot_license_expiry').eq('is_active', true)]);
  const P = new Map((ppl || []).map(p => [p.id, p]));
  const last = new Map(); (docs || []).forEach(d => { const k = d.user_id + '|' + d.kind + '|' + (d.title || '').trim(); if (!last.has(k) || last.get(k).expires_on < d.expires_on) last.set(k, d); });   // חודש = רק האחרון קובע
  const due = [...last.values()].filter(d => P.has(d.user_id) && d.expires_on <= lim && !(/מטיס/.test(d.title || '') && P.get(d.user_id).pilot_license_expiry))
    .sort((a, b) => a.expires_on < b.expires_on ? -1 : 1);
  if (!due.length) return [];
  const dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`, who = d => (P.get(d.user_id).full_name || '').split(' ')[0];
  const line = d => `${who(d)} · ${d.title || 'תעודה'}`, when = d => d.expires_on < today ? `פגה ב-${dm(d.expires_on)}` : `בתוקף עד ${dm(d.expires_on)}`;
  const tone = due.some(d => d.expires_on < today) ? 'bad' : 'warn';
  return due.length === 1 ? [{ k: 'cert', tone, ic: icon('shield', 18), title: `${line(due[0])} — ${due[0].expires_on < today ? 'פגה' : 'פגה בקרוב'}`, sub: when(due[0]), href: `#/staff/${due[0].user_id}/docs` }]
    : [{ k: 'cert', tone, ic: icon('shield', 18), title: `${due.length} תעודות פגות או עומדות לפוג`, sub: due.map(line).join(' · '),
        list: due.map(d => ({ href: `#/staff/${d.user_id}/docs`, t: line(d), s: when(d) })) }];
}
// הנהלה: ביטוח / רישום / רישוי של כלים (רחפנים, רכבים, ציוד) — 30 יום לפני = אזהרה, פג = קריטי (db/097)
async function equipRows() {
  if (!['admin', 'ops_manager'].includes(state.profile.role)) return [];
  const today = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data } = await sb.from('equipment').select('id,name,kind,insurance_until,license_until').or(`insurance_until.lte.${lim},license_until.lte.${lim}`);
  const dm = d => `${+d.slice(8)}.${+d.slice(5, 7)}`;
  const due = (data || []).flatMap(e => [['ביטוח', e.insurance_until], [e.kind === 'drone' ? 'רישום' : e.kind === 'vehicle' ? 'טסט' : 'רישוי', e.license_until]]
    .filter(([, d]) => d && d <= lim).map(([t, d]) => ({ e, t, d }))).sort((a, b) => a.d < b.d ? -1 : 1);
  if (!due.length) return [];
  const tone = due.some(x => x.d < today) ? 'bad' : 'warn', line = x => `${x.e.name} · ${x.t}`, when = x => x.d < today ? `פג ב-${dm(x.d)}` : `בתוקף עד ${dm(x.d)}`;
  return due.length === 1 ? [{ k: 'equip', tone, ic: icon('drone', 18), title: `${line(due[0])} — ${due[0].d < today ? 'פג' : 'פג בקרוב'}`, sub: when(due[0]), href: '#/equipment' }]
    : [{ k: 'equip', tone, ic: icon('drone', 18), title: `${due.length} ביטוחים / רישויים של כלים ${tone === 'bad' ? 'פגו או פגים' : 'פגים בקרוב'}`, sub: due.map(line).join(' · '),
        list: due.map(x => ({ href: '#/equipment', t: line(x), s: when(x) })) }];
}
async function tourRows() {
  if (state.profile.role !== 'ops_manager') return [];
  const { data: it } = await sb.from('kb_items').select('id').eq('video_url', '#/tour/ops').maybeSingle(); if (!it) return [];
  const { data: v } = await sb.from('kb_views').select('item_id').eq('item_id', it.id).eq('user_id', state.user.id).maybeSingle();
  return v ? [] : [{ k: 'tour', tone: '', ic: icon('play', 18), title: 'הדרכה: 5 דקות להכרת האפליקציה', sub: 'לו״ז, שיבוץ, תכניות וביקורות', href: '#/tour/ops' }];
}
// הנהלה: מי בצוות לא מקבל התראות (אין מכשיר רשום) — התראות אליהם הולכות לאיבוד. מיומן ההתראות של השבוע האחרון
async function noPushRows() {
  if (state.profile.role !== 'admin') return [];
  const { data: log } = await sb.from('notify_log').select('nosub').gte('at', new Date(Date.now() - 7 * 864e5).toISOString()).limit(500);
  const ids = [...new Set((log || []).flatMap(x => x.nosub || []))]; if (!ids.length) return [];
  const { data: ppl } = await sb.from('profiles').select('id,full_name').in('id', ids).eq('is_active', true);
  if (!(ppl || []).length) return [];
  return [{ k: 'nopush', tone: 'warn', ic: icon('chat', 18), title: ppl.length > 1 ? `${ppl.length} בצוות לא מקבלים התראות` : `${ppl[0].full_name.split(' ')[0]} לא מקבל התראות`, sub: ppl.map(x => x.full_name.split(' ')[0]).join(' · '),
    list: ppl.map(x => ({ href: `#/staff/${x.id}`, t: x.full_name, s: '' })) }];
}
async function pushRows() {
  const st = await pushState();
  if (st === 'off') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'התראות כבויות', sub: '', btn: 'הפעלה' }];
  if (st === 'install') return [{ k: 'push', tone: 'warn', ic: icon('chat', 18), title: 'להתקין למסך הבית', sub: '', href: '#/menu' }];   // הוראות ההתקנה — בתפריט "עוד"
  return [];
}

// כל מה שמחכה למשתמש עצמו (הודעות, הדרכות, קליטה, התראות, שיבוץ שחסר)
export async function attentionItems() {
  const parts = await Promise.all([noPushRows(), tourRows(), schedRows(), certRows(), equipRows(), newsRows(), onbRows(), kbRows(), pushRows()].map(p => p.catch(() => [])));
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
