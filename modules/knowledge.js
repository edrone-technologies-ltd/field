// מרכז ידע: הדרכות "איך מתפעלים" — סרטון (קישור דרייב/יוטיוב שמתנגן בפנים), הסבר, מסמכים.
// בחינם: סרטונים לא נשמרים בשרת שלנו (רק קישור). לשרת עולים רק PDF ותמונות עד 10MB.
// "צפיתי והבנתי" = מעקב הדרכה; פריט "חובה" מופיע בבית לכל מי שעוד לא אישר.
import { sb, state, isManager, can, sheet, icon, $, $$, esc, toast, confirmBox, signedUrls, backBtn, initials, replaceHash, goUp, zoom } from '../lib/core.js';
import { mon } from '../lib/core.js';
import { errText } from '../lib/audit.js';
import { shareIcon, shareLink, shareFile, kbShareUrl, ogIndex } from '../lib/share.js';

// קהלי יעד: ריק = כולם. מנהלים רואים הכל תמיד
const AUD = [['pilot', 'מטיסים'], ['operator', 'מפעילי מערכות'], ['crew_lead', 'ראשי צוות'], ['crew', 'כל צוות השטח'], ['surveyor', 'סוקר'], ['ops_manager', 'הנהלה ותפעול']];
const audTxt = r => !r?.length ? '' : r.map(x => (AUD.find(a => a[0] === x) || [, x])[1]).join(', ');
// תוקף: אישור/מעבר/חתימה בתוך חודשי התוקף (אם הוגדרו)
const until = (at, m) => !at ? null : m ? new Date(new Date(at).setMonth(new Date(at).getMonth() + m)) : new Date(8.64e15);
export let PUSH_ON = false;
export const kbDone = (x, v) => { if (x.auto_done === 'push' && PUSH_ON) return true; if (!v) return false;
  const need = [x.quiz ? v.passed_at : v.confirmed_at, x.sign_required ? v.signed_at : true];
  return need.every(a => a === true || (a && until(a, x.cert_months) > new Date())); };
const fmtD = d => d.getFullYear() > 9000 ? 'ללא הגבלה' : d.toLocaleDateString('he-IL');
const isImg = f => /\.(jpe?g|png|webp)$/i.test(f.name || f.path);
const ytId = u => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/) || [])[1];
const driveId = u => (u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/) || [])[1];
export const embedUrl = u => !u ? null : ytId(u) ? `https://www.youtube-nocookie.com/embed/${ytId(u)}` : driveId(u) ? `https://drive.google.com/file/d/${driveId(u)}/preview` : null;
const cats = async () => { try { const { data } = await sb.from('app_settings').select('value').eq('key', 'kb_categories').maybeSingle(); return data?.value || []; } catch { return []; } };

export async function renderKb(el, cat = '') {
  try { const { pushState } = await import('../lib/core.js'); PUSH_ON = (await pushState()) === 'on'; } catch { /* */ }
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">מרכז ידע</h1></header><div class="skel"></div>`;
  const [{ data: items }, { data: views }, C] = await Promise.all([
    sb.from('kb_items').select('id,title,category,body,video_url,files,required,sort,updated_at,roles,quiz,sign_required,cert_months,cert_required,auto_done').order('sort').order('title'),
    sb.from('kb_views').select('item_id,confirmed_at,passed_at,signed_at').eq('user_id', state.user.id), cats()]);
  const seen = new Map((views || []).map(v => [v.item_id, v]));
  const all = items || [], M = isManager();
  const todo = all.filter(x => (x.required || (x.cert_required && ['crew', 'crew_lead'].includes(state.profile.role))) && !kbDone(x, seen.get(x.id)));
  const used = [...new Set([...C, ...all.map(x => x.category)])].filter(c => all.some(x => x.category === c) || GUIDES.some(g => g.cat === c));
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1 class="grow">מרכז ידע</h1>${M ? `<button class="hbtn" id="kbnew" aria-label="הדרכה חדשה">${icon('plus', 20)}</button>` : ''}</header>
    <div class="stack lg">
      ${cat ? '' : quickRail(all)}
      <input class="search" id="kbq" type="search" placeholder="חיפוש: משאבה, סוללות, סיכום היום…">
      ${used.length > 1 ? `<div class="chips scroll">${['', ...used].map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${c === cat}">${c || 'הכל'}</button>`).join('')}</div>` : ''}
      ${todo.length ? `<section><div class="sh-row"><h3 class="sh">לצפייה — חובה</h3><span class="count">${todo.length}</span></div><div class="list">${todo.map(row).join('')}</div></section>` : ''}
      <div id="kbl" class="stack lg"></div>
    </div>`;
  function row(x) {
    const v = seen.get(x.id), kind = x.video_url ? 'play' : (x.files || []).length ? 'file' : 'report';
    return `<a class="item kb" href="#/kb/${x.id}" data-q="${esc((x.title + ' ' + (x.body || '') + ' ' + x.category).toLowerCase())}"><span class="kbic ${x.video_url ? 'vid' : ''}${ytThumb(x.video_url) ? ' th' : ''}"${ytThumb(x.video_url) ? ` style="--th:url('${esc(ytThumb(x.video_url))}')"` : ''}>${kind === 'play' ? '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>' : icon(kind, 20)}</span>
      <span class="t"><b>${esc(x.title)}</b><small>${esc([x.video_url ? 'סרטון' : 'מדריך', M && x.roles?.length ? audTxt(x.roles) : null].filter(Boolean).join(' · '))}</small></span>
      ${kbDone(x, v) ? `<span class="pill ok" aria-label="הושלם">${icon('check', 16)}</span>` : x.quiz ? '<span class="pill warn">מבחן</span>' : x.sign_required ? '<span class="pill warn">חתימה</span>' : !v && (x.required || x.cert_required) ? '<span class="newdot" title="חדש" aria-label="חדש"></span>' : ''}</a>`;
  }
  const draw = () => {
    const q = $('#kbq').value.trim().toLowerCase();
    const list = all.filter(x => (q || !todo.includes(x)) && (!cat || x.category === cat) && (!q || (x.title + ' ' + (x.body || '') + ' ' + x.category).toLowerCase().includes(q)));
    // מדריך פתיחה לקטגוריה שעוד אין בה הדרכה (נעלם לבד כשנוספת הדרכה אמיתית)
    const starters = GUIDES.filter(g => !all.some(x => x.category === g.cat) && (!cat || g.cat === cat) && (!q || (g.t + ' ' + g.sub + ' ' + g.cat + ' ' + g.cards.map(c => c.t + ' ' + c.items.join(' ')).join(' ')).toLowerCase().includes(q)));
    const groups = [...new Set([...list.map(x => x.category), ...starters.map(g => g.cat)])];
    $('#kbl').innerHTML = groups.map(g => `<section><h3 class="sh">${esc(g)}</h3><div class="list">${list.filter(x => x.category === g).map(row).join('')}${starters.filter(x => x.cat === g).map(guideRow).join('')}</div></section>`).join('')
      || `<div class="empty-line">${all.length ? 'לא נמצא' : 'אין הדרכות'}</div>`;
  };
  $('#kbq').oninput = draw;
  $$('[data-c]', el).forEach(b => b.onclick = () => replaceHash('#/kb' + (b.dataset.c ? '/c/' + encodeURIComponent(b.dataset.c) : '')));
  const n = $('#kbnew'); if (n) n.onclick = () => editKb(null, C);
  bindQuick(el);
  draw();
}

