// הדרכה אינטראקטיבית (מסך מלא בתוך האפליקציה). התמונות באחסון המוגן — נפתחות רק למשתמש מחובר.
import { sb, state, isManager, signedUrls, icon } from '../lib/core.js';

// לכל הדרכה — רשימת המסכים שלה (tours/<name>/<shot>.jpg) ומי רשאי לפתוח. mgmt כולל מסכי שכר — הנהלה בלבד (גם באחסון: db/120)
const TOURS = {
  ops: { ok: isManager, shots: ['d01_ws', 'd02_cmdk', 'd03_projmd', 'd04_desk', 'd05_deskpane', 'd06_dispatch', 'd07_wizard', 'd08_live', 'd09_comp', 'd10_repairs', 'd11_deskzones', 'o01_home', 'o03_sched', 'o04_proj', 'o05_sheet', 'o06_wx', 'o07_dayadmin', 'o08_plan', 'o09_pick', 'o10_pick_sel', 'o11_crew_home', 'o11b_site', 'o12_close', 'o12b_preview', 'o13_visit_new', 'o14_repair', 'o15_progress', 'o16_comp', 'o17_live', 'o18_purchase', 'o20_plus', 'o21_request', 'o22_pre_home', 'o23_pre_decide', 'o24_pulse_bad', 'o25_pulse', 'o26_pulses', 'o27_weekly', 'o27b_weekly', 'o29_night', 'o30_photo'] },
  mgmt: { ok: () => state.profile?.role === 'admin', shots: ['d10_repairs', 'd11_deskzones', 'dA10_costs', 'dA1_ws', 'dA2_cmdk', 'dA3_projmd', 'dA4_desk', 'dA5_deskpane', 'dA6_wizard', 'dA7_live', 'dA8_comp', 'dA9_dispatch', 'm01_home', 'm02_needs', 'm03_projects', 'm05_proj', 'm06_ready', 'm07_sched', 'm08_sheet', 'm14_signoff', 'm16_crep', 'm17_att', 'm18_emp', 'm19_equip', 'm20_drone', 'm23_purch', 'm24_purch_new', 'm25_specs', 'm26_logi', 'm27_plan', 'm28_launch', 'm29_person', 'm31_sync', 'm32_psum', 'm33_costs', 'm35_kbitem', 'o11_crew_home', 'o12_close', 'o12b_preview', 'o14_repair', 'o15_progress', 'o22_pre_home', 'o23_pre_decide', 'o24_pulse_bad', 'o25_pulse', 'o26_pulses', 'o27_weekly', 'o27b_weekly', 'o28_load'] },
};

export async function renderTour(el, name = 'ops') {
  const T = TOURS[name];
  if (!T) { location.hash = '#/kb'; return; }
  if (!T.ok()) { el.innerHTML = '<div class="empty">ההדרכה הזו להנהלה.</div>'; return; }
  const SHOTS = T.shots;
  el.innerHTML = '<div class="skel tall"></div>';
  const [html, urls] = await Promise.all([
    fetch(`tour/${name}.html`, { cache: 'no-cache' }).then(r => r.text()),
    signedUrls('kb', SHOTS.map(s => `tours/${name}/${s}.jpg`))]);
  const U = Object.fromEntries(SHOTS.map(s => [s + '.jpg', urls[`tours/${name}/${s}.jpg`]]));
  const doc = `<!doctype html><html lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${location.href.split('#')[0].replace(/[^/]*$/, '')}"><style>:root{padding:0}body{margin:0}</style><script>window.__U=${JSON.stringify(U)};window.__N=${JSON.stringify((state.profile?.full_name || '').trim().split(/\s+/)[0] || '')}<\/script></head><body>${html}</body></html>`;
  // מסך מלא מעל האפליקציה (בלי כותרת ובלי הסרגל התחתון) + כפתור סגירה
  document.querySelector('.tourfs')?.remove();
  const fs = document.createElement('div'); fs.className = 'tourfs';
  fs.innerHTML = `<iframe title="הדרכה" sandbox="allow-scripts allow-same-origin"></iframe><button type="button" class="tourx" aria-label="סגירה">×</button>`;
  document.body.appendChild(fs); el.innerHTML = '';
  fs.querySelector('iframe').srcdoc = doc;
  fs.querySelector('.tourx').onclick = () => { fs.remove(); location.hash = '#/'; };
  addEventListener('hashchange', () => fs.remove(), { once: true });
  sb.from('kb_items').select('id').eq('video_url', `#/tour/${name}`).maybeSingle().then(({ data }) => data && sb.from('kb_views').insert({ item_id: data.id, user_id: state.user.id }).then(() => {}));
}
