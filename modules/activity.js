// פעילות באפליקציה (הנהלה בלבד): מי מחובר עכשיו, מי נכנס ומתי, באיזה מכשיר וגרסה, אילו מסכים, מה עשו — ו-14 ימים אחורה.
import { sb, state, $, $$, esc, backBtn, ROLE_HE, timeAgo } from '../lib/core.js';

const ROUTE = { 'בית': 'בית', schedule: 'לו״ז', today: 'יום השטח', 'day/:id': 'יום שטח', projects: 'פרויקטים', 'p/:id': 'פרויקט', specs: 'אפיונים', 'site/:id': 'אתר', 'b/:id': 'מבנה',
  reports: 'דוחות שטח', menu: 'עוד', kb: 'מרכז ידע', 'kb/:id': 'הדרכה', inbox: 'הודעות', c: 'צ׳אט', 'c/:id': 'צ׳אט', alerts: 'לטיפול', attendance: 'נוכחות צוות', hours: 'השעות שלי',
  expenses: 'הוצאות', purchase: 'רכש', requests: 'בקשות', staff: 'עובדים', 'staff/:id': 'עובד', dispatch: 'לוח שיבוץ', equipment: 'ציוד', 'plan/:id': 'תכנית עבודה',
  'visit/:id': 'דוח ביקור', 'visit/new': 'דוח ביקור חדש', 'tour/ops': 'הדרכה', news: 'הודעות הנהלה', myfile: 'התיק שלי', admin: 'הרשאות', activity: 'פעילות', onboarding: 'לפני שמתחילים' };
const TBL = { photos: 'תמונות', specs: 'אפיונים', tasks: 'משימות', project_visits: 'דוחות ביקור', work_days: 'ימי שטח', projects: 'פרויקטים', field_reports: 'דוחות',
  issues: 'תקלות', expenses: 'הוצאות', shifts: 'משמרות', buildings: 'מבנים', sites: 'אתרים', purchase_requests: 'רכש', messages: 'הודעות צ׳אט', plan_days: 'תכניות עבודה' };
const ACT = { insert: 'הוסיף', update: 'עדכן', delete: 'מחק' };
const rname = r => ROUTE[r] || ROUTE[(r || '').split('/')[0]] || r || '';
const hm = iso => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const day = iso => new Date(iso).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });

