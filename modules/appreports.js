// דיווחי תקלות מהאפליקציה (#/admin/reports) — שותפים בלבד (RLS ב-db/151: dg_is_partner). המדווח רואה את שלו במסך הבקשות.
// מיון: חדש → בטיפול → תוקן (גרסה + מענה + סרטון הדגמה, המדווח מקבל הודעה) / לא לטיפול.
// מענה (db/156, אביחי 01/11): כל דיווח שטופל מקבל מענה בתוך הדיווח. סרטון: דלי פרטי dg-report-fix דרך הפונקציה report-video.
import { sb, state, $, $$, esc, icon, toast, backBtn, sheet, signedUrls, zoom, skeleton, ROLE_HE, timeAgo, dm } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const ST = { new: ['חדש', 'warn'], triaged: ['בטיפול', 'lime'], fixed: ['תוקן', 'ok'], wontfix: ['לא לטיפול', ''] };
const MAXV = 15 * 1024 * 1024;
const videoUrl = async id => { try { const { data, error } = await sb.functions.invoke('report-video', { body: { action: 'url', id } }); return error ? null : data?.url || null; } catch { return null; } };
const hms = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false }); } catch { return ''; } };
const mono = s => `<bdi dir="ltr" class="rpmono">${esc(s)}</bdi>`;
// device מגיע מהמדווח (jsonb חופשי): כל ערך עובר esc. לא מזהים HTML לפי "<" בתחילת מחרוזת (XSS מעובד לשותף, it-security 01/11)
const bdi = s => `<bdi>${esc(s)}</bdi>`;
const devLine = d => !d ? '' : [d.os && bdi(d.os), d.browser && bdi(d.browser), d.vw && mono(`${d.vw}×${d.vh}`), bdi(d.standalone ? 'מותקנת' : 'בדפדפן'), d.online === false ? bdi('בלי קליטה') : d.net && d.net !== '4g' ? mono(d.net) : null, d.desk ? bdi('מחשב') : null]
  .filter(Boolean).join(' · ');
const errBlock = e => Array.isArray(e) && e.length ? `<details class="fold rperrs"><summary><span class="sh">${e.length === 1 ? 'שגיאה אחת' : e.length + ' שגיאות'}</span></summary>
  <pre class="rperr" dir="ltr">${esc(e.map(x => `[${x.t ? hms(x.t) : ''} ${x.k || ''}${x.n > 1 ? ' ×' + x.n : ''}] ${x.what ? x.what + ' ' : ''}${x.m || ''}${x.r ? '  @' + x.r : ''}${x.at ? '\n   ' + x.at : ''}`).join('\n'))}</pre></details>` : '';

async function version() { try { const k = (await caches.keys()).find(x => x.startsWith('edrone-field-v')); return k ? 'v' + k.split('-v')[1] : ''; } catch { return ''; } }

