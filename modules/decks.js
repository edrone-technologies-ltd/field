// מצגות (שותפים בלבד — admin = אביחי, טל, גל): קישור אישי לכל נמען, מי פתח, מתי, כמה זמן ועד איזה שקף.
// נתונים: dg_decks / dg_deck_link_summary / dg_deck_sessions (שכבת הדיגיטל, edrone-digital/db/d001). אירועים נקלטים ב-edge function track.
// הקישור נשלח ע"י השותף בעצמו (העתקה / וואטסאפ) — האפליקציה לא שולחת כלום ללקוח.
import { sb, state, $, $$, esc, backBtn, icon, sheet, toast, timeAgo } from '../lib/core.js';

const SITE = 'https://edrone.pages.dev';
const url = l => `${SITE}/p/${l.deck_slug}/?r=${l.token}`;
const dur = s => { s = Math.round(s || 0); if (s < 60) return `${s} שנ׳`; const m = Math.floor(s / 60); return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')} דק׳` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שע׳`; };
const when = iso => new Date(iso).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const ltr = t => `<bdi dir="ltr">${t}</bdi>`;

// עיצוב מקומי למסך (לא נוגעים ב-styles.css המשותף)
function css() {
  if ($('#dk-css')) return;
  const st = document.createElement('style'); st.id = 'dk-css';
  st.textContent = `
.dk-row{cursor:pointer;text-align:start;width:100%;font:inherit}
.dk-row .grow small{display:block;color:var(--muted);font-size:.8rem;margin-top:2px}
.dk-prog{display:block;height:5px;border-radius:3px;background:var(--line);margin-top:7px;overflow:hidden;max-width:220px}
.dk-prog i{display:block;height:100%;background:var(--lime);border-radius:3px}
.dk-time{font-family:var(--f-display);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.dk-heat{display:flex;align-items:flex-end;gap:3px;height:96px;padding:6px 0 0}   /* שקף 1 מימין — כמו כיוון המצגת */
.dk-fw{color:var(--warn);font-weight:700}
.dk-heat div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;min-width:0}
.dk-heat i{display:block;width:100%;background:var(--lime);border-radius:3px 3px 0 0;min-height:2px;opacity:.9}
.dk-heat i.z{background:var(--line)}
.dk-heat small{font-size:.66rem;color:var(--muted);font-variant-numeric:tabular-nums}
.dk-link{display:block;direction:ltr;text-align:left;font-family:ui-monospace,monospace;font-size:.8rem;padding:10px 12px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);word-break:break-all;user-select:all}
.dk-ses{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)}
.dk-ses:last-child{border-bottom:0}
@media (min-width:1100px){.dk-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:22px;align-items:start}}`;
  document.head.appendChild(st);
}

const status = l => l.revoked_at ? '<span class="pill">בוטל</span>' : !l.sessions ? '<span class="pill">לא נפתח</span>'
  : l.sessions > 1 ? `<span class="pill ok">נפתח ×${l.sessions}</span>` : '<span class="pill ok">נפתח</span>';

function row(l) {
  const pct = l.pct_reached || 0;
  return `<button class="lrow dk-row" data-l="${l.id}">
    <span class="grow"><b>${esc(l.recipient_name)}</b>${l.internal ? ' <span class="pill">בדיקה</span>' : ''}
      <small>${[l.recipient_org && esc(l.recipient_org), l.last_open_at ? 'פעם אחרונה ' + timeAgo(l.last_open_at) : 'נוצר ' + timeAgo(l.created_at),
        l.devices > 1 ? `<span class="dk-fw">${l.devices} מכשירים — ייתכן שהועבר</span>` : ''].filter(Boolean).join(' · ')}</small>
      ${l.sessions ? `<span class="dk-prog" title="עד שקף ${l.max_slide} מתוך ${l.deck_slides || '?'}"><i style="width:${pct}%"></i></span>` : ''}</span>
    ${l.sessions ? `<span class="dk-time">${dur(l.active_sec)}</span>` : ''}${status(l)}</button>`;
}

export async function renderDecks(el, linkId = '') {
  if (state.profile.role !== 'admin') { el.innerHTML = '<div class="empty-line">לשותפים בלבד</div>'; return; }
  css();
  const head = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">מצגות</h1><button class="btn primary" id="dk-new" style="min-height:44px">${icon('plus', 18)} קישור לנמען</button></header>`;
  el.innerHTML = head + '<div class="skel tall"></div>';
  const [{ data: D, error }, { data: L }] = await Promise.all([
    sb.from('dg_decks').select('slug,title,client,slides,archived_at').is('archived_at', null).order('created_at', { ascending: false }),
    sb.from('dg_deck_link_summary').select('*').order('created_at', { ascending: false })]);
  if (error) { el.innerHTML = head + '<div class="empty-line">הנתונים לא נטענו — נסו שוב</div>'; return; }
  const decks = D || [], links = L || [];
  // מי שנפתח לאחרונה למעלה; לא נפתח — לפי מועד יצירה
  links.sort((a, b) => (b.last_open_at || '').localeCompare(a.last_open_at || '') || b.created_at.localeCompare(a.created_at));
  const opened = links.filter(l => l.sessions && !l.internal), live = links.filter(l => !l.revoked_at);
  el.innerHTML = head + `<div class="stack lg">
    ${live.length ? `<div class="kpis"><div class="kpi"><b>${live.filter(l => !l.internal).length}</b><span>נמענים</span></div><div class="kpi"><b>${opened.length}</b><span>פתחו</span></div><div class="kpi"><b>${dur(opened.reduce((s, l) => s + l.active_sec, 0))}</b><span>זמן צפייה</span></div></div>` : ''}
    ${decks.map(d => { const ls = links.filter(l => l.deck_slug === d.slug);
      return `<section class="stack"><div class="sh-row"><h3 class="sh">${esc(d.title)}</h3><button class="chip" data-new="${esc(d.slug)}">${icon('plus', 15)} נמען</button></div>
        ${ls.length ? `<div class="list">${ls.map(row).join('')}</div>` : `<button class="empty-card" data-new="${esc(d.slug)}" style="width:100%;font:inherit;cursor:pointer;color:inherit"><span class="ei">${icon('send', 24)}</span><span class="grow" style="text-align:start"><b>עוד לא נשלח לאף אחד</b></span></button>`}</section>`; }).join('')}
  </div>`;
  $('#dk-new').onclick = () => newLink(decks, decks[0]?.slug, () => renderDecks(el));
  $$('[data-new]', el).forEach(b => b.onclick = () => newLink(decks, b.dataset.new, () => renderDecks(el)));
  $$('[data-l]', el).forEach(b => b.onclick = () => detail(links.find(l => l.id === b.dataset.l), () => renderDecks(el)));
  // מהתראה: #/decks/<link_id> פותח ישר את הנמען
  if (linkId) { const l = links.find(x => x.id === linkId); if (l) detail(l, () => renderDecks(el)); }
}

// יצירת קישור: שם חובה, השאר רשות. הטוקן נוצר בשרת (dg_create_link).
async function newLink(decks, slug, done) {
  if (!decks.length) return toast('אין מצגת רשומה');
  const { data: leads } = await sb.from('sites').select('name,monday_lead_id').eq('kind', 'lead').not('monday_lead_id', 'is', null).is('merged_into', null).order('name');
  let deck = slug || decks[0].slug, internal = false;
  sheet(`<h3>קישור אישי לנמען</h3>
    ${decks.length > 1 ? `<div class="field">מצגת<div class="chips">${decks.map(d => `<button type="button" class="chip" data-d="${esc(d.slug)}" aria-pressed="${d.slug === deck}">${esc(d.title)}</button>`).join('')}</div></div>` : `<div class="small muted">${esc(decks[0].title)}</div>`}
    <label class="field">שם הנמען<input id="dk-n" autocomplete="off" placeholder="למשל: יוסי כהן"></label>
    <label class="field">ארגון<input id="dk-o" autocomplete="off"></label>
    <label class="field">ליד<input id="dk-lead" list="dk-leads" autocomplete="off" placeholder="לא חובה"><datalist id="dk-leads">${(leads || []).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
    <div class="chips"><button type="button" class="chip" id="dk-int" aria-pressed="false">בדיקה פנימית — בלי התראה</button></div>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="dk-go">יצירת קישור</button></div>`, (s, close) => {
    $$('[data-d]', s).forEach(c => c.onclick = () => { deck = c.dataset.d; $$('[data-d]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#dk-int', s).onclick = e => { internal = !internal; e.currentTarget.setAttribute('aria-pressed', internal); };
    setTimeout(() => $('#dk-n', s)?.focus(), 250);
    $('#dk-go', s).onclick = async () => {
      const name = $('#dk-n', s).value.trim(); if (!name) return toast('למי הקישור?');
      const go = $('#dk-go', s); if (go.disabled) return; go.disabled = true;
      const lead = (leads || []).find(x => x.name === $('#dk-lead', s).value.trim());
      const { data, error } = await sb.rpc('dg_create_link', { p_deck: deck, p_name: name, p_org: $('#dk-o', s).value.trim() || null, p_lead: lead?.monday_lead_id || null, p_internal: internal });
      if (error) { go.disabled = false; return toast('הקישור לא נוצר — נסו שוב'); }
      close(); done && done(); setTimeout(() => share(data), 220);
    };
  });
}

// שליחה: העתקה או וואטסאפ — השותף שולח בעצמו
function share(l) {
  const u = url(l), first = (l.recipient_name || '').split(' ')[0];
  const msg = `שלום ${first}, מצורפת המצגת של E-Drone:\n${u}`;
  sheet(`<h3>הקישור של ${esc(l.recipient_name)}</h3><span class="dk-link">${esc(u)}</span>
    <div class="row"><button class="btn ghost grow" id="dk-cp">${icon('file', 18)} העתקה</button><a class="btn primary grow" id="dk-wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon('send', 18)} וואטסאפ</a></div>`, (s, close) => {
    $('#dk-cp', s).onclick = async () => { try { await navigator.clipboard.writeText(u); toast('הועתק'); close(); } catch { toast('לא הועתק — סמנו את הקישור'); } };
    $('#dk-wa', s).onclick = () => setTimeout(close, 300);
  });
}

async function detail(l, refresh) {
  if (!l) return;
  const { data: S } = await sb.from('dg_deck_sessions').select('started_at,last_seen_at,active_sec,max_slide,slides,device,internal').eq('link_id', l.id).order('started_at', { ascending: false }).limit(50);
  const ses = S || [], n = l.deck_slides || Math.max(1, ...ses.map(x => x.max_slide));
  // מפת חום: שניות לכל שקף, מצטבר על כל הביקורים
  const sum = Array.from({ length: n }, (_, i) => ses.reduce((t, x) => t + (+(x.slides || {})[i + 1] || 0), 0)), mx = Math.max(1, ...sum);
  const top = sum.map((v, i) => [v, i + 1]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 2);
  sheet(`<h3>${esc(l.recipient_name)}${l.recipient_org ? ` <span class="muted small">· ${esc(l.recipient_org)}</span>` : ''}</h3>
    <div class="small muted">${esc(l.deck_title)} · ${status(l)}</div>
    ${l.sessions ? `<div class="kpis"><div class="kpi"><b>${l.sessions}</b><span>ביקורים</span></div><div class="kpi"><b>${dur(l.active_sec)}</b><span>זמן צפייה</span></div><div class="kpi"><b>${ltr(`${l.max_slide || 0}/${n}`)}</b><span>שקפים</span></div></div>
      <section class="stack"><h3 class="sh">איפה התעכב</h3>
        <div class="dk-heat">${sum.map((v, i) => `<div title="שקף ${i + 1}: ${dur(v)}"><i class="${v ? '' : 'z'}" style="height:${Math.round(v / mx * 100)}%"></i><small>${i + 1}</small></div>`).join('')}</div>
        ${top.length ? `<div class="small muted">הכי הרבה: ${top.map(([v, i]) => `שקף ${i} (${dur(v)})`).join(' · ')}</div>` : ''}</section>
      <section class="stack"><h3 class="sh">ביקורים</h3><div>${ses.map(x => `<div class="dk-ses"><b class="grow">${when(x.started_at)}</b><span class="small muted">${esc(x.device || '')}</span><span class="dk-time">${dur(x.active_sec)}</span><span class="small muted">${ltr(`${x.max_slide}/${n}`)}</span></div>`).join('')}</div></section>`
      : `<div class="empty-line">עוד לא נפתח</div>`}
    <div class="row"><button class="btn ghost grow" id="dk-sh">${icon('send', 18)} שליחה שוב</button>${l.revoked_at ? '' : `<button class="btn ghost grow" id="dk-rv">ביטול הקישור</button>`}</div>`, (s, close) => {
    $('#dk-sh', s).onclick = () => { close(); setTimeout(() => share(l), 220); };
    const rv = $('#dk-rv', s); if (rv) rv.onclick = async () => {
      if (rv.dataset.ok !== '1') { rv.dataset.ok = '1'; rv.textContent = 'לבטל? הקישור יפסיק להיספר'; return; }
      const { error } = await sb.from('dg_deck_links').update({ revoked_at: new Date().toISOString() }).eq('id', l.id);
      if (error) return toast('לא בוטל — נסו שוב'); close(); toast('הקישור בוטל'); refresh && refresh();
    };
  });
}
