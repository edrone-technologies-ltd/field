// שיחה חיה: לאתר (אפיון), לפרויקט (צוות) או שיחה פנימית (אישי/קבוצה). טקסט, תמונה, סימון "חשוב". בזמן אמת.
import { sb, state, enqueue, signedUrls, isManager, sheet, $, $$, esc, toast, zoom, initials, icon, HE_DOW, thumbUrls } from '../lib/core.js';
import { shrink } from '../lib/store.js';
import { ogIndex, kbOgImg, kbIdFromUrl, appUrl } from '../lib/share.js';

// קישור להדרכה (דף שיתוף s/kb-<id>.html או #/kb/<id>) → כרטיס: תמונה + שם + "פתיחה", בלי כתובת גולמית
const SITE = 'https://edrone-technologies-ltd.github.io/field/';
const KB_RE = /https?:\/\/[^\s<]+/g;
const kbOf = u => (u.startsWith(SITE) || u.startsWith(location.origin + location.pathname.replace(/[^/]*$/, ''))) ? kbIdFromUrl(u) : null;
const kbMeta = new Map();
async function loadKbMeta(msgs) {
  const ids = [...new Set(msgs.flatMap(m => (m.body || '').match(KB_RE) || []).map(kbOf).filter(Boolean))].filter(i => !kbMeta.has(i));
  if (!ids.length) return false;
  const ix = await ogIndex();
  ids.forEach(i => ix[i] && kbMeta.set(i, ix[i]));
  const rest = ids.filter(i => !kbMeta.has(i) && /^[0-9a-f-]{36}$/.test(i));
  if (rest.length) try { const { data } = await sb.from('kb_items').select('id,title,category').in('id', rest); (data || []).forEach(x => kbMeta.set(x.id, { t: x.title, c: x.category })); } catch { /* */ }
  return true;
}
function kbParts(body) {
  const ids = []; const lead = body.replace(KB_RE, u => { const id = kbOf(u); if (!id) return u; ids.push(id); return ''; }).trim();
  if (!ids.length) return null;
  let kick = '', text = lead;
  const t = kbMeta.get(ids[0])?.t, m = /^(?:([^:\n]{1,24}):\s*)?([\s\S]+)$/.exec(lead);
  if (t && m && m[2].trim() === t) { kick = m[1] || ''; text = ''; }
  return { text, cards: [...new Set(ids)].map(id => { const x = kbMeta.get(id) || {};
    return `<a class="kbc" href="#/kb/${esc(id)}"><span class="kbc-i"><img src="${esc(kbOgImg(id, x.v))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(appUrl('og/app.jpg'))}'"></span>
      <span class="kbc-b"><span class="grow"><b>${esc(x.t || 'הדרכה')}</b><small>${esc(kick || x.c || 'מרכז ידע')}</small></span><span class="kbc-go">פתיחה</span></span></a>`; }).join('') };
}

let channel;
const dkey = iso => new Date(iso).toLocaleDateString('he-IL');
const dlabel = iso => { const d = new Date(iso), t = new Date(); const y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? 'היום' : d.toDateString() === y.toDateString() ? 'אתמול' : `יום ${HE_DOW[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`; };