// ---------- מדריכים מהירים: החלקות ויזואליות + "מסלול עבודה" + מה שמיועד לתפקיד שלי ----------
const mineRole = x => x.roles?.length && (x.roles.includes(state.profile.role) || x.roles.includes(state.profile.field_role) || (isManager() && x.roles.includes('ops_manager')));
const ytThumb = u => ytId(u || '') ? `https://i.ytimg.com/vi/${ytId(u)}/mqdefault.jpg` : '';
function quickRail(all) {
  const built = [['flow', 'map', 'מסלול עבודה', 'מליד ועד חתימת לקוח', 'a'], ['do', 'play', 'מה עושים כאן', '3 החלקות', 'b'], ['setup', 'chat', 'התקנה והתראות', 'דקה אחת', 'c']];
  const mine = all.filter(mineRole).slice(0, 6);
  return `<div class="kbrail scroll-x">${built.map(([k, ic, t, s, c]) => `<button class="kbq kbq-${c}" data-qk="${k}"><span class="kbq-ic">${icon(ic, 22)}</span><b>${t}</b><small>${s}</small></button>`).join('')}
    ${mine.map(x => `<a class="kbq kbq-i" href="#/kb/${x.id}"${ytThumb(x.video_url) ? ` style="--th:url('${esc(ytThumb(x.video_url))}')"` : ''}><span class="kbq-ic">${icon(x.video_url ? 'play' : 'book', 20)}</span><b>${esc(x.title)}</b><small>בשבילך</small></a>`).join('')}</div>`;
}
function bindQuick(el) {
  $$('[data-qk]', el).forEach(b => b.onclick = async () => {
    const k = b.dataset.qk; if (k === 'flow') { location.hash = '#/kb/flow'; return; }
    const w = await import('./welcome.js');
    if (k === 'do') w.play(w.storiesFor().map(x => ({ ...x, btn: 'הבא' })).concat([{ k: 'end', art: `<div class="wl-big ok">${icon('check', 52)}</div>`, t: 'זהו', btn: 'סגירה', end: true }]), { label: 'מה עושים כאן' });
    else w.playSetup();
  });
}

