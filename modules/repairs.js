// לולאת תיקון סגורה (db/112): העובד מסמן "טופל" עם תמונת אחרי → ממתין לאישור → ראש הצוות / מנהל התפעול מאשר או מחזיר עם סיבה (חוזר לאותו עובד).
// השורות ב"דורש טיפול": לכל אחראי — "N תיקונים ממתינים לאישור" (פתיחה = אישור במקום); לעובד — "תיקון הוחזר".
import { sb, state, sheet, icon, esc, toast, signedUrls, zoom, haptic, $, $$ } from '../lib/core.js';
import { errText } from '../lib/audit.js';

const REASONS = ['לא נוקה עד הסוף', 'נשארו כתמים / פסים', 'חסרה תמונה ברורה', 'לא המקום שסומן'];
const first = n => String(n || '').split(' ')[0];

export async function repairRows() {
  const out = [];
  const [{ data: Q }, { data: R }] = await Promise.all([
    ['admin', 'ops_manager', 'crew_lead'].includes(state.profile.role) ? sb.rpc('repair_queue') : Promise.resolve({ data: [] }),
    sb.from('tasks').select('id,title,review_note').eq('assignee_id', state.user.id).eq('review', 'returned').not('status', 'in', '(done,dropped)')]);
  const by = new Map(); (Q || []).forEach(t => { const k = t.assignee_id || t.done_by || '-'; if (!by.has(k)) by.set(k, []); by.get(k).push(t); });
  for (const L of by.values()) out.push({ k: 'repair', tone: 'warn', ic: icon('check', 18),
    title: `${first(L[0].who) || 'צוות'} · ${L.length > 1 ? `${L.length} תיקונים ממתינים לאישור` : 'תיקון ממתין לאישור'}`,
    sub: L.length > 1 ? [...new Set(L.map(t => t.project))].join(' · ') : L[0].title, act: () => reviewSheet(L) });
  if ((R || []).length) out.push({ k: 'repair-ret', tone: 'bad', ic: icon('alert', 18), title: R.length > 1 ? `${R.length} תיקונים הוחזרו` : `תיקון הוחזר · ${R[0].title}`,
    sub: R.length > 1 ? R.map(t => t.title).join(' · ') : R[0].review_note || '', href: '#/tasks' });
  return out;
}

// אישור במקום: פריט אחרי פריט — לפני (עם הסימון) מול אחרי, אישור בלחיצה או החזרה עם סיבה
export async function reviewSheet(items) {
  const L = items.slice(); let i = 0, changed = false;
  const urls = await signedUrls('field', L.flatMap(t => [...(t.photos?.before || []), ...(t.photos?.after || [])])).catch(() => ({}));
  const pic = (ph, tag) => urls[ph] ? `<button type="button" class="rvph" data-z="${esc(urls[ph])}"><img src="${esc(urls[ph])}" alt=""><span class="q">${tag}</span></button>` : '';
  const finish = () => { if (changed) dispatchEvent(new HashChangeEvent('hashchange')); };
  const show = () => {
    const t = L[i]; if (!t) { finish(); return; }
    sheet(`<div class="row"><h3 class="grow">${esc(t.title)}</h3>${L.length > 1 ? `<span class="count">${i + 1}/${L.length}</span>` : ''}</div>
      <div class="small muted">${esc([t.project, t.who && 'טיפל: ' + first(t.who), t.returns ? `הוחזר ${t.returns}×` : ''].filter(Boolean).join(' · '))}</div>
      <div class="rvpair">${pic((t.photos?.before || [])[0], 'לפני')}${pic((t.photos?.after || []).at(-1), 'אחרי')}</div>
      ${t.done_note ? `<div class="note">${esc(t.done_note)}</div>` : ''}
      <div class="rvret" id="rvr" hidden><div class="chips">${REASONS.map(r => `<button type="button" class="chip" data-rr="${esc(r)}" aria-pressed="false">${esc(r)}</button>`).join('')}</div>
        <input type="text" id="rvn" maxlength="200" placeholder="מה עוד צריך?"></div>
      <div class="row"><button class="btn ghost grow" id="rvno">החזרה</button><button class="btn primary grow" id="rvok">${icon('check', 18)} אישור</button></div>`, (s, close) => {
      $$('[data-z]', s).forEach(b => b.onclick = () => zoom(b.dataset.z, ''));
      const go = async (ok, note) => {
        $$('#rvok,#rvno', s).forEach(b => b.disabled = true);
        const { error } = await sb.rpc('review_repair', { t: t.id, ok, note: note || null });
        if (error) { $$('#rvok,#rvno', s).forEach(b => b.disabled = false); return toast(errText(error, 'לא נשמר — נסו שוב')); }
        changed = true; haptic(ok ? 'success' : 'tap'); toast(ok ? 'אושר ✓' : `הוחזר ל${first(t.who) || 'עובד'}`);
        i++; if (L[i]) show(); else { close(); finish(); }
      };
      $('#rvok', s).onclick = () => go(true);
      $$('[data-rr]', s).forEach(b => b.onclick = () => { $('#rvn', s).value = b.dataset.rr; $$('[data-rr]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); });
      $('#rvno', s).onclick = () => {
        const box = $('#rvr', s); if (box.hidden) { box.hidden = false; $('#rvno', s).textContent = 'החזרה לתיקון'; setTimeout(() => $('#rvn', s).focus(), 30); return; }
        const n = $('#rvn', s).value.trim(); if (!n) { $('#rvn', s).focus(); return toast('מה הסיבה?'); }
        go(false, n);
      };
    });
  };
  show();
}
