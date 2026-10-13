// בחירת מקור לתמונה — בכל מקום באפליקציה: "צילום" או "מהגלריה" (אביחי 13/10).
// עובד על כל input[type=file] של תמונות בלבד, בלי לשנות את המסכים: לחיצה על הכפתור הקיים בטלפון פותחת בחירה קצרה,
// והקבצים מגיעים לאותו onchange הקיים (הקטנה, תור אופליין, סימון וכו׳ — ללא שינוי).
// כל קובץ מסומן במקור שלו (file.__ph = { src, t }) — addFieldPhoto שומר source / taken_at בתמונה (db/137).
const coarse = () => matchMedia('(pointer: coarse)').matches;
const isImg = inp => { const a = (inp.getAttribute('accept') || '').split(',').map(s => s.trim()).filter(Boolean); return a.length > 0 && a.every(s => s.startsWith('image/')); };

// זמן הצילום המקורי מתוך EXIF (DateTimeOriginal) — JPEG בלבד; אחרת תאריך הקובץ אם הוא לא "עכשיו"
export async function takenAt(f) {
  try {
    const b = new DataView(await f.slice(0, 256 * 1024).arrayBuffer());
    if (b.byteLength > 12 && b.getUint16(0) === 0xFFD8) {
      for (let o = 2; o < b.byteLength - 10;) {
        const m = b.getUint16(o); if ((m & 0xFF00) !== 0xFF00) break;
        if (m === 0xFFE1 && b.getUint32(o + 4) === 0x45786966) { const t = exif(b, o + 10); if (t) return t; break; }
        o += 2 + b.getUint16(o + 2);
      }
    }
  } catch { /* */ }
  const lm = f.lastModified; return lm && lm < Date.now() - 120000 && lm > 946684800000 ? new Date(lm).toISOString() : null;
}
function exif(b, t) {
  const le = b.getUint16(t) === 0x4949, u16 = p => b.getUint16(p, le), u32 = p => b.getUint32(p, le);
  const tags = (p) => { const r = {}; if (p + 2 > b.byteLength) return r; const n = u16(p); for (let i = 0; i < n && p + 14 + i * 12 <= b.byteLength; i++) { const e = p + 2 + i * 12; r[u16(e)] = e; } return r; };
  const str = e => { const c = u32(e + 4), at = c > 4 ? t + u32(e + 8) : e + 8; let s = ''; for (let i = 0; i < c - 1 && at + i < b.byteLength; i++) s += String.fromCharCode(b.getUint8(at + i)); return s; };
  const i0 = tags(t + u32(t + 4)); let dt = '', off = '';
  if (i0[0x8769]) { const ex = tags(t + u32(i0[0x8769] + 8)); if (ex[0x9003]) dt = str(ex[0x9003]); if (ex[0x9011]) off = str(ex[0x9011]); }
  if (!dt && i0[0x0132]) dt = str(i0[0x0132]);
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(dt); if (!m) return null;
  const d = /^[+-]\d\d:\d\d$/.test(off) ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) || d.getFullYear() < 2000 || d > Date.now() + 864e5 ? null : d.toISOString();
}

// חלון בחירה קטן משלו (לא #sheet — כדי לא לסגור טופס פתוח כמו הוצאה / תקלה)
function choose() {
  return new Promise(done => {
    document.querySelector('.phpk')?.remove();
    const el = document.createElement('div'); el.className = 'phpk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="phpk-in"><button type="button" class="phpk-b" data-s="camera"><span>📷</span>צילום</button><button type="button" class="phpk-b" data-s="gallery"><span>🖼️</span>מהגלריה</button><button type="button" class="phpk-x" data-s="">ביטול</button></div>`;
    const end = v => { removeEventListener('keydown', key); el.remove(); done(v); };
    const key = e => { if (e.key === 'Escape') end(null); };
    addEventListener('keydown', key);
    el.onclick = e => { const b = e.target.closest('[data-s]'); if (b) end(b.dataset.s || null); else if (e.target === el) end(null); };
    document.body.appendChild(el);
    el.querySelector('.phpk-b').focus({ preventScroll: true });
  });
}
function open(inp, src) {
  if (inp.dataset.cap == null) inp.dataset.cap = inp.getAttribute('capture') || '';
  if (src === 'camera') inp.setAttribute('capture', inp.dataset.cap || 'environment'); else inp.removeAttribute('capture');
  inp._phSrc = src; inp._phGo = true; inp.click();
}

// לחיצה על בחירת תמונה (גם דרך label) — בטלפון: בחירה בין מצלמה לגלריה. במחשב: בחירת קובץ רגילה
document.addEventListener('click', async e => {
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || !isImg(inp) || inp.disabled) return;
  if (inp._phGo) { inp._phGo = false; return; }
  if (!coarse()) { inp._phSrc = 'gallery'; return; }
  e.preventDefault();
  const src = await choose();
  if (src) open(inp, src);
}, true);
// הקבצים מסומנים במקור לפני שה-onchange של המסך רץ
document.addEventListener('change', e => {
  const inp = e.target; if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || !inp.files?.length) return;
  const src = inp._phSrc || (isImg(inp) ? (inp.hasAttribute('capture') ? 'camera' : 'gallery') : null); if (!src) return;
  for (const f of inp.files) try { f.__ph = { src, t: src === 'gallery' ? takenAt(f) : null }; } catch { /* */ }
}, true);

// שימוש ישיר מקוד: pickPhoto({ multiple, onFiles })
export function pickPhoto({ multiple = false, onFiles } = {}) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple; inp.hidden = true;
  inp.onchange = () => { const fs = [...inp.files]; inp.remove(); if (fs.length) onFiles?.(fs); };
  document.body.appendChild(inp);
  if (!coarse()) { inp._phSrc = 'gallery'; inp._phGo = true; inp.click(); return; }
  choose().then(src => src ? open(inp, src) : inp.remove());
}
// מטא לשמירה בתמונה: { source, taken_at? } — מחכה לקריאת ה-EXIF
export async function photoMeta(f) {
  const p = f?.__ph; if (!p) return {};
  const t = p.t ? await p.t.catch(() => null) : null;
  return { source: p.src, ...(t ? { taken_at: t } : {}) };
}
