// הודעות פנימיות: שיחה אישית עם כל עובד + קבוצות תפוצה. לא קשור לפרויקטים (לצ'אט פרויקט יש מקום בתוך הפרויקט).
import { sb, state, isManager, cache, sheet, $, $$, esc, initials, icon, timeAgo, toast, ROLE_HE } from '../lib/core.js';

const av = c => `<span class="avatar ${c.kind === 'group' ? 'grp' : ''}">${c.kind === 'group' ? icon('users', 20) : esc(initials(c.title))}</span>`;

export async function renderInbox(el) {
  el.innerHTML = `<header class="phead"><h1 class="grow">הודעות</h1><button class="btn primary sm" id="new">${icon('plus', 18)} הודעה חדשה</button></header>
    <div id="ib" class="list"><div class="skel"></div></div>`;
  let rows;
  try { const { data, error } = await sb.rpc('my_inbox'); if (error) throw error; rows = data || []; await cache.set('inbox', rows); }
  catch { rows = (await cache.get('inbox')) || []; }
  const groups = rows.filter(c => c.kind === 'group'), dms = rows.filter(c => c.kind === 'dm');
  const row = c => `<a class="row msgrow ${c.unread ? 'unread' : ''}" href="#/c/${c.id}">${av(c)}<span class="grow"><span class="r1"><b>${esc(c.title || '')}</b><small>${c.last_message_at ? timeAgo(c.last_message_at) : ''}</small></span>
    <small class="r2">${esc(c.last_message || (c.kind === 'group' ? `${(c.members || []).length} חברים` : 'אין הודעות עדיין'))}</small></span>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</a>`;
  $('#ib').innerHTML = `${dms.length ? `<h3 class="sh">אישי</h3>${dms.map(row).join('')}` : ''}
    <h3 class="sh">קבוצות</h3>${groups.map(row).join('') || '<div class="muted small">אין קבוצות.</div>'}`;
  $('#new').onclick = newMessage;
}

async function newMessage() {
  const { data: people } = await sb.from('profiles').select('id,full_name,role').eq('is_active', true).neq('id', state.user.id).order('full_name');
  sheet(`<div class="row"><h3 class="grow">הודעה חדשה</h3><button class="chip" data-close>סגירה</button></div>
    <div class="list">${(people || []).map(p => `<button class="row" data-p="${p.id}"><span class="avatar">${esc(initials(p.full_name))}</span><span class="grow"><b>${esc(p.full_name)}</b><small>${esc(ROLE_HE[p.role] || '')}</small></span></button>`).join('')}</div>
    ${isManager() ? `<button class="btn ghost block" id="ng">${icon('users', 18)} קבוצת תפוצה חדשה</button>` : ''}`, (s, close) => {
    $$('[data-p]', s).forEach(b => b.onclick = async () => {
      const { data, error } = await sb.rpc('open_dm', { other: b.dataset.p }); if (error) return toast(error.message);
      close(); location.hash = '#/c/' + data;
    });
    const g = $('#ng', s); if (g) g.onclick = () => { close(); newGroup(people || []); };
  });
}
function newGroup(people) {
  sheet(`<h3>קבוצת תפוצה חדשה</h3><input type="text" id="gt" placeholder="שם הקבוצה (למשל: צוות אינטל חיפה)">
    <div class="chips">${people.map(p => `<button class="chip" data-u="${p.id}" aria-pressed="false">${esc(p.full_name)}</button>`).join('')}</div>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="gc">פתיחה</button></div>`, (s, close) => {
    $$('[data-u]', s).forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
    $('#gc', s).onclick = async () => {
      const t = $('#gt', s).value.trim(), m = $$('[data-u][aria-pressed="true"]', s).map(c => c.dataset.u);
      if (!t || !m.length) return toast('חסר שם או חברים');
      const { data, error } = await sb.rpc('create_group', { t, members: m }); if (error) return toast(error.message);
      close(); location.hash = '#/c/' + data;
    };
  });
}

// ---------- שיחה ----------
export async function renderConversation(el, id) {
  let conv;
  try { const { data } = await sb.rpc('my_inbox'); conv = (data || []).find(c => c.id === id); } catch {}
  conv ||= ((await cache.get('inbox')) || []).find(c => c.id === id) || { id, kind: 'dm', title: '' };
  const members = (conv.members || []).filter(m => m.id !== state.user.id);
  el.innerHTML = `<header class="phead sticky"><a class="back" href="#/inbox" aria-label="חזרה">${icon('back', 20)}</a>${av(conv)}<div class="grow"><b class="ttl">${esc(conv.title || '')}</b>
    <small class="muted">${conv.kind === 'group' ? esc(members.map(m => m.name.split(' ')[0]).join(', ')) : ''}</small></div></header><div id="cv"></div>`;
  (await import('./chat.js')).renderChat($('#cv'), { conversation: conv });
  sb.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', state.user.id).then(() => {});
}
