// מסך כניסה: טלפון + קוד 6 ספרות, נשלח לבד כשהקוד מלא. הטלפון נזכר במכשיר. (קישור הזמנה אישי = join.html, בלי להקליד בכלל)
import { signIn, $, esc } from '../lib/core.js';
import { MARK } from './welcome.js';

const fmt = v => { const d = v.replace(/\D/g, '').replace(/^972/, '0').slice(0, 10); return d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d; };

export function renderLogin(app, msg = '', onDone) {
  const ios = /iphone|ipad/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  app.innerHTML = `<form class="login lg2" id="lf" autocomplete="on" novalidate>
    <div class="lg-hero"><div class="lg-mark">${MARK}</div><h1>E-Drone שטח</h1></div>
    <label class="field" for="ph">טלפון<input id="ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="050-0000000" dir="ltr" required></label>
    <label class="field" for="cd">קוד<input id="cd" class="code lg-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••" dir="ltr" required></label>
    <div class="err" id="er" role="alert">${esc(msg)}</div>
    <button class="btn primary block big" id="go">כניסה</button>
    ${ios && standalone ? '<div class="lg-foot">הקוד נמצא בהודעת ההזמנה</div>' : ''}
  </form>`;
  const ph = $('#ph'), cd = $('#cd'), b = $('#go');
  try { const last = localStorage.getItem('edrone-phone'); if (last) { ph.value = fmt(last); } } catch { /* */ }
  ph.oninput = () => { const p = ph.selectionStart === ph.value.length; ph.value = fmt(ph.value); if (p && ph.value.replace(/\D/g, '').length === 10) cd.focus(); };
  cd.oninput = () => { cd.value = cd.value.replace(/\D/g, '').slice(0, 6); $('#er').textContent = ''; if (cd.value.length === 6 && ph.value.replace(/\D/g, '').length >= 9) send(); };
  setTimeout(() => (ph.value ? cd : ph).focus({ preventScroll: true }), 60);
  let busy = false;
  async function send() {
    if (busy) return; const phone = ph.value.replace(/\D/g, '');
    if (phone.length < 9) { $('#er').textContent = 'חסר מספר טלפון'; return ph.focus(); }
    if (cd.value.length < 6) { $('#er').textContent = 'הקוד הוא 6 ספרות'; return cd.focus(); }
    busy = true; b.disabled = true; b.textContent = 'נכנס…';
    try {
      await signIn(phone, cd.value);
      try { localStorage.setItem('edrone-phone', phone); } catch { /* */ }
      await onDone?.();
    } catch (err) {
      $('#er').textContent = err.message; b.disabled = false; b.textContent = 'כניסה'; busy = false;
      cd.value = ''; cd.focus(); $('#lf').classList.remove('shake'); void $('#lf').offsetWidth; $('#lf').classList.add('shake');
    }
  }
  $('#lf').onsubmit = e => { e.preventDefault(); send(); };
}
