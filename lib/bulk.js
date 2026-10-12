// פעולה על כמה פריטים בבת אחת (מסך רחב): תיבת סימון לכל פריט, "בחירת הכל", Shift = טווח, וסרגל "אישור N".
// אותן פעולות שרת כמו לפריט בודד — רק ברצף. run(ids, progress) → מספר שגיאות / [שגיאה]. after() = רענון המסך.
import { $, toast, haptic } from './core.js';
import { errText } from './audit.js';

export const bulkWide = () => matchMedia('(min-width:1100px)').matches;

export function bulk(root, { items = '[data-bk]', label = n => `אישור ${n}`, busy = 'מאשר', run, after, before = null, min = 2 }) {
  const els = [...root.querySelectorAll(items)];
  if (els.length < min || !bulkWide()) return null;
  const bar = document.createElement('div'); bar.className = 'bk-bar'; bar.setAttribute('role', 'toolbar');
  bar.innerHTML = `<label class="bk-allw"><input type="checkbox" class="bk-all" aria-label="בחירת הכל"><span class="bk-n">בחירת הכל · ${els.length}</span></label><span class="grow"></span>
    <button type="button" class="btn ghost sm bk-clr" hidden>ניקוי</button><button type="button" class="btn primary sm bk-go" hidden></button>`;
  (before || els[0].parentElement).before(bar);
  let last = -1;
  els.forEach((e, i) => {
    e.classList.add('bk-it');
    e.insertAdjacentHTML('afterbegin', `<label class="bk-ck"><input type="checkbox" aria-label="בחירה"></label>`);
    const c = e.querySelector('.bk-ck input');
    c.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ev.shiftKey && last >= 0) { const [a, b] = [Math.min(last, i), Math.max(last, i)]; els.slice(a, b + 1).forEach(x => { x.querySelector('.bk-ck input').checked = c.checked; }); }
      last = i; sync();
    });
    e.querySelector('.bk-ck').addEventListener('click', ev => ev.stopPropagation());
  });
  const chosen = () => els.filter(e => e.querySelector('.bk-ck input')?.checked);
  const all = $('.bk-all', bar), go = $('.bk-go', bar), clr = $('.bk-clr', bar), n0 = $('.bk-n', bar);
  function sync() {
    const n = chosen().length;
    els.forEach(e => e.classList.toggle('bk-on', !!e.querySelector('.bk-ck input')?.checked));
    all.checked = n === els.length; all.indeterminate = n > 0 && n < els.length;
    n0.textContent = n ? `${n} נבחרו` : `בחירת הכל · ${els.length}`;
    go.hidden = clr.hidden = !n; go.textContent = label(n); bar.classList.toggle('on', !!n);
  }
  all.onchange = () => { els.forEach(e => { e.querySelector('.bk-ck input').checked = all.checked; }); sync(); };
  clr.onclick = () => { all.checked = false; all.onchange(); };
  go.onclick = async () => {
    const C = chosen(), ids = C.map(e => e.dataset.bk || e.getAttribute(items.replace(/^\[|\]$/g, '')));
    if (!ids.length || go.disabled) return;
    go.disabled = clr.disabled = all.disabled = true; bar.classList.add('busy');
    const prog = k => { go.textContent = `${busy} ${k}/${ids.length}…`; };
    let errs = [];
    try { const r = await run(ids, prog); errs = Array.isArray(r) ? r.filter(Boolean) : []; }
    catch (e) { errs = [e]; }
    haptic(errs.length ? 'warn' : 'success');
    toast(errs.length ? `${ids.length - errs.length} מתוך ${ids.length} · ${errText(errs[0])}` : `${ids.length} בוצעו`, errs.length ? 4200 : 1800, errs.length ? 'light' : 'success');
    after && after();
  };
  sync();
  return { bar, chosen };
}
// ריצה ברצף על מזהים, עם התקדמות. fn(id) → {error}
export async function seq(ids, prog, fn) {
  const errs = [];
  for (let i = 0; i < ids.length; i++) { prog?.(i + 1); try { const { error } = (await fn(ids[i])) || {}; if (error) errs.push(error); } catch (e) { errs.push(e); } }
  return errs;
}
