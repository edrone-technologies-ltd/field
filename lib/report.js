// דיווח על בעיה באפליקציה: צילום של המסך כמו שהוא, שורת טקסט לא חובה, ושליחה דרך תור השליחה (גם בלי קליטה).
// מה שנאסף לבד: המסך (בלי פרמטרים), המכשיר (מערכת, דפדפן, גודל, מותקן, קליטה — בלי UA מלא ובלי IP), הגרסה,
// 5 השגיאות האחרונות ופריטים שנתקעו בתור. גלוי רק למדווח ולשותפים (db/151). כשל בכל שלב = נשלח בלי החלק הזה.
import { state, sheet, icon, toast, uid, zoom, enqueue, sendsLabel, recentErrs, recentRoutes, cleanRoute, isStandalone } from './core.js';
import { outbox } from './store.js';

const LIB = './vendor/modern-screenshot-4.7.0.mjs';
const SHOT_MS = 8000;   // צילום שלא הסתיים עד אז — נשלח בלעדיו
const sleep = ms => new Promise(r => setTimeout(r, ms));

function device() {
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const v = (re) => (ua.match(re) || [])[1]?.replace(/_/g, '.');
  const os = ios ? 'iOS ' + (v(/OS (\d+[_.]\d+)/) || v(/Version\/(\d+\.\d+)/) || '') : /Android/.test(ua) ? 'Android ' + (v(/Android (\d+(?:\.\d+)?)/) || '') : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'אחר';
  const br = /CriOS\/(\d+)/.test(ua) ? 'Chrome ' + v(/CriOS\/(\d+)/) : /FxiOS\/(\d+)/.test(ua) ? 'Firefox ' + v(/FxiOS\/(\d+)/) : /EdgA?\/(\d+)/.test(ua) ? 'Edge ' + v(/EdgA?\/(\d+)/)
    : /SamsungBrowser\/(\d+)/.test(ua) ? 'Samsung ' + v(/SamsungBrowser\/(\d+)/) : /Chrome\/(\d+)/.test(ua) ? 'Chrome ' + v(/Chrome\/(\d+)/) : /Firefox\/(\d+)/.test(ua) ? 'Firefox ' + v(/Firefox\/(\d+)/)
    : /Version\/(\d+(?:\.\d+)?).*Safari/.test(ua) ? 'Safari ' + v(/Version\/(\d+(?:\.\d+)?)/) : 'אחר';
  const th = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark·auto' : 'light·auto');
  return { os: os.trim(), browser: br, vw: innerWidth, vh: innerHeight, dpr: Math.round((devicePixelRatio || 1) * 100) / 100, standalone: isStandalone(), online: navigator.onLine,
    net: navigator.connection?.effectiveType || undefined, theme: th, desk: document.body.classList.contains('ws') || undefined, trail: recentRoutes() };
}
async function version() {
  try { const k = (await caches.keys()).find(x => x.startsWith('edrone-field-v')); return k ? 'v' + k.split('-v')[1] : null; } catch { return null; }
}
// פריטים שנתקעו בתור (לא נשלחו) — לרוב זו בדיוק הבעיה שמדווחים עליה
async function queueErrs() {
  try {
    const q = (await outbox.all()).filter(x => !x.soft);
    const bad = q.filter(x => x.stuck || x.tries > 1).slice(-3).map(x => ({ k: 'queue', m: String(x.stuck || x.error || '').slice(0, 200), what: x.kind === 'insert' || x.kind === 'update' ? `${x.kind}:${x.table}` : x.kind === 'rpc' ? 'rpc:' + x.fn : x.kind, tries: x.tries }));
    return { n: q.length, bad };
  } catch { return { n: null, bad: [] }; }
}
// צילום של אזור התצוגה בלבד (לא כל הדף), JPEG 0.6. החלון עצמו (#sheet) והודעות קופצות לא נכנסים
async function capture() {
  const { domToJpeg } = await import(LIB);
  const skip = new Set(['sheet', 'toast', 'snap']);
  const url = await domToJpeg(document.body, {
    width: innerWidth, height: innerHeight, scale: Math.min(devicePixelRatio || 1, 1.5), quality: 0.6,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff', timeout: 4000,
    filter: n => !(n.nodeType === 1 && (skip.has(n.id) || n.tagName === 'VIDEO' || n.tagName === 'IFRAME')),
    features: { restoreScrollPosition: true },
  });
  const blob = await (await fetch(url)).blob();
  return blob.size > 2e6 ? null : blob;   // מעל 2MB הדלי מסרב — עדיף בלי צילום
}

