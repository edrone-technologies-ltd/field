// הודעות פנימיות: שיחה אישית עם כל עובד + קבוצות תפוצה. לא קשור לפרויקטים (לצ׳אט פרויקט יש מקום בתוך הפרויקט).
import { sb, state, isManager, cache, sheet, $, $$, esc, initials, icon, timeAgo, toast, ROLE_HE } from '../lib/core.js';
import { errText } from '../lib/audit.js';

// פעמון / פעמון מושתק (בלי התראות מהשיחה הזאת — חוץ מתיוג אישי והודעה חשובה)
const bell = (off, n = 20) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>${off ? '<path d="M3 3l18 18"/>' : ''}</svg>`;
const av = c => `<span class="avatar ${c.kind === 'group' ? 'grp' : ''}">${c.kind === 'group' ? icon('users', 20) : esc(initials(c.title))}</span>`;

export async function renderInbox(el) {
  el.innerHTML = `<header class="phead"><a class="back" href="#/" aria-label="חזרה">${icon('back', 20)}</a><h1 class="grow">הודעות</h1><button class="hbtn" id="new" aria-label="הודעה חדשה">${icon('plus', 20)}</button></header>
    <div id="ib" class="list"><div class="skel"></div></div>`;
  let rows;
  try { const { data, error } = await sb.rpc('my_inbox'); if (error) throw error; rows = data || []; await cache.set('inbox', rows); }
  catch { rows = (await cache.get('inbox')) || []; }
  await kbNames(rows);
  const groups = rows.filter(c => c.kind === 'group'), dms = rows.filter(c => c.kind === 'dm');
  const row = c => `<a class="lrow msgrow ${c.unread ? 'unread' : ''}" href="#/c/${c.id}">${av(c)}<span class="grow"><span class="r1"><b>${esc(c.title || '')}</b><small>${c.muted ? `<span class="mutei" aria-label="מושתק">${bell(true, 13)}</span>` : ''}${c.last_message_at ? timeAgo(c.last_message_at) : ''}</small></span>
    <small class="r2">${esc(c.last_message || (c.kind === 'group' ? `${(c.members || []).length} חברים` : 'אין הודעות עדיין'))}</small></span>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</a>`;
  // רשימה אחת לפי ההודעה האחרונה (כמו בוואטסאפ): שלא נקראו למעלה, אחר כך החדשות
  const all = [...dms, ...groups].sort((a, b) => (b.unread && !b.muted ? 1 : 0) - (a.unread && !a.muted ? 1 : 0) || String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')));
  $('#ib').innerHTML = all.map(row).join('') + (dms.length ? '' : `<button class="lrow msgrow newdm" id="new2"><span class="avatar grp">${icon('plus', 20)}</span><span class="grow"><b>הודעה אישית</b></span></button>`);
  $('#new').onclick = newMessage; const n2 = $('#new2'); if (n2) n2.onclick = newMessage;
}

// קישור להדרכה בתצוגה המקדימה → "הדרכה: <שם>" (השרת כבר שומר כך — db/128; כאן למה שנשמר/נשמר במטמון קודם)
const KB_U = /https?:\/\/\S*?(?:\/s\/kb-|#\/kb\/)([0-9a-f-]{36})\S*/g;
async function kbNames(rows) {
  const ids = [...new Set(rows.flatMap(c => [...String(c.last_message || '').matchAll(KB_U)].map(m => m[1])))];
  if (!ids.length) return;
  let T = new Map();
  try { const { data } = await sb.from('kb_items').select('id,title').in('id', ids); T = new Map((data || []).map(x => [x.id, x.title])); } catch { /* */ }
  for (const c of rows) {
    const s = String(c.last_message || ''); if (!KB_U.test(s)) continue; KB_U.lastIndex = 0;
    const ts = [...s.matchAll(KB_U)].map(m => T.get(m[1])).filter(Boolean), t = ts.join(' · ');
    const lead = s.replace(KB_U, '').trim().replace(/\s*…$/, '');
    c.last_message = !t ? (lead || 'הדרכה') : !lead || (lead.includes(t) && lead.length <= t.length + 26) ? `הדרכה: ${t}` : `${lead} · הדרכה: ${t}`;
  }
}

async function newMessage() {
  const { data: people } = await sb.from('profiles').select('id,full_name,role').eq('is_active', true).neq('id', state.user.id).order('full_name');
  sheet(`<div class="lrow"><h3 class="grow">הודעה חדשה</h3><button class="chip" data-close>סגירה</button></div>
    ${(people || []).length > 8 ? '<input type="search" id="pq" placeholder="חיפוש" aria-label="חיפוש">' : ''}
    <div class="list">${(people || []).map(p => `<button class="lrow" data-p="${p.id}" data-n="${esc(p.full_name)}"><span class="avatar">${esc(initials(p.full_name))}</span><span class="grow"><b>${esc(p.full_name)}</b><small>${esc(ROLE_HE[p.role] || '')}</small></span></button>`).join('')}</div>
    ${isManager() ? `<button class="btn ghost block" id="ng">${icon('users', 18)} קבוצת תפוצה חדשה</button>` : ''}`, (s, close) => {
    $$('[data-p]', s).forEach(b => b.onclick = async () => {
      if (b.disabled) return; b.disabled = true;
      const { data, error } = await sb.rpc('open_dm', { other: b.dataset.p }); if (error) { b.disabled = false; return toast(errText(error, 'השיחה לא נפתחה — נסו שוב')); }
      close(); location.hash = '#/c/' + data;
    });
    const g = $('#ng', s); if (g) g.onclick = () => { close(); newGroup(people || [], newMessage); };
    const q = $('#pq', s); if (q) q.oninput = () => { const v = q.value.trim(); $$('[data-p]', s).forEach(b => b.hidden = !!v && !b.dataset.n.includes(v)); };
  });
}
function newGroup(people, back) {
  sheet(`<h3>קבוצת תפוצה חדשה</h3><input type="text" id="gt" placeholder="שם הקבוצה (למשל: צוות אינטל חיפה)">
    <div class="chips">${people.map(p => `<button class="chip" data-u="${p.id}" aria-pressed="false">${esc(p.full_name)}</button>`).join('')}</div>
    <div class="lrow"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="gc">פתיחת הקבוצה</button></div>`, (s, close) => {
    $$('[data-u]', s).forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
    $('#gc', s).onclick = async () => {
      const t = $('#gt', s).value.trim(), m = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u);
      if (!t || !m.length) return toast('חסר שם או חברים');
      const gc = $('#gc', s); if (gc.disabled) return; gc.disabled = true;
      const { data, error } = await sb.rpc('create_group', { t, members: m }); if (error) { gc.disabled = false; return toast(errText(error, 'הקבוצה לא נפתחה — נסו שוב')); }
      close(); location.hash = '#/c/' + data;
    };
  }, { back });
}

// ---------- שיחה ----------
export async function renderConversation(el, id) {
  let conv;
  try { const { data } = await sb.rpc('my_inbox'); conv = (data || []).find(c => c.id === id); } catch {}
  conv ||= ((await cache.get('inbox')) || []).find(c => c.id === id) || { id, kind: 'dm', title: '' };
  const members = (conv.members || []).filter(m => m.id !== state.user.id);
  el.innerHTML = `<header class="phead sticky"><a class="back" href="#/inbox" aria-label="חזרה">${icon('back', 20)}</a>${av(conv)}<div class="grow"><b class="ttl">${esc(conv.title || '')}</b>
    <small class="muted">${conv.kind === 'group' ? esc(members.map(m => m.name.split(' ')[0]).join(', ')) : ''}</small></div>
    ${conv.kind === 'group' ? `<button class="hbtn mutebtn" id="mute" aria-pressed="${!!conv.muted}" aria-label="${conv.muted ? 'ביטול השתקה' : 'השתקת הקבוצה'}">${bell(conv.muted)}</button>` : ''}</header><div id="cv"></div>`;
  const mb = $('#mute');
  if (mb) mb.onclick = async () => {
    if (mb.disabled) return; mb.disabled = true; const on = !conv.muted;
    const { error } = await sb.from('conversation_members').update({ muted: on }).eq('conversation_id', id).eq('user_id', state.user.id);
    mb.disabled = false; if (error) return toast(errText(error, 'לא עודכן — נסו שוב'));
    conv.muted = on; mb.setAttribute('aria-pressed', on); mb.setAttribute('aria-label', on ? 'ביטול השתקה' : 'השתקת הקבוצה'); mb.innerHTML = bell(on);
    const c = (await cache.get('inbox').catch(() => null)) || []; const x = c.find(r => r.id === id); if (x) { x.muted = on; cache.set('inbox', c).catch(() => {}); }
    toast(on ? 'הקבוצה מושתקת · תיוג אישי עדיין מגיע' : 'ההתראות חזרו');
  };
  (await import('./chat.js')).renderChat($('#cv'), { conversation: conv });
  sb.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', state.user.id).then(() => {});
}
