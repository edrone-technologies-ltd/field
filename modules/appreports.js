// דיווחי תקלות מהאפליקציה (#/admin/reports) — שותפים בלבד (RLS ב-db/151: dg_is_partner). המדווח רואה את שלו במסך הבקשות.
// מיון: חדש → בטיפול → תוקן (עם גרסה, המדווח מקבל הודעה) / לא לטיפול.
import { sb, state, $$, esc, icon, toast, backBtn, ask, signedUrls, zoom, skeleton, ROLE_HE, timeAgo } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const ST = { new: ['חדש', 'warn'], triaged: ['בטיפול', 'lime'], fixed: ['תוקן', 'ok'], wontfix: ['לא לטיפול', ''] };
const hms = iso => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false }); } catch { return ''; } };
const mono = s => `<bdi dir="ltr" class="rpmono">${esc(s)}</bdi>`;
const devLine = d => !d ? '' : [d.os, d.browser, d.vw && mono(`${d.vw}×${d.vh}`), d.standalone ? 'מותקנת' : 'בדפדפן', d.online === false ? 'בלי קליטה' : d.net && d.net !== '4g' ? mono(d.net) : null, d.desk ? 'מחשב' : null]
  .filter(Boolean).map(x => /^</.test(x) ? x : `<bdi>${esc(x)}</bdi>`).join(' · ');
const errBlock = e => (e || []).length ? `<details class="fold rperrs"><summary><span class="sh">${e.length === 1 ? 'שגיאה אחת' : e.length + ' שגיאות'}</span></summary>
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
    <small class="muted">${devLine(r.device)}${r.queue_n ? ` · ${r.queue_n} ממתינים בתור` : ''}</small>
    ${errBlock(r.errors)}
    ${['new', 'triaged'].includes(r.status) ? `<div class="row">${r.status === 'new' ? `<button class="chip" data-st="triaged">בטיפול</button>` : ''}<button class="chip" data-st="wontfix">לא לטיפול</button><span class="grow"></span><button class="btn primary sm" data-st="fixed">תוקן</button></div>` : ''}
  </div>`;
  const open = rows.filter(r => r.status === 'new' || r.status === 'triaged'), closed = rows.filter(r => !open.includes(r));
  el.querySelector('.sk').outerHTML = `<div class="stack lg">
    ${open.length ? `<div class="stack">${open.map(card).join('')}</div>` : `<div class="ecta"><span class="ei ok">${icon('check', 28)}</span><b>אין דיווחים פתוחים</b></div>`}
    ${closed.length ? `<details class="fold"><summary><span class="sh">סגורים</span><span class="count">${closed.length}</span></summary><div class="stack">${closed.map(card).join('')}</div></details>` : ''}</div>`;
  $$('.rpthumb', el).forEach(i => i.onclick = () => zoom(i.src, 'צילום המסך'));
  $$('[data-st]', el).forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    const id = b.closest('[data-id]').dataset.id, st = b.dataset.st, patch = { status: st };   // מי טיפל ומתי — נקבע בשרת (טריגר)
    if (st === 'fixed') { const v = await ask('תוקן בגרסה', { value: await version(), ok: 'סימון תוקן', optional: true }); if (v == null) return; patch.fixed_in = v || null; }
    b.disabled = true;
    const { error: e } = await sb.from('dg_app_reports').update(patch).eq('id', id);
    if (e) { b.disabled = false; return toast(errText(e)); }
    toast(st === 'fixed' ? 'סומן תוקן · המדווח יקבל הודעה' : 'עודכן'); renderAppReports(el);
  });
}

// "הדיווחים שלי" — בתחתית מסך הבקשות, רק כשיש (30 יום). כשל = לא מציגים כלום
export async function myReports() {
  try {
    const { data, error } = await sb.from('dg_app_reports').select('id,created_at,status,body,route,fixed_in').eq('user_id', state.user.id)
      .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(10);
    if (error || !data?.length) return '';
    return `<section><h3 class="sh">בעיות שדיווחתי</h3><div class="list">${data.map(r => `<div class="lrow"><span class="grow"><b>${esc(r.body || 'דיווח מהמסך')}</b><small>${timeAgo(r.created_at)}</small></span>
      <span class="pill ${r.status === 'fixed' ? 'ok' : ''}">${r.status === 'fixed' ? 'תוקן' + (r.fixed_in ? ' ב-' + mono(r.fixed_in) : '') : r.status === 'wontfix' ? 'נבדק' : 'התקבל'}</span></div>`).join('')}</div></section>`;
  } catch { return ''; }
}
