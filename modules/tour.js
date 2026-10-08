// הדרכה אינטראקטיבית (מסך מלא בתוך האפליקציה). התמונות באחסון המוגן — נפתחות רק למשתמש מחובר.
import { sb, state, isManager, signedUrls, icon } from '../lib/core.js';

const SHOTS = ['01_home', '02_sched', '03_proj', '04_sheet', '05_sheet_wx', '06_pick', '07_pick_sel', '08_plan', '09_visit_form', '11_crew_home', '12_crew_done', '13_visit_done', '14_tasks', '16_purchase', '17_attendance', '19_visit_pdf', '20_visit_new'];

export async function renderTour(el, name = 'ops') {
  if (!isManager()) { el.innerHTML = '<div class="empty">ההדרכה הזו למנהלים.</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const [html, urls] = await Promise.all([
    fetch(`tour/${name}.html`, { cache: 'no-cache' }).then(r => r.text()),
    signedUrls('kb', SHOTS.map(s => `tours/${name}/${s}.jpg`))]);
  const U = Object.fromEntries(SHOTS.map(s => [s + '.jpg', urls[`tours/${name}/${s}.jpg`]]));
  const doc = `<!doctype html><html lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${location.href.split('#')[0].replace(/[^/]*$/, '')}"><style>:root{padding:0}body{margin:0}</style><script>window.__U=${JSON.stringify(U)}<\/script></head><body>${html}</body></html>`;
  el.innerHTML = `<div class="tourbar"><a class="back" href="#/kb" aria-label="חזרה">${icon('back', 20)}</a><b>הדרכת מנהל תפעול</b></div><iframe class="tourframe" title="הדרכה" sandbox="allow-scripts allow-same-origin"></iframe>`;
  el.querySelector('iframe').srcdoc = doc;
  sb.from('kb_items').select('id').eq('video_url', `#/tour/${name}`).maybeSingle().then(({ data }) => data && sb.from('kb_views').insert({ item_id: data.id, user_id: state.user.id }).then(() => {}));
}
