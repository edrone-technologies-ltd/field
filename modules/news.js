// לוח הודעות הנהלה (עם אישור קריאה) + "כל הכבוד" (הוקרה) + בקשות למשרד עם סטטוס ומענה.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, backBtn, initials, ask, signedUrls, zoom } from '../lib/core.js';

const AUD = [['pilot', 'מטיסים'], ['operator', 'מפעילי מערכות'], ['crew_lead', 'ראשי צוות'], ['crew', 'צוות שטח'], ['ops_manager', 'הנהלה ותפעול']];
const when = iso => { const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? 'היום ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
async function markRead(id, patch = {}) {
  const { data } = await sb.from('announcement_reads').update(patch).eq('ann_id', id).eq('user_id', state.user.id).select('ann_id');
  if (!data?.length) await sb.from('announcement_reads').insert({ ann_id: id, user_id: state.user.id, ...patch });
}

// ---------- לוח הודעות ----------
export async function renderNews(el) {
  const M = isManager();
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">הודעות הנהלה</h1>${M ? `<button class="btn ghost sm" id="nk">כל הכבוד</button><button class="btn primary sm" id="nn">${icon('plus', 16)} הודעה</button>` : ''}</header><div class="skel"></div>`;
  const [{ data: list }, { data: reads }, { data: people }] = await Promise.all([
    sb.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    sb.from('announcement_reads').select('ann_id,user_id,read_at,ack_at').in('user_id', M ? [] : [state.user.id]).then(r => r, () => ({ data: [] })),
    sb.from('profiles').select('id,full_name,role,field_role').eq('is_active', true).neq('role', 'partner'),
  ]);
  const all = list || [], N = id => (people || []).find(p => p.id === id)?.full_name || '';
  let R = reads || [];
  if (M && all.length) { const { data } = await sb.from('announcement_reads').select('ann_id,user_id,read_at,ack_at').in('ann_id', all.map(a => a.id)); R = data || []; }
  const mine = id => R.find(r => r.ann_id === id && r.user_id === state.user.id);
  const audience = a => (people || []).filter(p => !a.roles?.length || a.roles.includes(p.role) || a.roles.includes(p.field_role) || ['admin', 'ops_manager'].includes(p.role));
  el.querySelector('.skel').outerHTML = `<div class="stack lg">${all.map(a => {
    const r = mine(a.id), aud = audience(a), rd = R.filter(x => x.ann_id === a.id);
    return `<article class="news ${a.kind}" data-a="${a.id}">
      <div class="row"><span class="pill ${a.kind === 'kudos' ? 'lime' : a.pinned ? 'warn' : ''}">${a.kind === 'kudos' ? 'כל הכבוד' : a.pinned ? 'נעוץ' : 'הודעה'}</span><span class="grow"></span><small class="muted">${esc(N(a.created_by).split(' ')[0])} · ${when(a.created_at)}</small></div>
      ${a.kind === 'kudos' && a.recipient_id ? `<div class="kudo"><span class="avatar">${esc(initials(N(a.recipient_id)))}</span><b>${esc(N(a.recipient_id))}</b></div>` : ''}
      <h3>${esc(a.title)}</h3>${a.body ? `<p>${esc(a.body).replace(/\n/g, '<br>')}</p>` : ''}
      ${a.require_ack && !M ? (r?.ack_at ? '<div class="acked">אישרת קריאה ✓</div>' : `<button class="btn primary block" data-ack="${a.id}">קראתי ואישרתי</button>`) : ''}
      ${M ? `<button class="linkbtn small" data-who="${a.id}">נקרא ${rd.length}/${aud.length}${a.require_ack ? ` · אישרו ${rd.filter(x => x.ack_at).length}` : ''}</button>` : ''}
    </article>`; }).join('') || `<div class="empty-card"><span><b>אין הודעות</b><small>${M ? 'הודעה ראשונה בכפתור למעלה' : 'הודעות מההנהלה יופיעו כאן'}</small></span></div>`}</div>`;
  // כל ההודעות שבמסך = נקראו
  if (!M) for (const a of all) if (!mine(a.id)) markRead(a.id);
  $$('[data-ack]', el).forEach(b => b.onclick = async () => { b.disabled = true; await markRead(b.dataset.ack, { ack_at: new Date().toISOString() }); toast('אושר'); renderNews(el); });
  $$('[data-who]', el).forEach(b => b.onclick = () => { const a = all.find(x => x.id === b.dataset.who), rd = R.filter(x => x.ann_id === a.id);
    sheet(`<h3>מי קרא</h3><div class="list">${audience(a).map(p => { const r = rd.find(x => x.user_id === p.id);
      return `<div class="lrow"><span class="avatar sm">${esc(initials(p.full_name))}</span><b class="grow">${esc(p.full_name)}</b>${r?.ack_at ? '<span class="pill ok">אישר ✓</span>' : r ? '<span class="pill">קרא</span>' : '<span class="pill muted">עוד לא</span>'}</div>`; }).join('')}</div><button class="btn ghost block" data-close>סגירה</button>`); });
  const nn = $('#nn'); if (nn) nn.onclick = () => compose('news', people, () => renderNews(el));
  const nk = $('#nk'); if (nk) nk.onclick = () => compose('kudos', people, () => renderNews(el));
}

function compose(kind, people, done) {
  const roles = []; let who = null;
  sheet(`<h3>${kind === 'kudos' ? 'כל הכבוד' : 'הודעה לצוות'}</h3>
    ${kind === 'kudos' ? `<div class="field">למי<div class="chips">${(people || []).filter(p => p.id !== state.user.id).map(p => `<button type="button" class="chip" data-p="${p.id}" aria-pressed="false">${esc(p.full_name)}</button>`).join('')}</div></div>` : ''}
    <label class="field">${kind === 'kudos' ? 'על מה' : 'כותרת'}<input id="at" placeholder="${kind === 'kudos' ? 'למשל: עבודה נקייה ומהירה בכורדני' : 'למשל: נוהל חדש לטעינת סוללות'}"></label>
    <label class="field">פירוט (לא חובה)<textarea id="ab" rows="4"></textarea></label>
    ${kind === 'news' ? `<div class="field">למי<small>בלי סימון = לכל הצוות</small><div class="chips">${AUD.map(([k, l]) => `<button type="button" class="chip" data-r="${k}" aria-pressed="false">${l}</button>`).join('')}</div></div>
      <label class="tog"><span>דורש אישור קריאה</span><span class="sw"><input type="checkbox" id="ar"><i></i></span></label>
      <label class="tog"><span>נעוץ למעלה</span><span class="sw"><input type="checkbox" id="ap"><i></i></span></label>` : '<div class="small muted">ההוקרה מופיעה לכל הצוות, ומי שקיבל אותה מקבל התראה אישית.</div>'}
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="as">פרסום</button></div>`, (s, close) => {
    $$('[data-p]', s).forEach(c => c.onclick = () => { who = c.dataset.p; $$('[data-p]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $$('[data-r]', s).forEach(c => c.onclick = () => { const k = c.dataset.r, i = roles.indexOf(k); i < 0 ? roles.push(k) : roles.splice(i, 1); c.setAttribute('aria-pressed', roles.includes(k)); });
    $('#as', s).onclick = async () => {
      const title = $('#at', s).value.trim(); if (!title) return toast(kind === 'kudos' ? 'על מה?' : 'חסרה כותרת'); if (kind === 'kudos' && !who) return toast('למי?');
      $('#as', s).disabled = true;
      const { error } = await sb.from('announcements').insert({ kind, title, body: $('#ab', s).value.trim() || null, roles: roles.length ? roles : null, recipient_id: who,
        require_ack: !!$('#ar', s)?.checked, pinned: !!$('#ap', s)?.checked, created_by: state.user.id });
      if (error) { $('#as', s).disabled = false; return toast(error.message); }
      close(); toast('פורסם — נשלחה התראה'); done();
    };
  });
}

// בבית: הודעה שלא נקראה / לא אושרה, והוקרה שקיבלתי
export async function newsHome(box) {
  if (!box) return;
  try {
    const [{ data: list }, { data: reads }] = await Promise.all([
      sb.from('announcements').select('id,kind,title,recipient_id,require_ack,created_at,created_by').gte('created_at', new Date(Date.now() - 21 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(10),
      sb.from('announcement_reads').select('ann_id,ack_at').eq('user_id', state.user.id)]);
    const R = new Map((reads || []).map(r => [r.ann_id, r]));
    const due = (list || []).filter(a => a.created_by !== state.user.id && (!R.has(a.id) || (a.require_ack && !R.get(a.id).ack_at)));
    const kudo = due.find(a => a.kind === 'kudos' && a.recipient_id === state.user.id);
    box.innerHTML = kudo ? `<a class="promo kudos" href="#/news"><span class="mic">★</span><span class="grow"><b>כל הכבוד!</b><small>${esc(kudo.title)}</small></span></a>`
      : due.length ? `<a class="promo" href="#/news"><span class="mic">${icon('inbox', 20)}</span><span class="grow"><b>${due.length > 1 ? `${due.length} הודעות הנהלה חדשות` : 'הודעת הנהלה'}</b><small>${esc(due[0].title)}</small></span><span class="chev">${icon('chev', 18)}</span></a>` : '';
  } catch { box.innerHTML = ''; }
}

// ---------- בקשות למשרד ----------
const RST = { open: ['פתוחה', 'warn'], in_progress: ['בטיפול', 'lime'], done: ['טופלה', 'ok'] };
export async function renderRequests(el) {
  const M = isManager();
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">${M ? 'בקשות מהצוות' : 'בקשה למשרד'}</h1><button class="btn primary sm" id="rn">${icon('plus', 16)} בקשה</button></header><div class="skel"></div>`;
  let q = sb.from('office_requests').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(80);
  if (!M) q = q.eq('user_id', state.user.id);
  const { data } = await q; const rows = data || [];
  const urls = await signedUrls('field', rows.map(r => r.photo_path).filter(Boolean));
  const open = rows.filter(r => r.status !== 'done'), closed = rows.filter(r => r.status === 'done');
  const card = r => `<div class="card stack req" style="gap:6px"><div class="row"><span class="pill ${RST[r.status][1]}">${RST[r.status][0]}</span><b class="grow">${esc(r.category)}</b><small class="muted">${M ? esc(r.profiles?.full_name || '') + ' · ' : ''}${when(r.created_at)}</small></div>
      <div>${esc(r.body).replace(/\n/g, '<br>')}</div>${r.photo_path && urls[r.photo_path] ? `<img class="reqimg" src="${esc(urls[r.photo_path])}" alt="">` : ''}
      ${r.reply ? `<div class="note"><b>מענה:</b> ${esc(r.reply)}</div>` : ''}
      ${M && r.status !== 'done' ? `<div class="row">${r.status === 'open' ? `<button class="chip" data-st="${r.id}">בטיפול</button>` : ''}<span class="grow"></span><button class="btn primary sm" data-rp="${r.id}">מענה וסגירה</button></div>` : ''}</div>`;
  el.querySelector('.skel').outerHTML = `<div class="stack lg">${open.length ? `<section><h3 class="sh">${M ? 'פתוחות' : 'בטיפול'}</h3><div class="stack">${open.map(card).join('')}</div></section>` : ''}
    ${closed.length ? `<details class="fold" ${open.length ? '' : 'open'}><summary><span class="sh">טופלו</span><span class="count">${closed.length}</span></summary><div class="stack">${closed.map(card).join('')}</div></details>` : ''}
    ${!rows.length ? `<div class="empty-card"><span><b>אין בקשות</b><small>שאלה על השכר, ציוד שהתקלקל, מסמך — הכל כאן, עם תשובה מסודרת</small></span></div>` : ''}</div>`;
  $$('.reqimg', el).forEach(i => i.onclick = () => zoom(i.src, ''));
  $$('[data-st]', el).forEach(b => b.onclick = async () => { await sb.from('office_requests').update({ status: 'in_progress', handled_by: state.user.id }).eq('id', b.dataset.st); renderRequests(el); });
  $$('[data-rp]', el).forEach(b => b.onclick = async () => {
    const t = await ask('מענה לעובד', { multiline: true, placeholder: 'מה נעשה / מה התשובה', ok: 'שליחה וסגירה' }); if (t == null) return;
    const { error } = await sb.from('office_requests').update({ status: 'done', reply: t.trim() || 'טופל', handled_by: state.user.id }).eq('id', b.dataset.rp);
    if (error) return toast(error.message); toast('נשלח לעובד'); renderRequests(el);
  });
  $('#rn').onclick = () => newRequest(() => renderRequests(el));
}

async function newRequest(done) {
  const { data: st } = await sb.from('app_settings').select('value').eq('key', 'request_categories').maybeSingle();
  const C = st?.value || ['אחר']; let cat = C[0], file = null;
  sheet(`<h3>בקשה למשרד</h3>
    <div class="field">נושא<div class="chips">${C.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${c === cat}">${esc(c)}</button>`).join('')}</div></div>
    <label class="field">מה צריך<textarea id="rb" rows="4" placeholder="למשל: חסרות לי 6 שעות בתלוש של ספטמבר"></textarea></label>
    <label class="btn ghost block" style="position:relative">${icon('photo', 18)} <span id="rfl">צירוף תמונה (לא חובה)</span><input type="file" accept="image/*" id="rf" style="position:absolute;inset:0;opacity:0"></label>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="rs">שליחה</button></div>`, (s, close) => {
    $$('[data-c]', s).forEach(c => c.onclick = () => { cat = c.dataset.c; $$('[data-c]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#rf', s).onchange = e => { file = e.target.files[0]; $('#rfl', s).textContent = file ? 'תמונה צורפה ✓' : 'צירוף תמונה (לא חובה)'; };
    $('#rs', s).onclick = async () => {
      const body = $('#rb', s).value.trim(); if (!body) return toast('מה צריך?');
      $('#rs', s).disabled = true; let photo_path = null;
      if (file) try { const { shrink } = await import('../lib/store.js'); const blob = await shrink(file); photo_path = `${state.user.id}/requests/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('field').upload(photo_path, blob, { contentType: 'image/jpeg' }); if (error) throw error; } catch { photo_path = null; toast('התמונה לא עלתה — הבקשה נשלחת בלעדיה'); }
      const { error } = await sb.from('office_requests').insert({ user_id: state.user.id, category: cat, body, photo_path });
      if (error) { $('#rs', s).disabled = false; return toast(error.message); }
      close(); toast('נשלח למשרד — תקבל עדכון כשיטופל'); done();
    };
  });
}
