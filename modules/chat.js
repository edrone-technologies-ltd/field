// שיחה חיה לאתר או לפרויקט: טקסט, תמונה, סימון "חשוב". מתעדכן בזמן אמת.
import { sb, state, enqueue, signedUrls, $, $$, esc, toast, zoom, fmtTime } from '../lib/core.js';
import { shrink } from '../lib/store.js';

let channel;
export async function renderChat(el, { site, project }) {
  const key = site ? { col: 'site_id', id: site.id } : { col: 'project_id', id: project.id };
  el.innerHTML = `<div class="chat" id="msgs"><div class="skel"></div></div>`;
  const comp = document.createElement('div'); comp.className = 'composer';
  comp.innerHTML = `<label class="btn ghost att" title="תמונה">+<input type="file" accept="image/*" id="catt"></label>
    <textarea id="ctext" rows="1" placeholder="כתבו לצוות…"></textarea>
    <button class="btn ghost" id="cimp" aria-pressed="false" title="סימון חשוב">!</button>
    <button class="btn primary" id="csend">שליחה</button>`;
  el.appendChild(comp);
  const names = new Map();
  try { const { data } = await sb.from('profiles').select('id,full_name'); (data || []).forEach(p => names.set(p.id, p.full_name)); } catch {}
  let rows = [];
  async function load() {
    try {
      const { data } = await sb.from('messages').select('*').eq(key.col, key.id).order('created_at').limit(300);
      rows = data || [];
    } catch {}
    draw();
  }
  async function draw() {
    const urls = await signedUrls('field', rows.map(r => r.photo_path).filter(Boolean));
    const box = $('#msgs'); if (!box) return;
    box.innerHTML = rows.length ? rows.map(m => `<div class="msg ${m.author_id === state.user.id ? 'me' : ''} ${m.important ? 'imp' : ''}">
      <div class="who">${esc(m.author_label || names.get(m.author_id) || '')}${m.important ? ' · חשוב' : ''}${m.source === 'monday' ? ' · ממאנדי' : ''}</div>
      ${m.body ? `<div>${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${m.photo_path ? `<img src="${esc(urls[m.photo_path])}" alt="" data-z="${esc(urls[m.photo_path])}">` : ''}
      <div class="when">${fmtTime(m.created_at)}</div></div>`).join('')
      : `<div class="empty">אין הודעות עדיין. כאן מעדכנים את כל מי שעובד על ${esc(site ? site.name : project.name)}.</div>`;
    $$('[data-z]', box).forEach(i => i.onclick = () => zoom(i.dataset.z, ''));
    window.scrollTo({ top: document.body.scrollHeight });
  }
  await load();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('msg-' + key.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `${key.col}=eq.${key.id}` },
    p => { if (!rows.find(r => r.id === p.new.id)) { rows.push(p.new); draw(); } }).subscribe();
  addEventListener('hashchange', () => { if (channel) { sb.removeChannel(channel); channel = null; } }, { once: true });

  const imp = $('#cimp');
  imp.onclick = () => imp.setAttribute('aria-pressed', imp.getAttribute('aria-pressed') !== 'true');
  async function send(photoPath) {
    const body = $('#ctext').value.trim();
    if (!body && !photoPath) return;
    const row = { id: crypto.randomUUID(), [key.col]: key.id, author_id: state.user.id, body: body || '', photo_path: photoPath || null,
      important: imp.getAttribute('aria-pressed') === 'true', created_at: new Date().toISOString() };
    rows.push(row); draw();
    $('#ctext').value = ''; imp.setAttribute('aria-pressed', 'false');
    const { created_at, ...dbRow } = row;
    await enqueue({ kind: 'insert', table: 'messages', row: dbRow });
  }
  $('#csend').onclick = () => send();
  $('#ctext').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } };
  $('#catt').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const blob = await shrink(f), photoId = crypto.randomUUID(), path = `${state.user.id}/chat/${key.id}/${photoId}.jpg`;
      await enqueue({ kind: 'photo', blob, photoId, path, meta: { [key.col]: key.id, kind: 'general' } });
      await send(path);
    } catch { toast('התמונה לא נשלחה'); }
  };
}
