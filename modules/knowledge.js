// מרכז ידע: הדרכות "איך מתפעלים" — סרטון (קישור דרייב/יוטיוב שמתנגן בפנים), הסבר, מסמכים.
// בחינם: סרטונים לא נשמרים בשרת שלנו (רק קישור). לשרת עולים רק PDF ותמונות עד 10MB.
// "צפיתי והבנתי" = מעקב הדרכה; פריט "חובה" מופיע בבית לכל מי שעוד לא אישר.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, confirmBox, signedUrls, backBtn, initials, replaceHash, goUp } from '../lib/core.js';

const ytId = u => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/) || [])[1];
const driveId = u => (u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/) || [])[1];
export const embedUrl = u => !u ? null : ytId(u) ? `https://www.youtube-nocookie.com/embed/${ytId(u)}` : driveId(u) ? `https://drive.google.com/file/d/${driveId(u)}/preview` : null;
const cats = async () => { try { const { data } = await sb.from('app_settings').select('value').eq('key', 'kb_categories').maybeSingle(); return data?.value || []; } catch { return []; } };

export async function renderKb(el, cat = '') {
  el.innerHTML = `<header class="phead">${backBtn('#/menu')}<h1>מרכז ידע</h1></header><div class="skel"></div>`;
  const [{ data: items }, { data: views }, C] = await Promise.all([
    sb.from('kb_items').select('id,title,category,body,video_url,files,required,sort,updated_at').order('sort').order('title'),
    sb.from('kb_views').select('item_id,confirmed_at').eq('user_id', state.user.id), cats()]);
  const seen = new Map((views || []).map(v => [v.item_id, v]));
  const all = items || [], M = isManager();
  const todo = all.filter(x => x.required && !seen.get(x.id)?.confirmed_at);
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
      <span class="t"><b>${esc(x.title)}</b><small>${esc(x.category)}${x.video_url ? ' · סרטון' : ''}${(x.files || []).length ? ` · ${x.files.length} מסמכים` : ''}</small></span>
      ${v?.confirmed_at ? '<span class="pill ok">✓</span>' : !v ? '<span class="pill lime">חדש</span>' : ''}</a>`;
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
  const { data: v } = await sb.from('kb_views').select('confirmed_at').eq('item_id', id).eq('user_id', state.user.id).maybeSingle();
  if (!v) sb.from('kb_views').insert({ item_id: id, user_id: state.user.id }).then(() => {});
  const files = x.files || [], urls = files.length ? await signedUrls('kb', files.map(f => f.path)) : {};
  const emb = embedUrl(x.video_url), M = isManager();
  el.innerHTML = `<header class="phead">${backBtn('#/kb')}<h1>${esc(x.title)}</h1></header>
    <div class="stack lg">
      <div class="row"><span class="pill">${esc(x.category)}</span>${x.required ? '<span class="pill warn">חובה</span>' : ''}<span class="grow"></span>${M ? `<button class="chip" id="kbed">עריכה</button>` : ''}</div>
      ${emb ? `<div class="kbvid"><iframe src="${esc(emb)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy" title="${esc(x.title)}"></iframe></div>`
        : x.video_url ? `<a class="btn ghost block" href="${esc(x.video_url)}" target="_blank" rel="noopener">${icon('send', 18)} פתיחת הסרטון</a>` : ''}
      ${x.body ? `<div class="card kbbody">${esc(x.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${files.length ? `<section><h3 class="sh">מסמכים</h3><div class="list">${files.map(f => `<a class="lrow" href="${esc(urls[f.path] || '#')}" target="_blank" rel="noopener"><span class="mic">${icon('file', 19)}</span><span class="grow"><b>${esc(f.name)}</b></span><span class="chev">${icon('chev', 18)}</span></a>`).join('')}</div></section>` : ''}
      ${v?.confirmed_at ? `<div class="acked center">צפית ואישרת ✓</div>` : `<button class="btn primary block big" id="kbok">צפיתי והבנתי</button>`}
      ${M ? '<div id="kbwho"></div>' : ''}
    </div>`;
  const ok = $('#kbok'); if (ok) ok.onclick = async () => {
    ok.disabled = true;
    const { error } = await sb.from('kb_views').upsert({ item_id: id, user_id: state.user.id, confirmed_at: new Date().toISOString() });
    if (error) { ok.disabled = false; return toast(error.message); }
    toast('נרשם — תודה'); renderKbItem(el, id);
  };
  const ed = $('#kbed'); if (ed) ed.onclick = async () => editKb(x, await cats());
  if (M) {
    // מי צפה ואישר — מעקב הדרכה
    const [{ data: team }, { data: vs }] = await Promise.all([
      sb.from('profiles').select('id,full_name').eq('is_active', true).neq('role', 'partner').order('full_name'),
      sb.from('kb_views').select('user_id,confirmed_at,viewed_at').eq('item_id', id)]);
    const by = new Map((vs || []).map(r => [r.user_id, r]));
    $('#kbwho').innerHTML = `<section><h3 class="sh">מי צפה</h3><div class="list">${(team || []).map(u => { const r = by.get(u.id);
      return `<div class="lrow"><span class="avatar sm">${esc(initials(u.full_name))}</span><b class="grow">${esc(u.full_name)}</b>${r?.confirmed_at ? '<span class="pill ok">אישר ✓</span>' : r ? '<span class="pill">צפה</span>' : '<span class="pill muted">עוד לא</span>'}</div>`; }).join('')}</div></section>`;
  }
}

// יצירה / עריכה (מנהלים)
function editKb(x, C) {
  const f = { title: x?.title || '', category: x?.category || C[0] || 'כללי', body: x?.body || '', video_url: x?.video_url || '', required: !!x?.required, files: [...(x?.files || [])] };
  sheet(`<h3>${x ? 'עריכת הדרכה' : 'הדרכה חדשה'}</h3>
    <label class="field">כותרת<input id="kt" value="${esc(f.title)}" placeholder="למשל: הפעלת משאבת הלחץ בבוקר"></label>
    <div class="field">קטגוריה<div class="chips">${[...new Set([...C, f.category])].map(c => `<button type="button" class="chip" data-kc="${esc(c)}" aria-pressed="${c === f.category}">${esc(c)}</button>`).join('')}</div></div>
    <label class="field">קישור לסרטון<small>גוגל דרייב או יוטיוב (לא רשום). בדרייב: שיתוף ← "כל מי שיש לו את הקישור" — כדי שיתנגן לכל הצוות</small><input id="kv" type="url" dir="ltr" value="${esc(f.video_url)}" placeholder="https://drive.google.com/file/d/…"></label>
    <div id="kvp" class="small muted"></div>
    <label class="field">הסבר<small>שלבים, דגשים, מה לא לעשות</small><textarea id="kb" rows="6">${esc(f.body)}</textarea></label>
    <div class="field">מסמכים (PDF / תמונות, עד 10MB)<div id="kf" class="list"></div><label class="btn ghost block" style="position:relative">${icon('plus', 18)} הוספת מסמך<input type="file" accept="application/pdf,image/*" multiple id="kfi" style="position:absolute;inset:0;opacity:0"></label></div>
    <label class="tog"><span>הדרכת חובה <small class="muted">— מופיעה בבית לכל הצוות עד שאישרו, ונשלחת התראה</small></span><span class="sw"><input type="checkbox" id="kr" ${f.required ? 'checked' : ''}><i></i></span></label>
    <div class="row">${x ? '<button class="btn ghost" id="kdel">מחיקה</button>' : ''}<button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="ks">שמירה</button></div>`, (s, close) => {
    const drawFiles = () => { $('#kf', s).innerHTML = f.files.map((x, i) => `<div class="lrow"><span class="mic">${icon('file', 18)}</span><b class="grow">${esc(x.name)}</b><button type="button" class="chip" data-rm="${i}">הסרה</button></div>`).join('');
      $$('[data-rm]', s).forEach(b => b.onclick = () => { f.files.splice(+b.dataset.rm, 1); drawFiles(); }); };
    drawFiles();
    const prev = () => { const u = $('#kv', s).value.trim(); $('#kvp', s).textContent = !u ? '' : embedUrl(u) ? '✓ הסרטון יתנגן בתוך האפליקציה' : 'קישור אחר — ייפתח בלשונית חדשה'; };
    $('#kv', s).oninput = prev; prev();
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
      const row = { title: $('#kt', s).value.trim(), category: f.category, body: $('#kb', s).value.trim() || null, video_url: $('#kv', s).value.trim() || null, required: $('#kr', s).checked, files: f.files };
      if (!row.title) return toast('חסרה כותרת');
      $('#ks', s).disabled = true;
      const q = x ? sb.from('kb_items').update(row).eq('id', x.id).select('id').single() : sb.from('kb_items').insert({ ...row, created_by: state.user.id }).select('id').single();
      const { data, error } = await q; if (error) { $('#ks', s).disabled = false; return toast(error.message); }
      close(); toast(row.required && !x?.required ? 'נשמר — נשלחה התראה לצוות' : 'נשמר');
      location.hash = '#/kb/' + data.id; if (x) dispatchEvent(new HashChangeEvent('hashchange'));
    };
  });
}

// בבית: הדרכות חובה שעוד לא אושרו
export async function kbDue(box) {
  if (!box) return;
  try {
    const [{ data: req }, { data: v }] = await Promise.all([sb.from('kb_items').select('id,title').eq('required', true),
      sb.from('kb_views').select('item_id,confirmed_at').eq('user_id', state.user.id)]);
    const ok = new Set((v || []).filter(x => x.confirmed_at).map(x => x.item_id));
    const due = (req || []).filter(x => !ok.has(x.id));
    box.innerHTML = due.map(x => `<a class="promo" href="#/kb/${x.id}"><span class="mic">${icon('play', 20)}</span><span class="grow"><b>הדרכה לצפייה</b><small>${esc(x.title)}</small></span><span class="chev">${icon('chev', 18)}</span></a>`).join('');
  } catch { box.innerHTML = ''; }
}
