// שיחה חיה: לאתר (אפיון), לפרויקט (צוות) או שיחה פנימית (אישי/קבוצה). טקסט, תמונה, סימון "חשוב". בזמן אמת.
import { sb, state, enqueue, signedUrls, isManager, sheet, $, $$, esc, toast, zoom, initials, icon, HE_DOW } from '../lib/core.js';
import { shrink } from '../lib/store.js';

let channel;
const dkey = iso => new Date(iso).toLocaleDateString('he-IL');
const dlabel = iso => { const d = new Date(iso), t = new Date(); const y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? 'היום' : d.toDateString() === y.toDateString() ? 'אתמול' : `יום ${HE_DOW[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; };

export async function renderChat(el, { site, project, conversation }) {
  const key = site ? { col: 'site_id', id: site.id } : project ? { col: 'project_id', id: project.id } : { col: 'conversation_id', id: conversation.id };
  const label = site ? site.name : project ? project.name : conversation.title;
  // "חשוב" = חובת אישור קריאה. בשיחות פנימיות — רק מנהל מסמן. בצ'אט פרויקט — גם עובר כעדכון למאנדי.
  const showImportant = !conversation || isManager();
  el.innerHTML = `<div class="chat" id="msgs"><div class="skel"></div></div>`;
  const comp = document.createElement('div'); comp.className = 'composer';
  comp.innerHTML = `<label class="cbtn" title="תמונה" aria-label="צירוף תמונה">${icon('plus', 22)}<input type="file" accept="image/*" id="catt"></label>
    <textarea id="ctext" rows="1" placeholder="הודעה…" aria-label="הודעה"></textarea>
    ${showImportant ? `<button class="cbtn" id="cimp" aria-pressed="false" title="הודעה חשובה — דורשת אישור קריאה">!</button>` : ''}
    <button class="cbtn send" id="csend" aria-label="שליחה">${icon('send', 20)}</button>`;
  document.body.appendChild(comp);
  const names = new Map();
  try { const { data } = await sb.from('profiles').select('id,full_name'); (data || []).forEach(p => names.set(p.id, p.full_name)); } catch {}
  let rows = [], acks = new Map(), audience = conversation ? (conversation.members || []).length : 0;
  async function load() {
    try { const { data } = await sb.from('messages').select('*').eq(key.col, key.id).order('created_at').limit(300); rows = data || []; } catch {}
    await loadAcks(); draw();
  }
  async function loadAcks() {
    const imp = rows.filter(r => r.important).map(r => r.id); if (!imp.length) return;
    try { const { data } = await sb.from('message_acks').select('message_id,user_id').in('message_id', imp); acks = new Map(); (data || []).forEach(a => { if (!acks.has(a.message_id)) acks.set(a.message_id, []); acks.get(a.message_id).push(a.user_id); }); } catch {}
    if (project && !audience) try { const { count } = await sb.from('project_members').select('user_id', { count: 'exact', head: true }).eq('project_id', project.id); audience = count || 0; } catch {}
  }
  function ackLine(m, me) {
    if (!m.important) return '';
    const who = acks.get(m.id) || [];
    if (me) return `<button class="ackinfo" data-ack="${m.id}">${icon('users', 14)} אישרו ${who.length}${audience > 1 ? ' מתוך ' + (audience - 1) : ''}</button>`;
    return who.includes(state.user.id) ? `<div class="acked">אישרת ✓</div>` : `<button class="btn primary sm ackbtn" data-do-ack="${m.id}">קראתי ואישרתי</button>`;
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
        ${ackLine(m, me)}<div class="when">${new Date(m.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
    }).join('') : `<div class="empty-card"><span class="ei">${icon('chat', 26)}</span><span><b>אין הודעות עדיין</b><small>${conversation ? 'כתבו את ההודעה הראשונה' : site ? `שיחת האפיון של ${esc(label)} — מנהלים וסוקרים בלבד` : `צ'אט הצוות של ${esc(label)} — רק מי ששובץ לפרויקט`}</small></span></div>`;
    $$('[data-z]', box).forEach(i => i.onclick = () => i.dataset.z && zoom(i.dataset.z, ''));
    $$('[data-do-ack]', box).forEach(b => b.onclick = async () => { const id = b.dataset.doAck; if (!acks.has(id)) acks.set(id, []); acks.get(id).push(state.user.id); draw(); await enqueue({ kind: 'insert', table: 'message_acks', row: { message_id: id, user_id: state.user.id } }); });
    $$('[data-ack]', box).forEach(b => b.onclick = () => { const who = acks.get(b.dataset.ack) || [];
      sheet(`<h3>אישרו קריאה</h3><div class="list">${who.map(u => `<div class="lrow"><span class="avatar sm">${esc(initials(names.get(u)))}</span><b class="grow">${esc(names.get(u) || '')}</b><span class="pill ok">✓</span></div>`).join('') || '<div class="muted">עדיין אף אחד</div>'}</div><button class="btn ghost block" data-close>סגירה</button>`); });
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
