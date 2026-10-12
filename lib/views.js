// תצוגות שמורות (מסך רחב): סינון ומיון נוכחיים נשמרים בשם, לכל משתמש (בדפדפן הזה). שבב = מעבר בלחיצה, × = מחיקה.
// get() → אובייקט המצב · apply(obj) → מחיל · same(a,b) אופציונלי. שימוש: שולחן ניהול ורשימת הפרויקטים.
import { state, esc, ask, toast } from './core.js';

const KEY = k => `edrone-views:${k}:${state.user?.id || ''}`;
const read = k => { try { return JSON.parse(localStorage.getItem(KEY(k)) || '[]'); } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v.slice(0, 12))); } catch { /* */ } };
const norm = o => JSON.stringify(Object.keys(o || {}).sort().reduce((a, x) => (o[x] !== '' && o[x] != null && (a[x] = String(o[x])), a), {}));

export function viewsBar(box, key, { get, apply, same = (a, b) => norm(a) === norm(b) }) {
  if (!box) return { refresh() {} };
  const draw = () => {
    const V = read(key), cur = get();
    box.innerHTML = `${V.map((v, i) => `<span class="wsv-c ${same(cur, v.s) ? 'on' : ''}"><button type="button" data-vi="${i}" title="${esc(v.n)}"${i < 9 ? ` aria-keyshortcuts="Alt+${i + 1}"` : ''}>${esc(v.n)}</button><button type="button" class="wsv-x" data-vx="${i}" aria-label="מחיקת ${esc(v.n)}">×</button></span>`).join('')}
      ${V.some(v => same(cur, v.s)) ? '' : `<button type="button" class="wsv-add" data-vadd>＋ שמירת תצוגה</button>`}`;
    box.hidden = false;
  };
  box.classList.add('wsv');
  box.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const V = read(key);
    if (b.dataset.vi) { apply(V[+b.dataset.vi].s); setTimeout(draw, 30); return; }
    if (b.dataset.vx) { const [x] = V.splice(+b.dataset.vx, 1); write(key, V); draw(); toast(`"${x.n}" נמחקה`, 1600); return; }
    if (b.hasAttribute('data-vadd')) {
      const n = (await ask('שם לתצוגה', { placeholder: 'למשל: השבוע שלי', ok: 'שמירה' }))?.trim(); if (!n) return;
      const s = get(), i = V.findIndex(v => v.n === n); if (i >= 0) V[i].s = s; else V.push({ n, s });
      write(key, V); draw(); toast('התצוגה נשמרה', 1600, 'success');
    }
  };
  // Alt+1…9 — מעבר מהיר בין התצוגות (כשהסרגל במסך)
  const kd = e => {
    if (!box.isConnected) { removeEventListener('keydown', kd); return; }
    if (!e.altKey || e.metaKey || e.ctrlKey || !/^Digit[1-9]$/.test(e.code)) return;
    const v = read(key)[+e.code.slice(5) - 1]; if (!v) return;
    e.preventDefault(); apply(v.s); setTimeout(draw, 30);
  };
  addEventListener('keydown', kd);
  draw();
  return { refresh: draw };
}
