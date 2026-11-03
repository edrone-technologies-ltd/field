// דיווחי תקלות מהאפליקציה. שותפים: #/admin/reports (RLS ב-db/151: dg_is_partner). המדווח: "הדיווחים שלי" (#/myreports) + כרטיס בבית כשתוקן.
// כל דיווח הוא שרשור (db/158, אביחי 01/11): הדיווח המקורי למעלה, הודעות מתחת, שדה עם תמונה.
// סטטוס: חדש → בטיפול → תוקן → נסגר. "תוקן" הוא לא סגירה: המדווח מאשר (נסגר) או כותב מה עוד לא (חוזר לטיפול).
// רק המדווח סוגר, ורק מ"תוקן" — נאכף בשרת (dg_app_reports_guard + dg_report_approve). שותף לא סוגר, ושום דבר לא נסגר לבד.
// "תוקן" נשאר עדכון של הדיווח (גרסה + מענה + סרטון, db/156) — השרת יוצר ממנו הודעת fix בשרשור.
import { sb, state, $, $$, esc, icon, toast, backBtn, sheet, signedUrls, zoom, skeleton, ROLE_HE, timeAgo, dm, uid } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const ST = { new: ['חדש', 'warn'], triaged: ['בטיפול', 'lime'], fixed: ['תוקן', 'ok'], archived: ['נסגר', ''], wontfix: ['לא לטיפול', ''] };
const ST_ME = { new: ['התקבל', ''], triaged: ['בטיפול', 'lime'], fixed: ['תוקן', 'ok'], archived: ['נסגר', ''], wontfix: ['נבדק', ''] };   // מה שהמדווח רואה
const MAXV = 15 * 1024 * 1024;
const videoUrl = async (id, msg) => { try { const { data, error } = await sb.functions.invoke('report-video', { body: { action: 'url', id, ...(msg ? { msg } : {}) } }); return error ? null : data?.url || null; } catch { return null; } };
const hms = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false }); } catch { return ''; } };
const mono = s => `<bdi dir="ltr" class="rpmono">${esc(s)}</bdi>`;
const txt = s => esc(s).replace(/\n/g, '<br>');
const pill = (r, mine) => { const s = (mine ? ST_ME : ST)[r.status] || [esc(r.status), '']; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
// device מגיע מהמדווח (jsonb חופשי): כל ערך עובר esc. לא מזהים HTML לפי "<" בתחילת מחרוזת (XSS מעובד לשותף, it-security 01/11)
const bdi = s => `<bdi>${esc(s)}</bdi>`;
const devLine = d => !d ? '' : [d.os && bdi(d.os), d.browser && bdi(d.browser), d.vw && mono(`${d.vw}×${d.vh}`), bdi(d.standalone ? 'מותקנת' : 'בדפדפן'), d.online === false ? bdi('בלי קליטה') : d.net && d.net !== '4g' ? mono(d.net) : null, d.desk ? bdi('מחשב') : null]
  .filter(Boolean).join(' · ');
const errBlock = e => Array.isArray(e) && e.length ? `<details class="fold rperrs"><summary><span class="sh">${e.length === 1 ? 'שגיאה אחת' : e.length + ' שגיאות'}</span></summary>
  <pre class="rperr" dir="ltr">${esc(e.map(x => `[${x.t ? hms(x.t) : ''} ${x.k || ''}${x.n > 1 ? ' ×' + x.n : ''}] ${x.what ? x.what + ' ' : ''}${x.m || ''}${x.r ? '  @' + x.r : ''}${x.at ? '\n   ' + x.at : ''}`).join('\n'))}</pre></details>` : '';

async function version() { try { const k = (await caches.keys()).find(x => x.startsWith('edrone-field-v')); return k ? 'v' + k.split('-v')[1] : ''; } catch { return ''; } }

// כמה הודעות מהצד השני לא נקראו, לכל דיווח (כשל = בלי מונים)
async function unreadMap(ids) {
  const out = {}; if (!ids.length) return out;
  try {
    const [{ data: ms }, { data: rd }] = await Promise.all([
      sb.from('dg_app_report_msgs').select('report_id,author,created_at').in('report_id', ids).neq('author', state.user.id),
      sb.from('dg_app_report_reads').select('report_id,seen_at').in('report_id', ids)]);
    const seen = Object.fromEntries((rd || []).map(x => [x.report_id, x.seen_at]));
    (ms || []).forEach(m => { if (!seen[m.report_id] || m.created_at > seen[m.report_id]) out[m.report_id] = (out[m.report_id] || 0) + 1; });
  } catch { /* */ }
  return out;
}

// ---------- שותפים: הרשימה ----------
export async function renderAppReports(el, openId) {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">דיווחי תקלות</h1></header>${skeleton('list', 4)}`;
  const { data, error } = await sb.from('dg_app_reports').select('id,created_at,user_id,role,body,status,fixed_in,profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(200);
  if (error) {
    el.querySelector('.sk').outerHTML = `<div class="oops" role="alert"><span class="oops-ic">${icon('alert', 28)}</span><b>${navigator.onLine ? 'הדיווחים לא נטענו' : 'אין קליטה כרגע'}</b><button class="btn primary" data-retry>${icon('sync', 18)} לנסות שוב</button></div>`;
    el.querySelector('[data-retry]').onclick = () => renderAppReports(el, openId);
    return;
  }
  const rows = data || [], un = await unreadMap(rows.map(r => r.id));
  const row = r => `<button type="button" class="lrow rprow${un[r.id] ? ' unread' : ''}" data-rep="${r.id}">
    <span class="grow"><b>${esc(r.body || 'דיווח מהמסך')}</b><small>${esc(r.profiles?.full_name || 'משתמש')} · ${timeAgo(r.created_at)}</small></span>
    ${un[r.id] ? `<span class="badge" aria-label="${un[r.id]} הודעות חדשות">${un[r.id]}</span>` : ''}${pill(r)}</button>`;
  const open = rows.filter(r => r.status === 'new' || r.status === 'triaged'), wait = rows.filter(r => r.status === 'fixed'), done = rows.filter(r => r.status === 'archived' || r.status === 'wontfix');
  el.querySelector('.sk').outerHTML = `<div class="stack lg">
    ${open.length ? `<div class="list">${open.map(row).join('')}</div>` : `<div class="ecta"><span class="ei ok">${icon('check', 28)}</span><b>אין דיווחים פתוחים</b></div>`}
    ${wait.length ? `<section class="stack"><h3 class="sh">ממתינים לאישור המדווח</h3><div class="list">${wait.map(row).join('')}</div></section>` : ''}
    ${done.length ? `<details class="fold"><summary><span class="sh">ארכיון</span><span class="count">${done.length}</span></summary><div class="list">${done.map(row).join('')}</div></details>` : ''}</div>`;
  const reload = () => renderAppReports(el);
  $$('[data-rep]', el).forEach(b => b.onclick = () => openThread(b.dataset.rep, { after: reload }));
  if (openId) openThread(openId, { after: reload });   // מהתראה (#/admin/reports/<id>)
}

// ---------- השרשור (שותף ומדווח, אותו חלון) ----------
export async function openThread(id, { after } = {}) {
  const [{ data: r, error }, { data: ms }] = await Promise.all([
    sb.from('dg_app_reports').select('*, profiles:user_id(full_name)').eq('id', id).maybeSingle(),
    sb.from('dg_app_report_msgs').select('id,created_at,author,side,kind,body,photo_path,video_path,fixed_in,profiles:author(full_name)').eq('report_id', id).order('created_at')]);
  if (error || !r) return toast('הדיווח לא נמצא');
  const msgs = ms || [], me = state.user.id, mine = r.user_id === me, partner = state.profile?.role === 'admin';
  sb.rpc('dg_report_seen', { p_id: id }).then(() => {}, () => {});
  const urls = await signedUrls('dg-reports', [r.shot_path, ...msgs.map(m => m.photo_path)].filter(Boolean), 3600);   // צילום של admin עלול להכיל ₪ — שעה
  const lastFix = [...msgs].reverse().find(m => m.kind === 'fix');
  const banner = r.status === 'fixed' && lastFix;   // "תוקן" בראש החלון — ההסבר והסרטון של התיקון האחרון, לא חוזרים בשרשור
  const who = m => m.side === 'reporter' ? (r.profiles?.full_name || 'המדווח') : (m.profiles?.full_name || 'הנהלה');
  const vid = m => m.video_path ? `<div class="rpvid sk" data-mvid="${m.id}"></div>` : '';
  const img = m => m.photo_path && urls[m.photo_path] ? `<img src="${esc(urls[m.photo_path])}" alt="תמונה" loading="lazy" data-zoom>` : '';
  const bubble = m => {
    if (m.kind === 'approve') return `<div class="rpsys">${icon('check', 16)} ${mine ? 'אישרת את התיקון' : esc(r.profiles?.full_name || 'המדווח') + ' אישר את התיקון'} · ${timeAgo(m.created_at)}</div>`;
    if (m.kind === 'fix') return `<div class="rpres rpfix"><b>תוקן${m.fixed_in ? ' ב-' + mono(m.fixed_in) : ''}</b>${m.body ? `<div>${txt(m.body)}</div>` : ''}${vid(m)}<small class="muted">${esc(who(m))} · ${timeAgo(m.created_at)}</small></div>`;
    return `<div class="msg ${m.author === me ? 'me' : ''}">${m.author === me ? '' : `<div class="who">${esc(who(m))}</div>`}${m.kind === 'reopen' ? '<span class="impl">עוד לא</span>' : ''}
      ${m.body ? `<div class="tx">${txt(m.body)}</div>` : ''}${img(m)}<div class="when">${timeAgo(m.created_at)}</div></div>`;
  };
  const head = mine ? 'הדיווח שלך' : esc(r.profiles?.full_name || 'משתמש');
  const orig = `<div class="rporig">${r.shot_path && urls[r.shot_path] ? `<img class="rpthumb" src="${esc(urls[r.shot_path])}" alt="צילום המסך" data-zoom>` : ''}
    <span class="grow stack tight"><span>${r.body ? txt(r.body) : 'דיווח מהמסך'}</span>
      ${partner && !mine ? `<small class="muted">${esc(ROLE_HE[r.role] || r.role || '')} · ${mono(r.route || '#/')}${r.sw_version ? ' · ' + mono(r.sw_version) : ''}</small><small class="muted">${devLine(r.device)}${+r.queue_n ? ` · ${+r.queue_n} ממתינים בתור` : ''}</small>` : ''}</span></div>
    ${partner && !mine ? errBlock(r.errors) : ''}`;
  const thread = msgs.filter(m => !(banner && m.id === lastFix.id));
  const canWrite = r.status !== 'archived' && !(mine && r.status === 'fixed');   // המדווח מול "תוקן": רק שני הכפתורים
  sheet(`<div class="rpth">
    <div class="row"><h3 class="sh grow">${head}</h3>${pill(r, mine)}</div>
    <small class="muted rpdate">${dm(r.created_at.slice(0, 10))}${mine && r.sw_version ? ' · ' + mono(r.sw_version) : ''}</small>
    ${banner ? `<div class="rpbanner"><div class="rpbig">${icon('check', 22)}<span>תוקן${lastFix.fixed_in ? ' ב-' + mono(lastFix.fixed_in) : ''}</span></div>
      ${lastFix.body ? `<div>${txt(lastFix.body)}</div>` : ''}${vid(lastFix)}
      ${mine ? `<div class="stack tight rpask"><button class="btn primary" id="rp-ok">${icon('check', 18)} מאשר, משביע רצון</button>
        <button class="btn ghost" id="rp-no">עוד לא / יש לי הצעה לשיפור</button>
        <div class="stack tight" id="rp-nobox" hidden><textarea id="rp-not" class="rpnot" rows="3" maxlength="1000" placeholder="מה עוד לא עובד, או מה להציע" aria-label="מה עוד לא עובד"></textarea>
          <button class="btn primary" id="rp-nosend" disabled>${icon('send', 18)} שליחה</button></div></div>`
        : `<small class="muted">ממתין לאישור של ${esc(r.profiles?.full_name || 'המדווח')}</small>`}</div>` : ''}
    ${orig}
    ${thread.length ? `<div class="chat rpchat">${thread.map(bubble).join('')}</div>` : ''}
    ${r.status === 'archived' ? `<div class="rpsys">הדיווח נסגר</div>` : ''}
    ${canWrite ? `<div class="rpcomp"><label class="cbtn" aria-label="צירוף תמונה">${icon('photo', 22)}<input type="file" accept="image/*" id="rp-f"></label>
      <textarea id="rp-t" rows="1" maxlength="1000" placeholder="${mine ? 'הוספה לדיווח…' : 'תשובה…'}" aria-label="הודעה"></textarea>
      <button class="cbtn send" id="rp-s" aria-label="שליחה">${icon('send', 20)}</button></div><div id="rp-pv" class="rppv" hidden></div>` : ''}
    ${partner && ['new', 'triaged'].includes(r.status) ? `<div class="row rpact">${r.status === 'new' ? '<button class="chip" data-st="triaged">בטיפול</button>' : ''}<button class="chip" data-st="wontfix">לא לטיפול</button><span class="grow"></span><button class="btn primary sm" data-st="fixed">תוקן</button></div>` : ''}
    <button class="btn ghost" data-close>סגירה</button></div>`, (s, close) => {
    const again = () => { close(); after?.(); setTimeout(() => openThread(id, { after }), 190); };
    $$('[data-zoom]', s).forEach(i => i.onclick = () => zoom(i.src, 'תמונה'));
    $$('[data-mvid]', s).forEach(async box => { const u = await videoUrl(id, box.dataset.mvid); if (!box.isConnected) return;
      box.outerHTML = u ? `<video class="rpvid" src="${esc(u)}" controls playsinline preload="metadata"></video>` : '<small class="muted">הסרטון לא נטען — נסו שוב מאוחר יותר</small>'; });
    // המדווח מול "תוקן"
    const ok = $('#rp-ok', s), no = $('#rp-no', s);
    if (ok) ok.onclick = async () => { if (ok.disabled) return; ok.disabled = true;
      const { error: e } = await sb.rpc('dg_report_approve', { p_id: id });
      if (e) { ok.disabled = false; return toast(errText(e)); }
      toast('תודה! הדיווח נסגר', 2400, 'success'); again(); };
    if (no) { const box = $('#rp-nobox', s), t = $('#rp-not', s), go = $('#rp-nosend', s);
      no.onclick = () => { box.hidden = false; no.hidden = true; if (ok) ok.hidden = true; t.focus(); };   // מצב אחד בכל רגע: או אישור או כתיבה
      t.oninput = () => go.disabled = t.value.trim().length < 2;
      go.onclick = async () => { if (go.disabled) return; go.disabled = true;
        const { error: e } = await sb.rpc('dg_report_reopen', { p_id: id, p_body: t.value.trim() });
        if (e) { go.disabled = false; return toast(errText(e)); }
        toast('נשלח · חזר לטיפול', 2400, 'success'); again(); }; }
    // הודעה + תמונה. התמונה עולה קודם (תיקיית המדווח), ורק אז ההודעה — שלא תהיה הודעה שמצביעה על קובץ חסר
    const f = $('#rp-f', s), t = $('#rp-t', s), send = $('#rp-s', s), pv = $('#rp-pv', s); let blob = null, pvUrl = null;
    if (t) t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; };
    if (f) f.onchange = async () => { const x = f.files[0]; f.value = ''; if (!x) return;
      try { const { shrink } = await import('../lib/store.js'); blob = await shrink(x); } catch { blob = x.type === 'image/jpeg' && x.size < 2e6 ? x : null; }
      if (!blob) return toast('התמונה לא נקלטה — נסו צילום אחר');
      if (pvUrl) URL.revokeObjectURL(pvUrl); pvUrl = URL.createObjectURL(blob);
      pv.hidden = false; pv.innerHTML = `<img src="${pvUrl}" alt="התמונה שתישלח"><button type="button" class="rpx" aria-label="בלי תמונה">${icon('x', 16)}</button>`;
      pv.querySelector('.rpx').onclick = () => { blob = null; pv.hidden = true; pv.innerHTML = ''; }; };
    if (send) send.onclick = async () => {
      const body = t.value.trim().slice(0, 1000) || null; if ((!body && !blob) || send.disabled) return;
      if (!navigator.onLine) return toast('אין קליטה — נסו שוב כשיש חיבור');
      send.disabled = true; const mid = uid(), path = blob ? `${r.user_id}/${mid}.jpg` : null;
      if (blob) { const { error: e1 } = await sb.storage.from('dg-reports').upload(path, blob, { contentType: 'image/jpeg' });
        if (e1) { send.disabled = false; return toast('התמונה לא עלתה — נסו שוב'); } }
      const { error: e } = await sb.from('dg_app_report_msgs').insert({ id: mid, report_id: id, body, photo_path: path });
      if (e) { send.disabled = false; return toast(errText(e)); }
      again(); };
    // שותף: מיון
    $$('[data-st]', s).forEach(b => b.onclick = async () => {
      if (b.disabled) return; const st = b.dataset.st;
      if (st === 'fixed') { close(); return fixSheet(r, () => { after?.(); openThread(id, { after }); }); }
      b.disabled = true;
      const { error: e } = await sb.from('dg_app_reports').update({ status: st }).eq('id', id);   // מי טיפל ומתי — נקבע בשרת
      if (e) { b.disabled = false; return toast(errText(e)); }
      toast('עודכן'); again(); });
  });
}

// סימון "תוקן": גרסה (ממולאת מהגרסה הנוכחית) · מה תוקן · סרטון הדגמה mp4 עד 15MB.
// הסרטון עולה קודם (קישור חתום מ-report-video), ורק אז עדכון אחד של הדיווח — השרת יוצר הודעת fix בשרשור, וההתראה יוצאת כשהמענה כבר שם.
async function fixSheet(r, after) {
  const v0 = await version();
  sheet(`<div class="stack tight"><h3 class="sh">תוקן</h3>${r.body ? `<small class="muted">${esc(r.body.slice(0, 90))}${r.body.length > 90 ? '…' : ''}</small>` : ''}</div>
    <label class="field">גרסה<input id="fx-v" value="${esc(v0)}" dir="ltr" autocomplete="off"></label>
    <label class="field">מה תוקן<textarea id="fx-r" rows="3" maxlength="1000" placeholder="במשפט אחד, כמו שהמדווח יבין"></textarea></label>
    <label class="field">סרטון הדגמה<input type="file" id="fx-f" accept="video/mp4"><small class="muted" id="fx-fh">mp4 עד 15MB</small></label>
    <small class="muted">המדווח יקבל הודעה, ויאשר או יכתוב מה עוד לא.</small>
    <div class="row-btns"><button class="btn ghost" data-close>חזרה</button><button class="btn primary" id="fx-ok">סימון תוקן</button></div>`, (s, close) => {
    const f = $('#fx-f', s), hint = $('#fx-fh', s), ok = $('#fx-ok', s);
    f.onchange = () => { const x = f.files[0]; if (!x) return hint.textContent = 'mp4 עד 15MB';
      const bad = x.type !== 'video/mp4' ? 'רק mp4' : x.size > MAXV ? `${(x.size / 1048576).toFixed(1)}MB — מעל 15MB` : '';
      hint.textContent = bad || `${(x.size / 1048576).toFixed(1)}MB`; hint.className = bad ? 'bad' : 'muted'; ok.disabled = !!bad; };
    ok.onclick = async () => { if (ok.disabled) return; ok.disabled = true;
      // כל "תוקן" הוא הודעה חדשה בשרשור: מענה וסרטון מתחילים ריקים (סרטון קודם נשאר בהודעה הקודמת)
      const patch = { status: 'fixed', fixed_in: $('#fx-v', s).value.trim() || null, resolution: $('#fx-r', s).value.trim() || null, fix_video: null }, x = f.files[0];
      if (x) { ok.textContent = 'מעלה סרטון…';
        const { data: up, error: e1 } = await sb.functions.invoke('report-video', { body: { action: 'upload', id: r.id } });
        const e2 = e1 || !up?.token ? e1 || 1 : (await sb.storage.from('dg-report-fix').uploadToSignedUrl(up.path, up.token, x, { contentType: 'video/mp4' })).error;
        if (e2) { ok.disabled = false; ok.textContent = 'סימון תוקן'; return toast('הסרטון לא עלה — נסו שוב או סמנו בלי סרטון', 5000); }
        patch.fix_video = up.path; }
      const { error } = await sb.from('dg_app_reports').update(patch).eq('id', r.id);
      if (error) { ok.disabled = false; ok.textContent = 'סימון תוקן'; return toast(errText(error)); }
      close(); toast('סומן תוקן · המדווח קיבל את המענה', 2600, 'success'); setTimeout(() => after?.(), 190); };
  });
}

// ---------- המדווח: "הדיווחים שלי" (#/myreports, כל מי שאינו admin) ----------
// מהתראה: #/requests/rep/<id> (notify) מועבר ל-#/myreports/<id>
export const openMyReport = (id, after) => openThread(id, { after });
const mineQ = () => sb.from('dg_app_reports').select('id,created_at,status,body,fixed_in').eq('user_id', state.user.id).order('created_at', { ascending: false });
const myRow = un => r => `<button type="button" class="lrow rprow${un[r.id] ? ' unread' : ''}" data-myrep="${r.id}"><span class="grow"><b>${esc(r.body || 'דיווח מהמסך')}</b><small>${timeAgo(r.created_at)}</small></span>
  ${un[r.id] ? `<span class="badge" aria-label="${un[r.id]} הודעות חדשות">${un[r.id]}</span>` : ''}${pill(r, true)}</button>`;

export async function renderMyReports(el, openId) {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">הדיווחים שלי</h1></header>${skeleton('list', 3)}`;
  const { data, error } = await mineQ().limit(60);
  if (!el.isConnected) return;
  if (error) {
    el.querySelector('.sk').outerHTML = `<div class="oops" role="alert"><span class="oops-ic">${icon(navigator.onLine ? 'alert' : 'sync', 28)}</span><b>${navigator.onLine ? 'הדיווחים לא נטענו' : 'אין קליטה כרגע'}</b><button class="btn primary" data-retry>${icon('sync', 18)} לנסות שוב</button></div>`;
    return;
  }
  const rows = data || [], un = await unreadMap(rows.map(r => r.id)), row = myRow(un);
  if (!el.isConnected) return;
  const wait = rows.filter(r => r.status === 'fixed'), open = rows.filter(r => r.status === 'new' || r.status === 'triaged'), done = rows.filter(r => r.status === 'archived' || r.status === 'wontfix');
  el.querySelector('.sk').outerHTML = `<div class="stack lg">
    ${wait.length ? `<section class="stack"><h3 class="sh">מחכים לאישור שלך</h3><div class="list">${wait.map(row).join('')}</div></section>` : ''}
    ${open.length ? `<section class="stack"><h3 class="sh">בטיפול</h3><div class="list">${open.map(row).join('')}</div></section>` : ''}
    ${done.length ? `<details class="fold"${wait.length || open.length ? '' : ' open'}><summary><span class="sh">נסגרו</span><span class="count">${done.length}</span></summary><div class="list">${done.map(row).join('')}</div></details>` : ''}
    ${rows.length ? '' : `<div class="ecta"><span class="ei ok">${icon('check', 28)}</span><b>אין דיווחים</b></div>`}</div>`;
  const reload = () => { if (el.isConnected) renderMyReports(el); };
  $$('[data-myrep]', el).forEach(b => b.onclick = () => openMyReport(b.dataset.myrep, reload));
  if (openId) openMyReport(openId, reload);
}

// לתפריט: האם יש לי דיווחים בכלל (null = לא ידוע: בלי קליטה / כשל)
export async function myReportsCount() {
  try { const { count, error } = await sb.from('dg_app_reports').select('id', { count: 'exact', head: true }).eq('user_id', state.user.id); return error ? null : count || 0; } catch { return null; }
}

// בבית: דיווח שתוקן ומחכה לאישור שלי. אחד = פותח אותו; כמה = לרשימה. כשל = כלום
export async function fixedHome(box) {
  if (!box) return;
  try {
    const { data, error } = await mineQ().eq('status', 'fixed').limit(10);
    if (!box.isConnected) return;
    if (error || !data?.length) { box.innerHTML = ''; return; }
    const one = data.length === 1 ? data[0] : null;
    const inner = `<span class="mic">${icon('check', 20)}</span><span class="grow"><b>${one ? 'תוקן, מחכה לאישור שלך' : `<bdi dir="ltr" class="rpmono">${data.length}</bdi> תיקונים מחכים לאישור שלך`}</b><small>${esc(one ? one.body || 'דיווח מהמסך' : data.map(r => r.body || 'דיווח מהמסך').join(' · '))}</small></span><span class="chev">${icon('chev', 18)}</span>`;
    box.innerHTML = one ? `<button type="button" class="promo repfix" data-fixrep="${one.id}">${inner}</button>` : `<a class="promo repfix" href="#/myreports">${inner}</a>`;
    const b = box.querySelector('[data-fixrep]'); if (b) b.onclick = () => openMyReport(b.dataset.fixrep, () => fixedHome(box));
  } catch { box.innerHTML = ''; }
}