export async function renderAppReports(el) {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">דיווחי תקלות</h1></header>${skeleton('list', 4)}`;
  const { data, error } = await sb.from('dg_app_reports').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(150);
  if (error) {
    el.querySelector('.sk').outerHTML = `<div class="oops" role="alert"><span class="oops-ic">${icon('alert', 28)}</span><b>${navigator.onLine ? 'הדיווחים לא נטענו' : 'אין קליטה כרגע'}</b><button class="btn primary" data-retry>${icon('sync', 18)} לנסות שוב</button></div>`;
    return;
  }
  const rows = data || [];
  const urls = await signedUrls('dg-reports', rows.map(r => r.shot_path).filter(Boolean), 3600);   // צילום של admin עלול להכיל ₪ — קישור לשעה
  const card = r => `<div class="card stack rpcard" data-id="${r.id}">
    <div class="row rphead">${r.shot_path && urls[r.shot_path] ? `<img class="rpthumb" src="${esc(urls[r.shot_path])}" alt="צילום המסך" loading="lazy">` : ''}
      <span class="grow"><b>${esc(r.profiles?.full_name || 'משתמש')}</b><small class="muted">${esc(ROLE_HE[r.role] || r.role || '')} · ${timeAgo(r.created_at)}</small>
        <small class="muted">${mono(r.route || '#/')}${r.sw_version ? ' · ' + mono(r.sw_version) : ''}</small></span>
      <span class="pill ${ST[r.status]?.[1] || ''}">${ST[r.status]?.[0] || esc(r.status)}${r.status === 'fixed' && r.fixed_in ? ' ' + mono(r.fixed_in) : ''}</span></div>
    ${r.body ? `<div>${esc(r.body).replace(/\n/g, '<br>')}</div>` : ''}
    <small class="muted">${devLine(r.device)}${+r.queue_n ? ` · ${+r.queue_n} ממתינים בתור` : ''}</small>
    ${r.resolution ? `<div class="rpres"><b>מענה</b> ${esc(r.resolution).replace(/\n/g, '<br>')}</div>` : ''}${r.fix_video ? `<button type="button" class="slink" data-vid="${r.id}">${icon('play', 16)} סרטון המענה</button>` : ''}
    ${errBlock(r.errors)}
    ${['new', 'triaged'].includes(r.status) ? `<div class="row">${r.status === 'new' ? `<button class="chip" data-st="triaged">בטיפול</button>` : ''}<button class="chip" data-st="wontfix">לא לטיפול</button><span class="grow"></span><button class="btn primary sm" data-st="fixed">תוקן</button></div>` : ''}
  </div>`;
  const open = rows.filter(r => r.status === 'new' || r.status === 'triaged'), closed = rows.filter(r => !open.includes(r));
  el.querySelector('.sk').outerHTML = `<div class="stack lg">
    ${open.length ? `<div class="stack">${open.map(card).join('')}</div>` : `<div class="ecta"><span class="ei ok">${icon('check', 28)}</span><b>אין דיווחים פתוחים</b></div>`}
    ${closed.length ? `<details class="fold"><summary><span class="sh">סגורים</span><span class="count">${closed.length}</span></summary><div class="stack">${closed.map(card).join('')}</div></details>` : ''}</div>`;
  $$('.rpthumb', el).forEach(i => i.onclick = () => zoom(i.src, 'צילום המסך'));
  $$('[data-vid]', el).forEach(b => b.onclick = async () => { const u = await videoUrl(b.dataset.vid); if (!u) return toast('הסרטון לא נטען'); playSheet(u); });
  $$('[data-st]', el).forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    const id = b.closest('[data-id]').dataset.id, st = b.dataset.st, patch = { status: st };   // מי טיפל ומתי — נקבע בשרת (טריגר)
    if (st === 'fixed') return fixSheet(rows.find(r => r.id === id), () => renderAppReports(el));
    b.disabled = true;
    const { error: e } = await sb.from('dg_app_reports').update(patch).eq('id', id);
    if (e) { b.disabled = false; return toast(errText(e)); }
    toast(st === 'fixed' ? 'סומן תוקן · המדווח יקבל הודעה' : 'עודכן'); renderAppReports(el);
  });
}

// סימון "תוקן": גרסה (ממולאת מהגרסה הנוכחית) · מה תוקן (המדווח רואה ומקבל את תחילתו בהתראה) · סרטון הדגמה mp4 עד 15MB.
// הסרטון עולה קודם (קישור חתום מ-report-video), ורק אז עדכון אחד של הדיווח — ההתראה יוצאת כשהמענה כבר שם.
async function fixSheet(r, after) {
  const v0 = await version();
  sheet(`<div class="stack tight"><h3 class="sh">תוקן</h3>${r.body ? `<small class="muted">${esc(r.body.slice(0, 90))}${r.body.length > 90 ? '…' : ''}</small>` : ''}</div>
    <label class="field">גרסה<input id="fx-v" value="${esc(v0)}" dir="ltr" autocomplete="off"></label>
    <label class="field">מה תוקן<textarea id="fx-r" rows="3" maxlength="1000" placeholder="במשפט אחד, כמו שהמדווח יבין">${esc(r.resolution || '')}</textarea></label>
    <label class="field">סרטון הדגמה<input type="file" id="fx-f" accept="video/mp4"><small class="muted" id="fx-fh">mp4 עד 15MB</small></label>
    <div class="row-btns"><button class="btn ghost" data-close>חזרה</button><button class="btn primary" id="fx-ok">סימון תוקן</button></div>`, (s, close) => {
    const f = $('#fx-f', s), hint = $('#fx-fh', s), ok = $('#fx-ok', s);
    f.onchange = () => { const x = f.files[0]; if (!x) return hint.textContent = 'mp4 עד 15MB';
      const bad = x.type !== 'video/mp4' ? 'רק mp4' : x.size > MAXV ? `${(x.size / 1048576).toFixed(1)}MB — מעל 15MB` : '';
      hint.textContent = bad || `${(x.size / 1048576).toFixed(1)}MB`; hint.className = bad ? 'bad' : 'muted'; ok.disabled = !!bad; };
    ok.onclick = async () => { if (ok.disabled) return; ok.disabled = true;
      const patch = { status: 'fixed', fixed_in: $('#fx-v', s).value.trim() || null, resolution: $('#fx-r', s).value.trim() || null }, x = f.files[0];
      if (x) { ok.textContent = 'מעלה סרטון…';
        const { data: up, error: e1 } = await sb.functions.invoke('report-video', { body: { action: 'upload', id: r.id } });
        const e2 = e1 || !up?.token ? e1 || 1 : (await sb.storage.from('dg-report-fix').uploadToSignedUrl(up.path, up.token, x, { contentType: 'video/mp4' })).error;
        if (e2) { ok.disabled = false; ok.textContent = 'סימון תוקן'; return toast('הסרטון לא עלה — נסו שוב או סמנו בלי סרטון', 5000); }
        patch.fix_video = up.path; }
      const { error } = await sb.from('dg_app_reports').update(patch).eq('id', r.id);
      if (error) { ok.disabled = false; ok.textContent = 'סימון תוקן'; return toast(errText(error)); }
      close(); toast('סומן תוקן · המדווח קיבל את המענה', 2600, 'success'); after?.(); };
  });
}
const playSheet = u => sheet(`<video class="rpvid" src="${esc(u)}" controls playsinline autoplay preload="metadata"></video><button class="btn ghost" data-close>סגירה</button>`);

