// דוח ללקוח — נבנה לבד מהחתימה האחרונה (מה שהחותם בחר: ימים, זוגות לפני/אחרי מאותו יום, משימות, כמויות, תקלות שטופלו, דירוג, חתימה). לא נשלח במייל — PDF/קישור/קולאז׳ מהמנהל.
// כללים: אחריות על משימות = "E-Drone" (לא שמות עובדים); איש קשר בפוטר = החברה; זוג לפני/אחרי רק מאותו יום עבודה (לא זוגות מזויפים).
import { sb, state, isManager, signedUrls, icon, $, $$, esc, toast, dm, coverArt, cache, isoDay } from '../lib/core.js';

const bdi = t => esc(t).replace(/([+−~≤≥]?[0-9A-Za-z][0-9A-Za-z.,%°~+−≤≥–—/ -]*[0-9A-Za-z%°])/g, '<bdi dir="ltr">$1</bdi>');
const fmt = d => d ? new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export async function renderClientReport(el, pid) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const q = x => x.then(r => r.data || []).catch(() => []);
  const [{ data: p }, days, tasks, reps0, ph, sos, { data: me }, local] = await Promise.all([
    sb.from('projects').select('*, sites(name,address,contact_name)').eq('id', pid).single(),
    q(sb.from('work_days').select('id,day,status,work_types,signoff,gallons,material,weather_stop').eq('project_id', pid).eq('status', 'done').order('day')),
    q(sb.from('tasks').select('id,title,status,phase,buildings(name)').eq('project_id', pid).neq('status', 'dropped').order('day_no').order('seq')),
    q(sb.from('field_reports').select('report_date,work,gallons,notes,photos').eq('project_id', pid).eq('excluded', false).order('report_date')),
    q(sb.from('photos').select('kind,storage_path,work_day_id,created_at').eq('project_id', pid).in('kind', ['before', 'after']).order('created_at')),
    q(sb.from('project_signoffs').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1)),
    sb.from('app_settings').select('value').eq('key', 'company').maybeSingle(),
    cache.get('signoff-last:' + pid).catch(() => null),
  ]);
  if (!p) { el.innerHTML = '<div class="empty">הפרויקט לא נמצא</div>'; return; }
  // החתימה האחרונה קובעת מה נכלל (ימים, תמונות, משימות, מקטעים). חתימה שנשמרה בטלפון ועוד לא הגיעה לשרת — משמשת מיד
  let so = sos[0] || null;
  if (local && (!so || so.id === local.id || new Date(local.created_at) > new Date(so.created_at))) so = { ...(so || {}), ...local };
  if (so?.id && sos[0]?.id === so.id && local) cache.set('signoff-last:' + pid, null).catch(() => {});
  const legacy = !so && [...days].reverse().find(d => d.signoff)?.signoff;
  const inc = so?.include || null, snap = so?.snapshot || null, sec = { works: true, photos: true, qty: false, issues: false, ...(inc?.sections || {}) };
  const reps = reps0.filter(r => r.report_date && !/^⚠/.test(r.notes || ''));
  // ---- ימים: מה שהחותם בחר; אחרת כל ימי העבודה
  const D = new Map();
  for (const w of days) D.set(w.day, { d: w.day, work: (w.work_types || []).join(' · '), gal: Number(w.gallons) || 0, mat: w.material });
  for (const r of reps) if (!D.has(r.report_date)) D.set(r.report_date, { d: r.report_date, work: r.work || '', gal: Number(r.gallons) || 0 });
  for (const x of snap?.days || []) D.set(x.d, { ...(D.get(x.d) || {}), d: x.d, work: x.work || D.get(x.d)?.work || '', gal: x.gal ?? D.get(x.d)?.gal, mat: x.mat ?? D.get(x.d)?.mat });
  const dates = (inc?.days?.length ? inc.days : [...D.keys()]).filter(d => D.has(d)).sort();
  const L = dates.map(d => D.get(d));
  const works = [...new Set(L.flatMap(x => (x.work || '').split(/\s*[·,]\s*/).filter(Boolean)))];
  // ---- תמונות: הבחירה מהחתימה (b/p/k/d), אחרת לפני/אחרי מהאפליקציה + תמונות הדוחות
  const wdDay = new Map(days.map(w => [w.id, w.day]));
  let PH = inc?.photos?.length ? inc.photos : [...ph.map(x => ({ b: 'field', p: x.storage_path, k: x.kind, d: wdDay.get(x.work_day_id) || isoDay(new Date(x.created_at)) })),
    ...reps.flatMap(r => (r.photos || []).filter(Boolean).map(path => ({ b: 'media', p: path, k: 'doc', d: r.report_date })))];
  if (inc && !sec.photos) PH = [];
  const sigPath = so?.signature_path && !so.sigData ? [so.signature_path] : legacy?.signature_path ? [legacy.signature_path] : [];
  const [fu, mu] = await Promise.all([signedUrls('field', PH.filter(x => x.b === 'field').map(x => x.p).concat(sigPath)).catch(() => ({})),
    signedUrls('media', PH.filter(x => x.b === 'media').map(x => x.p).concat(p.cover_path ? [p.cover_path] : [])).catch(() => ({}))]);
  const url = x => (x.b === 'field' ? fu : mu)[x.p];
  PH = PH.filter(url);
  const sigUrl = so?.sigData || (sigPath[0] && fu[sigPath[0]]) || null;
  // זוגות אמיתיים בלבד: לפני ואחרי מאותו יום עבודה. השאר — בשורה משלהם
  const blocks = dates.map(d => { const mine = PH.filter(x => x.d === d), b = mine.filter(x => x.k === 'before'), a = mine.filter(x => x.k !== 'before');
    const pairs = []; while (b.length && a.length) pairs.push([b.shift(), a.pop()]); return { d, work: D.get(d)?.work, pairs, rest: [...b, ...a] }; }).filter(x => x.pairs.length || x.rest.length);
  const pages = []; let cur = [], w8 = 0;
  for (const bl of blocks) { const wt = bl.pairs.length * 2 + (bl.rest.length ? 1 : 0); if (cur.length && w8 + wt > 4) { pages.push(cur); cur = []; w8 = 0; } cur.push(bl); w8 += wt; }
  if (cur.length) pages.push(cur);
  const afterAll = PH.filter(x => x.k !== 'before');
  const hero = (p.cover_path && mu[p.cover_path]) || (afterAll.length && url(afterAll.at(-1))) || (PH[0] && url(PH[0])) || coverArt(p.name);
  const co = me?.value || {}, coLine = [co.phone, co.email, co.web].filter(Boolean).map(x => `<bdi dir="ltr">${esc(x)}</bdi>`).join(' · ');
  const T = snap?.tasks?.length ? snap.tasks.map(t => ({ t: t.t, b: t.b })) : (inc ? (inc.tasks || []).map(id => tasks.find(t => t.id === id)).filter(Boolean) : tasks.filter(t => t.status === 'done')).map(t => t.t ? t : { t: t.title, b: t.buildings?.name || null });
  const issues = sec.issues ? (snap?.issues || []) : [];
  const qty = sec.qty ? (snap?.qty || { gallons: L.reduce((t, x) => t + (x.gal || 0), 0), material: [...new Set(L.map(x => x.mat).filter(Boolean))] }) : null;
  const rating = so?.rating || null, ok = so ? so.full_ok !== false : legacy ? legacy.satisfied !== false : null;
  const signer = so?.signer_name || legacy?.name || '', role = so?.signer_role || legacy?.role || '', signedAt = (so?.created_at || legacy?.at) ? isoDay(new Date(so?.created_at || legacy?.at)) : '';   // תאריך ישראל, לא UTC
  const place = p.sites?.name || p.name.replace(/^[^—]*—\s*/, '');
  const intro = inc?.text && !/\n/.test(inc.text.trim()) && inc.text.length > 60 ? inc.text
    : `E-Drone ביצעה ${works.length ? works.join(', ') : 'עבודות ניקוי'} ב${place}${dates.length ? (dates.length > 1 ? `, בין ${fmt(dates[0])} ל-${fmt(dates.at(-1))}` : `, ב-${fmt(dates[0])}`) : ''}. העבודה בוצעה באמצעות רחפן ייעודי ובצוות מוסמך, תוך שמירה על בטיחות האתר והפרעה מינימלית לשגרה.`;
  const stars = n => `<span class="cr-stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const foot = n => `<div class="cr-pf"><span><bdi dir="ltr"><b>E-Drone</b> Technologies</bdi> · ${esc(place)}</span><span>${n}</span></div>`;
  const shot = (x, tag, cls = '') => `<div class="shot ${cls}"><img src="${esc(url(x))}" alt="">${tag ? `<span class="tag ${tag === 'אחרי' ? 'a' : ''}">${tag}</span>` : ''}</div>`;
  let pn = 1;
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/p/${pid}/s" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ללקוח${so || legacy ? '' : ' <span class="pill warn">לפני חתימה</span>'}</b>
      <button class="btn ghost sm" id="shr">${icon('send', 16)} שיתוף</button><button class="btn ghost sm" id="collage">קולאז׳</button><button class="btn primary sm" id="print">PDF</button></div>
    <div class="creport" id="cr">
      <div class="pg"><div class="hero"><img src="${esc(hero)}" alt=""><div class="hero-top"><div class="wordmark"><div class="w">E-DRONE</div><div class="t">TECHNOLOGIES</div></div><div class="kicker">PROJECT REPORT</div></div>
        <div class="hero-txt"><div class="lbl">דוח סיכום פרויקט</div><h1 contenteditable="true">${bdi(place)}</h1><div class="sub" contenteditable="true">${bdi(p.client_name || '')}</div></div></div>
        <div class="stats"><div class="stat"><div class="n">${dates.length || '—'}</div><div class="c">ימי עבודה</div></div><div class="stat"><div class="n">${T.length || works.length || '—'}</div><div class="c">${T.length ? 'משימות שבוצעו' : 'סוגי עבודה'}</div></div>
          <div class="stat"><div class="n">${PH.length || '—'}</div><div class="c">תמונות תיעוד</div></div><div class="stat"><div class="n">${rating ? `${rating}<em>/5</em>` : ok != null ? '✓' : '—'}</div><div class="c">${rating ? 'שביעות רצון' : 'אישור לקוח'}</div></div></div>
        <div class="intro"><p contenteditable="true">${bdi(intro)}</p></div>
        <div class="meta"><div><div class="k">לקוח</div><div class="v" contenteditable="true">${bdi(p.client_name || '—')}</div></div><div><div class="k">אתר</div><div class="v" contenteditable="true">${bdi(p.sites?.address || place || '—')}</div></div><div><div class="k">מועד ביצוע</div><div class="v">${dates.length ? `<bdi dir="ltr">${dm(dates[0])}${dates.length > 1 ? '–' + dm(dates.at(-1)) : ''}</bdi>` : '—'}</div></div></div>
        <div class="foot"><span><b>E-Drone</b> Technologies</span>${coLine ? `<span>${coLine}</span>` : ''}</div></div>
      ${pages.map((pg, i) => `<div class="pg"><div class="pad">${i ? '' : '<div class="rsec">DOCUMENTATION</div><h2>תיעוד העבודה</h2><div class="rule"></div>'}
        ${pg.map(bl => `<div class="ba"><div class="band"><span class="t">${esc(fmt(bl.d))}</span>${bl.work ? `<span class="d">${esc(bl.work)}</span>` : ''}<span class="ln"></span></div>
          ${bl.pairs.map(([b, a]) => `<div class="row2 cr-pair">${shot(b, 'לפני')}${shot(a, 'אחרי')}</div>`).join('')}
          ${bl.rest.length ? `<div class="row3">${bl.rest.slice(0, 3).map(x => shot(x, x.k === 'before' ? 'לפני' : x.k === 'after' ? 'אחרי' : '')).join('')}</div>` : ''}</div>`).join('')}
        </div>${foot(++pn)}</div>`).join('')}
      <div class="pg"><div class="pad"><div class="rsec">SCOPE</div><h2>פירוט העבודה</h2><div class="rule"></div>
        <table><tr><th>עבודה</th><th>${T.some(t => t.b) ? 'מבנה' : 'באחריות'}</th><th>סטטוס</th></tr>
          ${(() => { const R = T.length ? T : works.map(w => ({ t: w })); const hb = T.some(t => t.b); return R.slice(0, 14).map(w => `<tr><td class="el" contenteditable="true">${bdi(w.t)}</td><td>${hb ? bdi(w.b || '') : 'E-Drone'}</td><td class="st"><span class="pill">בוצע</span></td></tr>`).join('') + (R.length > 14 ? `<tr><td class="el">ועוד ${R.length - 14}</td><td></td><td class="st"><span class="pill">בוצע</span></td></tr>` : '') || '<tr><td colspan="3">—</td></tr>'; })()}</table>
        ${L.length ? `<div class="rsec" style="margin-top:11mm">FIELD LOG</div><h2 class="cr-h3">יומן ימי העבודה</h2>
          <table class="cr-log"><tr><th>תאריך</th><th>עבודה</th>${qty ? '<th>כמות</th>' : ''}</tr>${L.map(x => `<tr><td class="cr-d"><bdi dir="ltr">${dm(x.d)}</bdi></td><td contenteditable="true">${bdi(x.work || 'עבודה באתר')}</td>${qty ? `<td>${x.gal ? `<bdi dir="ltr">${x.gal}</bdi> גל׳` : ''}</td>` : ''}</tr>`).join('')}</table>
          ${qty && (qty.gallons || qty.material?.length) ? `<div class="cr-qty">${qty.gallons ? `<span><b><bdi dir="ltr">${qty.gallons}</bdi></b> גלונים בסה״כ</span>` : ''}${qty.material?.length ? `<span>${esc(qty.material.join(' · '))}</span>` : ''}</div>` : ''}` : ''}
        ${issues.length ? `<div class="rsec" style="margin-top:11mm">RESOLVED</div><h2 class="cr-h3">נקודות שטופלו</h2><ul class="cl">${issues.map(x => `<li><b>${bdi(x.b)}</b>${x.r ? ` — ${bdi(x.r)}` : ''}</li>`).join('')}</ul>` : ''}
      </div>${foot(++pn)}</div>
      <div class="pg"><div class="pad"><div class="rsec">CLIENT APPROVAL</div><h2>אישור הלקוח</h2><div class="rule"></div>
        ${signer ? `<div class="cr-sign"><div class="cr-sv"><div class="k">החותם</div><div class="v">${bdi(signer)}${role ? ` · ${esc(role)}` : ''}</div>
            <div class="k">תאריך</div><div class="v">${signedAt ? fmt(signedAt) : ''}</div>
            ${rating ? `<div class="k">שביעות רצון</div><div class="v">${stars(rating)}</div>` : ''}</div>
          <div class="cr-sig">${sigUrl ? `<img src="${esc(sigUrl)}" alt="חתימה">` : ''}<span>חתימת הלקוח</span></div></div>
          <div class="note"><p><b>${ok === false ? 'העבודה אושרה עם הערות.' : 'העבודה בוצעה במלואה ולשביעות רצון הלקוח.'}</b>${so?.notes || legacy?.notes ? ` ${bdi(so?.notes || legacy?.notes)}` : ''}</p></div>`
        : '<div class="note"><p>טרם נחתם על ידי הלקוח.</p></div>'}
        <div class="rsec" style="margin-top:12mm">SUMMARY</div><h2>סיכום</h2><div class="rule"></div>
        <ul class="cl" contenteditable="true"><li>העבודה בוצעה בהתאם לתכנית ובלוח הזמנים שתואם.</li><li>הופעלו נהלי בטיחות מלאים: גידור אזור העבודה, תדריך יומי ובדיקות לפני טיסה.</li><li>מומלץ לקבוע ניקוי תקופתי כדי לשמור על מראה המבנה ועל תפקוד המעטפת.</li></ul>
        <div class="end"><div class="l"><b>E-Drone Technologies</b>${coLine ? `<br>${coLine}` : ''}</div><img src="logo.png" alt="E-Drone"></div></div>${foot(++pn)}</div>
    </div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => { const t = document.title; document.title = `E-Drone · ${place}`; window.print(); setTimeout(() => document.title = t, 500); };
  const allB = PH.filter(x => x.k === 'before').map(url), allA = afterAll.map(url);
  $('#collage').onclick = () => collage(allB, allA, place);
  $('#shr').onclick = () => shareLink(p, pid);
}

// קישור ללקוח (share.html): מתקדם לבד מ"התקדמות" ל"דוח סיום" ברגע שנחתם. משתמשים בקישור הפעיל אם יש
async function shareLink(p, pid) {
  let { data: s } = await sb.from('project_shares').select('token,expires_at').eq('project_id', pid).eq('revoked', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!s) ({ data: s } = await sb.from('project_shares').insert({ project_id: pid, created_by: state.user.id }).select('token').single());
  if (!s) return toast('הקישור לא נוצר — נסו שוב');
  const u = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share.html?t=' + s.token;
  try { if (navigator.share) await navigator.share({ title: `E-Drone · ${p.sites?.name || p.name}`, url: u }); else { await navigator.clipboard.writeText(u); toast('הקישור הועתק'); } } catch { }
}

// קולאז׳ לפני/אחרי לשיווק (1080×1080) — עם לוגו, בלי שם לקוח בתמונה
async function collage(before, after, name) {
  if (!before.length || !after.length) return toast('צריך לפחות תמונת לפני ותמונת אחרי');
  const load = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  try {
    const [a, b, logo] = await Promise.all([load(before[0]), load(after[0]), load('logo.png').catch(() => null)]);
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
    const draw = (img, dx) => { const s = Math.max(540 / img.width, 1080 / img.height), w = img.width * s, h = img.height * s; x.save(); x.beginPath(); x.rect(dx, 0, 540, 1080); x.clip(); x.drawImage(img, dx + (540 - w) / 2, (1080 - h) / 2, w, h); x.restore(); };
    draw(b, 0); draw(a, 540);   // RTL: לפני מימין, אחרי משמאל
    x.fillStyle = '#C6EA5E'; x.fillRect(538, 0, 4, 1080);
    x.font = 'bold 44px Heebo, Arial'; x.textAlign = 'center';
    [['לפני', 810, 'rgba(14,16,19,.85)', '#fff'], ['אחרי', 270, '#C6EA5E', '#16181C']].forEach(([t, cx, bg, fg]) => { x.fillStyle = bg; x.fillRect(cx - 90, 40, 180, 70); x.fillStyle = fg; x.fillText(t, cx, 92); });
    if (logo) { const h = 70, w = logo.width * h / logo.height; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(1080 - w - 60, 960, w + 40, h + 30); x.drawImage(logo, 1080 - w - 40, 975, w, h); }
    const a2 = document.createElement('a'); a2.href = c.toDataURL('image/jpeg', 0.9); a2.download = `לפני-אחרי-${name}.jpg`; a2.click();
    toast('הקולאז׳ נשמר — בלי שם הלקוח בתמונה');
  } catch { toast('התמונות לא נטענו — נסו שוב'); }
}
