// דופק לפני עבודה (אביחי 12/10): בדיקת רחפן = המטיס · בדיקת בטיחות = מפעיל הקרקע. חריג = תקלה קריטית שמחכה להחלטת מנהל התפעול.
// כאן: מי אחראי (אותו כלל כמו prestart_people בשרת, db/130) + גיליון ההחלטה (כשיר לעבוד / השבתה) — מהבית, מניהול היום וממסך היום.
import { sb, state, sheet, $, esc, toast, icon, timeAgo, thumbUrls, zoom, haptic } from '../lib/core.js';
import { errText } from '../lib/audit.js';

export const SEC = {
  drone: { t: 'בדיקת רחפן', who: 'מטיס', key: 'preflight_checks', ic: 'drone', off: 'השבתת הרחפן' },
  safety: { t: 'בדיקת בטיחות', who: 'מפעיל קרקע', key: 'safety_checks', ic: 'alert', off: 'עצירת העבודה' },
};
export const needsDrone = day => !!(day.drone_id || day.method === 'רחפן');

// crew = work_day_crew עם profiles(full_name,is_pilot,field_role). מי שאמר שלא יגיע — לא נחשב
export function pulseRoles(day) {
  const lead = day.crew_lead_id || null;
  const C = (day.work_day_crew || []).filter(c => !c.cant_come_at).slice().sort((a, b) => a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0);
  const ip = c => !!(c.profiles?.is_pilot || c.profiles?.field_role === 'pilot');
  const pilot = C.find(c => c.role === 'pilot')?.user_id || (C.some(c => c.user_id === lead && ip(c)) ? lead : null) || C.find(ip)?.user_id || null;   // בלי מטיס אין רחפן (אביחי 13/10)
  const gset = C.find(c => c.role === 'ground')?.user_id || null;
  const rest = C.filter(c => !ip(c) && c.user_id !== pilot).sort((a, b) => (b.profiles?.field_role === 'operator') - (a.profiles?.field_role === 'operator') || (a.user_id === lead) - (b.user_id === lead));
  const ground = gset || rest[0]?.user_id || lead;
  const name = u => ((C.find(c => c.user_id === u) || (day.work_day_crew || []).find(c => c.user_id === u))?.profiles?.full_name || '').split(' ')[0];
  return { pilot, ground, groundSet: !!gset, lead, name };
}
// מי רשאי לחתום על החלק (בלי "בשם")
export function mySection(R, sec, me = state.user.id) {
  return sec === 'drone' ? me === R.pilot : me === R.ground || (me === R.lead && !R.groundSet);
}

// גיליון ההחלטה: הפריט, ההערה והתמונה מהשטח → "כשיר לעבוד" או "השבתה" (עם סיבה). after(res) אחרי שמירה
export function decideSheet(issue, { after, who = '' } = {}) {
  const sec = SEC[issue.prestart] || SEC.safety;
  const done = !!issue.decision;
  sheet(`<div class="stack tight"><h3 class="sh">${esc(sec.t)} · לא תקין</h3>
      <b>${esc(String(issue.body || '').replace(/^[^·]*·\s*/, ''))}</b>
      <small class="muted">${esc([issue.projects?.name, who, issue.created_at && timeAgo(issue.created_at)].filter(Boolean).join(' · '))}</small></div>
    <div class="photos" id="psph"></div>
    ${done ? `<div class="small muted">הוחלט: ${esc(issue.resolution || '')}</div>` : ''}
    <label class="field">סיבה / מה נעשה<textarea id="psn" rows="2" placeholder="לא חובה ב״כשיר לעבוד״"></textarea></label>
    <div class="row-btns psdec"><button class="btn danger" id="psoff">${icon(sec.ic, 18)} השבתה</button><button class="btn primary" id="psok">${icon('check', 18)} כשיר לעבוד</button></div>`, (s, close) => {
    sb.from('photos').select('storage_path').eq('issue_id', issue.id).limit(4).then(async ({ data }) => {
      const P = (data || []).map(p => p.storage_path); if (!P.length) return;
      const u = await thumbUrls('field', P).catch(() => ({})), box = $('#psph', s); if (!box) return;
      box.innerHTML = P.filter(p => u[p]).map(p => `<button class="ph" data-z="${esc(u[p].f)}"><img src="${esc(u[p].t)}" alt=""></button>`).join('');
      box.querySelectorAll('[data-z]').forEach(b => b.onclick = () => zoom(b.dataset.z, ''));
    });
    const go = async (choice, btn) => {
      const why = $('#psn', s).value.trim();
      if (choice !== 'cleared' && !why) { const t = $('#psn', s); t.focus(); t.setAttribute('aria-invalid', 'true'); haptic('warn'); return toast('מה הסיבה?'); }
      if (btn.disabled) return; btn.disabled = true;
      const { data, error } = await sb.rpc('prestart_decide', { i: issue.id, choice, why: why || null });
      if (error) { btn.disabled = false; return toast(errText(error, 'לא נשמר — נסו שוב'), 5000); }
      haptic('success'); close();
      toast(choice === 'cleared' ? 'כשיר לעבוד · הצוות קיבל עדכון' : choice === 'grounded' ? 'הרחפן הושבת · בוחרים רחפן חלופי' : 'העבודה הופסקה · הצוות קיבל עדכון', 2600, 'success');
      after?.({ ...(data || {}), choice });
    };
    $('#psok', s).onclick = e => go('cleared', e.currentTarget);
    $('#psoff', s).onclick = e => go(issue.prestart === 'drone' ? 'grounded' : 'stopped', e.currentTarget);
  });
}
// אחרי השבתת רחפן: ניהול היום נפתח להחלפת הרחפן
export function afterDecide(res, refresh) {
  if (res?.choice === 'grounded' && res.work_day_id) import('./dayadmin.js').then(m => m.openDayAdmin(res.work_day_id, refresh));
  else refresh?.();
}