// מסלול עבודה של שטיפת חזיתות מקצה לקצה — כל שלב מפנה למסך שבו הוא קורה (לפי הרשאות) ולהדרכות הרלוונטיות
const FLOW = [
  { ic: 'pin', t: 'ליד ואפיון', s: 'סיור באתר, חזיתות, גישה ומים', href: '#/specs', ok: () => can('specs'), kb: [] },
  { ic: 'clipboard', t: 'תכנית עבודה', s: 'ימי עבודה לפי חזית, צוות וציוד', href: '#/projects', ok: () => can('projects') && isManager(), kb: [] },
  { ic: 'calendar', t: 'שיבוץ', s: 'צוות, רחפן ותאריך — הצוות מאשר הגעה', href: '#/schedule', ok: () => true, kb: [] },
  { ic: 'drone', t: 'הכנה', s: 'ציוד, מים וחומרים, מזג אוויר, מרחב אווירי', href: '#/weather', ok: () => true, kb: ['רחפנים', 'מערכת שטיפה ומשאבות', 'חומרים וניקוי'] },
  { ic: 'send', t: 'יום שטח', s: 'יציאה, הגעה, בטיחות, עבודה לפי התכנית', href: '#/', ok: () => true, kb: ['בטיחות ועבודה בגובה', 'נהלים'] },
  { ic: 'photo', t: 'סיכום היום', s: 'תמונות לפני/אחרי, תקלות, הוצאות', href: '#/', ok: () => true, kb: [] },
  { ic: 'pen', t: 'החתמת לקוח', s: 'בסיום — הלקוח חותם בשטח', href: '#/projects', ok: () => can('projects'), kb: [] },
  { ic: 'check', t: 'סיכום', s: mon('הדוחות והתמונות מגיעים למשרד ולמאנדי לבד', 'הדוחות והתמונות מגיעים למשרד לבד'), href: '#/projects', ok: () => can('projects') && isManager(), kb: [] },
];
async function renderFlow(el) {
  const { data: items } = await sb.from('kb_items').select('category');
  const n = c => (items || []).filter(x => x.category === c).length;
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">מסלול עבודה</h1></header>
    <ol class="kbflow">${FLOW.map((f, i) => { const go = f.ok(), cats = f.kb.filter(n);
      return `<li class="${go ? '' : 'off'}"><span class="kf-n">${icon(f.ic, 20)}</span><div class="kf-b">
        ${go ? `<a href="${f.href}"><b>${i + 1}. ${f.t}</b><small>${f.s}</small></a>` : `<div><b>${i + 1}. ${f.t}</b><small>${f.s} · המשרד</small></div>`}
        ${cats.length ? `<div class="chips">${cats.map(c => `<a class="chip" href="#/kb/c/${encodeURIComponent(c)}">${icon('play', 14)} ${esc(c)} · ${n(c)}</a>`).join('')}</div>` : ''}</div></li>`; }).join('')}</ol>`;
}

export async function renderKbItem(el, id) {
  if (id === 'flow') return renderFlow(el);
  if (id.startsWith('g-')) return renderGuide(el, id);
  try { const { pushState } = await import('../lib/core.js'); PUSH_ON = (await pushState()) === 'on'; } catch { /* */ }
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">מרכז ידע</h1></header><div class="skel"></div>`;
  const { data: x } = await sb.from('kb_items').select('*').eq('id', id).maybeSingle();
  if (!x) { el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">מרכז ידע</h1></header><div class="empty-line">ההדרכה לא נמצאה</div>`; return; }
  // צפייה נרשמת בפתיחה; "צפיתי והבנתי" בלחיצה
  const { data: v } = await sb.from('kb_views').select('confirmed_at,passed_at,score,signed_at').eq('item_id', id).eq('user_id', state.user.id).maybeSingle();
  if (!v) sb.from('kb_views').upsert({ item_id: id, user_id: state.user.id }, { onConflict: 'item_id,user_id', ignoreDuplicates: true }).then(() => {});   // ציור חוזר — בלי 409
  const files = x.files || [], urls = files.length ? await signedUrls('kb', files.map(f => f.path)) : {};
  const emb = embedUrl(x.video_url), M = isManager();
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">${esc(x.title)}</h1><button class="hbtn" id="kbsh" aria-label="שיתוף">${shareIcon(20)}</button></header>
    <div class="stack lg">
      <div class="row"><span class="pill">${esc(x.category)}</span>${x.required ? '<span class="pill warn">חובה</span>' : ''}${M && x.roles?.length ? `<span class="pill">${esc(audTxt(x.roles))}</span>` : ''}<span class="grow"></span>${M ? `<button class="chip" id="kbed">עריכה</button>` : ''}</div>
      ${emb ? `<div class="kbvid"><iframe src="${esc(emb)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy" title="${esc(x.title)}"></iframe></div>`
        : x.video_url?.startsWith('#/') ? `<a class="btn primary block big" href="${esc(x.video_url)}">${icon('play', 18)} הפעלת ההדרכה</a>`   // הדרכה פנימית באפליקציה
        : x.video_url ? `<a class="btn ghost block" href="${esc(x.video_url)}" target="_blank" rel="noopener">${icon('send', 18)} פתיחת הסרטון</a>` : ''}
      ${x.auto_done === 'push' && !PUSH_ON ? `<button class="btn primary block big" id="kbsetup">${icon('chat', 18)} הפעלה עכשיו</button>` : ''}
      ${x.body ? `<div class="card kbbody">${esc(x.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${files.some(isImg) ? `<div class="kbshots">${files.filter(isImg).map((f, i) => `<figure><img src="${esc(urls[f.path] || '')}" alt="${esc(f.name.replace(/\.\w+$/, ''))}" loading="lazy"><figcaption>${i + 1}. ${esc(f.name.replace(/^\d+[-_ ]*/, '').replace(/\.\w+$/, ''))}</figcaption></figure>`).join('')}</div>` : ''}
      ${files.some(f => !isImg(f)) ? `<section><h3 class="sh">מסמכים</h3><div class="list">${files.filter(f => !isImg(f)).map(f => urls[f.path] ? `<div class="lrow shrow"><a class="grow shrow-a" href="${esc(urls[f.path])}" target="_blank" rel="noopener"><span class="mic">${icon('file', 19)}</span><b>${esc(f.name)}</b></a><button class="hbtn sm" data-fsh="${esc(f.path)}" aria-label="שיתוף ${esc(f.name)}">${shareIcon(18)}</button></div>` : `<div class="lrow"><span class="mic">${icon('file', 19)}</span><span class="grow"><b>${esc(f.name)}</b><small>לא זמין כרגע</small></span></div>`).join('')}</div></section>` : ''}
      ${x.quiz?.length ? `<section class="card stack" id="kbquiz"></section>` : ''}
      ${x.sign_required ? `<section class="card stack" id="kbsign"></section>` : ''}
      ${!x.quiz?.length && !x.sign_required ? (v?.confirmed_at && kbDone(x, v) ? `<div class="acked center">${icon('check', 16)} צפית ואישרת</div>` : `<button class="btn primary block big" id="kbok">צפיתי והבנתי</button>`) : ''}
      ${M ? `<button class="btn ghost block" id="kbteam">${icon('users', 18)} שיתוף לצוות בצ׳אט</button><div id="kbwho"></div>` : ''}
    </div>`;
  $$('.kbshots img', el).forEach(i => i.onclick = () => zoom(i.src, i.alt));
  const ok = $('#kbok'); if (ok) ok.onclick = async () => {
    ok.disabled = true;
    const { error } = await markView(id, { confirmed_at: new Date().toISOString() });
    if (error) { ok.disabled = false; return toast(errText(error)); }
    toast('נרשם — תודה'); renderKbItem(el, id);
  };
  const su = $('#kbsetup'); if (su) su.onclick = async () => (await import('./welcome.js')).playSetup();
  const ed = $('#kbed'); if (ed) ed.onclick = async () => editKb(x, await cats());
  // שיתוף: סרטון חיצוני — הקישור הציבורי; הדרכה באפליקציה — קישור למסך (לעובדים מחוברים)
  ogIndex(); $('#kbsh').onclick = () => kbShare(x);
  $$('[data-fsh]', el).forEach(b => b.onclick = () => { const f = files.find(y => y.path === b.dataset.fsh); shareFile({ bucket: 'kb', path: f.path }, f.name, x.title, '', { btn: b }); });
  const tm = $('#kbteam'); if (tm) tm.onclick = () => teamShare(x);
  if (x.quiz?.length) drawQuiz(x, v, el, id);
  if (x.sign_required) drawSign(x, v, el, id);
  if (M) {
    // מי צפה ואישר — מעקב הדרכה
    const [{ data: team }, { data: vs }] = await Promise.all([
      sb.from('profiles').select('id,full_name').eq('is_active', true).neq('role', 'partner').order('full_name'),
      sb.from('kb_views').select('user_id,confirmed_at,viewed_at,passed_at,score,signed_at').eq('item_id', id)]);
    const by = new Map((vs || []).map(r => [r.user_id, r]));
    $('#kbwho').innerHTML = `<section><h3 class="sh">מי צפה</h3><div class="list">${(team || []).map(u => { const r = by.get(u.id);
      return `<div class="lrow"><span class="avatar sm">${esc(initials(u.full_name))}</span><b class="grow">${esc(u.full_name)}</b>${kbDone(x, r) ? `<span class="pill ok">${x.quiz ? `עבר ${r.score}%` : x.sign_required ? 'חתם' : 'אישר'}${x.cert_months ? ' · עד ' + fmtD(until(r.passed_at || r.signed_at || r.confirmed_at, x.cert_months)) : ''}</span>`
          : r?.score != null && !r.passed_at ? `<span class="pill bad">נכשל ${r.score}%</span>` : r?.passed_at || r?.signed_at || r?.confirmed_at ? '<span class="pill warn">פג תוקף</span>' : r ? '<span class="pill">צפה</span>' : '<span class="pill muted">עוד לא</span>'}</div>`; }).join('')}</div></section>`;
  }
}

// כתיבה ל-kb_views: עדכון אם קיים, אחרת הוספה (לעובד אין הרשאה לכתוב ציון/מעבר — רק דרך הבדיקה בשרת)
async function markView(id, patch) {
  const { data, error } = await sb.from('kb_views').update(patch).eq('item_id', id).eq('user_id', state.user.id).select('item_id');
  if (error) return { error }; if (data?.length) return {};
  return sb.from('kb_views').insert({ item_id: id, user_id: state.user.id, ...patch });
}
function drawQuiz(x, v, el, id) {
  const box = $('#kbquiz', el), ok = v?.passed_at && until(v.passed_at, x.cert_months) > new Date();
  if (ok) { box.innerHTML = `<div class="row"><span class="mic ok">${icon('check', 18)}</span><span class="grow"><b>עברת את המבחן · ${v.score}%</b><small>${x.cert_months ? 'ההסמכה בתוקף עד ' + fmtD(until(v.passed_at, x.cert_months)) : 'הסמכה ללא הגבלת זמן'}</small></span><button class="chip" id="qagain">שוב</button></div>`;
    $('#qagain', box).onclick = () => { v.passed_at = null; drawQuiz(x, v, el, id); }; return; }
  const ans = [];
  box.innerHTML = `<h3>מבחן הסמכה</h3><div class="small muted">${x.quiz.length} שאלות · עוברים מ-${x.pass_pct}%${x.cert_months ? ` · תוקף ${x.cert_months} חודשים` : ''}</div>
    ${x.quiz.map((q, i) => `<div class="qz" data-q="${i}"><b>${i + 1}. ${esc(q.q)}</b>${q.options.map((o, j) => `<button type="button" class="qopt" data-o="${j}">${esc(o)}</button>`).join('')}</div>`).join('')}
    <div id="qres"></div><button class="btn primary block big" id="qsend">בדיקת התשובות</button>`;
  $$('.qz', box).forEach(z => $$('.qopt', z).forEach(b => b.onclick = () => { ans[+z.dataset.q] = +b.dataset.o; $$('.qopt', z).forEach(y => y.classList.toggle('on', y === b)); }));
  $('#qsend', box).onclick = async () => {
    if (ans.filter(a => a != null).length < x.quiz.length) return toast('יש שאלות בלי תשובה');
    const qs = $('#qsend', box); if (qs.disabled) return; qs.disabled = true;
    const { data, error } = await sb.rpc('kb_grade', { item: id, answers: x.quiz.map((_, i) => ans[i]) }); qs.disabled = false; if (error) return toast(errText(error, 'הבדיקה לא נשלחה — נסו שוב'));
    $$('.qz', box).forEach(z => z.classList.toggle('wrong', data.wrong.includes(+z.dataset.q + 1)));
    if (data.passed) { toast(`עברת · ${data.score}%`); renderKbItem(el, id); }
    else $('#qres', box).innerHTML = `<div class="note">ציון ${data.score}% — צריך ${data.need}%</div>`;
  };
}
function drawSign(x, v, el, id) {
  const box = $('#kbsign', el), ok = v?.signed_at && until(v.signed_at, x.cert_months) > new Date();
  if (x.quiz?.length && !(v?.passed_at)) { box.innerHTML = '<div class="empty-line">החתימה אחרי מעבר המבחן</div>'; return; }
  if (ok) { box.innerHTML = `<div class="row"><span class="mic ok">${icon('check', 18)}</span><span class="grow"><b>חתמת ב-${new Date(v.signed_at).toLocaleDateString('he-IL')}</b><small>${esc(x.sign_text || '')}</small></span></div>`; return; }
  box.innerHTML = `<h3>חתימה</h3><div class="small consent">${esc(x.sign_text || 'קראתי, הבנתי ואפעל לפי הנוהל.')}</div>
    <canvas class="sigpad" width="700" height="220"></canvas><div class="row"><button class="chip" id="sclr">ניקוי</button><span class="grow"></span><span class="small muted">${esc(state.profile.full_name)} · ${new Date().toLocaleDateString('he-IL')}</span></div>
    <button class="btn primary block big" id="ssend">חתימה ואישור</button>`;
  const c = $('canvas', box), g = c.getContext('2d'); let drew = false, on = false;
  g.lineWidth = 4; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#111827';
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { on = true; c.setPointerCapture(e.pointerId); const [a, b] = pt(e); g.beginPath(); g.moveTo(a, b); };
  c.onpointermove = e => { if (!on) return; const [a, b] = pt(e); g.lineTo(a, b); g.stroke(); drew = true; };
  c.onpointerup = c.onpointercancel = () => { on = false; };
  $('#sclr', box).onclick = () => { g.clearRect(0, 0, c.width, c.height); drew = false; };
  $('#ssend', box).onclick = async () => {
    if (!drew) return toast('חסרה חתימה');
    const sb2 = $('#ssend', box); if (sb2.disabled) return; sb2.disabled = true;
    const now = new Date().toISOString();
    const { error } = await markView(id, { signed_at: now, signature: c.toDataURL('image/png'), confirmed_at: now });
    if (error) { sb2.disabled = false; return toast(errText(error, 'החתימה לא נשמרה — נסו שוב')); } toast('נחתם — תודה'); renderKbItem(el, id);
  };
}

// יצירה / עריכה (מנהלים)
async function editKb(x, C, pre = {}) {
  let keys = [];
  if (x?.quiz?.length) { const { data } = await sb.from('kb_quiz_keys').select('answers').eq('item_id', x.id).maybeSingle(); keys = data?.answers || []; }
  const Q = (x?.quiz || []).map((q, i) => ({ q: q.q, options: [...q.options, '', '', '', ''].slice(0, 4), a: keys[i] ?? 0 }));
  const f = { title: x?.title || pre.title || '', category: x?.category || pre.category || C[0] || 'כללי', body: x?.body || pre.body || '', video_url: x?.video_url || '', required: !!x?.required, files: [...(x?.files || [])], roles: [...(x?.roles || [])] };
  sheet(`<h3>${x ? 'עריכת הדרכה' : 'הדרכה חדשה'}</h3>
    <label class="field">קישור לסרטון<input id="kv" type="url" inputmode="url" dir="ltr" value="${esc(f.video_url)}" placeholder="יוטיוב או דרייב"></label>
    <div id="kvp" class="kvp"></div>
    <label class="field">כותרת<input id="kt" value="${esc(f.title)}" placeholder="למשל: הפעלת משאבת הלחץ בבוקר"></label>
    <div class="field">קטגוריה<div class="chips">${[...new Set([...C, f.category])].map(c => `<button type="button" class="chip" data-kc="${esc(c)}" aria-pressed="${c === f.category}">${esc(c)}</button>`).join('')}</div></div>
    <div class="field">למי ההדרכה<div class="chips">${AUD.map(([k, l]) => `<button type="button" class="chip" data-ka="${k}" aria-pressed="${f.roles.includes(k)}">${l}</button>`).join('')}</div></div>
    <label class="field">הסבר<textarea id="kb" rows="6" placeholder="שלבים, דגשים, מה לא לעשות">${esc(f.body)}</textarea></label>
    <div class="field">מסמכים (PDF / תמונות, עד 10MB)<div id="kf" class="list"></div><label class="btn ghost block">${icon('plus', 18)} הוספת מסמך<input type="file" accept="application/pdf,image/*" multiple id="kfi" hidden></label></div>
    <details class="fold" ${Q.length || x?.sign_required ? 'open' : ''}><summary><span class="sh">מבחן, הסמכה וחתימה</span></summary>
      <div class="stack kbadv">
        <div id="qb"></div><button type="button" class="btn ghost block" id="qadd">${icon('plus', 18)} שאלה למבחן</button>
        <div class="row"><label class="field grow">ציון מעבר %<input type="number" id="kpp" value="${x?.pass_pct || 80}" min="50" max="100"></label><label class="field grow">תוקף (חודשים)<input type="number" id="kcm" value="${x?.cert_months || ''}" min="1" placeholder="ללא הגבלה"></label></div>
        <label class="tog"><span>הסמכת חובה לצוות שטח</span><span class="sw"><input type="checkbox" id="kcr" ${x?.cert_required ? 'checked' : ''}><i></i></span></label>
        <label class="tog"><span>חתימה דיגיטלית</span><span class="sw"><input type="checkbox" id="ksr" ${x?.sign_required ? 'checked' : ''}><i></i></span></label>
        <label class="field">נוסח החתימה<textarea id="kst" rows="2" placeholder="קראתי והבנתי את הנוהל ואפעל לפיו.">${esc(x?.sign_text || '')}</textarea></label>
      </div></details>
    <label class="tog"><span>הדרכת חובה</span><span class="sw"><input type="checkbox" id="kr" ${f.required ? 'checked' : ''}><i></i></span></label>
    <div class="row">${x ? '<button class="btn ghost" id="kdel">מחיקה</button>' : ''}<button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="ks">שמירת ההדרכה</button></div>`, (s, close) => {
    const drawFiles = () => { $('#kf', s).innerHTML = f.files.map((x, i) => `<div class="lrow"><span class="mic">${icon('file', 18)}</span><b class="grow">${esc(x.name)}</b><button type="button" class="chip" data-rm="${i}">הסרה</button></div>`).join('');
      $$('[data-rm]', s).forEach(b => b.onclick = () => { f.files.splice(+b.dataset.rm, 1); drawFiles(); }); };
    drawFiles();
    const drawQ = () => { $('#qb', s).innerHTML = Q.map((q, i) => `<div class="qedit" data-i="${i}"><div class="row"><b class="grow">שאלה ${i + 1}</b><button type="button" class="chip" data-qrm="${i}">הסרה</button></div>
        <input data-qq="${i}" value="${esc(q.q)}" placeholder="השאלה">${q.options.map((o, j) => `<label class="qopt-e"><input type="radio" name="qa${i}" data-qa="${i}" value="${j}" ${q.a === j ? 'checked' : ''}><input data-qo="${i}|${j}" value="${esc(o)}" placeholder="תשובה ${j + 1}${j > 1 ? ' (לא חובה)' : ''}"></label>`).join('')}</div>`).join('');
      $$('[data-qq]', s).forEach(e => e.oninput = () => Q[+e.dataset.qq].q = e.value);
      $$('[data-qo]', s).forEach(e => e.oninput = () => { const [i, j] = e.dataset.qo.split('|').map(Number); Q[i].options[j] = e.value; });
      $$('[data-qa]', s).forEach(e => e.onchange = () => Q[+e.dataset.qa].a = +e.value);
      $$('[data-qrm]', s).forEach(e => e.onclick = () => { Q.splice(+e.dataset.qrm, 1); drawQ(); }); };
    drawQ(); $('#qadd', s).onclick = () => { Q.push({ q: '', options: ['', '', '', ''], a: 0 }); drawQ(); };
    // תצוגה מקדימה מיידית: תמונת הסרטון מיוטיוב / אישור דרייב, ואזהרה אם הקישור לא יתנגן בפנים
    const prev = () => { const u = $('#kv', s).value.trim(), th = ytThumb(u), ok = embedUrl(u);
      $('#kvp', s).innerHTML = !u ? '' : th ? `<span class="kvp-th" style="background-image:url('${esc(th)}')">${icon('play', 22)}</span><small class="ok">יתנגן בתוך האפליקציה</small>`
        : ok ? `<small class="ok">${icon('check', 14)} סרטון דרייב — יתנגן בתוך האפליקציה</small>` : `<small class="muted">ייפתח בלשונית חדשה</small>`;
      if (th && !$('#kt', s).value.trim()) $('#kt', s).focus(); };
    $('#kv', s).oninput = prev; prev();
    $$('[data-ka]', s).forEach(c => c.onclick = () => { const k = c.dataset.ka; f.roles = f.roles.includes(k) ? f.roles.filter(r => r !== k) : [...f.roles, k]; c.setAttribute('aria-pressed', f.roles.includes(k)); });
    $$('[data-kc]', s).forEach(c => c.onclick = () => { f.category = c.dataset.kc; $$('[data-kc]', s).forEach(y => y.setAttribute('aria-pressed', y === c)); });
    $('#kfi', s).onchange = async e => {
      for (const file of e.target.files) {
        if (file.size > 10485760) { toast(`${file.name}: מעל 10MB — עדיף קישור מדרייב`, 4000); continue; }
        const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.֐-׿-]+/g, '_')}`;
        const { error } = await sb.storage.from('kb').upload(path, file, { contentType: file.type });
        if (error) { toast(errText(error, `${file.name} לא עלה`)); continue; }
        f.files.push({ path, name: file.name });
      }
      drawFiles();
    };
    const del = $('#kdel', s); if (del) del.onclick = async () => {
      if (!(await confirmBox('למחוק את ההדרכה?', { body: 'כולל רישום מי צפה. אי אפשר לשחזר.', ok: 'מחיקה', danger: true }))) return;
      const { error } = await sb.from('kb_items').delete().eq('id', x.id); if (error) return toast(errText(error, 'לא נמחק — נסו שוב'));
      close(); toast('נמחק'); goUp('#/kb');
    };
    $('#ks', s).onclick = async () => {
      // מבחן: שאלות בלי תשובות נשמרות בהדרכה; מפתח התשובות בטבלה נפרדת (מנהלים בלבד)
      const qs = Q.filter(q => q.q.trim()).map(q => { const opts = q.options.map((o, j) => [o.trim(), j]).filter(([o]) => o); return { q: q.q.trim(), options: opts.map(([o]) => o), a: Math.max(0, opts.findIndex(([, j]) => j === q.a)) }; });
      if (qs.some(q => q.options.length < 2)) return toast('לכל שאלה צריך לפחות 2 תשובות');
      const row = { title: $('#kt', s).value.trim(), category: f.category, body: $('#kb', s).value.trim() || null, video_url: $('#kv', s).value.trim() || null, required: $('#kr', s).checked, files: f.files, roles: f.roles.length ? f.roles : null,
        quiz: qs.length ? qs.map(({ q, options }) => ({ q, options })) : null, pass_pct: +$('#kpp', s).value || 80, cert_months: +$('#kcm', s).value || null,
        cert_required: $('#kcr', s).checked && qs.length > 0, sign_required: $('#ksr', s).checked, sign_text: $('#kst', s).value.trim() || null };
      if (!row.title) return toast('חסרה כותרת');
      $('#ks', s).disabled = true;
      const q = x ? sb.from('kb_items').update(row).eq('id', x.id).select('id').single() : sb.from('kb_items').insert({ ...row, created_by: state.user.id }).select('id').single();
      const { data, error } = await q; if (error) { $('#ks', s).disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב')); }
      if (qs.length) { const { error: e2 } = await sb.from('kb_quiz_keys').upsert({ item_id: data.id, answers: qs.map(q => q.a) }); if (e2) { $('#ks', s).disabled = false; return toast(errText(e2, 'מפתח התשובות לא נשמר — נסו שוב')); } }
      else await sb.from('kb_quiz_keys').delete().eq('item_id', data.id);
      close(); toast(row.required && !x?.required ? 'נשמר — נשלחה התראה לצוות' : 'נשמר');
      location.hash = '#/kb/' + data.id; if (x) dispatchEvent(new HashChangeEvent('hashchange'));
    };
  });
}

// בבית: הדרכות חובה שעוד לא אושרו
export async function kbDue(box) {
  if (!box) return;
  try {
    const [{ data: req }, { data: v }] = await Promise.all([sb.from('kb_items').select('id,title,quiz,sign_required,cert_months,required,cert_required').or('required.eq.true,cert_required.eq.true'),
      sb.from('kb_views').select('item_id,confirmed_at,passed_at,signed_at').eq('user_id', state.user.id)]);
    const vm = new Map((v || []).map(x => [x.item_id, x]));
    const due = (req || []).filter(x => !kbDone(x, vm.get(x.id)) && (x.required || ['crew', 'crew_lead'].includes(state.profile.role)));
    box.innerHTML = due.map(x => `<a class="promo" href="#/kb/${x.id}"><span class="mic">${icon('play', 20)}</span><span class="grow"><b>הדרכה לצפייה</b><small>${esc(x.title)}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('');
  } catch { box.innerHTML = ''; }
}

// ---------- מדריכי פתיחה (מובנים) לקטגוריות ריקות: נקודות התחלה כלליות, לא נוהל החברה. אביחי מחליף בסרטון/נוהל בלחיצה ----------
const GUIDES = [
  { id: 'g-drone', cat: 'רחפנים', ic: 'drone', t: 'רחפן השטיפה — היכרות', sub: 'רכיבים, סוללות ושמירה על הכלי',
    cards: [
      { ic: 'drone', t: 'מה יש בכלי', items: ['גוף, זרועות ומדחפים', 'צינור הזנה ופיית ריסוס', 'סוללות או כבל הזנה (לפי הדגם)', 'שלט ואפליקציית הטיסה'] },
      { ic: 'sync', t: 'סוללות', items: ['טעינה ואחסון לפי הוראות היצרן', 'לא משאירים בשמש או ברכב חם', 'סוללה נפוחה או פגועה — לא משתמשים, מדווחים'] },
      { ic: 'wrench', t: 'אחרי העבודה', items: ['ניקוי הכלי מחומר ולכלוך', 'בדיקה חזותית של מדחפים וחיבורים', 'כל ממצא — תקלה באפליקציה, עם תמונה'] },
    ], links: [['#/equipment', 'ציוד ותקלות', () => can('equipment')], ['#/weather', 'מזג אוויר וטיסה', () => true]] },
  { id: 'g-wash', cat: 'מערכת שטיפה ומשאבות', ic: 'wrench', t: 'פריסת ציוד לשטיפה', sub: 'מים, משאבה, צנרת וחיבורים',
    cards: [
      { ic: 'pin', t: 'מקור מים', items: ['ברז, הידרנט או מכלית — לפי מה שסומן באפיון', 'בודקים לחץ וזרימה לפני שמתחילים'] },
      { ic: 'wrench', t: 'משאבה', items: ['על משטח ישר ויציב', 'רחוק מכניסות ומעברים', 'לפי הוראות היצרן של המשאבה'] },
      { ic: 'map', t: 'צנרת וחיבורים', items: ['פריסה בלי קיפולים וחיכוך בפינות', 'מעבר הולכי רגל — מסומן ומכוסה', 'בדיקת דליפות לפני ההפעלה המלאה'] },
      { ic: 'check', t: 'בסיום', items: ['ניקוז המערכת', 'ניקוי מסננים', 'מחסור או תקלה — דרך הכפתור + באפליקציה'] },
    ], links: [['#/specs', 'אפיון האתר (מים וגישה)', () => can('specs')]] },
  { id: 'g-safety', cat: 'בטיחות ועבודה בגובה', ic: 'shield', t: 'בטיחות בעבודה עם רחפן', sub: 'אזור עבודה, צוות ועצירה בחריג',
    cards: [
      { ic: 'alert', t: 'אזור העבודה', items: ['גידור ושילוט מתחת לאזור הטיסה', 'אין מעבר אנשים מתחת לרחפן', 'תיאום עם האתר: חלונות, כניסות, חניה'] },
      { ic: 'users', t: 'הצוות', items: ['מטיס ומפעיל מערכות בקשר רציף', 'תפקידים ברורים לפני ההמראה', 'ציוד מגן אישי לפי סוג העבודה'] },
      { ic: 'sun', t: 'עוצרים כש…', items: ['רוח ומשבים מעל המותר לכלי', 'גשם או ראות ירודה', 'אנשים נכנסים לאזור', 'כל ספק — עוצרים ומדווחים'] },
    ], links: [['#/weather', 'מזג אוויר וטיסה', () => true]] },
  { id: 'g-chem', cat: 'חומרים וניקוי', ic: 'clipboard', t: 'חומרי ניקוי — עקרונות', sub: 'מינון, בדיקה, אחסון ומגן',
    cards: [
      { ic: 'file', t: 'לפני השימוש', items: ['קוראים את התווית וגיליון הבטיחות (SDS) של היצרן', 'מינון לפי הוראות היצרן בלבד'] },
      { ic: 'photo', t: 'בדיקה קטנה קודם', items: ['מנסים על שטח קטן ולא בולט', 'מצלמים לפני ואחרי'] },
      { ic: 'shield', t: 'מגן ואחסון', items: ['כפפות ומשקפי מגן לפי הוראות היצרן', 'אריזה סגורה ומסומנת', 'לא שופכים לניקוז או לגינון'] },
    ], links: [] },
  { id: 'g-proc', cat: 'נהלים', ic: 'file', t: 'איפה כל דבר באפליקציה', sub: 'תקלה, הוצאה, בקשה, שעות',
    cards: [
      { ic: 'alert', t: 'תקלה בשטח', items: ['כפתור + ← תקלה, עם תמונה', 'רחפן מקורקע — מסומן לכל הצוות'] },
      { ic: 'receipt', t: 'הוצאה', items: ['כפתור + ← הוצאה', 'מצלמים את הקבלה — זהו'] },
      { ic: 'send', t: 'בקשה למשרד', items: ['שכר, ציוד, מסמכים', 'עוד ← בקשה למשרד'] },
      { ic: 'clock', t: 'שעות', items: ['נרשמות לבד מיציאה ועד סיום', 'תיקון — מבקשים מ"השעות שלי"'] },
    ], links: [['#/hours', 'השעות שלי', () => true], ['#/requests', 'בקשה למשרד', () => true]] },
];
const guideRow = g => `<a class="item kb kbg" href="#/kb/${g.id}" data-q="${esc((g.t + ' ' + g.sub).toLowerCase())}"><span class="kbic">${icon(g.ic, 20)}</span>
  <span class="t"><b>${esc(g.t)}</b><small>מדריך פתיחה · ${esc(g.sub)}</small></span></a>`;
async function renderGuide(el, id) {
  const g = GUIDES.find(x => x.id === id);
  if (!g) { el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">מרכז ידע</h1></header><div class="empty-line">ההדרכה לא נמצאה</div>`; return; }
  const M = isManager(), links = g.links.filter(([, , ok]) => ok());
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1 class="grow">${esc(g.t)}</h1><button class="hbtn" id="kbsh" aria-label="שיתוף">${shareIcon(20)}</button></header>
    <div class="stack lg">
      <div class="kbg-hero"><span>${icon(g.ic, 34)}</span><div><b>${esc(g.cat)}</b><small>נקודת התחלה כללית — הוראות היצרן ונוהלי החברה קודמים</small></div></div>
      <div class="kbg-cards">${g.cards.map((c, i) => `<section class="kbg-c" style="--i:${i}"><div class="kbg-ct"><span>${icon(c.ic, 18)}</span><b>${esc(c.t)}</b></div><ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}</div>
      ${links.length ? `<div class="list">${links.map(([h, t]) => `<a class="lrow" href="${h}"><span class="grow"><b>${esc(t)}</b></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div>` : ''}
      ${M ? `<button class="btn ghost block" id="kbrep">${icon('play', 18)} החלפה בסרטון / נוהל של החברה</button>` : ''}
    </div>`;
  ogIndex(); $('#kbsh').onclick = async () => shareLink(await kbShareUrl(g.id), g.t, g.t);
  const r = $('#kbrep'); if (r) r.onclick = async () => editKb(null, await cats(), { title: g.t, category: g.cat, body: g.cards.map(c => c.t + ':\n' + c.items.map(t => '• ' + t).join('\n')).join('\n\n') });
}

// ---------- שיתוף ----------
const isExt = u => /^https?:\/\//i.test(u || '');
// דף שיתוף (שם + תמונה בוואטסאפ) — גם לסרטון: הכרטיס עם תמונת הסרטון, והצפייה נשארת במעקב באפליקציה
async function kbShare(x) {
  const ext = isExt(x.video_url), docs = (x.files || []).filter(f => !isImg(f));
  // מסמך יחיד בלי סרטון — משתפים את הקובץ עצמו
  if (!ext && !x.video_url && !x.body && docs.length === 1) return shareFile({ bucket: 'kb', path: docs[0].path }, docs[0].name, x.title, '', { btn: $('#kbsh') });
  shareLink(await kbShareUrl(x.id), x.title, x.title);
}

// שיתוף לצוות (מנהלים): בוחרים אנשים / תפקיד / קבוצה קיימת → הודעה בצ׳אט הפנימי עם הקישור. ההתראה הרגילה של הודעה נשלחת
async function teamShare(x) {
  const [{ data: ppl }, { data: inbox }] = await Promise.all([
    sb.from('profiles').select('id,full_name,role,field_role').eq('is_active', true).neq('role', 'partner').neq('id', state.user.id).order('full_name'),
    sb.rpc('my_inbox').then(r => r, () => ({ data: [] }))]);
  const P = ppl || [], G = (inbox || []).filter(c => c.kind === 'group');
  const hasRole = (u, r) => u.role === r || u.field_role === r || (r === 'crew' && ['crew', 'crew_lead'].includes(u.role)) || (r === 'ops_manager' && ['ops_manager', 'admin'].includes(u.role));
  const R = AUD.filter(([k]) => P.some(u => hasRole(u, k)));
  const sel = new Set(), gsel = new Set();
  // ברירת מחדל: קהל היעד של ההדרכה
  if (x.roles?.length) P.filter(u => x.roles.some(r => hasRole(u, r))).forEach(u => sel.add(u.id));
  sheet(`<h3>שיתוף לצוות</h3><div class="small muted">${esc(x.title)}</div>
    ${G.length ? `<div class="field">קבוצה<div class="chips">${G.map(c => `<button type="button" class="chip" data-g="${c.id}" aria-pressed="false">${icon('users', 15)} ${esc(c.title)}</button>`).join('')}</div></div>` : ''}
    ${R.length ? `<div class="field">לפי תפקיד<div class="chips">${R.map(([k, l]) => `<button type="button" class="chip" data-r="${k}">${l}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span class="row"><span class="grow">אנשים</span><button type="button" class="chip sm" id="tsall">כולם</button></span><div class="list tspl">${P.map(u => `<label class="lrow tsp"><span class="avatar sm">${esc(initials(u.full_name))}</span><b class="grow">${esc(u.full_name)}</b><input type="checkbox" data-u="${u.id}" ${sel.has(u.id) ? 'checked' : ''}></label>`).join('')}</div></div>
    <label class="tog"><span>חשוב — עם אישור קריאה</span><span class="sw"><input type="checkbox" id="tsimp" ${x.required ? 'checked' : ''}><i></i></span></label>
    <button class="btn primary block big" id="tsgo"></button><button class="btn ghost block" data-close>ביטול</button>`, (s, close) => {
    const go = $('#tsgo', s);
    const cnt = () => { const n = sel.size + gsel.size; go.disabled = !n; go.textContent = n ? `שליחה${gsel.size ? ` · ${gsel.size} קבוצות` : ''}${sel.size ? ` · ${sel.size} אנשים` : ''}` : 'בחרו למי'; };
    const sync = () => { $$('[data-u]', s).forEach(c => c.checked = sel.has(c.dataset.u)); $$('[data-r]', s).forEach(b => { const ids = P.filter(u => hasRole(u, b.dataset.r)).map(u => u.id); b.setAttribute('aria-pressed', ids.length && ids.every(i => sel.has(i))); }); cnt(); };
    $$('[data-u]', s).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.u) : sel.delete(c.dataset.u); sync(); });
    $$('[data-r]', s).forEach(b => b.onclick = () => { const ids = P.filter(u => hasRole(u, b.dataset.r)).map(u => u.id), on = ids.every(i => sel.has(i)); ids.forEach(i => on ? sel.delete(i) : sel.add(i)); sync(); });
    $$('[data-g]', s).forEach(b => b.onclick = () => { const g = b.dataset.g; gsel.has(g) ? gsel.delete(g) : gsel.add(g); b.setAttribute('aria-pressed', gsel.has(g)); cnt(); });
    $('#tsall', s).onclick = () => { const all = P.every(u => sel.has(u.id)); P.forEach(u => all ? sel.delete(u.id) : sel.add(u.id)); sync(); };
    sync();
    go.onclick = async () => {
      if (go.disabled) return; go.disabled = true; go.textContent = 'שולח…';
      const body = `${x.video_url && !isExt(x.video_url) ? 'הדרכה' : x.video_url ? 'סרטון הדרכה' : 'הדרכה'}: ${x.title}\n${await kbShareUrl(x.id)}`;
      const imp = $('#tsimp', s).checked;
      // קבוצה שכל חבריה כבר נבחרו כאנשים — לא שולחים להם גם בנפרד
      const inG = new Set(G.filter(c => gsel.has(c.id)).flatMap(c => (c.members || []).map(m => m.id)));
      const convs = [...gsel];
      let fail = 0;
      for (const u of [...sel].filter(u => !inG.has(u))) { const { data, error } = await sb.rpc('open_dm', { other: u }); if (error || !data) fail++; else convs.push(data); }
      const rows = convs.map(c => ({ id: crypto.randomUUID(), conversation_id: c, author_id: state.user.id, body, important: imp }));
      const { error } = rows.length ? await sb.from('messages').insert(rows) : { error: null };
      if (error) { go.disabled = false; cnt(); return toast(errText(error, 'לא נשלח — נסו שוב')); }
      close(); toast(`נשלח ל-${rows.length} שיחות${fail ? ` · ${fail} לא נשלחו` : ''}`);
    };
  });
}
