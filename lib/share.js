// שיתוף אחד לכל האפליקציה: קובץ (PDF / תמונה / מסמך) או קישור.
// טלפון (iOS Safari / Android Chrome): גיליון השיתוף של המכשיר — וואטסאפ, מייל, שמירה לקבצים.
// מחשב / דפדפן בלי שיתוף קבצים: וואטסאפ (Web) · העתקת קישור · הורדה.
// קבצים מוגנים (תלושים, מסמכים, תמונות שטח): משתפים את הקובץ עצמו — לא קישור חתום שפג אחרי זמן קצר.
// קישור משתפים רק כשהוא קבוע: מסך באפליקציה (לעובדים מחוברים) או כתובת ציבורית (יוטיוב, share.html).
import { sb, icon, toast, sheet, esc } from './core.js';

export const SHARE_IC = 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12';
export const shareIcon = (s = 20) => icon(SHARE_IC, s);
// קישור קבוע למסך באפליקציה (נפתח למי שמחובר)
export const appUrl = hash => location.origin + location.pathname.replace(/[^/]*$/, '') + hash;
const desktop = () => matchMedia('(pointer:fine)').matches && !('ontouchstart' in window) && !navigator.maxTouchPoints;
const clean = n => (n || 'קובץ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// src: Blob | File | כתובת (string) | { bucket, path } לקובץ באחסון המוגן
async function toFile(src, name) {
  let blob = src;
  if (src && !(src instanceof Blob)) {
    let url = typeof src === 'string' ? src : null;
    if (!url && src?.bucket) { const { data, error } = await sb.storage.from(src.bucket).createSignedUrl(src.path, 120); if (error || !data?.signedUrl) throw new Error('no-access'); url = data.signedUrl; }
    const r = await fetch(url); if (!r.ok) throw new Error('fetch'); blob = await r.blob();
  }
  const type = blob.type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg');
  let n = clean(name); if (!/\.\w{2,5}$/.test(n)) n += '.' + (EXT[type] || 'pdf');
  return blob instanceof File && blob.name === n ? blob : new File([blob], n, { type });
}
const download = f => { const a = document.createElement('a'), u = URL.createObjectURL(f); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 6e4); };
const wa = t => window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
async function copy(t) { try { await navigator.clipboard.writeText(t); return true; } catch { const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); const ok = document.execCommand('copy'); x.remove(); return ok; } }
const busy = (b, on) => { if (!b) return; b.disabled = on; b.classList.toggle('busy', on); };