export async function openReport() {
  const from = cleanRoute(location.hash), dev = device(), errs = recentErrs();
  const [ver, qi] = await Promise.all([version(), queueErrs()]);
  // הצילום מתחיל מיד (המסך כמו שהוא), במקביל לפתיחת החלון
  let keep = true, shotUrl = '';
  const shotP = Promise.race([capture(), sleep(SHOT_MS).then(() => null)]).catch(e => { console.warn('shot', e); return null; });
  sheet(`<h3>בעיה באפליקציה</h3>
    <div class="rp" id="rp"><div class="rpshot" id="rpshot" style="aspect-ratio:${innerWidth}/${innerHeight}"><i class="skb"></i></div>
      <textarea id="rpb" rows="4" maxlength="1000" placeholder="מה קרה? (לא חובה)" aria-label="מה קרה"></textarea></div>
    <small class="rpnote">הצילום ופרטי המכשיר נשלחים לשותפים ולצוות מערכות המידע (כולל כלי <bdi dir="ltr">AI</bdi>), לתיקון התקלה בלבד.</small>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="rps">${icon('send', 18)} שליחה</button></div>`, (s, close) => {
    const box = s.querySelector('#rpshot'), wrap = s.querySelector('#rp');
    const drop = () => { keep = false; wrap.classList.add('noshot'); box.remove(); };
    shotP.then(b => {
      if (!box.isConnected) return;
      if (!b) return drop();
      shotUrl = URL.createObjectURL(b);
      box.innerHTML = `<img src="${shotUrl}" alt="צילום המסך"><button type="button" class="rpx" aria-label="בלי צילום מסך">${icon('x', 16)}</button>`;
      box.querySelector('img').onclick = () => zoom(shotUrl, 'צילום המסך');
      box.querySelector('.rpx').onclick = drop;
    });
    const btn = s.querySelector('#rps');
    btn.onclick = async () => {
      if (btn.disabled) return; btn.disabled = true; btn.textContent = 'שולח…';
      const body = s.querySelector('#rpb').value.trim().slice(0, 1000) || null;
      const blob = keep ? await Promise.race([shotP, sleep(3000).then(() => null)]) : null;
      const id = uid(), path = blob ? `${state.user.id}/${id}.jpg` : null;
      const row = { id, user_id: state.user.id, role: state.profile?.role || null, route: from, body, shot_path: path, device: dev, sw_version: ver,
        errors: [...errs, ...qi.bad], queue_n: qi.n };
      try {
        // הרשומה קודם, הצילום אחריה (אותו סדר בתור). פריט "רך": סירוב של השרת לא תוקע את התור ולא מציג פס אדום
        await enqueue({ kind: 'insert', table: 'dg_app_reports', row, soft: true });
        if (blob) await enqueue({ kind: 'file', bucket: 'dg-reports', path, blob, type: 'image/jpeg', soft: true });
        close(); toast(navigator.onLine ? 'נשלח, תודה' : 'נשמר · ' + sendsLabel(), 2600, 'success');
      } catch (e) { console.warn('report', e); close(); if (!e?.quota) toast('לא נשלח — נסו שוב', 3000, 'error'); }
      if (shotUrl) setTimeout(() => URL.revokeObjectURL(shotUrl), 4000);
    };
  });
}
