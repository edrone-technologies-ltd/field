// צפייה בתמונות בכל האפליקציה: דפדוף בין כל התמונות שבמסך (חצים / החלקה / מקלדת), הגדלה בהקשה כפולה,
// וסימון על תמונה — הסימון נשמר כתמונה נוספת ליד המקור, המקור לא משתנה.
import { sb, state, enqueue, isManager, toast, esc, ask } from './core.js';

let V = null;  // המציג הפתוח

// אוסף התמונות: מהחלון הפתוח (אם התמונה שם) או מהמסך עצמו. בלי אייקונים ותמונות פרופיל קטנות
function collect(src) {
  const roots = [document.querySelector('#sheet:not([hidden])'), document.querySelector('#app')].filter(Boolean);
  const same = (a, b) => a === b || (a && b && a.split('?')[0] === b.split('?')[0]);
  for (const r of roots) {
    const imgs = [...r.querySelectorAll('img')].filter(i => i.src && !i.closest('.av,.avatar,.logo,.brand') && !(i.complete && i.naturalWidth && i.naturalWidth < 80));
    const list = []; const seen = new Set();
    for (const i of imgs) { const k = i.src.split('?')[0]; if (seen.has(k)) continue; seen.add(k); list.push({ src: i.src, title: i.alt || '' }); }
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
  el.innerHTML = `<div class="vtop"><button class="vbtn" data-a="close" aria-label="סגירה">✕</button><span class="vt"></span><button class="vbtn vedit" data-a="edit">סימון</button></div>
    <div class="vstage"><img class="vimg" alt=""></div>
    ${list.length > 1 ? '<button class="vnav vprev" data-a="prev" aria-label="הקודמת">›</button><button class="vnav vnext" data-a="next" aria-label="הבאה">‹</button>' : ''}`;
  document.body.appendChild(el);
  let i = idx, zoomed = false;
  const img = el.querySelector('.vimg'), stage = el.querySelector('.vstage');
  const show = () => {
    zoomed = false; stage.classList.remove('z'); img.src = list[i].src;
    el.querySelector('.vt').innerHTML = `${esc(list[i].title || '')}${list.length > 1 ? ` <small>${i + 1} / ${list.length}</small>` : ''}`;
  };
  const go = d => { if (list.length < 2) return; i = (i + d + list.length) % list.length; show(); };
  const close = () => { removeEventListener('keydown', key); el.remove(); V = null; };
  const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(1); else if (e.key === 'ArrowRight') go(-1); };
  addEventListener('keydown', key);
  el.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') close(); if (a === 'prev') go(-1); if (a === 'next') go(1); if (a === 'edit') annotate(list[i].src, list[i].title, close); };
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
function annotate(src, title, closeViewer) {
  const el = document.createElement('div'); el.className = 'annot';
  el.innerHTML = `<div class="vtop"><button class="vbtn" data-a="cancel">ביטול</button><span class="vt">סימון על התמונה</span><button class="vbtn primary" data-a="save">שמירה כתמונה נוספת</button></div>
    <div class="astage"><canvas></canvas><div class="aload">טוען…</div></div>
    <div class="atools">
      <div class="seg">${[['pen', 'עט'], ['arrow', 'חץ'], ['circle', 'עיגול'], ['text', 'טקסט']].map(([k, l], j) => `<button data-t="${k}" aria-pressed="${!j}">${l}</button>`).join('')}</div>
      <div class="seg">${COLORS.map((c, j) => `<button data-c="${c}" aria-pressed="${!j}" style="--c:${c}" aria-label="צבע"><i></i></button>`).join('')}</div>
      <button class="vbtn" data-a="undo">ביטול פעולה</button></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  let tool = 'pen', color = COLORS[0], base = null, ops = [], cur = null;
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => {
    const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    base = im; el.querySelector('.aload').remove(); draw();
  };
  im.onerror = () => { el.querySelector('.aload').textContent = 'לא ניתן לטעון את התמונה לעריכה'; };
  im.src = src;
  const lw = () => Math.max(3, Math.round(Math.max(cv.width, cv.height) / 220));
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
    if (tool === 'text') { const s = await ask('מה לכתוב?', { ok: 'הוספה', placeholder: 'למשל: כתם עקשן' }); if (s) { ops.push({ t: 'text', c: color, w: lw(), p: [p], s }); draw(); } return; }
    cv.setPointerCapture(e.pointerId); cur = { t: tool, c: color, w: lw(), p: [p, p] };
  };
  cv.onpointermove = e => { if (!cur) return; const p = pt(e); if (cur.t === 'pen') cur.p.push(p); else cur.p[1] = p; draw(); };
  cv.onpointerup = cv.onpointercancel = () => { if (cur) { ops.push(cur); cur = null; draw(); } };
  el.onclick = async e => {
    const t = e.target.closest('[data-t]'), c = e.target.closest('[data-c]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (t) { tool = t.dataset.t; el.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    if (c) { color = c.dataset.c; el.querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-pressed', b === c)); }
    if (a === 'undo') { ops.pop(); draw(); }
    if (a === 'cancel') el.remove();
    if (a === 'save') {
      if (!ops.length) return toast('עוד לא סומן כלום');
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
      try { const where = await saveCopy(src, blob, title); el.remove(); closeViewer(); toast(where); dispatchEvent(new HashChangeEvent('hashchange')); }
      catch (err) { toast(err.message || 'השמירה נכשלה', 4000); }
    }
  };
}

// שמירת העותק המסומן ליד המקור, לפי מקור התמונה. המקור לא נגעים בו.
async function saveCopy(src, blob, title) {
  const m = /\/object\/sign\/([^/]+)\/([^?]+)/.exec(src || ''), bucket = m?.[1], path = m ? decodeURIComponent(m[2]) : null;
  const photoId = crypto.randomUUID(), dest = `${state.user.id}/edit/${photoId}.jpg`;
  const META = ['site_id', 'building_id', 'project_id', 'work_day_id', 'spec_id', 'issue_id', 'kind', 'conversation_id'];
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
  // אחרת (מפת אתר, תמונה מצ'אט): שיתוף / הורדה — מעלים לאן שצריך
  const file = new File([blob], `${(title || 'תמונה').replace(/[\\/:*?"<>|]/g, '')} - מסומן.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }).catch(() => {}); return 'התמונה המסומנת מוכנה לשיתוף'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  return 'התמונה המסומנת הורדה';
}
