// צפייה בתמונות בכל האפליקציה: דפדוף בין כל התמונות שבמסך (חצים / החלקה / מקלדת), הגדלה בהקשה כפולה,
// וסימון על תמונה — הסימון נשמר כתמונה נוספת ליד המקור, המקור לא משתנה.
import { sb, state, enqueue, isManager, toast, esc } from './core.js';
import { errText } from './audit.js';

let V = null;  // המציג הפתוח
// מנהל: תמונה שיובאה מהגלריה (לא צולמה במקום) מסומנת "מהגלריה" + זמן הצילום המקורי (db/137)
const TAG = new Map();
function srcTag(src) {
  if (!isManager()) return Promise.resolve('');
  const m = /\/object\/sign\/field\/([^?]+)/.exec(src || ''); if (!m) return Promise.resolve('');
  const p = decodeURIComponent(m[1]).replace(/_t\.jpg$/i, '.jpg');
  if (!TAG.has(p)) TAG.set(p, sb.from('photos').select('source,taken_at').eq('storage_path', p).limit(1).maybeSingle().then(({ data }) => {
    if (data?.source !== 'gallery') return '';
    const t = data.taken_at ? new Date(data.taken_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return '🖼️ מהגלריה' + (t ? ` · צולם ${t}` : '');
  }, () => ''));
  return TAG.get(p);
}

// אוסף התמונות: מהחלון הפתוח (אם התמונה שם) או מהמסך עצמו. בלי אייקונים ותמונות פרופיל קטנות
function collect(src) {
  const roots = [document.querySelector('#sheet:not([hidden])'), document.querySelector('#app')].filter(Boolean);
  const same = (a, b) => a === b || (a && b && a.split('?')[0] === b.split('?')[0]);
  for (const r of roots) {
    const imgs = [...r.querySelectorAll('img')].filter(i => i.src && !i.closest('.av,.avatar,.logo,.brand') && !(i.complete && i.naturalWidth && i.naturalWidth < 80));
    const list = []; const seen = new Set();
    for (const i of imgs) { const k = (i.dataset.full || i.src).split('?')[0]; if (seen.has(k)) continue; seen.add(k); list.push({ src: i.dataset.full || i.src, title: i.alt || '' }); }
    const idx = list.findIndex(x => same(x.src, src));
    if (idx >= 0) return { list, idx };
  }
  return { list: [{ src, title: '' }], idx: 0 };
}

export function openViewer(src, title) {
  if (!src) return;
  const { list, idx } = collect(src);
  if (title) list[idx].title = title;
  V?.close();
  const el = document.createElement('div'); el.className = 'viewer'; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="vtop"><button class="vbtn" data-a="close" aria-label="סגירה">✕</button><span class="vt"></span><button class="vbtn vshare" data-a="share" aria-label="שיתוף"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg></button><button class="vbtn vedit" data-a="edit">סימון</button></div>
    <div class="vstage"><img class="vimg" alt=""></div>
    ${list.length > 1 ? '<button class="vnav vprev" data-a="prev" aria-label="הקודמת">›</button><button class="vnav vnext" data-a="next" aria-label="הבאה">‹</button>' : ''}`;
  document.body.appendChild(el);
  let i = idx, zoomed = false;
  const img = el.querySelector('.vimg'), stage = el.querySelector('.vstage');
  const show = () => {
    zoomed = false; stage.classList.remove('z'); img.src = list[i].src;
    el.querySelector('.vt').innerHTML = `${esc(list[i].title || '')}${list.length > 1 ? ` <small>${i + 1} / ${list.length}</small>` : ''}`;
    el.querySelector('.vsrc')?.remove();
    const k = i; srcTag(list[i].src).then(t => { if (t && i === k && !el.querySelector('.vsrc')) el.insertAdjacentHTML('beforeend', `<div class="vsrc">${esc(t)}</div>`); });
  };
  const go = d => { if (list.length < 2) return; i = (i + d + list.length) % list.length; show(); };
  const close = () => { removeEventListener('keydown', key); el.remove(); V = null; };
  const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(1); else if (e.key === 'ArrowRight') go(-1); };
  addEventListener('keydown', key);
  el.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') close(); if (a === 'prev') go(-1); if (a === 'next') go(1); if (a === 'edit') annotate(list[i].src, list[i].title, close);
    if (a === 'share') sharePhoto(list[i].src, list[i].title, e.target.closest('[data-a]')); };
  // הקשה כפולה = הגדלה פי 2.5 עם גלילה; החלקה אופקית (כשלא מוגדל) = דפדוף. בעברית: החלקה שמאלה = הבאה
  let last = 0, sx = 0, sy = 0;
  img.onclick = e => { const now = Date.now(); if (now - last < 300) { zoomed = !zoomed; stage.classList.toggle('z', zoomed); if (zoomed) { stage.scrollLeft = (img.offsetWidth - stage.clientWidth) * (e.offsetX / img.clientWidth); stage.scrollTop = (img.offsetHeight - stage.clientHeight) * (e.offsetY / img.clientHeight); } } last = now; };
  stage.addEventListener('touchstart', e => { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  stage.addEventListener('touchend', e => { if (zoomed || e.changedTouches.length !== 1) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); });
  show();
  V = { close };
}

// ---------- סימון על תמונה ----------
const COLORS = ['#E11D48', '#FACC15', '#FFFFFF', '#111827'];
// סימון על תמונה שרק צולמה (תקלה / ממצא לתיקון), לפני השמירה: { blob, marked } — המקור נשמר בנפרד אצל הקורא. null = בוטל
export function markupFile(file) {
  return new Promise(done => {
    const u = URL.createObjectURL(file), end = v => { URL.revokeObjectURL(u); done(v); };
    annotate(u, '', () => {}, { tool: 'circle', onSave: blob => { try { if (file.__ph) blob.__ph = file.__ph; } catch { /* */ } end({ blob, marked: true }); }, onSkip: () => end({ blob: file, marked: false }), onCancel: () => end(null) });
  });
}
function annotate(src, title, closeViewer, F = null) {
  const el = document.createElement('div'); el.className = 'annot';
  el.innerHTML = `<div class="vtop"><button class="vbtn" data-a="cancel">${F ? '✕' : 'ביטול'}</button><span class="vt">סימון על התמונה</span>${F ? '<button class="vbtn" data-a="skip">בלי סימון</button>' : ''}${F ? '' : '<button class="vbtn" data-a="ashare">שיתוף</button>'}<button class="vbtn primary" data-a="save">${F ? 'שמירה ✓' : /\/object\/sign\/field\/[^?]*\/chat\//.test(src || '') ? 'שליחה בצ׳אט' : 'שמירה כתמונה נוספת'}</button></div>
    <div class="astage"><canvas></canvas><div class="aload">טוען…</div></div>
    <div class="atools">
      <div class="seg">${[['pen', 'עט'], ['arrow', 'חץ'], ['circle', 'עיגול'], ['text', 'טקסט']].map(([k, l], j) => `<button data-t="${k}" aria-pressed="${F?.tool ? k === F.tool : !j}">${l}</button>`).join('')}</div>
      <div class="seg">${COLORS.map((c, j) => `<button data-c="${c}" aria-pressed="${!j}" style="--c:${c}" aria-label="צבע"><i></i></button>`).join('')}</div>
      <button class="vbtn" data-a="undo">ביטול פעולה</button></div>
    <div class="atext" hidden><input type="text" maxlength="40" placeholder="למשל: כתם עקשן" enterkeyhint="done"><button class="vbtn primary" type="button" data-a="tok">הוספה</button></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  let tool = F?.tool || 'pen', color = COLORS[0], base = null, ops = [], cur = null, tp = null;
  const tbox = el.querySelector('.atext'), tin = tbox.querySelector('input');
  const addText = () => { const s = tin.value.trim(); if (s && tp) { ops.push({ t: 'text', c: color, w: lw(), p: [tp], s }); draw(); } tp = null; tin.value = ''; tbox.hidden = true; };
  tin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addText(); } };
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => {
    const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    base = im; el.querySelector('.aload').remove(); draw();
  };
  im.onerror = () => { el.querySelector('.aload').textContent = 'התמונה לא נטענה לעריכה — נסו שוב'; };
  im.src = src;
  const lw = () => Math.max(4, Math.round(Math.max(cv.width, cv.height) / 160));
  function paint(o) {
    ctx.strokeStyle = ctx.fillStyle = o.c; ctx.lineWidth = o.w; ctx.lineCap = ctx.lineJoin = 'round';
    if (o.t === 'pen') { ctx.beginPath(); o.p.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    if (o.t === 'arrow') { const [[x0, y0], [x1, y1]] = o.p, a = Math.atan2(y1 - y0, x1 - x0), h = o.w * 4.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill(); }
    if (o.t === 'circle') { const [[x0, y0], [x1, y1]] = o.p; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2 || 1, Math.abs(y1 - y0) / 2 || 1, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (o.t === 'text') { const fs = o.w * 7; ctx.font = `800 ${fs}px Heebo, sans-serif`; ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.lineWidth = fs / 6; ctx.strokeStyle = o.c === '#111827' ? '#fff' : '#111827'; ctx.strokeText(o.s, o.p[0][0], o.p[0][1]); ctx.fillStyle = o.c; ctx.fillText(o.s, o.p[0][0], o.p[0][1]); }
  }
  function draw() { if (!base) return; ctx.drawImage(base, 0, 0, cv.width, cv.height); ops.forEach(paint); if (cur) paint(cur); }
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = async e => {
    if (!base) return; const p = pt(e);
    if (tool === 'text') { tp = p; tbox.hidden = false; setTimeout(() => tin.focus(), 30); return; }   // תווית בתוך המסך — בלי חלון שסוגר את מה שפתוח מתחת
    cv.setPointerCapture(e.pointerId); cur = { t: tool, c: color, w: lw(), p: [p, p] };
  };
  cv.onpointermove = e => { if (!cur) return; const p = pt(e); if (cur.t === 'pen') cur.p.push(p); else cur.p[1] = p; draw(); };
  cv.onpointerup = cv.onpointercancel = () => { if (cur) { ops.push(cur); cur = null; draw(); } };
  el.onclick = async e => {
    const t = e.target.closest('[data-t]'), c = e.target.closest('[data-c]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (t) { tool = t.dataset.t; el.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    if (c) { color = c.dataset.c; el.querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-pressed', b === c)); }
    if (a === 'undo') { ops.pop(); draw(); }
    if (a === 'tok') addText();
    if (a === 'cancel') { el.remove(); F?.onCancel(); }
    if (a === 'ashare') {   // שיתוף התמונה המסומנת בלי לשמור עותק
      if (!ops.length) return toast('עוד לא סומן כלום');
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
      (await import('./share.js')).shareFile(blob, `${title || 'תמונה'} - מסומן.jpg`, title || 'תמונה מסומנת');
    }
    if (a === 'skip') { el.remove(); F.onSkip(); }
    if (a === 'save') {
      if (!ops.length) return F ? (el.remove(), F.onSkip()) : toast('עוד לא סומן כלום');
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
      if (F) { el.remove(); return F.onSave(blob); }
      try { const where = await saveCopy(src, blob, title); el.remove(); closeViewer(); toast(where); dispatchEvent(new HashChangeEvent('hashchange')); }
      catch (err) { toast(errText(err, 'השמירה נכשלה — נסו שוב'), 4000); }
    }
  };
}

