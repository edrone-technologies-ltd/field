// תקלה אחת — אותו חלון מכל מקום (יום שטח, ציוד, יומן רחפן): מה דווח, תמונות, מי ומתי, ומשם ליום / לפרויקט / לכלי.
// מנהל: "טופל" עם מה נעשה (נכנס לתור — עובד גם בלי קליטה). חריג מבדיקה לפני עבודה שעוד לא הוחלט — חלון ההחלטה.
import { sb, state, isManager, can, enqueue, sheet, $, esc, icon, toast, zoom, thumbUrls, dayLabel } from './core.js';

const KIND = { equipment: 'ציוד', site: 'אתר', safety: 'בטיחות', near_miss: 'כמעט תאונה', other: 'תקלה' };
const when = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'עכשיו'; };   // נוצרה עכשיו ועוד לא נשלחה — בלי "Invalid Date"
const first = n => (n || '').split(' ')[0];

// i: שורת תקלה (או מזהה). here: 'day:<id>' / 'eq:<id>' — לא מקשרים למסך שכבר נמצאים בו. after: אחרי סגירה / החלטה
export async function openIssue(i, { here = '', after } = {}) {
  if (typeof i === 'string') { const { data } = await sb.from('issues').select('*').eq('id', i).maybeSingle(); if (!data) return toast('התקלה לא נמצאה'); i = data; }
  const M = isManager();
  if (M && i.prestart && !i.decision && i.status !== 'closed') {   // הצוות באתר ומחכה — ההחלטה היא הפעולה
    const P = await import('../modules/prestart.js');
    return P.decideSheet(i, { after: r => P.afterDecide(r, after) });
  }
  const [who, wd, eq] = await Promise.all([
    i.opened_by ? sb.from('profiles').select('full_name').eq('id', i.opened_by).maybeSingle().then(r => r.data?.full_name || '', () => '') : '',
    i.work_day_id ? sb.from('work_days').select('id,day,projects(name)').eq('id', i.work_day_id).maybeSingle().then(r => r.data, () => null) : null,
    i.equipment_id ? sb.from('equipment').select('id,name').eq('id', i.equipment_id).maybeSingle().then(r => r.data, () => null) : null,
  ]);
  const open = i.status !== 'closed';
  const links = [
    wd && here !== 'day:' + wd.id && `<a class="lrow" href="#/day/${wd.id}" data-close><span class="mic">${icon('calendar', 18)}</span><span class="grow"><b>יום שטח · ${esc(dayLabel(wd.day))}</b>${wd.projects?.name ? `<small>${esc(wd.projects.name)}</small>` : ''}</span><span class="chev">${icon('chev', 16)}</span></a>`,
    i.project_id && M && `<a class="lrow" href="#/p/${i.project_id}/i" data-close><span class="mic">${icon('folder', 18)}</span><span class="grow"><b>בפרויקט</b><small>כל התקלות הפתוחות</small></span><span class="chev">${icon('chev', 16)}</span></a>`,
    eq && can('equipment') && here !== 'eq:' + eq.id && `<a class="lrow" href="#/equipment/${eq.id}" data-close><span class="mic">${icon('drone', 18)}</span><span class="grow"><b>${esc(eq.name)}</b></span><span class="chev">${icon('chev', 16)}</span></a>`,
  ].filter(Boolean);
  sheet(`<div class="stack tight"><div class="row"><h3 class="sh grow">${esc(String(i.body || KIND[i.kind] || 'תקלה'))}</h3><span class="pill ${open ? (i.severity === 'critical' ? 'bad' : 'warn') : 'ok'}">${open ? 'פתוחה' : 'טופלה'}</span></div>
      <small class="muted">${esc([KIND[i.kind] || 'תקלה', first(who)].filter(Boolean).join(' · '))} · <bdi dir="ltr" class="num">${esc(when(i.created_at))}</bdi></small></div>
    <div class="photos" id="isph" hidden></div>
    ${!open && (i.resolution || i.decision) ? `<div class="note"><b>טיפול:</b> ${esc(i.resolution || (i.decision === 'cleared' ? 'כשיר לעבוד' : ''))}</div>` : ''}
    ${links.length ? `<div class="list">${links.join('')}</div>` : ''}
    ${open && M ? `<label class="field">איך טופל<textarea id="isr" rows="2" placeholder="לא חובה"></textarea></label><div class="row-btns"><button class="btn ghost" data-close>סגירה</button><button class="btn primary" id="isok">טופל</button></div>`
      : `<button class="btn ghost block" data-close>סגירה</button>`}`, async (s, close) => {
    const ok = $('#isok', s);
    if (ok) ok.onclick = async () => { if (ok.disabled) return; ok.disabled = true;
      const patch = { status: 'closed', resolution: $('#isr', s).value.trim() || 'טופל', closed_by: state.user.id, closed_at: new Date().toISOString() };
      Object.assign(i, patch); await enqueue({ kind: 'update', table: 'issues', rowId: i.id, patch });
      close(); toast('התקלה נסגרה', 1800, 'success'); after?.(i); };
    // תמונות התקלה (אם צולמו) — נטענות אחרי שהחלון כבר פתוח
    const { data: ph } = await sb.from('photos').select('storage_path').eq('issue_id', i.id).limit(8).then(r => r, () => ({ data: [] }));
    if (!(ph || []).length) return;
    const u = await thumbUrls('field', ph.map(p => p.storage_path)).catch(() => ({})), box = $('#isph', s);
    if (!box?.isConnected) return;
    box.innerHTML = ph.filter(p => u[p.storage_path]).map(p => `<button type="button" class="ph" data-z="${esc(u[p.storage_path].f)}"><img src="${esc(u[p.storage_path].t)}" alt="" loading="lazy"></button>`).join('');
    box.hidden = !box.children.length;
    box.querySelectorAll('[data-z]').forEach(z => z.onclick = () => zoom(z.dataset.z, ''));
  });
}
