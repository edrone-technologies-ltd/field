// מעקב פעילות: פתיחה, כניסה, מעבר מסכים, ודופק "מחובר עכשיו" כל דקה. מזהים (uuid) לא נשמרים — רק סוג המסך.
import { sb, state } from './core.js';

const device = () => {
  const u = navigator.userAgent, os = /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'אחר';
  const inst = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `${os} · ${inst ? 'מותקנת' : 'דפדפן'}`;
};
let ver = '';
const getVer = async () => { if (!ver) try { ver = ((await caches.keys()).find(k => k.startsWith('edrone-field-v')) || '').replace('edrone-field-', ''); } catch { /* */ } return ver; };
const norm = h => h.replace(/^#\/?/, '').split('/').slice(0, 2).map(s => /^[0-9a-f-]{20,}$/i.test(s) || /^\d+$/.test(s) ? ':id' : s).join('/') || 'בית';

export async function track(kind, route = null) {
  if (!state.user || !navigator.onLine) return;
  try { await sb.from('app_events').insert({ user_id: state.user.id, kind, route, ver: await getVer(), device: device() }); } catch { /* */ }
}
let last = '', lastAt = 0;
export function view() {
  const r = norm(location.hash); if (r === last && Date.now() - lastAt < 30000) return;
  last = r; lastAt = Date.now(); track('view', r);
}
let started = false, hiddenAt = 0;
export function startTracking(kind = 'open') {
  if (started) return; started = true;
  track(kind); view();
  addEventListener('hashchange', view);
  const beat = async () => { if (document.visibilityState !== 'visible' || !state.user) return; try { await sb.rpc('touch', { ver: await getVer(), device: device() }); } catch { /* */ } };
  beat(); setInterval(beat, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    beat(); if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) track('open');   // חזר לאפליקציה אחרי הפסקה = פתיחה
  });
}
