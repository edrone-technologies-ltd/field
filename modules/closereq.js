// בקשה לסגירה בלי חתימת לקוח (db/143): מנהל תפעול מגיש עם סיבה → ההנהלה מאשרת ב"לאישורך". אישור = סגירה (close_project).
import { sb, state, esc, ask, toast, dm, isoDay } from '../lib/core.js';
import { errText } from '../lib/audit.js';

// הבקשה האחרונה של הפרויקט (מנהל תפעול רואה רק את שלו, הנהלה — הכל)
export async function lastRequest(pid) {
  try { const { data } = await sb.from('close_requests').select('id,status,reason,reply,requested_by,decided_at,created_at').eq('project_id', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(); return data || null; }
  catch { return null; }
}
export async function pendingSet(pids) {
  if (!pids.length) return new Set();
  try { const { data } = await sb.from('close_requests').select('project_id').eq('status', 'pending').in('project_id', pids); return new Set((data || []).map(x => x.project_id)); }
  catch { return new Set(); }
}
export async function requestClose(pid, wid = null) {
  const reason = await ask('בקשה לסגירה בלי חתימת לקוח — למה?', { placeholder: 'למשל: הלקוח אישר בטלפון / במייל', ok: 'לאישור הנהלה' });
  if (reason == null) return false; if (!reason.trim()) { toast('חובה לכתוב סיבה'); return false; }
  const { error } = await sb.rpc('request_close_no_signoff', { p: pid, reason: reason.trim(), w: wid });
  if (error) { toast(errText(error, 'הבקשה לא נשלחה — נסו שוב')); return false; }
  toast('נשלח לאישור הנהלה', 2000, 'success'); return true;
}
export const pendingPill = () => `<div class="card row crpend"><span class="dot warn"></span><b class="grow">ממתין לאישור הנהלה</b><small class="muted">סגירה בלי חתימה</small></div>`;
// מצב הבקשה בסיכום הפרויקט
export function statusCard(r) {
  if (!r) return '';
  if (r.status === 'pending') return `<div class="card stack tight"><div class="row"><span class="dot warn"></span><b class="grow">סגירה בלי חתימה · ממתין לאישור הנהלה</b><small class="muted">${dm(isoDay(new Date(r.created_at)))}</small></div><small>${esc(r.reason)}</small></div>`;
  const ok = r.status === 'approved';
  return `<div class="card stack tight"><div class="row"><span class="dot ${ok ? 'ok' : 'bad'}"></span><b class="grow">${ok ? 'סגירה בלי חתימה אושרה' : 'הבקשה לסגירה נדחתה'}</b>${r.decided_at ? `<small class="muted">${dm(isoDay(new Date(r.decided_at)))}</small>` : ''}</div><small>${esc(r.reason)}</small>${r.reply ? `<small class="muted">תשובה: ${esc(r.reply)}</small>` : ''}</div>`;
}
// לאישורך (הנהלה): כרטיס לכל בקשה ממתינה
export async function approvalCards() {
  if (state.profile?.role !== 'admin') return [];
  try {
    const { data } = await sb.from('close_requests').select('id,reason,created_at,project_id,projects(name),who:requested_by(full_name)').eq('status', 'pending').order('created_at');
    const { oprGo } = await import('./ops.js');
    return (data || []).map(r => `<div class="card stack opr">${oprGo(`#/p/${r.project_id}`, `סגירה בלי חתימה · ${esc(r.projects?.name || '')}`, esc(r.reason), esc((r.who?.full_name || '').split(' ')[0]))}
      <div class="row-btns"><button class="btn ghost sm" data-crq="${r.id}" data-ok="0">דחייה</button><button class="btn primary sm" data-crq="${r.id}" data-ok="1">אישור</button></div></div>`);
  } catch { return []; }
}
export async function decide(id, ok) {
  const reply = ok ? '' : await ask('סיבת הדחייה', { ok: 'דחייה' });
  if (reply === null) return null; if (!ok && !reply.trim()) { toast('חובה לכתוב תשובה'); return null; }
  const { error } = await sb.rpc('decide_close_request', { id, ok, reply: (reply || '').trim() || null });
  if (error) return error;
  return true;
}
