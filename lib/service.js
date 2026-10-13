// אוצר מילים לפי שירות: כל טקסט שמורכב לבד (דוח ללקוח, החתמה, עדכון שבועי, דוח יומי, תכנית, אזורים) מדבר בשפת העבודה בפועל.
// מקור: שירות הפרויקט → שירות האתר → סוג השירות באפיון. בלי שירות = שטיפת חזיתות (ברירת המחדל של העסק). מקבילה בשרת: svc_terms (db/141).
const T = {
  facade: { work: 'שטיפת חזיתות', day: 'ניקוי חזיתות', unit: 'חזית', units: 'חזיתות', all: 'כל החזיתות', one: 'חזית אחת', wash: true, sun: true, roof: false,
    care: 'מומלץ לקבוע ניקוי תקופתי כדי לשמור על מראה המבנה ועל תפקוד המעטפת.' },
  windows: { work: 'ניקוי חלונות', day: 'ניקוי חלונות', unit: 'חזית', units: 'חזיתות', all: 'כל החזיתות', one: 'חזית אחת', wash: true, sun: true, roof: false,
    care: 'מומלץ לקבוע ניקוי חלונות תקופתי כדי לשמור על שקיפות ועל מראה המבנה.' },
  solar: { work: 'שטיפת פנלים סולאריים', day: 'שטיפת פנלים סולאריים', unit: 'מערך', units: 'מערכים', all: 'כל המערכים', one: 'מערך אחד', wash: true, sun: false, roof: true,
    care: 'מומלץ לקבוע שטיפה תקופתית — אבק ולכלוך שמצטברים על הפנלים מורידים את תפוקת המערכת.',
    safety: 'הופעלו נהלי בטיחות מלאים: תדריך יומי, בדיקות לפני טיסה ועבודה בטוחה בסמוך לפנלים.' },
  shade: { work: 'ניקוי יריעות הצללה', day: 'ניקוי יריעות הצללה', unit: 'יריעה', units: 'יריעות', all: 'כל היריעות', one: 'יריעה אחת', wash: true, sun: false, roof: false,
    care: 'מומלץ לקבוע ניקוי תקופתי כדי לשמור על מראה היריעות ועל אורך חייהן.' },
  scan: { work: 'סריקה ומידול', day: 'סריקה / מידול', unit: 'אזור', units: 'אזורים', all: 'כל האזורים', one: 'אזור אחד', wash: false, sun: false, roof: false,
    care: 'התוצרים נמסרים בפורמט שסוכם, ואפשר לעדכן אותם בסריקה חוזרת.',
    safety: 'הופעלו נהלי בטיחות מלאים: תיאום מרחב אווירי, תדריך יומי ובדיקות לפני טיסה.' },
  other: { work: 'העבודה', day: 'אחר', unit: 'אזור', units: 'אזורים', all: 'כל האזורים', one: 'אזור אחד', wash: false, sun: false, roof: false,
    care: 'נשמח ללוות אתכם גם בהמשך.' },
};
const SAFE = 'הופעלו נהלי בטיחות מלאים: גידור אזור העבודה, תדריך יומי ובדיקות לפני טיסה.';

export function svcKey(s) {
  const x = String(s || '').trim();
  if (!x) return 'facade';
  if (/סולאר|פאנל|פנל/.test(x)) return 'solar';
  if (/הצלל|יריע/.test(x)) return 'shade';
  if (/מידול|מיפוי|סריק|צילום|מדיד|as.?built/i.test(x)) return 'scan';
  if (/חלונ/.test(x) && !/חזית/.test(x)) return 'windows';
  if (/חזית|מעטפת/.test(x)) return 'facade';
  return 'other';
}
// השירות של פרויקט: p.service → p.sites.service → אפיון (service_type)
export const serviceOf = (p, spec) => p?.service || p?.sites?.service || p?.site?.service || spec?.service_type || spec || null;

// הקשר האתר מטקסטים חופשיים (שם, הערות אתר/אפיון, דוח ביקור): "לול" → על גגות הלולים
export function siteCtx(key, ...texts) {
  const t = texts.flat().filter(Boolean).join(' ');
  if (!t || !['solar', 'shade'].includes(key)) return '';
  if (/לול/.test(t)) return key === 'solar' ? 'על גגות הלולים' : 'בלולים';
  if (key === 'solar' && /גג/.test(t)) return 'על הגג';
  if (/רפת/.test(t)) return 'ברפת';
  if (/חניון|חניה/.test(t)) return 'בחניון';
  return '';
}

// המונחים לשירות. ctx = הקשר אתר (לא חובה) → workFull
export function terms(service, ctx = '') {
  const key = svcKey(service), b = T[key];
  return { key, ...b, label: service || b.work, safety: b.safety || SAFE, ctx, workFull: ctx && key !== 'other' ? `${b.work} ${ctx}` : b.work,
    n: k => k === 1 ? b.one : `${k} ${b.units}`,
    // "חזית צפון" / "כל החזיתות" (מהאפיון) → מונח השירות
    zone: z => key === 'facade' || key === 'windows' ? String(z || '') : String(z || '').replace(/^כל החזיתות$/, b.all).replace(/^חזית\s+/, b.unit + ' ').replace(/^חזית$/, b.unit) };
}

// סוגי עבודה שנבחרו ביום → בשפת השירות. ברירת המחדל הישנה ("ניקוי חזיתות") בפרויקט פנלים = טעות שמילאה האפליקציה, לא בחירה
export function fixWorks(list, t) {
  const L = [...new Set((list || []).filter(Boolean))];
  if (!t || t.key === 'facade' || t.key === 'windows') return L;
  const keep = L.filter(w => { const k = svcKey(w); return w !== 'אחר' && (k === t.key || k === 'other'); });
  return [...new Set([t.day, ...keep])];
}
// רשימת הצ׳יפים "סוג העבודה": עבודת השירות ראשונה
export const workChoices = (list, t) => [...new Set([...(t && t.key !== 'facade' ? [t.day] : []), ...(list || [])])];

// שם האתר בלי השירות שנדבק אליו ("קיבוץ גלאון — פנלים סולאריים" → "קיבוץ גלאון")
export function cleanPlace(name) {
  const m = String(name || '').match(/^(.*?)\s*[—–-]\s*([^—–-]+)$/);
  return m && m[1].trim() && svcKey(m[2]) !== 'other' && /סולאר|פנל|פאנל|חזית|חלונ|הצלל|יריע|מידול|מיפוי|סריק/.test(m[2]) ? m[1].trim() : String(name || '');
}
export const isPilot = (p, texts = []) => p?.engagement === 'פיילוט' || texts.some(x => /פיילוט/.test(x || ''));
