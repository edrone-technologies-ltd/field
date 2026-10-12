// החתמת לקוח: הכל נמשך לבד מהדוחות היומיים (ימי שטח באפליקציה + דוחות ממאנדי), המנהל/ראש הצוות בוחר מה נכלל, הלקוח חותם.
// שלב 1 "מה נכלל" (ימים · תמונות · משימות · מקטעים) → שלב 2 חתימה. הבחירה נשמרת עם החתימה (include + snapshot), החתימה סוגרת את הפרויקט (db/081).
import { sb, state, enqueue, uid, $, $$, esc, icon, toast, dm, isoDay, thumbUrls, signedUrls, zoom, backBtn, goUp, cache } from '../lib/core.js';

const HE_D1 = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const dow = d => HE_D1[new Date(d + 'T12:00').getDay()];

export async function renderSignoff(el, pid, dayId = null) {
  el.innerHTML = `<header class="phead">${backBtn('#/p/' + pid)}<h1 class="grow">החתמת לקוח</h1></header><div class="skel"></div><div class="skel"></div>`;
  try { await sb.rpc('join_project', { p: pid }); } catch {}
  const q = p => p.then(r => r.data || []).catch(() => []);
  const [{ data: p }, wds, reps, phs, tasks, iss] = await Promise.all([
    sb.from('projects').select('id,name,client_name,client_id,site_id,sites(name,contact_name,contact_phone)').eq('id', pid).single(),
    q(sb.from('work_days').select('id,day,status,work_types,gallons,material,weather_stop').eq('project_id', pid).eq('status', 'done').order('day')),
    q(sb.from('field_reports').select('monday_item_id,report_date,work,crew,gallons,notes,issues,photos').eq('project_id', pid).eq('excluded', false).order('report_date')),
    q(sb.from('photos').select('id,storage_path,kind,work_day_id,created_at').eq('project_id', pid).in('kind', ['before', 'after', 'general']).order('created_at')),
    q(sb.from('tasks').select('id,title,buildings(name)').eq('project_id', pid).eq('status', 'done').order('seq')),
    q(sb.from('issues').select('id,body,resolution').eq('project_id', pid).eq('status', 'closed')),
  ]);
  if (!p) { el.innerHTML = `<header class="phead">${backBtn('#/')}<h1>החתמת לקוח</h1></header><div class="empty-line">הפרויקט לא נמצא</div>`; return; }
  const ors = [p.site_id && `site_id.eq.${p.site_id}`, p.client_id && `client_id.eq.${p.client_id}`].filter(Boolean).join(',');
  const contacts = ors ? await q(sb.from('contacts').select('name,role,email,phone').eq('active', true).or(ors)) : [];

  // ---- ימים: יום שטח מהאפליקציה גובר; דוח ממאנדי לאותו תאריך = כפילות (נדחף משם). פריטים שסומנו "⚠️" במאנדי — לא נספרים
  const dayOf = new Map(wds.map(w => [w.day, w]));
  const D = new Map();
  for (const w of wds) D.set(w.day, { d: w.day, w, work: (w.work_types || []).join(' · '), gal: Number(w.gallons) || 0, mat: w.material, wx: w.weather_stop });
  for (const r of reps) { if (!r.report_date || /^⚠/.test(r.notes || '')) continue; const x = D.get(r.report_date) || { d: r.report_date, work: '', gal: 0 };
    if (!dayOf.has(r.report_date)) { x.work = x.work || r.work || ''; x.gal += Number(r.gallons) || 0; x.rep = r; }
    if (r.issues) x.issues = [...(x.issues || []), r.issues]; D.set(r.report_date, x); }
  const days = [...D.values()].sort((a, b) => a.d < b.d ? -1 : 1);
  if (!days.length) { el.innerHTML = `<header class="phead">${backBtn('#/p/' + pid)}<h1 class="grow">החתמת לקוח</h1></header><div class="muted">${esc(p.name)}</div><div class="empty-line">עוד אין ימי שטח מתועדים בפרויקט</div>`; return; }

  // ---- תמונות: מהאפליקציה (לפני/אחרי לפי יום) + מהדוחות במאנדי. בחירה מראש: "לפני" ראשונה ו"אחרי" אחרונה לכל יום, עד 12
  const wdDay = new Map(wds.map(w => [w.id, w.day]));
  const P = [...phs.map(x => ({ b: 'field', p: x.storage_path, k: x.kind, d: wdDay.get(x.work_day_id) || isoDay(new Date(x.created_at)) })),
    ...days.filter(x => x.rep).flatMap(x => (x.rep.photos || []).filter(Boolean).map(path => ({ b: 'media', p: path, k: 'doc', d: x.d })))];
  const [uf, um] = await Promise.all([thumbUrls('field', P.filter(x => x.b === 'field').map(x => x.p)).catch(() => ({})), signedUrls('media', P.filter(x => x.b === 'media').map(x => x.p)).catch(() => ({}))]);
  const src = x => x.b === 'field' ? uf[x.p]?.t : um[x.p], full = x => x.b === 'field' ? uf[x.p]?.f : um[x.p];
  const key = x => x.b + ':' + x.p;
  const pre = new Set();
  for (const d of days) { const mine = P.filter(x => x.d === d.d && src(x)); const bf = mine.find(x => x.k === 'before'), af = [...mine].reverse().find(x => x.k === 'after');
    [bf, af].filter(Boolean).forEach(x => pre.add(key(x)));
    if (!bf && !af && mine.length) { pre.add(key(mine[0])); if (mine.length > 1) pre.add(key(mine.at(-1))); } }
  const preList = [...pre].slice(0, 12);

  // ---- מצב הבחירה (נשמר בטלפון — אפשר לצאת ולחזור באמצע, גם בלי קליטה)
  const ck = 'signoff:' + pid;
  const saved = (await cache.get(ck)) || {};
  const S = { days: new Set(saved.days || days.filter(x => !x.wx).map(x => x.d)), photos: new Set(saved.photos || preList), tasks: new Set(saved.tasks || tasks.map(t => t.id)),
    sec: { works: true, photos: true, qty: false, issues: false, ...(saved.sec || {}) }, step: 1, rating: 5, text: saved.text || null };
  const persist = () => cache.set(ck, { days: [...S.days], photos: [...S.photos], tasks: [...S.tasks], sec: S.sec, text: S.text }).catch(() => {});
  const works = () => [...new Set(days.filter(x => S.days.has(x.d)).flatMap(x => (x.work || '').split(/\s*[·,]\s*/).filter(Boolean)))];
  const chosen = () => days.filter(x => S.days.has(x.d));
  const summaryText = () => { const c = chosen(), r = c.length ? `${dm(c[0].d)}${c.length > 1 ? '–' + dm(c.at(-1).d) : ''}` : '';
    return [works().join(' · '), c.length ? `${c.length === 1 ? 'יום עבודה אחד' : c.length + ' ימי עבודה'} (${r})` : '', S.sec.works && S.tasks.size ? `${S.tasks.size} משימות בוצעו` : ''].filter(Boolean).join('\n'); };

  const tog = (k, label) => `<label class="tog"><span>${label}</span><span class="sw"><input type="checkbox" data-sec="${k}" ${S.sec[k] ? 'checked' : ''}><i></i></span></label>`;
  const bar = document.createElement('div'); bar.className = 'bar'; document.body.appendChild(bar);

  function step1() {
    S.step = 1; const c = chosen(), byDay = d => P.filter(x => x.d === d && src(x));
    el.innerHTML = `<header class="phead">${backBtn('#/p/' + pid)}<h1 class="grow">החתמת לקוח</h1></header>
      <div class="stack lg">
        <div class="muted">${esc(p.name)}</div>
        <div class="kpis">${[[c.length, 'ימי עבודה'], [S.sec.works ? S.tasks.size : 0, 'משימות'], [S.sec.photos ? S.photos.size : 0, 'תמונות']].map(([n, l]) => `<div class="kpi ${n ? '' : 'zero'}"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
        <section><h3 class="sh">ימים</h3><div class="list">${days.map(x => `<label class="lrow"><span class="datebox"><b>${+x.d.slice(8)}</b><small>${dow(x.d)}</small></span>
          <span class="grow"><b>${dm(x.d)}${x.wx ? ' · עצירת מזג אוויר' : ''}</b><small>${esc(x.work || (x.rep ? 'דוח יומי' : 'יום שטח'))}${byDay(x.d).length ? ` · ${byDay(x.d).length} תמונות` : ''}</small></span>
          <span class="sw"><input type="checkbox" data-day="${x.d}" ${S.days.has(x.d) ? 'checked' : ''}><i></i></span></label>`).join('')}</div></section>
        <section><h3 class="sh">מה נכלל בדוח</h3><div class="menu pad">${tog('works', 'עבודות שבוצעו')}${tog('photos', 'תיעוד בתמונות')}${tog('qty', 'כמויות וחומר')}${iss.length || days.some(x => x.issues) ? tog('issues', 'תקלות שטופלו') : ''}</div></section>
        <label class="field">מה בוצע<textarea id="sw" rows="3">${esc(S.text ?? summaryText())}</textarea></label>
        ${S.sec.photos && P.some(src) ? `<section><div class="sh-row"><h3 class="sh">תמונות</h3><span class="count" id="pcount">${S.photos.size}</span>${S.photos.size ? '<button class="more" id="pclr">ניקוי</button>' : ''}</div>
          ${c.map(x => byDay(x.d).length ? `<div class="pgroup"><small class="muted">${dow(x.d)} ${dm(x.d)}</small><div class="pgrid">${byDay(x.d).map(ph => `<button type="button" class="pick ${S.photos.has(key(ph)) ? 'on' : ''}" data-ph="${esc(key(ph))}" aria-pressed="${S.photos.has(key(ph))}">
            <img src="${esc(src(ph))}" alt="" loading="lazy">${ph.k === 'before' ? '<span class="pk-tag">לפני</span>' : ph.k === 'after' ? '<span class="pk-tag a">אחרי</span>' : ''}<span class="pk-on">${icon('check', 16)}</span></button>`).join('')}</div></div>` : '').join('')}</section>` : ''}
        ${S.sec.works && tasks.length ? `<details class="fold"><summary><span class="sh">משימות שבוצעו</span><span class="count">${S.tasks.size}/${tasks.length}</span></summary>
          <div class="list">${tasks.map(t => `<label class="lrow"><span class="grow"><b>${esc(t.title)}</b>${t.buildings?.name ? `<small>${esc(t.buildings.name)}</small>` : ''}</span><span class="sw"><input type="checkbox" data-task="${t.id}" ${S.tasks.has(t.id) ? 'checked' : ''}><i></i></span></label>`).join('')}</div></details>` : ''}
      </div>`;
    bar.innerHTML = `<button class="btn primary" id="next" ${c.length ? '' : 'disabled'}>${icon('pen', 20)} מסירה ללקוח לחתימה</button>`;
    $('#sw', el).oninput = e => { S.text = e.target.value; persist(); };
    $$('[data-day]', el).forEach(i => i.onchange = () => { i.checked ? S.days.add(i.dataset.day) : S.days.delete(i.dataset.day); persist(); step1(); });
    $$('[data-sec]', el).forEach(i => i.onchange = () => { S.sec[i.dataset.sec] = i.checked; persist(); step1(); });
    $$('[data-task]', el).forEach(i => i.onchange = () => { i.checked ? S.tasks.add(i.dataset.task) : S.tasks.delete(i.dataset.task); persist(); $('.fold .count', el).textContent = `${S.tasks.size}/${tasks.length}`; });
    $$('[data-ph]', el).forEach(b => {
      let t = null, long = false;
      b.onpointerdown = () => { long = false; t = setTimeout(() => { long = true; const ph = P.find(x => key(x) === b.dataset.ph); zoom(full(ph) || src(ph), dm(ph.d)); }, 450); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(t);
      b.onclick = () => { if (long) return; const k = b.dataset.ph, on = !S.photos.has(k); on ? S.photos.add(k) : S.photos.delete(k);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); persist(); $$('.kpi b', el)[2].textContent = S.photos.size; $('#pcount', el).textContent = S.photos.size; };
    });
    const pc = $('#pclr', el); if (pc) pc.onclick = () => { S.photos.clear(); persist(); step1(); };
    $('#next').onclick = () => step2();
  }

  // ---- שלב 2: הטלפון ביד הלקוח. מסך אחד, ממותג, בלי שדות מיותרים: מה בוצע (לראות) → כוכבים → שם → חתימה → אישור
  function step2() {
    S.step = 2; const c = chosen(), sel = P.filter(x => S.photos.has(key(x)) && src(x));
    const bf = sel.find(x => x.k === 'before'), af = [...sel].reverse().find(x => x.k !== 'before');
    const hero = full(af || sel[0] || {}) || src(af || sel[0] || {}) || '';
    const range = `${dm(c[0].d)}${c.length > 1 ? '–' + dm(c.at(-1).d) : ''}`;
    const site = p.sites?.name || p.name.replace(/^[^—]*—\s*/, '');
    const W = works(), nT = S.sec.works ? S.tasks.size : 0;
    const who0 = contacts.length === 1 ? contacts[0] : null;
    document.body.classList.add('client-mode');
    addEventListener('hashchange', () => document.body.classList.remove('client-mode'), { once: true });
    el.innerHTML = `<div class="soc">
        <div class="soc-hero"${hero ? ` style="background-image:url('${esc(hero)}')"` : ''}>
          <button class="soc-back" id="b1" aria-label="חזרה">${icon('back', 20)}</button>
          <div class="soc-wm"><b>E-DRONE</b><small>TECHNOLOGIES</small></div>
          <div class="soc-ht"><span class="soc-k">אישור סיום עבודה</span><h1>${esc(site)}</h1><p>${esc(p.client_name || '')}</p></div>
        </div>
        <div class="soc-stats"><div><b>${c.length}</b><span>${c.length === 1 ? 'יום עבודה' : 'ימי עבודה'}</span></div>${nT ? `<div><b>${nT}</b><span>משימות</span></div>` : ''}<div><b dir="ltr">${range}</b><span>מועד</span></div></div>
        ${bf && af ? `<div class="soc-ba"><figure><img src="${esc(full(bf) || src(bf))}" alt=""><figcaption>לפני</figcaption></figure><figure class="a"><img src="${esc(full(af) || src(af))}" alt=""><figcaption>אחרי</figcaption></figure></div>` : ''}
        ${S.text || W.length ? `<div class="soc-works">${(S.text ? S.text.split('\n')[0].split(/\s*·\s*/) : W).filter(Boolean).slice(0, 8).map(w => `<span>${icon('check', 14)}${esc(w)}</span>`).join('')}</div>` : ''}
        <section class="soc-q"><h2>איך הייתה העבודה?</h2><div class="stars soc-stars" id="st">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${S.rating >= n}" aria-label="${n} כוכבים">★</button>`).join('')}</div>
          <div class="soc-nt" id="ntw" hidden><textarea id="snt" rows="2" placeholder="מה נשפר?"></textarea></div></section>
        <section class="soc-q"><h2>מי חותם?</h2>
          ${contacts.length > 1 ? `<div class="chips">${contacts.map((x, i) => `<button type="button" class="chip" data-ct="${i}" aria-pressed="false">${esc(x.name)}</button>`).join('')}</div>` : ''}
          <div class="row"><input type="text" id="sn" class="grow" placeholder="שם מלא" autocomplete="name" value="${esc(who0?.name || (contacts.length ? '' : p.sites?.contact_name || ''))}"><input type="text" id="sr" placeholder="תפקיד" value="${esc(who0?.role || '')}"></div></section>
        <section class="soc-q"><div class="soc-sigw"><canvas id="sig" class="sig soc-sig"></canvas><span class="soc-ph" id="sph">${icon('pen', 18)} חתימה כאן</span><button class="soc-clr" id="sclr" type="button" hidden>ניקוי</button></div>
          <label class="soc-ok"><input type="checkbox" id="sf" checked><i>${icon('check', 16)}</i><span>העבודה בוצעה במלואה ולשביעות רצוני</span></label></section>
      </div>`;
    bar.innerHTML = '<button class="btn primary" id="sgo" disabled>אישור וחתימה</button>';
    $('#b1').onclick = () => { document.body.classList.remove('client-mode'); step1(); };
    $$('[data-ct]', el).forEach(b => b.onclick = () => { const x = contacts[+b.dataset.ct]; $$('[data-ct]', el).forEach(y => y.setAttribute('aria-pressed', y === b)); $('#sn').value = x.name || ''; $('#sr').value = x.role || ''; ready(); });
    const notesOpen = () => { const lo = S.rating < 4 || $('#sf').checked === false; $('#ntw').hidden = !lo && !$('#snt').value; };
    $$('#st [data-q]').forEach(b => b.onclick = () => { S.rating = +b.dataset.q; $$('#st [data-q]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.q <= S.rating)); b.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], 260); notesOpen(); });
    $('#sf').onchange = notesOpen;
    let sig;
    const ready = () => { $('#sgo').disabled = !(sig && !sig.empty() && $('#sn').value.trim()); };
    $('#sn').oninput = ready;
    import('./today.js').then(({ pad }) => { sig = pad($('#sig'), null, () => { $('#sph').hidden = true; $('#sclr').hidden = false; ready(); });
      $('#sclr').onclick = () => { sig.clear(); $('#sph').hidden = false; $('#sclr').hidden = true; ready(); };
      $('#sgo').onclick = async e => {
        const name = $('#sn').value.trim(); if (!name) { toast('חסר שם החותם'); return $('#sn').focus(); }
        if (sig.empty()) return toast('חסרה חתימה');
        e.target.disabled = true;
        const id = uid(), path = `${state.user.id}/signoff/${id}.png`, sigData = $('#sig').toDataURL('image/png');
        const photos = S.sec.photos ? P.filter(x => S.photos.has(key(x))).map(({ b, p: pth, k, d }) => ({ b, p: pth, k, d })) : [];
        const text = (S.text ?? summaryText()).trim();
        const include = { days: c.map(x => x.d), sections: S.sec, photos, tasks: S.sec.works ? [...S.tasks] : [], text };
        const snapshot = { project: p.name, client: p.client_name, range: [c[0].d, c.at(-1).d], days: c.map(x => ({ d: x.d, work: x.work, gal: x.gal, mat: x.mat || null })),
          tasks: S.sec.works ? tasks.filter(t => S.tasks.has(t.id)).map(t => ({ t: t.title, b: t.buildings?.name || null })) : [],
          qty: S.sec.qty ? { gallons: c.reduce((t, x) => t + (x.gal || 0), 0), material: [...new Set(c.map(x => x.mat).filter(Boolean))] } : null,
          issues: S.sec.issues ? [...iss.map(i => ({ b: i.body, r: i.resolution })), ...c.flatMap(x => (x.issues || []).map(b => ({ b })))] : [] };
        const row = { id, project_id: pid, work_day_id: dayId || null, signer_name: name, signer_role: $('#sr').value.trim() || null,
          full_ok: $('#sf').checked, rating: S.rating, works: text || null, notes: $('#snt').value.trim() || null, signature_path: path, client_email: contacts.find(x => x.name === name)?.email || null,
          include, snapshot, created_by: state.user.id };
        try {
          await enqueue({ kind: 'file', path, blob: await sig.blob(), type: 'image/png' });
          await enqueue({ kind: 'insert', table: 'project_signoffs', row });
        } catch (err) { e.target.disabled = false; return toast('השמירה נכשלה — נסו שוב'); }
        cache.set(ck, null).catch(() => {});
        // הדוח ללקוח נבנה מהחתימה מיד — גם לפני שהגיעה לשרת (בלי קליטה): עותק מקומי עם החתימה עצמה
        cache.set('signoff-last:' + pid, { ...row, created_at: new Date().toISOString(), sigData }).catch(() => {});
        step3(row);
      };
    });
  }

  // ---- שלב 3: תודה ללקוח, ולמנהל — הדוח מוכן
  function step3(row) {
    S.step = 3; bar.remove();
    const first = row.signer_name.split(/\s+/)[0];
    el.innerHTML = `<div class="soc-done">
        <div class="soc-tick">${icon('check', 54)}</div>
        <h1>תודה, ${esc(first)}!</h1>
        <p>${esc(p.sites?.name || p.name.replace(/^[^—]*—\s*/, ''))} · אושר ${esc(dm(isoDay()))}</p>
        <div class="soc-rate" aria-label="${row.rating} כוכבים">${'★'.repeat(row.rating)}<i>${'★'.repeat(5 - row.rating)}</i></div>
        <div class="soc-brand"><b>E-DRONE</b><small>TECHNOLOGIES</small></div>
        <div class="soc-acts">
          <a class="btn primary block" href="#/client-report/${pid}">${icon('report', 20)} הדוח ללקוח מוכן</a>
          <a class="btn ghost block" href="#/p/${pid}/s">${navigator.onLine ? 'סיום' : 'סיום · יישלח כשתחזור קליטה'}</a>
        </div>
      </div>`;
    try { navigator.vibrate?.([30, 60, 30]); } catch {}
  }
  step1();
}