// גיליון חלופי (מחשב / אין שיתוף קבצים / המכשיר ביקש לחיצה נוספת)
function fallback({ file, url, title, text }) {
  const msg = [text || title, url].filter(Boolean).join('\n');
  const nativeF = file && navigator.canShare?.({ files: [file] }), nativeL = !file && url && navigator.share;
  sheet(`<div class="shs"><div class="shs-h"><span class="shs-ic">${file ? icon(file.type === 'application/pdf' ? 'file' : 'photo', 22) : shareIcon(22)}</span><span class="grow"><b>${esc(title || file?.name || 'שיתוף')}</b>${file ? `<small><bdi>${esc(file.name.replace(/\.\w{2,5}$/, ""))}</bdi> · <bdi dir="ltr">${file.size < 1048576 ? Math.max(1, Math.round(file.size / 1024)) + 'KB' : (file.size / 1048576).toFixed(1) + 'MB'}</bdi></small>` : url ? `<small dir="ltr">${esc(url.replace(/^https?:\/\//, '').slice(0, 60))}</small>` : ''}</span></div>
    ${nativeF || nativeL ? `<button class="btn primary block big" data-sh="native">${shareIcon(18)} שיתוף</button>` : ''}
    <div class="shs-g">
      <button class="shs-b wa" data-sh="wa"><span>${icon('chat', 22)}</span>וואטסאפ</button>
      ${url ? `<button class="shs-b" data-sh="copy"><span>${icon('clipboard', 22)}</span>העתקת קישור</button>` : ''}
      ${file ? `<button class="shs-b" data-sh="dl"><span>${icon('file', 22)}</span>הורדה</button>` : ''}
    </div>
    ${file && !url ? '<div class="shs-n">הקובץ יורד — מצרפים אותו בצ׳אט</div>' : ''}
    <button class="btn ghost block" data-close>סגירה</button></div>`, (s, close) => {
    s.querySelectorAll('[data-sh]').forEach(b => b.onclick = async () => {
      const k = b.dataset.sh;
      if (k === 'native') { try { await navigator.share(file ? { files: [file], title } : { url, title, text }); close(); } catch (e) { if (e?.name !== 'AbortError') toast('השיתוף לא נפתח'); } }
      if (k === 'wa') { if (file && !url) download(file); wa(msg || title); close(); }
      if (k === 'copy') { toast(await copy(url) ? 'הקישור הועתק' : 'לא הועתק'); close(); }
      if (k === 'dl') { download(file); toast('הקובץ ירד'); close(); }
    });
  });
}

// שיתוף קובץ. opts.link = קישור קבוע לאותו דבר (אם יש) — נכנס להודעה בוואטסאפ/העתקה. opts.btn = כפתור לנעילה בזמן הכנה
export async function shareFile(src, name, title = '', text = '', opts = {}) {
  let file;
  busy(opts.btn, true);
  try { file = await toFile(src, name); }
  catch (e) { busy(opts.btn, false); return toast(e?.message === 'no-access' ? 'אין גישה לקובץ' : 'הקובץ לא נטען — נסו שוב'); }
  busy(opts.btn, false);
  const can = navigator.canShare?.({ files: [file] });
  if (can && !desktop()) {
    try { await navigator.share({ files: [file], title: title || file.name, ...(text ? { text } : {}) }); return; }
    catch (e) {
      if (e?.name === 'AbortError') return;
      // ההכנה לקחה זמן והמכשיר רוצה לחיצה חדשה (iOS) — אותו קובץ, כפתור אחד
      if (e?.name !== 'NotAllowedError' && e?.name !== 'TypeError') return toast('השיתוף לא נפתח');
    }
  }
  fallback({ file, url: opts.link || '', title, text });
}

// שיתוף קישור קבוע: מסך באפליקציה (appUrl) או כתובת ציבורית
export async function shareLink(url, title = '', text = '') {
  if (navigator.share && !desktop()) {
    try { await navigator.share({ url, title, ...(text ? { text } : {}) }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  fallback({ url, title, text });
}

// ---------- מסמך הדפסה (.creport) → קובץ PDF אמיתי, A4, בלי שרת ----------
const LIBS = { h2c: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', pdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js' };
const loaded = {};
const lib = k => loaded[k] ||= new Promise((ok, bad) => { const s = document.createElement('script'); s.src = LIBS[k]; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => { delete loaded[k]; bad(new Error('lib')); }; document.head.appendChild(s); });
export async function pdfFrom(root, { scale = 1.6 } = {}) {
  await Promise.all([lib('h2c'), lib('pdf')]);
  const pages = [...root.querySelectorAll('.pg')]; if (!pages.length) pages.push(root);
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let first = true;
  for (const pg of pages) {
    let cuts = [];
    const cv = await window.html2canvas(pg, { scale, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: 1240,
      onclone: d => {
        d.body.classList.add('pdf-render'); d.documentElement.dataset.theme = 'light';
        // ::after משוכפל עם המידות של המסך הנוכחי (טלפון) — מותחים לגודל של A4
        const st = d.createElement('style'); st.textContent = '.creport .hero>html2canvaspseudoelement{width:100%!important;height:100%!important;top:0!important;right:0!important;left:0!important;bottom:0!important}'; d.head.appendChild(st);
        d.querySelectorAll('.creport .hero').forEach(h => [...h.children].forEach(c => { if (c.tagName.toLowerCase() === 'html2canvaspseudoelement') c.style.cssText += ';width:100%;height:100%;top:0;left:0'; }));
        // object-fit לא נתמך — תמונה ← רקע בגודל זהה (בלי מתיחה)
        d.querySelectorAll('.pdf-render img').forEach(im => { const cs = d.defaultView.getComputedStyle(im); if (!/cover|contain/.test(cs.objectFit)) return;
          const v = d.createElement('div'); v.className = im.className;
          v.style.cssText = `display:block;width:${im.offsetWidth}px;height:${im.offsetHeight}px;background:url("${im.currentSrc || im.src}") ${cs.objectPosition || 'center'}/${cs.objectFit} no-repeat;border-radius:${cs.borderRadius};position:${cs.position};top:${cs.top};right:${cs.right};bottom:${cs.bottom};left:${cs.left}`;
          im.replaceWith(v); });
        // נקודות חיתוך טבעיות לעמודים ארוכים: בין שורות/ימים/מקטעים
        const c = d.querySelectorAll('.pdf-render .pg')[pages.indexOf(pg)] || d.body, top = c.getBoundingClientRect().top;
        cuts = [...c.querySelectorAll('.vrow,.pday,.ba,section,h2,h3,.rsec,.meta,.end,table tr,.vpics,p')].map(e => e.getBoundingClientRect().top - top).filter(y => y > 0).sort((a, b) => a - b);
      } });
    const W = cv.width, pageH = Math.round(W * 297 / 210);
    const cutsPx = cuts.map(y => y * scale);
    for (let y = 0; y < cv.height - 4;) {
      let end = Math.min(cv.height, y + pageH);
      if (end < cv.height) { const nice = cutsPx.filter(c => c > y + pageH * 0.55 && c <= end - 2).pop(); if (nice) end = Math.round(nice) - 6; }
      const part = document.createElement('canvas'); part.width = W; part.height = end - y;
      const g = part.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, part.height); g.drawImage(cv, 0, y, W, part.height, 0, 0, W, part.height);
      if (!first) doc.addPage(); first = false;
      doc.addImage(part.toDataURL('image/jpeg', 0.84), 'JPEG', 0, 0, 210, part.height * 210 / W, undefined, 'FAST');
      y = end;
    }
  }
  return doc.output('blob');
}
// כפתור "שיתוף" בסרגל של מסמך הדפסה: מכין PDF ומשתף את הקובץ
export async function sharePrint(btn, root, name, title) {
  if (btn?.disabled) return;
  const lbl = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="shspin"></span>'; }
  try {
    root.querySelectorAll('[contenteditable]').forEach(e => e.blur());
    const blob = await pdfFrom(root);
    if (btn) { btn.disabled = false; btn.innerHTML = lbl; }
    await shareFile(new File([blob], clean(name) + '.pdf', { type: 'application/pdf' }), clean(name) + '.pdf', title);
  } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = lbl; } toast(e?.message === 'lib' ? 'אין קליטה — נסו שוב' : 'ה-PDF לא נוצר — נסו "הדפסה"'); }
}