// שמירת העותק המסומן ליד המקור, לפי מקור התמונה. המקור לא נגעים בו.
async function saveCopy(src, blob, title) {
  const m = /\/object\/sign\/([^/]+)\/([^?]+)/.exec(src || ''), bucket = m?.[1], path = m ? decodeURIComponent(m[2]) : null;
  const photoId = crypto.randomUUID(), dest = `${state.user.id}/edit/${photoId}.jpg`;
  const META = ['site_id', 'building_id', 'project_id', 'work_day_id', 'spec_id', 'issue_id', 'kind', 'conversation_id'];
  // תמונה מצ׳אט (<uid>/chat/<שיחה|פרויקט|אתר>/...): הסימון נשלח כהודעה חדשה באותו צ׳אט, דרך התור (גם בלי קליטה).
  // באג 19/10: הסימון נשמר רק כ"תמונה נוספת" בלי הודעה — לא הופיע בצ׳אט ולא הגיע לנמען
  const cm = bucket === 'field' && /\/chat\/([0-9a-f-]{36})\//.exec(path || '');
  if (cm) {
    const id = cm[1];
    const { data: msg } = await sb.from('messages').select('conversation_id,project_id,site_id').eq('photo_path', path).limit(1).maybeSingle().then(r => r, () => ({ data: null }));
    const col = (msg && ['conversation_id', 'project_id', 'site_id'].find(k => msg[k] === id))
      || (location.hash.startsWith('#/c/' + id) ? 'conversation_id' : location.hash.startsWith('#/p/' + id) ? 'project_id' : null);
    if (!col) throw new Error('לא נשלח — פתחו את הצ׳אט ונסו שוב');
    const dest2 = `${state.user.id}/chat/${id}/${photoId}.jpg`;
    await enqueue({ kind: 'photo', blob, photoId, path: dest2, meta: { [col]: id, kind: 'general', caption: 'סימון על תמונה' } });
    await enqueue({ kind: 'insert', table: 'messages', row: { id: crypto.randomUUID(), [col]: id, author_id: state.user.id, body: '', photo_path: dest2 } });
    return navigator.onLine ? 'נשלח בצ׳אט' : 'נשמר · יישלח בצ׳אט כשתחזור קליטה';
  }
  if (bucket === 'field') {
    // תמונת שטח / אפיון / תקלה: אותו שיוך ואותו סוג — מופיעה מיד ליד המקור
    const { data: o } = await sb.from('photos').select(META.join(',')).eq('storage_path', path).maybeSingle();
    if (o) {
      const meta = Object.fromEntries(META.map(k => [k, o[k]]).filter(([, v]) => v != null));
      await enqueue({ kind: 'photo', blob, photoId, path: dest, meta: { ...meta, caption: 'סימון על תמונה' } });
      return 'נשמר כתמונה נוספת';
    }
  }
  if (bucket === 'media' && /^p\/[0-9a-f-]{36}\//.test(path || '')) {
    // תמונה מדוח ביצוע: נשמרת לתמונות הפרויקט
    await enqueue({ kind: 'photo', blob, photoId, path: dest, meta: { project_id: path.split('/')[1], kind: 'general', caption: 'סימון על תמונה מדוח' } });
    return 'נשמר בתמונות הפרויקט';
  }
  if (bucket === 'plans' && isManager()) {
    // גיליון תכנית: גיליון נוסף לאותו מבנה ("· מסומן")
    const { data: pi } = await sb.from('plan_images').select('*').eq('storage_path', path).maybeSingle();
    if (pi) {
      const np = path.replace(/(\.\w+)?$/, `-marked-${Date.now()}.jpg`);
      const { error } = await sb.storage.from('plans').upload(np, blob, { contentType: 'image/jpeg' }); if (error) throw error;
      const { id, created_at, ...rest } = pi;
      const { error: e2 } = await sb.from('plan_images').insert({ ...rest, storage_path: np, title: `${pi.title} · מסומן`, sort: (pi.sort || 0) + 1 }); if (e2) throw e2;
      return 'נשמר כגיליון נוסף';
    }
  }
  // אחרת (מפת אתר, תמונה מצ׳אט): שיתוף / הורדה — מעלים לאן שצריך
  const file = new File([blob], `${(title || 'תמונה').replace(/[\\/:*?"<>|]/g, '')} - מסומן.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) { const ok = await navigator.share({ files: [file] }).then(() => true, () => false); if (ok) return 'התמונה המסומנת שותפה'; }   // בוטל — יורד לטלפון, לא נעלם
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  return 'התמונה המסומנת הורדה';
}

// שיתוף התמונה עצמה (קובץ, לא קישור חתום שפג)
async function sharePhoto(src, title, btn) {
  const name = `${(title || 'תמונה').slice(0, 60)}.jpg`;
  (await import('./share.js')).shareFile(src, name, title || 'תמונה · E-Drone', '', { btn });
}
