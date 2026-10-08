// משימות אישיות (מעקב): מנהל פותח לעובד משימה — לרוב מקושרת לליד/אתר — והעובד רואה אותה בראש מסך הבית,
// עם חיוג / וואטסאפ / מייל לאיש הקשר וסימון "בוצע". כל פעולה נחתמת ביומן הפעולות.
import { sb, state, isManager, sheet, icon, $, $$, esc, toast, isoDay, dm, initials, ask, signedUrls, zoom } from '../lib/core.js';
import { shrink } from '../lib/store.js';

const SEL = 'id,title,instructions,due,status,assignee_id,created_by,site_id,project_id,done_at,photos,sites(name,slug,contact_name,contact_phone),projects(name)';
const emailIn = t => (String(t || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
const tel = p => String(p || '').replace(/\D/g, '').replace(/^972/, '0');
const wa = p => 'https://wa.me/972' + tel(p).replace(/^0/, '');
const dueTxt = d => { if (!d) return ''; const t = isoDay(); return d < t ? `<span class="err">באיחור · ${dm(d)}</span>` : d === t ? '<b>היום</b>' : 'עד ' + dm(d); };

export async function myTasks(box) {
  if (!box) return;
  const me = state.user.id;
  let mine = [], others = [], names = new Map();
  try {
    const [{ data: a }, { data: b }, { data: p }] = await Promise.all([
      sb.from('tasks').select(SEL).eq('assignee_id', me).eq('phase', 'מעקב').not('status', 'in', '(done,dropped)').order('due', { nullsFirst: false }),
      isManager() ? sb.from('tasks').select(SEL).eq('created_by', me).eq('phase', 'מעקב').neq('assignee_id', me).not('status', 'in', '(done,dropped)').order('due', { nullsFirst: false }) : Promise.resolve({ data: [] }),
      sb.from('profiles').select('id,full_name'),
    ]);
    mine = a || []; others = b || []; (p || []).forEach(x => names.set(x.id, x.full_name));
  } catch { return; }
  if (!mine.length && !others.length) { box.innerHTML = ''; return; }
  const urls = await signedUrls('field', mine.flatMap(t => t.photos?.before || [])).catch(() => ({}));
  const row = (t, mineRow) => {
    const s = t.sites, ph = s?.contact_phone, em = emailIn(t.instructions);
    return `<div class="tcard" data-id="${t.id}">
      <div class="row"><span class="grow"><b>${esc(t.title)}</b><small>${[s?.name && !t.project_id ? esc(s.name) : '', dueTxt(t.due), !mineRow ? 'אצל ' + esc((names.get(t.assignee_id) || '').split(' ')[0]) : ''].filter(Boolean).join(' · ')}</small></span>
        ${mineRow ? `<button class="btn primary sm" data-done="${t.id}">בוצע</button>` : ''}</div>
      ${t.instructions ? `<div class="small" style="white-space:pre-line">${esc(t.instructions)}</div>` : ''}
      ${mineRow && t.photos?.before?.length ? `<div class="fphs sm">${t.photos.before.map(ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '').join('')}</div>` : ''}
      ${mineRow && (ph || em || s) ? `<div class="tacts">${s?.contact_name ? `<span class="small muted grow">${esc(s.contact_name)}</span>` : '<span class="grow"></span>'}
        ${ph ? `<a class="chip" href="tel:${tel(ph)}">חיוג</a><a class="chip" href="${wa(ph)}" target="_blank" rel="noopener">וואטסאפ</a>` : ''}
        ${em ? `<a class="chip" href="mailto:${esc(em)}">מייל</a>` : ''}${s ? `<a class="chip" href="#/site/${esc(s.slug)}">לליד</a>` : ''}</div>` : ''}
    </div>`;
  };
  // מקובץ לפי פרויקט: צ'קליסט אחד לכל פרויקט, עם מעבר לצ'קליסט המלא
  const groups = new Map(); mine.forEach(t => { const k = t.project_id || t.site_id || '-'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const head = t => t.project_id ? `<a class="tgroup" href="#/p/${t.project_id}/t"><b class="grow">${esc(t.projects?.name || 'פרויקט')}</b><span class="small muted">לצ'קליסט ›</span></a>` : t.sites ? `<div class="tgroup"><b>${esc(t.sites.name)}</b></div>` : groups.size > 1 ? '<div class="tgroup"><b>כללי</b></div>' : '';
  box.innerHTML = `${mine.length ? `<section><div class="sh-row"><h3 class="sh">המשימות שלי</h3><span class="count">${mine.length}</span></div><div class="stack">${[...groups.values()].map(g => `<div class="stack tg">${head(g[0])}${g.map(t => row(t, true)).join('')}</div>`).join('')}</div></section>` : ''}
    ${others.length ? `<details class="fold"><summary><span class="sh">משימות שפתחתי לצוות</span><span class="count">${others.length}</span></summary><div class="stack">${others.map(t => row(t, false)).join('')}</div></details>` : ''}`;
  $$('.fph', box).forEach(i => i.onclick = () => zoom(i.src, ''));
  $$('[data-done]', box).forEach(b => b.onclick = async () => {
    const t = mine.find(x => x.id === b.dataset.done);
    if (t?.project_id) return completeTask(t, () => myTasks(box));   // משימת שטח: סימון עם תיעוד
    const note = await ask('מה סוכם?', { multiline: true, placeholder: 'למשל: נקבעה פגישה ל-12.10 בשעה 10:00 (לא חובה)', ok: 'סימון בוצע', optional: true });
    if (note == null) return;
    b.disabled = true;
    const { error } = await sb.from('tasks').update({ status: 'done', done_by: me, done_at: new Date().toISOString(), done_note: note.trim() || null }).eq('id', b.dataset.done);
    if (error) { b.disabled = false; return toast(error.message); }
    toast('סומן כבוצע — עודכן גם במאנדי'); myTasks(box);
  });
}

// פתיחת משימה לעובד (מנהלים). site = ליד/אתר לקישור (לא חובה)
export async function newTask({ site, title = '', notes = '', project = null, onDone = null } = {}) {
  if (!isManager()) return;
  const { data: team } = await sb.from('profiles').select('id,full_name,role').eq('is_active', true).neq('role', 'partner').order('full_name');
  const tomorrow = (() => { const d = new Date(Date.now() + 864e5); return isoDay(d); })();
  let who = null;
  sheet(`<h3>משימה לצוות</h3>${site ? `<div class="small muted">מקושרת ל: <b>${esc(site.name)}</b>${site.contact_name ? ' · ' + esc(site.contact_name) : ''}</div>` : ''}
    <label class="field">מה לעשות<input id="ntt" value="${esc(title)}" placeholder="למשל: ליצור קשר ולתאם פגישת אפיון"></label>
    <div class="field">למי<div class="chips">${(team || []).map(u => `<button type="button" class="chip" data-u="${u.id}" aria-pressed="false"><span class="avatar xs">${esc(initials(u.full_name))}</span> ${esc(u.full_name)}</button>`).join('')}</div></div>
    <label class="field">עד מתי<input type="date" id="ntd" value="${tomorrow}"></label>
    <label class="field">פרטים<small>מייל או טלפון שכתובים כאן הופכים לכפתור אצל העובד</small><textarea id="ntn">${esc(notes)}</textarea></label>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="nts">פתיחת משימה</button></div>`, (s, close) => {
    $$('[data-u]', s).forEach(c => c.onclick = () => { who = c.dataset.u; $$('[data-u]', s).forEach(x => x.setAttribute('aria-pressed', x === c)); });
    $('#nts', s).onclick = async () => {
      const t = $('#ntt', s).value.trim(); if (!t) return toast('מה המשימה?'); if (!who) return toast('למי המשימה?');
      $('#nts', s).disabled = true;
      const { data: ins, error } = await sb.from('tasks').insert({ title: t, instructions: $('#ntn', s).value.trim() || null, due: $('#ntd', s).value || null, assignee_id: who,
        site_id: site?.id || null, project_id: project, phase: 'מעקב', status: 'todo', created_by: state.user.id, is_extra: true }).select('id').single();
      if (error) { $('#nts', s).disabled = false; return toast(error.message); }
      close(); toast('המשימה נפתחה — נשלחה התראה'); const h = $('#mytasks'); if (h) myTasks(h); if (onDone) onDone(ins.id);
    };
  });
}

// סימון "טופל" עם תיעוד: תמונת "אחרי" (חובה כשיש תמונת "לפני" מהממצא) + מה נעשה. משמש בבית ובצ'קליסט הפרויקט
export function completeTask(t, onDone) {
  const before = t.photos?.before || [], after = [...(t.photos?.after || [])], urls = {};
  sheet(`<h3>${esc(t.title)}</h3>
    ${before.length ? `<div class="small muted">לפני</div><div class="fphs" id="cb"></div>` : ''}
    <div class="small muted">אחרי</div><div class="fphs" id="ca"></div>
    <label class="field">מה נעשה<textarea id="cn" rows="2" placeholder="לא חובה"></textarea></label>
    <div class="row"><button class="btn ghost grow" data-close>ביטול</button><button class="btn primary grow" id="cok">טופל</button></div>`, async (s, close) => {
    const img = ph => urls[ph] ? `<img class="fph" src="${esc(urls[ph])}" alt="">` : '';
    const draw = () => {
      if ($('#cb', s)) $('#cb', s).innerHTML = before.map(img).join('');
      $('#ca', s).innerHTML = after.map(img).join('') + `<label class="fph add" aria-label="צילום אחרי">${icon('photo', 18)}<input type="file" accept="image/*" multiple id="cf" hidden></label>`;
      $$('img.fph', s).forEach(i => i.onclick = () => zoom(i.src, ''));
      $('#cf', s).onchange = async e => {
        const fl = [...e.target.files]; if (!fl.length) return; toast('מעלה…');
        try {
          for (const file of fl) {
            const blob = await shrink(file), path = `${state.user.id}/fix/${crypto.randomUUID()}.jpg`;
            const { error } = await sb.storage.from('field').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
            await sb.from('photos').insert({ storage_path: path, project_id: t.project_id, kind: 'fix', uploaded_by: state.user.id, caption: t.title });
            after.push(path);
          }
          Object.assign(urls, await signedUrls('field', after));
        } catch (er) { toast(er.message || 'התמונה לא עלתה'); }
        draw();
      };
    };
    Object.assign(urls, await signedUrls('field', [...before, ...after]).catch(() => ({}))); draw();
    $('#cok', s).onclick = async () => {
      if (before.length && !after.length) return toast('צריך תמונה של אחרי הטיפול');
      $('#cok', s).disabled = true;
      const patch = { status: 'done', done_by: state.user.id, done_at: new Date().toISOString(), done_note: $('#cn', s).value.trim() || null, photos: { before, after } };
      const { error } = await sb.from('tasks').update(patch).eq('id', t.id);
      if (error) { $('#cok', s).disabled = false; return toast(error.message); }
      Object.assign(t, patch); close(); toast('סומן כטופל'); onDone && onDone();
    };
  });
}
