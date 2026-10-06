// אחסון מקומי בטלפון (IndexedDB): מטמון לקריאה בלי קליטה + תור שליחה (outbox).
// כל פעולה נשמרת קודם כאן, ורק אז נשלחת. כך שום קלט לא הולך לאיבוד.
const DB_NAME = 'edrone-field', VER = 1;
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const cache = {
  get: (k) => tx('cache', 'readonly', s => s.get(k)),
  set: (k, v) => tx('cache', 'readwrite', s => s.put(v, k)),
};
// הסדר חשוב (סטטוס אחרי סטטוס, תמונה אחרי התקלה שלה) — לכן ממיינים לפי זמן היצירה ומונה רץ
let seq = 0;
export const outbox = {
  add: (item) => tx('outbox', 'readwrite', s => s.put({ ...item, id: item.id || crypto.randomUUID(), at: Date.now(), n: ++seq, tries: 0 })),
  all: async () => (await tx('outbox', 'readonly', s => s.getAll())).sort((a, b) => a.at - b.at || (a.n || 0) - (b.n || 0)),
  del: (id) => tx('outbox', 'readwrite', s => s.delete(id)),
  put: (item) => tx('outbox', 'readwrite', s => s.put(item)),
};

// הקטנת תמונה לפני שמירה ושליחה (2000px, JPEG 0.82) — מהיר בשטח וחוסך נפח
export function shrink(file, max = 2000, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('image')), 'image/jpeg', q);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.src = url;
  });
}