export async function renderChat(el, { site, project, conversation }) {
  const key = site ? { col: 'site_id', id: site.id } : project ? { col: 'project_id', id: project.id } : { col: 'conversation_id', id: conversation.id };
  const label = site ? site.name : project ? project.name : conversation.title;
  // "חשוב" = חובת אישור קריאה. בשיחות פנימיות — רק מנהל מסמן. בצ׳אט פרויקט — גם עובר כעדכון למאנדי.
  const showImportant = !conversation || isManager();
  el.innerHTML = `<div class="chat" id="msgs"><div class="skel"></div></div>`;
  const comp = document.createElement('div'); comp.className = 'composer';
  comp.innerHTML = `<label class="cbtn" title="תמונה" aria-label="צירוף תמונה">${icon('photo', 22)}<input type="file" accept="image/*" id="catt"></label>
    <textarea id="ctext" rows="1" placeholder="הודעה…" aria-label="הודעה"></textarea>
    ${showImportant ? `<button class="cbtn" id="cimp" aria-pressed="false" title="הודעה חשובה — דורשת אישור קריאה">!</button>` : ''}
    <button class="cbtn send" id="csend" aria-label="שליחה">${icon('send', 20)}</button>`;
  document.body.appendChild(comp);
  const names = new Map(), roles = new Map();
  try { const { data } = await sb.from('profiles').select('id,full_name,role,is_active'); (data || []).forEach(p => { names.set(p.id, p.full_name); if (p.is_active !== false) roles.set(p.id, p.role); }); } catch {}
  // מי אפשר לתייג: רק מי שיש לו גישה לשיחה הזאת
  let taggable = [];
  try {
    if (conversation) taggable = (conversation.members || []).map(m => m.id);
    else if (project) { const { data } = await sb.from('project_members').select('user_id').eq('project_id', project.id); taggable = [...new Set([...(data || []).map(x => x.user_id), ...[...roles].filter(([, r]) => ['admin', 'ops_manager'].includes(r)).map(([id]) => id)])]; }
    else taggable = [...roles].filter(([, r]) => ['admin', 'ops_manager', 'surveyor'].includes(r)).map(([id]) => id);
  } catch {}
  taggable = taggable.filter(id => id !== state.user.id && names.get(id)).sort((a, b) => names.get(a).localeCompare(names.get(b), 'he'));
  let rows = [], acks = new Map(), audience = conversation ? (conversation.members || []).length : 0;
  // אישורי קריאה (כמו בוואטסאפ): ✓ נשלח · ✓✓ נקרא (בשיחה אישית — ע״י השני, בקבוצה — ע״י כולם). שעון = עוד בטלפון
  let reads = [];
  async function loadReads() {
    if (!conversation) return;
    try { const { data } = await sb.from('conversation_members').select('user_id,last_read_at').eq('conversation_id', conversation.id).neq('user_id', state.user.id); reads = data || []; } catch { /* */ }
  }
  const tick = m => {
    if (m._local) return `<span class="tk wait" aria-label="ממתין לשליחה">${icon('clock', 12)}</span>`;
    if (!conversation) return '';
    const n = reads.filter(r => r.last_read_at && new Date(r.last_read_at) >= new Date(m.created_at)).length, all = reads.length && n >= reads.length;
    return `<span class="tk ${all ? 'read' : ''}" aria-label="${all ? 'נקרא' : 'נשלח'}" title="${conversation.kind === 'group' && n && !all ? `נקרא ע״י ${n}` : ''}">${all || n ? '✓✓' : '✓'}</span>`;
  };
  const retick = () => $$('[data-tk]').forEach(e => { const m = rows.find(r => r.id === e.dataset.tk); if (m) e.innerHTML = tick(m); });
  async function load() {
    try { const { data } = await sb.from('messages').select('*').eq(key.col, key.id).order('created_at').limit(300); rows = data || []; } catch {}
    await Promise.all([loadAcks(), loadReads(), loadKbMeta(rows).catch(() => {})]); draw();
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
    return who.includes(state.user.id) ? `<div class="acked">${icon('check', 14)} אישרת</div>` : `<button class="btn primary sm ackbtn" data-do-ack="${m.id}">קראתי ואישרתי</button>`;
  }
  const tagHtml = m => { let h = esc(m.body);
    for (const u of m.mentions || []) { const n = names.get(u); if (n) h = h.split('@' + esc(n)).join(`<span class="tag ${u === state.user.id ? 'me' : ''}">@${esc(n)}</span>`); }
    // קישורים לחיצים: קישור לאפליקציה שלנו נפתח באותה לשונית, חיצוני — בלשונית חדשה
    h = h.replace(/(https?:\/\/[^\s<]+)/g, u => u.startsWith(location.origin + location.pathname) ? `<a href="${u}">${u}</a>` : `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    return h.replace(/\n/g, '<br>'); };
  async function draw() {
    const urls = await thumbUrls('field', rows.map(r => r.photo_path).filter(Boolean));
    const box = $('#msgs'); if (!box) return;
    let lastDay = '', lastAuthor = '';
    box.innerHTML = rows.length ? rows.map(m => {
      const me = m.author_id === state.user.id, d = dkey(m.created_at);
      const sep = d !== lastDay ? `<div class="dsep"><span>${dlabel(m.created_at)}</span></div>` : '';
      const first = m.author_id !== lastAuthor || d !== lastDay, showWho = !me && conversation?.kind !== 'dm' && first;   // בשיחה אישית — בלי שם על כל בועה
      lastDay = d; lastAuthor = m.author_id;
      return `${sep}<div class="msg ${me ? 'me' : ''} ${m.important ? 'imp' : ''} ${first ? '' : 'cont'} ${(m.mentions || []).includes(state.user.id) ? 'tagged' : ''}">
        ${showWho ? `<div class="who">${esc(m.author_label || names.get(m.author_id) || '')}${m.source === 'monday' ? ' · מהמשרד' : ''}</div>` : ''}
        ${m.important ? '<div class="impl">חשוב</div>' : ''}
        ${m.photo_path ? `<img src="${esc(urls[m.photo_path]?.t || '')}" alt="" data-full="${esc(urls[m.photo_path]?.f || '')}" data-z="${esc(urls[m.photo_path]?.f || '')}">` : ''}
        ${m.body ? (k => k ? `${k.text ? `<div class="tx">${tagHtml({ ...m, body: k.text })}</div>` : ''}${k.cards}` : `<div class="tx">${tagHtml(m)}</div>`)(kbParts(m.body)) : ''}
        ${ackLine(m, me)}<div class="when">${new Date(m.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}${me ? `<span data-tk="${m.id}">${tick(m)}</span>` : ''}</div></div>`;
    }).join('') : `<div class="empty-line">אין הודעות עדיין</div>`;
    $$('[data-z]', box).forEach(i => i.onclick = () => i.dataset.z && zoom(i.dataset.z, ''));
    $$('[data-do-ack]', box).forEach(b => b.onclick = async () => { const id = b.dataset.doAck; if (!acks.has(id)) acks.set(id, []); acks.get(id).push(state.user.id); draw(); await enqueue({ kind: 'insert', table: 'message_acks', row: { message_id: id, user_id: state.user.id } }); });
    $$('[data-ack]', box).forEach(b => b.onclick = () => { const who = acks.get(b.dataset.ack) || [];
      sheet(`<h3>אישרו קריאה</h3><div class="list">${who.map(u => `<div class="lrow"><span class="avatar sm">${esc(initials(names.get(u)))}</span><b class="grow">${esc(names.get(u) || '')}</b><span class="pill ok" aria-label="אישר">${icon('check', 16)}</span></div>`).join('') || '<div class="empty-line">עדיין אף אחד</div>'}</div><button class="btn ghost block" data-close>סגירה</button>`); });
    const sc = document.getElementById('app'); sc.scrollTo({ top: sc.scrollHeight });
  }
  await load();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('msg-' + key.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `${key.col}=eq.${key.id}` },
    p => { const had = rows.find(r => r.id === p.new.id);
      if (had) { if (had._local) { had._local = false; had.created_at = p.new.created_at; retick(); } return; }
      rows.push(p.new); draw(); loadKbMeta([p.new]).then(n => n && draw(), () => {}); if (conversation) markRead(); }).subscribe();
  // קריאה של האחרים מתעדכנת כל 15 שניות כל עוד השיחה פתוחה (רק הסימונים, בלי לצייר מחדש)
  const rt = conversation ? setInterval(async () => { if (document.hidden) return; await loadReads(); retick(); }, 15000) : 0;
  addEventListener('hashchange', () => { clearInterval(rt); if (channel) { sb.removeChannel(channel); channel = null; } }, { once: true });
  const markRead = () => sb.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', key.id).eq('user_id', state.user.id).then(() => {});

  const imp = $('#cimp');
  if (imp) imp.onclick = () => imp.setAttribute('aria-pressed', imp.getAttribute('aria-pressed') !== 'true');
  const ta = $('#ctext');
  const pop = document.createElement('div'); pop.className = 'mpop'; pop.hidden = true; comp.appendChild(pop);
  const atQuery = () => { const v = ta.value.slice(0, ta.selectionStart); const m = /(^|\s)@([^\s@]{0,20}(?: [^\s@]{0,20})?)$/.exec(v); return m ? { q: m[2], at: v.length - m[2].length - 1 } : null; };
  const showPop = () => {
    const a = atQuery(); if (!a || !taggable.length) { pop.hidden = true; return; }
    const q = a.q.trim(), list = taggable.filter(id => !q || names.get(id).split(' ').some(w => w.startsWith(q)) || names.get(id).startsWith(q)).slice(0, 6);
    if (!list.length) { pop.hidden = true; return; }
    pop.innerHTML = list.map(id => `<button type="button" data-tag="${id}"><span class="avatar sm">${esc(initials(names.get(id)))}</span>${esc(names.get(id))}</button>`).join('');
    pop.hidden = false;
    $$('[data-tag]', pop).forEach(b => b.onmousedown = b.ontouchstart = e => { e.preventDefault();
      const a2 = atQuery(); if (!a2) return; const n = names.get(b.dataset.tag), caret = ta.selectionStart;
      ta.value = ta.value.slice(0, a2.at) + '@' + n + ' ' + ta.value.slice(caret); const pos = a2.at + n.length + 2;
      ta.setSelectionRange(pos, pos); ta.focus(); pop.hidden = true; ta.oninput(); });
  };
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; showPop(); };
  ta.onblur = () => setTimeout(() => { pop.hidden = true; }, 150);
  async function send(photoPath) {
    const body = ta.value.trim();
    if (!body && !photoPath) return;
    const mentions = taggable.filter(id => body.includes('@' + names.get(id)));
    const row = { id: crypto.randomUUID(), [key.col]: key.id, author_id: state.user.id, body: body || '', photo_path: photoPath || null,
      important: imp?.getAttribute('aria-pressed') === 'true', mentions: mentions.length ? mentions : null, created_at: new Date().toISOString() };
    rows.push({ ...row, _local: true }); draw(); loadKbMeta([row]).then(n => n && draw(), () => {});
    ta.value = ''; ta.oninput(); imp?.setAttribute('aria-pressed', 'false');
    const { created_at, ...dbRow } = row;
    await enqueue({ kind: 'insert', table: 'messages', row: dbRow });
    // גיבוי אם אין אירוע בזמן אמת: בודקים שההודעה הגיעה לשרת
    setTimeout(async () => { const m = rows.find(r => r.id === row.id); if (!m?._local) return;
      try { const { data } = await sb.from('messages').select('id,created_at').eq('id', row.id).maybeSingle(); if (data) { m._local = false; m.created_at = data.created_at; retick(); } } catch { /* */ } }, 3500);
  }
  $('#csend').onclick = () => send();
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } };
  $('#catt').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const blob = await shrink(f), photoId = crypto.randomUUID(), path = `${state.user.id}/chat/${key.id}/${photoId}.jpg`;
      await enqueue({ kind: 'photo', blob, photoId, path, meta: { [key.col]: key.id, kind: 'general' } });
      await send(path);
    } catch { toast('התמונה לא נשלחה — נסו שוב'); }
  };
}