// המדווח: לחיצה על דיווח → מה כתב, סטטוס, גרסה, המענה והסרטון (קישור חתום). גם מהתראת "תוקן" (#/requests/rep/<id>)
export async function openMyReport(id) {
  const { data: r, error } = await sb.from('dg_app_reports').select('id,created_at,status,body,route,sw_version,fixed_in,resolution,fix_video').eq('id', id).maybeSingle();
  if (error || !r) return toast('הדיווח לא נמצא');
  const st = r.status === 'fixed' ? ['תוקן' + (r.fixed_in ? ' ב-' + mono(r.fixed_in) : ''), 'ok'] : r.status === 'wontfix' ? ['נבדק', ''] : r.status === 'triaged' ? ['בטיפול', 'lime'] : ['התקבל', ''];
  sheet(`<div class="stack tight"><h3 class="sh">הדיווח שלך</h3><small class="muted">${dm(r.created_at.slice(0, 10))}${r.sw_version ? ' · ' + mono(r.sw_version) : ''}</small></div>
    <div class="row"><span class="grow">${r.body ? esc(r.body).replace(/\n/g, '<br>') : 'דיווח מהמסך'}</span><span class="pill ${st[1]}">${st[0]}</span></div>
    ${r.resolution ? `<div class="rpres"><b>מה תוקן</b><div>${esc(r.resolution).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${r.fix_video ? '<div id="rp-v" class="rpvid sk"></div>' : ''}
    <button class="btn ghost" data-close>סגירה</button>`, async s => {
    if (!r.fix_video) return;
    const u = await videoUrl(r.id), box = $('#rp-v', s); if (!box) return;
    box.outerHTML = u ? `<video class="rpvid" src="${esc(u)}" controls playsinline preload="metadata"></video>` : '<small class="muted">הסרטון לא נטען — נסו שוב מאוחר יותר</small>';
  });
}
let bound = false;

// "הדיווחים שלי" — בתחתית מסך הבקשות, רק כשיש (30 יום). כשל = לא מציגים כלום
export async function myReports() {
  try {
    if (!bound) { bound = true; document.addEventListener('click', e => { const b = e.target.closest?.('[data-myrep]'); if (b) openMyReport(b.dataset.myrep); }); }
    const { data, error } = await sb.from('dg_app_reports').select('id,created_at,status,body,route,fixed_in,resolution,fix_video').eq('user_id', state.user.id)
      .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(10);
    if (error || !data?.length) return '';
    return `<section><h3 class="sh">בעיות שדיווחתי</h3><div class="list">${data.map(r => `<button type="button" class="lrow" data-myrep="${r.id}"><span class="grow"><b>${esc(r.body || 'דיווח מהמסך')}</b><small>${timeAgo(r.created_at)}${r.resolution || r.fix_video ? ' · יש מענה' : ''}</small></span>
      <span class="pill ${r.status === 'fixed' ? 'ok' : ''}">${r.status === 'fixed' ? 'תוקן' + (r.fixed_in ? ' ב-' + mono(r.fixed_in) : '') : r.status === 'wontfix' ? 'נבדק' : 'התקבל'}</span></button>`).join('')}</div></section>`;
  } catch { return ''; }
}
