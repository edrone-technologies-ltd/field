// מרכז ידע: הדרכות "איך מתפעלים" — סרטון (קישור דרייב/יוטיוב שמתנגן בפנים), הסבר, מסמכים.
// בחינם: סרטונים לא נשמרים בשרת שלנו (רק קישור). לשרת עולים רק PDF ותמונות עד 10MB.
// "צפיתי והבנתי" = מעקב הדרכה; פריט "חובה" מופיע בבית לכל מי שעוד לא אישר.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, confirmBox, signedUrls, backBtn, initials, replaceHash, goUp, zoom } from '../lib/core.js';

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
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>מרכז ידע</h1></header><div class="skel"></div>`;
  const [{ data: items }, { data: views }, C] = await Promise.all([
    sb.from('kb_items').select('id,title,category,body,video_url,files,required,sort,updated_at,roles,quiz,sign_required,cert_months,cert_required,auto_done').order('sort').order('title'),
    sb.from('kb_views').select('item_id,confirmed_at,passed_at,signed_at').eq('user_id', state.user.id), cats()]);
  const seen = new Map((views || []).map(v => [v.item_id, v]));
  const all = items || [], M = isManager();
  const todo = all.filter(x => (x.required || (x.cert_required && ['crew', 'crew_lead'].includes(state.profile.role))) && !kbDone(x, seen.get(x.id)));
  const used = [...new Set([...C, ...all.map(x => x.category)])].filter(c => all.some(x => x.category === c));
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>מרכז ידע</h1>${M ? `<button class="btn primary sm" id="kbnew">${icon('plus', 16)} הדרכה</button>` : ''}</header>
    <div class="stack lg">
      <input class="search" id="kbq" type="search" placeholder="חיפוש: משאבה, סוללות, דוח יומי…">
      ${used.length > 1 ? `<div class="chips scroll">${['', ...used].map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${c === cat}">${c || 'הכל'}</button>`).join('')}</div>` : ''}
      ${todo.length ? `<section><div class="sh-row"><h3 class="sh">לצפייה — חובה</h3><span class="count">${todo.length}</span></div><div class="list">${todo.map(row).join('')}</div></section>` : ''}
      <div id="kbl"></div>
    </div>`;
  function row(x) {
    const v = seen.get(x.id), kind = x.video_url ? 'play' : (x.files || []).length ? 'file' : 'report';
    return `<a class="item kb" href="#/kb/${x.id}" data-q="${esc((x.title + ' ' + (x.body || '') + ' ' + x.category).toLowerCase())}"><span class="kbic ${x.video_url ? 'vid' : ''}">${kind === 'play' ? '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>' : icon(kind, 20)}</span>
      <span class="t"><b>${esc(x.title)}</b><small>${esc(x.category)}${x.video_url ? ' · סרטון' : ''}${(x.files || []).some(isImg) ? ' · עם צילומי מסך' : ''}${M && x.roles?.length ? ' · ' + esc(audTxt(x.roles)) : ''}</small></span>
      ${kbDone(x, v) ? '<span class="pill ok">✓</span>' : x.quiz ? '<span class="pill warn">מבחן</span>' : x.sign_required ? '<span class="pill warn">חתימה</span>' : !v ? '<span class="pill lime">חדש</span>' : ''}</a>`;
  }
  const draw = () => {
    const q = $('#kbq').value.trim().toLowerCase();
    const list = all.filter(x => (q || !todo.includes(x)) && (!cat || x.category === cat) && (!q || (x.title + ' ' + (x.body || '') + ' ' + x.category).toLowerCase().includes(q)));
    const groups = [...new Set(list.map(x => x.category))];
    $('#kbl').innerHTML = groups.map(g => `<section><h3 class="sh">${esc(g)}</h3><div class="list">${list.filter(x => x.category === g).map(row).join('')}</div></section>`).join('')
      || `<div class="empty-card"><span><b>${all.length ? 'לא נמצא' : 'עוד אין הדרכות'}</b><small>${all.length ? 'נסו מילה אחרת' : M ? 'מוסיפים הדרכה ראשונה בכפתור למעלה' : 'הדרכות יופיעו כאן'}</small></span></div>`;
  };
  $('#kbq').oninput = draw;
  $$('[data-c]', el).forEach(b => b.onclick = () => replaceHash('#/kb' + (b.dataset.c ? '/c/' + encodeURIComponent(b.dataset.c) : '')));
  const n = $('#kbnew'); if (n) n.onclick = () => editKb(null, C);
  draw();
}

export async function renderKbItem(el, id) {
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1>מרכז ידע</h1></header><div class="skel"></div>`;
  const { data: x } = await sb.from('kb_items').select('*').eq('id', id).maybeSingle();
  if (!x) { el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1>מרכז ידע</h1></header><div class="empty">ההדרכה לא נמצאה.</div>`; return; }
  // צפייה נרשמת בפתיחה; "צפיתי והבנתי" בלחיצה
  const { data: v } = await sb.from('kb_views').select('confirmed_at,passed_at,score,signed_at').eq('item_id', id).eq('user_id', state.user.id).maybeSingle();
  if (!v) sb.from('kb_views').insert({ item_id: id, user_id: state.user.id }).then(() => {});
  const files = x.files || [], urls = files.length ? await signedUrls('kb', files.map(f => f.path)) : {};
  const emb = embedUrl(x.video_url), M = isManager();
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1>${esc(x.title)}</h1></header>
    <div class="stack lg">
      <div class="row"><span class="pill">${esc(x.category)}</span>${x.required ? '<span class="pill warn">חובה</span>' : ''}${M && x.roles?.length ? `<span class="pill">${esc(audTxt(x.roles))}</span>` : ''}<span class="grow"></span>${M ? `<button class="chip" id="kbed">עריכה</button>` : ''}</div>
      ${emb ? `<div class="kbvid"><iframe src="${esc(emb)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy" title="${esc(x.title)}"></iframe></div>`
        : x.video_url?.startsWith('#/') ? `<a class="btn primary block big" href="${esc(x.video_url)}">▶ הפעלת ההדרכה</a>`   // הדרכה פנימית באפליקציה
        : x.video_url ? `<a class="btn ghost block" href="${esc(x.video_url)}" target="_blank" rel="noopener">${icon('send', 18)} פתיחת הסרטון</a>` : ''}
      ${x.body ? `<div class="card kbbody">${esc(x.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${files.some(isImg) ? `<div class="kbshots">${files.filter(isImg).map((f, i) => `<figure><img src="${esc(urls[f.path] || '')}" alt="${esc(f.name.replace(/\.\w+$/, ''))}" loading="lazy"><figcaption>${i + 1}. ${esc(f.name.replace(/^\d+[-_ ]*/, '').replace(/\.\w+$/, ''))}</figcaption></figure>`).join('')}</div>` : ''}
      ${files.some(f => !isImg(f)) ? `<section><h3 class="sh">מסמכים</h3><div class="list">${files.filter(f => !isImg(f)).map(f => `<a class="lrow" href="${esc(urls[f.path] || '#')}" target="_blank" rel="noopener"><span class="mic">${icon('file', 19)}</span><span class="grow"><b>${esc(f.name)}</b></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
      ${x.quiz?.length ? `<section class="card stack" id="kbquiz"></section>` : ''}
      ${x.sign_required ? `<section class="card stack" id="kbsign"></section>` : ''}
      ${!x.quiz?.length && !x.sign_required ? (v?.confirmed_at && kbDone(x, v) ? `<div class="acked center">צפית ואישרת ✓</div>` : `<button class="btn primary block big" id="kbok">צפיתי והבנתי</button>`) : ''}
      ${M ? '<div id="kbwho"></div>' : ''}
    </div>`;
  $$('.kbshots img', el).forEach(i => i.onclick = () => zoom(i.src, i.alt));
  const ok = $('#kbok'); if (ok) ok.onclick = async () => {
    ok.disabled = true;
    const { error } = await markView(id, { confirmed_at: new Date().toISOString() });
    if (error) { ok.disabled = false; return toast(error.message); }
    toast('נרשם — תודה'); renderKbItem(el, id);
  };
  const ed = $('#kbed'); if (ed) ed.onclick = async () => editKb(x, await cats());
  if (x.quiz?.length) drawQuiz(x, v, el, id);
  if (x.sign_required) drawSign(x, v, el, id);
  if (M) {
    // מי צפה ואישר — מעקב הדרכה
    const [{ data: team }, { data: vs }] = await Promise.all([
      sb.from('profiles').select('id,full_name').eq('is_active', true).neq('role', 'partner').order('full_name'),
      sb.from('kb_views').select('user_id,confirmed_at,viewed_at,passed_at,score,signed_at').eq('item_id', id)]);
    const by = new Map((vs || []).map(r => [r.user_id, r]));
    $('#kbwho').innerHTML = `<section><h3 class="sh">מי צפה</h3><div class="list">${(team || []).map(u => { const r = by.get(u.id);
      return `<div class="lrow"><span class="avatar sm">${esc(initials(u.full_name))}</span><b class="grow">${esc(u.full_name)}</b>${kbDone(x, r) ? `<span class="pill ok">${x.quiz ? `עבר ${r.score}%` : x.sign_required ? 'חתם' : 'אישר'} ✓${x.cert_months ? ' · עד ' + fmtD(until(r.passed_at || r.signed_at || r.confirmed_at, x.cert_months)) : ''}</span>`
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
  if (ok) { box.innerHTML = `<div class="row"><span class="mic ok">✓</span><span class="grow"><b>עברת את המבחן · ${v.score}%</b><small>${x.cert_months ? 'ההסמכה בתוקף עד ' + fmtD(until(v.passed_at, x.cert_months)) : 'הסמכה ללא הגבלת זמן'}</small></span><button class="chip" id="qagain">שוב</button></div>`;
    $('#qagain', box).onclick = () => { v.passed_at = null; drawQuiz(x, v, el, id); }; return; }
  const ans = [];
  box.innerHTML = `<h3>מבחן הסמכה</h3><div class="small muted">${x.quiz.length} שאלות · עוברים מ-${x.pass_pct}%${x.cert_months ? ` · תוקף ${x.cert_months} חודשים` : ''}</div>
    ${x.quiz.map((q, i) => `<div class="qz" data-q="${i}"><b>${i + 1}. ${esc(q.q)}</b>${q.options.map((o, j) => `<button type="button" class="qopt" data-o="${j}">${esc(o)}</button>`).join('')}</div>`).join('')}
    <div id="qres"></div><button class="btn primary block big" id="qsend">בדיקה</button>`;
  $$('.qz', box).forEach(z => $$('.qopt', z).forEach(b => b.onclick = () => { ans[+z.dataset.q] = +b.dataset.o; $$('.qopt', z).forEach(y => y.classList.toggle('on', y === b)); }));
  $('#qsend', box).onclick = async () => {
    if (ans.filter(a => a != null).length < x.quiz.length) return toast('יש שאלות בלי תשובה');
    const { data, error } = await sb.rpc('kb_grade', { item: id, answers: x.quiz.map((_, i) => ans[i]) }); if (error) return toast(error.message);
    $$('.qz', box).forEach(z => z.classList.toggle('wrong', data.wrong.includes(+z.dataset.q + 1)));
    if (data.passed) { toast(`עברת · ${data.score}%`); renderKbItem(el, id); }
    else $('#qres', box).innerHTML = `<div class="note">ציון ${data.score}% — צריך ${data.need}%. השאלות המסומנות לא נכונות; עברו שוב על ההדרכה ונסו שוב.</div>`;
  };
}
function drawSign(x, v, el, id) {
  const box = $('#kbsign', el), ok = v?.signed_at && until(v.signed_at, x.cert_months) > new Date();
  if (x.quiz?.length && !(v?.passed_at)) { box.innerHTML = '<div class="small muted">החתימה נפתחת אחרי מעבר המבחן.</div>'; return; }
  if (ok) { box.innerHTML = `<div class="row"><span class="mic ok">✓</span><span class="grow"><b>חתמת ב-${new Date(v.signed_at).toLocaleDateString('he-IL')}</b><small>${esc(x.sign_text || '')}</small></span></div>`; return; }
  box.innerHTML = `<h3>חתימה</h3><div class="small" style="line-height:1.6">${esc(x.sign_text || 'קראתי, הבנתי ואפעל לפי הנוהל.')}</div>
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
    const now = new Date().toISOString();
    const { error } = await markView(id, { signed_at: now, signature: c.toDataURL('image/png'), confirmed_at: now });
    if (error) return toast(error.message); toast('נחתם — תודה'); renderKbItem(el, id);
  };
}

// יצירה / עריכה (מנהלים)
async function editKb(x, C) {
  let keys = [];
  if (x?.quiz?.length) { const { data } = await sb.from('kb_quiz_keys').select('answers').eq('item_id', x.id).maybeSingle(); keys = data?.answers || []; }
  const Q = (x?.quiz || []).map((q, i) => ({ q: q.q, options: [...q.options, '', '', '', ''].slice(0, 4), a: keys[i] ?? 0 }));
  const f = { title: x?.title || '', category: x?.category || C[0] || 'כללי', body: x?.body || '', video_url: x?.video_url || '', required: !!x?.required, files: [...(x?.files || [])], roles: [...(x?.roles || [])] };
  sheet(`<h3>${x ? 'עריכת הדרכה' : 'הדרכה חדשה'}</h3>
    <label class="field">כותרת<input id="kt" value="${esc(f.title)}" placeholder="למשל: הפעלת משאבת הלחץ בבוקר"></label>
    <div class="field">קטגוריה<div class="chips">${[...new Set([...C, f.category])].map(c => `<button type="button" class="chip" data-kc="${esc(c)}" aria-pressed="${c === f.category}">${esc(c)}</button>`).join('')}</div></div>
    <div class="field">למי ההדרכה<small>בלי סימון = לכל הצוות. מנהלים רואים הכל</small><div class="chips">${AUD.map(([k, l]) => `<button type="button" class="chip" data-ka="${k}" aria-pressed="${f.roles.includes(k)}">${l}</button>`).join('')}</div></div>
    <label class="field">קישור לסרטון<small>גוגל דרייב או יוטיוב (לא רשום). בדרייב: שיתוף ← "כל מי שיש לו את הקישור" — כדי שיתנגן לכל הצוות</small><input id="kv" type="url" dir="ltr" value="${esc(f.video_url)}" placeholder="https://drive.google.com/file/d/…"></label>
    <div id="kvp" class="small muted"></div>
    <label class="field">הסבר<small>שלבים, דגשים, מה לא לעשות</small><textarea id="kb" rows="6">${esc(f.body)}</textarea></label>
    <div class="field">מסמכים (PDF / תמונות, עד 10MB)<div id="kf" class="list"></div><label class="btn ghost block" style="position:relative">${icon('plus', 18)} הוספת מסמך<input type="file" accept="application/pdf,image/*" multiple id="kfi" style="position:absolute;inset:0;opacity:0"></label></div>
    <details class="fold" ${Q.length || x?.sign_required ? 'open' : ''}><summary><span class="sh">מבחן, הסמכה וחתימה</span></summary>
      <div class="stack" style="gap:10px;margin-top:8px">
        <div id="qb"></div><button type="button" class="btn ghost block" id="qadd">${icon('plus', 18)} שאלה למבחן</button>
        <div class="row"><label class="field grow">ציון מעבר %<input type="number" id="kpp" value="${x?.pass_pct || 80}" min="50" max="100"></label><label class="field grow">תוקף (חודשים)<small>ריק = ללא הגבלה</small><input type="number" id="kcm" value="${x?.cert_months || ''}" min="1"></label></div>
        <label class="tog"><span>הסמכת חובה לצוות שטח <small class="muted">— בלי מעבר בתוקף אי אפשר לשבץ</small></span><span class="sw"><input type="checkbox" id="kcr" ${x?.cert_required ? 'checked' : ''}><i></i></span></label>
        <label class="tog"><span>חתימה דיגיטלית <small class="muted">— העובד חותם באצבע</small></span><span class="sw"><input type="checkbox" id="ksr" ${x?.sign_required ? 'checked' : ''}><i></i></span></label>
        <label class="field">נוסח החתימה<textarea id="kst" rows="2" placeholder="קראתי והבנתי את הנוהל ואפעל לפיו.">${esc(x?.sign_text || '')}</textarea></label>
      </div></details>
    <label class="tog"><span>הדרכת חובה <small class="muted">— מופיעה בבית לכל הצוות עד שאישרו, ונשלחת התראה</small></span><span class="sw"><input type="checkbox" id="kr" ${f.required ? 'checked' : ''}><i></i></span></label>
    <div class="row">${x ? '<button class="btn ghost" id="kdel">מחיקה</button>' : ''}<button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="ks">שמירה</button></div>`, (s, close) => {
    const drawFiles = () => { $('#kf', s).innerHTML = f.files.map((x, i) => `<div class="lrow"><span class="mic">${icon('file', 18)}</span><b class="grow">${esc(x.name)}</b><button type="button" class="chip" data-rm="${i}">הסרה</button></div>`).join('');
      $$('[data-rm]', s).forEach(b => b.onclick = () => { f.files.splice(+b.dataset.rm, 1); drawFiles(); }); };
    drawFiles();
    const drawQ = () => { $('#qb', s).innerHTML = Q.map((q, i) => `<div class="qedit" data-i="${i}"><div class="row"><b class="grow">שאלה ${i + 1}</b><button type="button" class="chip" data-qrm="${i}">הסרה</button></div>
        <input data-qq="${i}" value="${esc(q.q)}" placeholder="השאלה">${q.options.map((o, j) => `<label class="qopt-e"><input type="radio" name="qa${i}" data-qa="${i}" value="${j}" ${q.a === j ? 'checked' : ''}><input data-qo="${i}|${j}" value="${esc(o)}" placeholder="תשובה ${j + 1}${j > 1 ? ' (לא חובה)' : ''}"></label>`).join('')}
        <small class="muted">מסמנים את התשובה הנכונה</small></div>`).join('');
      $$('[data-qq]', s).forEach(e => e.oninput = () => Q[+e.dataset.qq].q = e.value);
      $$('[data-qo]', s).forEach(e => e.oninput = () => { const [i, j] = e.dataset.qo.split('|').map(Number); Q[i].options[j] = e.value; });
      $$('[data-qa]', s).forEach(e => e.onchange = () => Q[+e.dataset.qa].a = +e.value);
      $$('[data-qrm]', s).forEach(e => e.onclick = () => { Q.splice(+e.dataset.qrm, 1); drawQ(); }); };
    drawQ(); $('#qadd', s).onclick = () => { Q.push({ q: '', options: ['', '', '', ''], a: 0 }); drawQ(); };
    const prev = () => { const u = $('#kv', s).value.trim(); $('#kvp', s).textContent = !u ? '' : embedUrl(u) ? '✓ הסרטון יתנגן בתוך האפליקציה' : 'קישור אחר — ייפתח בלשונית חדשה'; };
    $('#kv', s).oninput = prev; prev();
    $$('[data-ka]', s).forEach(c => c.onclick = () => { const k = c.dataset.ka; f.roles = f.roles.includes(k) ? f.roles.filter(r => r !== k) : [...f.roles, k]; c.setAttribute('aria-pressed', f.roles.includes(k)); });
    $$('[data-kc]', s).forEach(c => c.onclick = () => { f.category = c.dataset.kc; $$('[data-kc]', s).forEach(y => y.setAttribute('aria-pressed', y === c)); });
    $('#kfi', s).onchange = async e => {
      for (const file of e.target.files) {
        if (file.size > 10485760) { toast(`${file.name}: מעל 10MB — עדיף קישור מדרייב`, 4000); continue; }
        const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.֐-׿-]+/g, '_')}`;
        const { error } = await sb.storage.from('kb').upload(path, file, { contentType: file.type });
        if (error) { toast(error.message); continue; }
        f.files.push({ path, name: file.name });
      }
      drawFiles();
    };
    const del = $('#kdel', s); if (del) del.onclick = async () => {
      if (!(await confirmBox('למחוק את ההדרכה?', { body: 'כולל רישום מי צפה. אי אפשר לשחזר.', ok: 'מחיקה' }))) return;
      const { error } = await sb.from('kb_items').delete().eq('id', x.id); if (error) return toast(error.message);
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
      const { data, error } = await q; if (error) { $('#ks', s).disabled = false; return toast(error.message); }
      if (qs.length) { const { error: e2 } = await sb.from('kb_quiz_keys').upsert({ item_id: data.id, answers: qs.map(q => q.a) }); if (e2) return toast(e2.message); }
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
