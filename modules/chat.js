// שיחה חיה: לאתר (אפיון), לפרויקט (צוות) או שיחה פנימית (אישי/קבוצה). טקסט, תמונה, סימון "חשוב". בזמן אמת.
import { sb, state, enqueue, signedUrls, $, $$, esc, toast, zoom, initials, icon, HE_DOW } from '../lib/core.js';
import { shrink } from '../lib/store.js';

let channel;
const dkey = iso => new Date(iso).toLocaleDateString('he-IL');
const dlabel = iso => { const d = new Date(iso), t = new Date(); const y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? 'היום' : d.toDateString() === y.toDateString() ? 'אתמול' : `יום ${HE_DOW[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; };

export async function renderChat(el, { site, project, conversation }) {
  const key = site ? { col: 'site_id', id: site.id } : project ? { col: 'project_id', id: project.id } : { col: 'conversation_id', id: conversation.id };
  const label = site ? site.name : project ? project.name : conversation.title;
  const showImportant = !conversation;   // "חשוב" רלוונטי לצ'אט פרויקט/אפיון (עובר למאנדי)
  el.innerHTML = `<div class="chat" id="msgs"><div class="skel"></div></div>`;
  const comp = document.createElement('div'); comp.className = 'composer';
  comp.innerHTML = `<label class="cbtn" title="תמונה" aria-label="צירוף תמונה">${icon('plus', 22)}<input type="file" accept="image/*" id="catt"></label>
    <textarea id="ctext" rows="1" placeholder="הודעה…" aria-label="הודעה"></textarea>
    ${showImportant ? `<button class="cbtn" id="cimp" aria-pressed="false" title="סימון חשוב — עובר גם למאנדי">!</button>` : ''}
    <button class="cbtn send" id="csend" aria-label="שליחה">${icon('send', 20)}</button>`;
  document.body.appendChild(comp);
  const names = new Map();
  try { const { data } = await sb.from('profiles').select('id,full_name'); (data || []).forEach(p => names.set(p.id, p.full_name)); } catch {}
  let rows = [];
  async function load() {
    try { const { data } = await sb.from('messages').select('*').eq(key.col, key.id).order('created_at').limit(300); rows = data || []; } catch {}
    draw();
  }
  async function draw() {
    const urls = await signedUrls('field', rows.map(r => r.photo_path).filter(Boolean));
    const box = $('#msgs'); if (!box) return;
    let lastDay = '', lastAuthor = '';
    box.innerHTML = rows.length ? rows.map(m => {
      const me = m.author_id === state.user.id, d = dkey(m.created_at);
      const sep = d !== lastDay ? `<div class="dsep"><span>${dlabel(m.created_at)}</span></div>` : '';
      const showWho = !me && (m.author_id !== lastAuthor || d !== lastDay);
      lastDay = d; lastAuthor = m.author_id;
      return `${sep}<div class="msg ${me ? 'me' : ''} ${m.important ? 'imp' : ''} ${showWho ? '' : 'cont'}">
        ${showWho ? `<div class="who">${esc(m.author_label || names.get(m.author_id) || '')}${m.source === 'monday' ? ' · ממאנדי' : ''}</div>` : ''}
        ${m.important ? '<div class="impl">חשוב</div>' : ''}
        ${m.photo_path ? `<img src="${esc(urls[m.photo_path] || '')}" alt="" data-z="${esc(urls[m.photo_path] || '')}">` : ''}
        ${m.body ? `<div class="tx">${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="when">${new Date(m.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
    }).join('') : `<div class="empty-card"><span class="ei">${icon('chat', 26)}</span><span><b>אין הודעות עדיין</b><small>${conversation ? 'כתבו את ההודעה הראשונה' : `כאן מעדכנים את כל מי שעובד על ${esc(label)}`}</small></span></div>`;
    $$('[data-z]', box).forEach(i => i.onclick = () => i.dataset.z && zoom(i.dataset.z, ''));
    window.scrollTo({ top: document.body.scrollHeight });
  }
  await load();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('msg-' + key.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `${key.col}=eq.${key.id}` },
    p => { if (!rows.find(r => r.id === p.new.id)) { rows.push(p.new); draw(); if (conversation) markRead(); } }).subscribe();
  addEventListener('hashchange', () => { if (channel) { sb.removeChannel(channel); channel = null; } }, { once: true });
  const markRead = () => sb.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', key.id).eq('user_id', state.user.id).then(() => {});

  const imp = $('#cimp');
  if (imp) imp.onclick = () => imp.setAttribute('aria-pressed', imp.getAttribute('aria-pressed') !== 'true');
  const ta = $('#ctext');
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  async function send(photoPath) {
    const body = ta.value.trim();
    if (!body && !photoPath) return;
    const row = { id: crypto.randomUUID(), [key.col]: key.id, author_id: state.user.id, body: body || '', photo_path: photoPath || null,
      important: imp?.getAttribute('aria-pressed') === 'true', created_at: new Date().toISOString() };
    rows.push(row); draw();
    ta.value = ''; ta.oninput(); imp?.setAttribute('aria-pressed', 'false');
    const { created_at, ...dbRow } = row;
    await enqueue({ kind: 'insert', table: 'messages', row: dbRow });
  }
  $('#csend').onclick = () => send();
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } };
  $('#catt').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const blob = await shrink(f), photoId = crypto.randomUUID(), path = `${state.user.id}/chat/${key.id}/${photoId}.jpg`;
      await enqueue({ kind: 'photo', blob, photoId, path, meta: { [key.col]: key.id, kind: 'general' } });
      await send(path);
    } catch { toast('התמונה לא נשלחה'); }
  };
}
