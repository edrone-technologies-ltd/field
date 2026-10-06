// דוח ללקוח בסיום פרויקט — בתבנית הקבועה של E-Drone (שער, לפני/אחרי, פירוט + חתימה, סיכום). נבנה מהנתונים, ניתן לעריכה, הדפסה ל-PDF.
// כללים: אחריות על משימות = "E-Drone" (לא שמות עובדים); איש קשר בפוטר = אדם; לפני/אחרי בשורות נפרדות (לא זוגות מזויפים).
import { sb, state, isManager, signedUrls, icon, $, $$, esc, toast, dm, coverArt } from '../lib/core.js';

const bdi = t => esc(t).replace(/([+−~≤≥]?[0-9A-Za-z][0-9A-Za-z.,%°~+−≤≥–—/ -]*[0-9A-Za-z%°])/g, '<bdi dir="ltr">$1</bdi>');
const fmt = d => d ? new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export async function renderClientReport(el, pid) {
  if (!isManager()) { el.innerHTML = '<div class="empty">למנהלים בלבד.</div>'; return; }
  el.innerHTML = '<div class="skel tall"></div>';
  const [{ data: p }, { data: days }, { data: tasks }, { data: reps }, { data: ph }, { data: sos }, { data: me }] = await Promise.all([
    sb.from('projects').select('*, sites(name,address,contact_name)').eq('id', pid).single(),
    sb.from('work_days').select('day,status,work_types,signoff,gallons').eq('project_id', pid).eq('status', 'done').order('day'),
    sb.from('tasks').select('title,status,phase').eq('project_id', pid).neq('status', 'dropped').order('day_no').order('seq'),
    sb.from('field_reports').select('report_date,work,photos').eq('project_id', pid).order('report_date'),
    sb.from('photos').select('kind,storage_path').eq('project_id', pid).in('kind', ['before', 'after']).order('created_at'),
    sb.from('project_signoffs').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(1),
    sb.from('profiles').select('full_name,phone').eq('id', state.user.id).single(),
  ]);
  const dates = [...new Set([...(days || []).map(d => d.day), ...(reps || []).map(r => r.report_date)])].sort();
  const works = [...new Set([...(days || []).flatMap(d => d.work_types || []), ...(reps || []).flatMap(r => (r.work || '').split(', ').filter(Boolean))])];
  const fieldU = await signedUrls('field', (ph || []).map(x => x.storage_path).concat(sos?.[0]?.signature_path ? [sos[0].signature_path] : [])).catch(() => ({}));
  const mediaPaths = (reps || []).flatMap(r => (r.photos || []).filter(Boolean)); const mediaU = await signedUrls('media', mediaPaths.concat(p.cover_path ? [p.cover_path] : [])).catch(() => ({}));
  const before = (ph || []).filter(x => x.kind === 'before').map(x => fieldU[x.storage_path]).filter(Boolean);
  const after = (ph || []).filter(x => x.kind === 'after').map(x => fieldU[x.storage_path]).concat(mediaPaths.map(x => mediaU[x])).filter(Boolean);
  const hero = (p.cover_path && mediaU[p.cover_path]) || after[0] || before[0] || coverArt(p.name);
  const so = sos?.[0] || [...(days || [])].reverse().find(d => d.signoff)?.signoff;
  const sigUrl = so?.signature_path ? fieldU[so.signature_path] : null;
  const doneTasks = (tasks || []).filter(t => t.status === 'done');
  const intro = `E-Drone ביצעה ${works.length ? works.join(', ') : 'עבודות ניקוי'} ב${p.sites?.name || p.name}${dates.length ? `, בין ${fmt(dates[0])} ל-${fmt(dates.at(-1))}` : ''}. העבודה בוצעה באמצעות רחפן ייעודי ובצוות מוסמך, תוך שמירה על בטיחות האתר והפרעה מינימלית לשגרה.`;
  const rows3 = (list, tag) => list.length ? `<div class="row3">${list.slice(0, 6).map(u => `<div class="shot"><img src="${esc(u)}" alt=""><span class="tag ${tag === 'אחרי' ? 'a' : ''}">${tag}</span></div>`).join('')}</div>` : '';
  el.innerHTML = `<div class="rep-toolbar"><a class="back" href="#/p/${pid}/s" aria-label="חזרה">${icon('back', 20)}</a><b class="grow">דוח ללקוח</b>
      <button class="btn ghost sm" id="collage">קולאז׳ לפני/אחרי</button><button class="btn primary sm" id="print">הדפסה / PDF</button></div>
    <div class="rep-hint">אפשר לערוך כל טקסט בדוח בלחיצה עליו לפני ההדפסה. בהדפסה בוחרים "שמירה כ-PDF".</div>
    <div class="creport" id="cr">
      <div class="pg"><div class="hero"><img src="${esc(hero)}" alt=""><div class="hero-top"><div class="wordmark"><div class="w">E-DRONE</div><div class="t">TECHNOLOGIES</div></div><div class="kicker">PROJECT REPORT</div></div>
        <div class="hero-txt"><div class="lbl">דוח סיכום פרויקט</div><h1 contenteditable="true">${bdi(p.name)}</h1><div class="sub" contenteditable="true">${bdi(p.client_name || p.sites?.name || '')}</div></div></div>
        <div class="stats"><div class="stat"><div class="n">${dates.length || '—'}</div><div class="c">ימי עבודה</div></div><div class="stat"><div class="n">${doneTasks.length || works.length || '—'}</div><div class="c">${doneTasks.length ? 'משימות שבוצעו' : 'סוגי עבודה'}</div></div>
          <div class="stat"><div class="n">${(before.length + after.length) || '—'}</div><div class="c">תמונות תיעוד</div></div><div class="stat"><div class="n">${so ? '✓' : '—'}</div><div class="c">אישור לקוח</div></div></div>
        <div class="intro"><p contenteditable="true">${bdi(intro)}</p></div>
        <div class="meta"><div><div class="k">לקוח</div><div class="v" contenteditable="true">${bdi(p.client_name || '—')}</div></div><div><div class="k">אתר</div><div class="v" contenteditable="true">${bdi(p.sites?.address || p.sites?.name || '—')}</div></div><div><div class="k">מועד ביצוע</div><div class="v">${dates.length ? `${dm(dates[0])}${dates.length > 1 ? '–' + dm(dates.at(-1)) : ''}` : '—'}</div></div></div>
        <div class="foot"><span><b>E-Drone</b> Technologies</span><span>${esc(me?.full_name || '')} · <bdi dir="ltr">${esc(me?.phone || '')}</bdi></span></div></div>
      ${before.length || after.length ? `<div class="pg"><div class="pad"><div class="sec">DOCUMENTATION</div><h2>תיעוד העבודה</h2><div class="rule"></div>
        ${before.length ? `<div class="ba"><div class="band"><span class="t">לפני</span><span class="ln"></span></div>${rows3(before, 'לפני')}</div>` : ''}
        ${after.length ? `<div class="ba"><div class="band"><span class="t">אחרי</span><span class="ln"></span></div>${rows3(after, 'אחרי')}</div>` : ''}</div></div>` : ''}
      <div class="pg"><div class="pad"><div class="sec">SCOPE</div><h2>פירוט העבודה</h2><div class="rule"></div>
        <table><tr><th>עבודה</th><th>באחריות</th><th>סטטוס</th></tr>
          ${(() => { const L = doneTasks.length ? doneTasks.map(t => t.title) : works; return L.slice(0, 12).map(w => `<tr><td class="el" contenteditable="true">${bdi(w)}</td><td>E-Drone</td><td class="st"><span class="pill">בוצע</span></td></tr>`).join('') + (L.length > 12 ? `<tr><td class="el">ועוד ${L.length - 12} משימות</td><td>E-Drone</td><td class="st"><span class="pill">בוצע</span></td></tr>` : '') || '<tr><td colspan="3">—</td></tr>'; })()}</table>
        ${so ? `<div class="note"><p><b>אישור הלקוח:</b> ${bdi(so.signer_name || so.name || '')}${so.signer_role || so.role ? ' · ' + esc(so.signer_role || so.role) : ''}. ${so.full_ok === false || so.satisfied === false ? 'העבודה אושרה עם הערות.' : 'העבודה בוצעה במלואה ולשביעות רצון הלקוח.'}${so.notes ? ' ' + bdi(so.notes) : ''}</p>${sigUrl ? `<img src="${esc(sigUrl)}" alt="חתימה" style="height:22mm;margin-top:3mm;background:#fff">` : ''}</div>` : ''}
        <div class="sec" style="margin-top:12mm">SUMMARY</div><h2>סיכום</h2><div class="rule"></div>
        <ul class="cl" contenteditable="true"><li>העבודה בוצעה בהתאם לתכנית ובלוח הזמנים שתואם.</li><li>הופעלו נהלי בטיחות מלאים: גידור אזור העבודה, תדריך יומי ובדיקות לפני טיסה.</li><li>מומלץ לקבוע ניקוי תקופתי כדי לשמור על מראה המבנה ועל תפקוד המעטפת.</li></ul>
        <div class="end"><div class="l"><b>E-Drone Technologies</b><br>${esc(me?.full_name || '')} · <bdi dir="ltr">${esc(me?.phone || '')}</bdi></div><img src="logo.png" alt="E-Drone"></div></div></div>
    </div>`;
  document.body.classList.add('printing-report');
  addEventListener('hashchange', () => document.body.classList.remove('printing-report'), { once: true });
  $('#print').onclick = () => window.print();
  $('#collage').onclick = () => collage(before, after, p.name);
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
  } catch { toast('לא הצלחתי לטעון את התמונות'); }
}
