// ספר אנשי קשר לנכס/לקוח: כמה אנשים לכל אתר (אחזקה, ביטחון, תפעול...), חיוג · וואטסאפ · שמירה באנשי הקשר בטלפון.
// מנהלים מוסיפים ומעדכנים; כל שינוי עובר לתיק הלקוח במאנדי (שכבת האנשים) ומשם חוזר.
import { sb, isManager, sheet, icon, $, $$, esc, toast } from './core.js';

const digits = p => String(p || '').replace(/\D/g, '');
const intl = p => { const d = digits(p); return d.startsWith('972') ? d : d.replace(/^0/, '972'); };
const local = p => { const d = digits(p); return d.startsWith('972') ? '0' + d.slice(3) : d; };

// כרטיס איש קשר (vCard) — נפתח בטלפון כ"איש קשר חדש"
function saveToPhone(c, org) {
  const v = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `N:;${c.name};;;`, org ? `ORG:${org}` : '', c.role ? `TITLE:${c.role}` : '',
    c.phone ? `TEL;TYPE=CELL:+${intl(c.phone)}` : '', c.email ? `EMAIL:${c.email}` : '', `NOTE:${[org, c.site].filter(Boolean).join(' · ')} (E-Drone)`, 'END:VCARD'].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([v], { type: 'text/vcard;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${c.name}.vcf`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// siteId: אנשי האתר + אנשי הלקוח הכלליים. clientId בלבד: כל אנשי הלקוח (עם שם האתר ליד כל אחד)
export async function renderContacts(box, { siteId = null, clientId = null, org = '', title = 'אנשי קשר' } = {}) {
  if (!box) return;
  const M = isManager();
  let q = sb.from('contacts').select('*, sites(name)').order('active', { ascending: false }).order('name');
  q = siteId ? (clientId ? q.or(`site_id.eq.${siteId},and(client_id.eq.${clientId},site_id.is.null)`) : q.eq('site_id', siteId)) : q.eq('client_id', clientId);
  const { data } = await q;
  const L = (data || []).filter(c => c.active || M);
  const row = (c, i) => `<div class="lrow ctc ${c.active ? '' : 'off'}" ${M ? `data-e="${i}" role="button" tabindex="0"` : ''}>
      <span class="grow"><b>${esc(c.name)}</b><small>${esc([c.role, !siteId && c.sites?.name, siteId && !c.site_id ? 'כללי ללקוח' : '', c.active ? '' : 'לא פעיל'].filter(Boolean).join(' · '))}</small>
        ${c.phone || c.email ? `<small class="muted"><bdi dir="ltr">${esc([c.phone && local(c.phone), c.email].filter(Boolean).join(' · '))}</bdi></small>` : ''}</span>
      ${c.phone ? `<a class="chip sm" href="tel:${local(c.phone)}" data-stop>חיוג</a><a class="chip sm" href="https://wa.me/${intl(c.phone)}" target="_blank" rel="noopener" data-stop>וואטסאפ</a>` : ''}
      <button class="chip sm" data-v="${i}" aria-label="שמירה בטלפון">${icon('plus', 14)}</button></div>`;
  box.innerHTML = L.length || M ? `<section class="stack"><div class="sh-row"><h3 class="sh">${title}</h3>${L.length ? `<span class="count">${L.length}</span>` : ''}${M ? '<button class="more" data-add style="border:0;background:none;cursor:pointer">+ איש קשר</button>' : ''}</div>
      <div class="list">${L.map(row).join('') || '<div class="small muted" style="padding:12px">עוד אין אנשי קשר — מוסיפים את מי שפוגשים באתר</div>'}</div>
      ${L.some(c => c.phone) ? '<div class="small muted">＋ = שמירה באנשי הקשר בטלפון</div>' : ''}</section>` : '';
  $$('[data-stop]', box).forEach(a => a.onclick = e => e.stopPropagation());
  $$('[data-v]', box).forEach(b => b.onclick = e => { e.stopPropagation(); const c = L[+b.dataset.v]; saveToPhone({ ...c, site: c.sites?.name }, org); });
  const redraw = () => renderContacts(box, { siteId, clientId, org, title });
  const edit = (c = {}) => sheet(`<h3>${c.id ? 'עדכון איש קשר' : 'איש קשר חדש'}</h3>
      <label class="field">שם<input id="cn" value="${esc(c.name || '')}" autocomplete="off"></label>
      <label class="field">תפקיד<input id="cr" value="${esc(c.role || '')}" placeholder="למשל: מנהל אחזקה, קב״ט, אב בית"></label>
      <label class="field">טלפון<input id="cp" type="tel" inputmode="tel" value="${esc(c.phone ? local(c.phone) : '')}"></label>
      <label class="field">מייל<input id="ce" type="email" inputmode="email" value="${esc(c.email || '')}"></label>
      <label class="field">הערה<input id="co" value="${esc(c.note || '')}" placeholder="למשל: זמין רק בבקרים, צריך לתאם דרכו כניסה"></label>
      ${c.id ? `<label class="tog"><span>פעיל <small class="muted">— מי שעזב מסמנים לא פעיל (לא מוחקים)</small></span><span class="sw"><input type="checkbox" id="ca" ${c.active ? 'checked' : ''}><i></i></span></label>` : ''}
      <div class="row-btns"><button class="btn ghost" data-close>ביטול</button><button class="btn primary" id="cs">שמירה</button></div>`, (s, close) => {
    $('#cs', s).onclick = async () => {
      const row = { name: $('#cn', s).value.trim(), role: $('#cr', s).value.trim() || null, phone: $('#cp', s).value.trim() || null, email: $('#ce', s).value.trim() || null, note: $('#co', s).value.trim() || null, updated_at: new Date().toISOString() };
      if (!row.name) return toast('חסר שם');
      if (c.id) row.active = $('#ca', s).checked; else Object.assign(row, { site_id: siteId, client_id: clientId });
      const { error } = c.id ? await sb.from('contacts').update(row).eq('id', c.id) : await sb.from('contacts').insert(row);
      if (error) return toast(error.message); close(); toast('נשמר'); redraw();
    };
  });
  $$('[data-e]', box).forEach(r => r.onclick = () => edit(L[+r.dataset.e]));
  const a = $('[data-add]', box); if (a) a.onclick = () => edit();
}
