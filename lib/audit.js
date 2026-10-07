// חתימת משתמש: מי עשה מה ומתי — מתוך יומן הפעולות בשרת (audit_log).
// signature() = שורה קצרה "נערך ע״י X · זמן"; openHistory() = היסטוריה מלאה בשפה פשוטה.
import { sb, sheet, esc, initials } from './core.js';

const TBL = { specs: 'אפיון', buildings: 'מבנה', sites: 'אתר', plan_images: 'גיליון תכנית', photos: 'תמונה', tasks: 'משימה', work_days: 'יום עבודה',
  issues: 'תקלה', expenses: 'הוצאה', purchase_requests: 'בקשת רכש', projects: 'פרויקט', missing_items: 'חוסר בשטח' };
const F = { days_expected: 'ימי עבודה', facade_days: 'ימים לפי חזית', facades: 'חזיתות', work_window: 'שעות עבודה באתר', method: 'שיטת ביצוע',
  washed_last: 'נשטף לאחרונה', density: 'רמת לכלוך', material: 'חומר ניקוי', obstacles: 'מכשולים', obstacles_text: 'פירוט מכשולים', docking: 'אזורי עגינה',
  hydrants: 'הידרנטים', power: 'מקור חשמל', secure_storage: 'אחסון מאובטח', notes: 'הערות', highlights: 'דגשים להצעה', status: 'סטטוס', lat: 'מיקום',
  map_path: 'מפת האתר', name: 'שם', title: 'כותרת', work_notes: 'דגשים לצוות', site_id: 'שיוך לאתר', report_time: 'יציאה מהמשרד', site_arrival: 'הגעה לאתר',
  site_end: 'סיום באתר', gallons: 'גלונים', status_note: 'הערה', contact_name: 'איש קשר', contact_phone: 'טלפון איש קשר', address: 'כתובת',
  amount: 'סכום', crew_lead_id: 'ראש צוות', drone_id: 'רחפן', day: 'תאריך', resolution: 'טיפול', severity: 'חומרה', floors: 'קומות', facade_area_m2: 'שטח חזיתות',
  material_used: 'חומר בפועל', quality: 'איכות', flights: 'טיסות', departed_at: 'יציאה לשטח', arrived_at: 'הגעה', finished_at: 'סיום עבודה', closed_at: 'סגירת יום' };
const V = { done: 'הושלם', draft: 'טיוטה', new: 'חדש', todo: 'לביצוע', in_progress: 'בעבודה', blocked: 'נתקע', dropped: 'בוטל', planned: 'מתוכנן', en_route: 'בדרך',
  on_site: 'באתר', working: 'בעבודה', open: 'פתוחה', closed: 'נסגרה', approved: 'אושר', rejected: 'נדחה', pending: 'ממתין', submitted: 'נשלח', critical: 'קריטית' };
const SKIP = new Set(['lng', 'geo_source', 'geo_by', 'surveyor_id', 'done_by', 'done_at', 'closed_by', 'opened_at', 'id']);
const KIND = { before: 'לפני', after: 'אחרי', issue: 'תקלה', site: 'אתר', obstacle: 'מכשול', facade: 'חזית', general: '' };

const val = v => v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'כן' : 'לא') : typeof v === 'object' ? null
  : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  : typeof v === 'string' && /^\d\d:\d\d:\d\d$/.test(v) ? v.slice(0, 5)
  : typeof v === 'string' && v.length > 40 ? null : String(V[v] || v);

// תיאור פעולה בשפה פשוטה
export function describe(r) {
  const t = TBL[r.tbl] || r.tbl;
  if (r.action === 'insert') {
    if (r.tbl === 'photos') return `הוסיף/ה תמונה${KIND[r.changes?.kind] ? ' (' + KIND[r.changes.kind] + ')' : ''}${r.changes?.caption ? ' · ' + r.changes.caption : ''}`;
    if (r.tbl === 'tasks') return `הוסיף/ה משימה: ${r.changes?.title || ''}`;
    if (r.tbl === 'issues') return `פתח/ה תקלה: ${String(r.changes?.body || '').slice(0, 60)}`;
    return `יצר/ה ${t}${r.changes?.name ? ': ' + r.changes.name : r.changes?.title ? ': ' + r.changes.title : ''}`;
  }
  if (r.action === 'delete') return `מחק/ה ${t}${r.changes?.title ? ': ' + r.changes.title : r.changes?.name ? ': ' + r.changes.name : ''}`;
  const parts = Object.entries(r.changes || {}).filter(([k]) => !SKIP.has(k)).map(([k, [a, b]]) => {
    const l = F[k] || k, va = val(a), vb = val(b);
    if (k === 'lat') return 'שמר/ה מיקום אתר';
    if (k === 'status' && r.tbl === 'tasks') return `סימן/ה "${val(b)}"`;
    return va != null && vb != null ? `${l}: ${va} ← ${vb}` : `עדכן/ה ${l}`;
  });
  return parts.length ? `${t} · ${parts.join(' · ')}` : `עדכן/ה ${t}`;
}

let names = null;
async function people() {
  if (names) return names;
  names = new Map(); try { const { data } = await sb.from('profiles').select('id,full_name'); (data || []).forEach(p => names.set(p.id, p.full_name)); } catch {}
  return names;
}
const when = iso => { const d = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5);
  const hm = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === t.toDateString() ? 'היום ' + hm : d.toDateString() === y.toDateString() ? 'אתמול ' + hm : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ' ' + hm; };

// שורת חתימה: נמשך לאלמנט box (כדי לא לעכב את המסך)
export async function signature(box, filter, { surveyor } = {}) {
  if (!box) return;
  try {
    let q = sb.from('audit_log').select('user_id,at,tbl,action,changes').order('at', { ascending: false }).limit(1);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const [{ data }, N] = await Promise.all([q, people()]);
    const r = data?.[0], extra = surveyor && N.get(surveyor) ? `סוקר: <b>${esc(N.get(surveyor))}</b>` : '';
    box.innerHTML = r || extra ? `<span class="sig">${extra}${r ? `${extra ? ' · ' : ''}נערך לאחרונה: <b>${esc(N.get(r.user_id) || 'משתמש')}</b>, ${when(r.at)}` : ''}</span><button type="button" class="siglink">היסטוריה</button>` : '';
    const b = box.querySelector('.siglink'); if (b) b.onclick = () => openHistory(filter);
  } catch { box.innerHTML = ''; }
}

export async function openHistory(filter, title = 'היסטוריית פעולות') {
  let q = sb.from('audit_log').select('*').order('at', { ascending: false }).limit(150);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const [{ data }, N] = await Promise.all([q, people()]);
  const rows = data || []; let last = '';
  sheet(`<h3>${esc(title)}</h3><div class="small muted">כל פעולה נרשמת אוטומטית עם שם המשתמש והשעה</div>
    <div class="hist">${rows.map(r => { const d = new Date(r.at).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
      const sep = d !== last ? `<div class="dsep"><span>${d}</span></div>` : ''; last = d;
      return `${sep}<div class="hrow"><span class="avatar sm">${esc(initials(N.get(r.user_id) || '?'))}</span><span class="grow"><b>${esc(N.get(r.user_id) || 'משתמש')}</b><small>${esc(describe(r))}</small></span><time>${new Date(r.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time></div>`; }).join('')
      || '<div class="empty small">עוד אין פעולות רשומות. הרישום התחיל ב-7.10.2026.</div>'}</div>
    <button class="btn ghost block" data-close>סגירה</button>`, null, {});
}