export async function renderActivity(el, who = '') {
  if (state.profile.role !== 'admin') { el.innerHTML = '<div class="empty">למנהל המערכת בלבד.</div>'; return; }
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>פעילות</h1></header><div class="skel tall"></div>`;
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const [{ data: S, error }, { data: ev }, { data: au }] = await Promise.all([
    sb.rpc('activity_stats', { days: 14 }),
    sb.from('app_events').select('user_id,at,kind,route,device').gte('at', since).order('at', { ascending: false }).limit(300),
    sb.from('audit_log').select('user_id,at,tbl,action').gte('at', since).order('at', { ascending: false }).limit(200)]);
  if (error) { el.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  const U = S.users || [], N = new Map(U.map(u => [u.id, u.name])), now = Date.now();
  const on = u => u.seen && now - new Date(u.seen) < 2.5 * 6e4, today = u => u.seen && new Date(u.seen).toDateString() === new Date().toDateString();
  const latestVer = U.map(u => u.ver).filter(Boolean).sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)))[0];
  const D = S.daily || [], tdy = D.find(d => d.d === new Date().toLocaleDateString('en-CA')) || { users: 0, views: 0 };
  const max = Math.max(1, ...D.map(d => d.users));

  // פיד: כניסות/פתיחות + פעולות, ממוזגים לפי זמן (מסכים — רק כשבוחרים עובד)
  const feed = [
    ...(ev || []).filter(e => e.kind !== 'view' || who).map(e => ({ at: e.at, u: e.user_id, t: e.kind === 'login' ? `נכנס עם קוד · ${esc(e.device || '')}` : e.kind === 'open' ? `פתח את האפליקציה · ${esc(e.device || '')}` : `צפה ב${esc(rname(e.route))}`, k: e.kind })),
    ...(au || []).map(a => ({ at: a.at, u: a.user_id, t: `${ACT[a.action] || a.action} ${TBL[a.tbl] || a.tbl}`, k: 'act' }))]
    .filter(x => !who || x.u === who).sort((a, b) => a.at < b.at ? 1 : -1);
  // פעולות רצופות מאותו סוג — שורה אחת עם מונה
  const rows = []; for (const x of feed) { const p = rows.at(-1); if (p && p.u === x.u && p.t === x.t && new Date(p.at) - new Date(x.at) < 30 * 6e4) p.n++; else rows.push({ ...x, n: 1 }); }

  const urow = u => `<button class="lrow act-u ${who === u.id ? 'sel' : ''}" data-u="${u.id}">
      <span class="dot ${on(u) ? 'on' : today(u) ? 'today' : ''}"></span>
      <span class="grow"><b>${esc(u.name)}</b><small>${esc(ROLE_HE[u.role] || '')} · ${on(u) ? '<b class="ok">מחובר עכשיו</b>' : u.seen ? 'נראה ' + timeAgo(u.seen) : 'עוד לא נכנס'}${u.last_login ? ` · כניסה אחרונה ${day(u.last_login)}` : ''}</small>
        ${u.device ? `<small>${esc(u.device)}${u.ver ? ` · ${esc(u.ver)}${latestVer && u.ver !== latestVer ? ' <b class="warn">(ישנה)</b>' : ''}` : ''}</small>` : ''}</span>
      <span class="act-n"><b>${u.days}</b><small>ימים</small></span><span class="act-n"><b>${u.actions}</b><small>פעולות</small></span></button>`;
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">פעילות</h1><span class="small muted" id="upd">עכשיו</span></header>
    <div class="stack lg">
      <div class="kpis"><div class="kpi"><b>${U.filter(on).length}</b><span>מחוברים עכשיו</span></div><div class="kpi"><b>${U.filter(today).length}</b><span>היו היום</span></div><div class="kpi"><b>${tdy.views}</b><span>מסכים היום</span></div></div>
      <section class="stack"><div class="sh-row"><h3 class="sh">הצוות</h3><span class="small muted">14 ימים אחרונים</span></div><div class="list">${U.map(urow).join('')}</div></section>
      <section class="stack"><h3 class="sh">${who ? `מה ${esc((N.get(who) || '').split(' ')[0])} עשה` : 'מה קורה עכשיו'}${who ? ' · <a href="#/activity" class="small">כולם</a>' : ''}</h3>
        <div class="list feed">${rows.slice(0, 60).map(x => `<div class="lrow fr ${x.k}"><span class="fh">${hm(x.at)}</span><span class="grow">${who ? '' : `<b>${esc((N.get(x.u) || '').split(' ')[0])}</b> `}${x.t}${x.n > 1 ? ` <span class="pill">×${x.n}</span>` : ''}${new Date(x.at).toDateString() !== new Date().toDateString() ? ` <small class="muted">${day(x.at)}</small>` : ''}</span></div>`).join('') || '<div class="small muted" style="padding:12px">אין פעילות ביומיים האחרונים</div>'}</div></section>
      <section class="stack"><h3 class="sh">משתמשים פעילים ביום</h3>
        <div class="dbars">${D.map(d => `<div class="db"><span class="n">${d.users}</span><i style="height:${Math.round(d.users / max * 100)}%"></i><small>${new Date(d.d + 'T12:00').getDate()}.${new Date(d.d + 'T12:00').getMonth() + 1}</small></div>`).join('') || '<div class="small muted">הנתונים מתחילים להיאסף מהיום</div>'}</div></section>
      <div class="grid2">
        <section class="stack"><h3 class="sh">מסכים נפוצים</h3><div class="list">${(S.routes || []).map(r => `<div class="lrow"><span class="grow">${esc(rname(r.r))}</span><b>${r.n}</b></div>`).join('') || '<div class="small muted" style="padding:12px">—</div>'}</div></section>
        <section class="stack"><h3 class="sh">פעולות</h3><div class="list">${Object.entries(S.actions || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="lrow"><span class="grow">${esc(TBL[t] || t)}</span><b>${n}</b></div>`).join('') || '<div class="small muted" style="padding:12px">—</div>'}</div></section>
      </div>
    </div>`;
  $$('[data-u]', el).forEach(b => b.onclick = () => { location.hash = who === b.dataset.u ? '#/activity' : `#/activity/${b.dataset.u}`; });
  // רענון כל 30 שניות כל עוד המסך פתוח
  const t = setTimeout(() => { if (location.hash.startsWith('#/activity')) renderActivity(el, who); }, 30000);
  addEventListener('hashchange', () => clearTimeout(t), { once: true });
}
