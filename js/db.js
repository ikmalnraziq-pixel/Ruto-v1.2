// IndexedDB: cache lokal untuk profil, konfigurasi model, key terenkripsi, percakapan, pesan, dan lampiran.
const NAME = 'ruto-ai';
const STORES = ['meta', 'models', 'keys', 'convs', 'msgs', 'blobs'];
let dbp;

export const open = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(NAME, 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore('meta', { keyPath: 'key' });
    for (const s of ['models', 'keys', 'convs', 'blobs']) d.createObjectStore(s, { keyPath: 'id' });
    d.createObjectStore('msgs', { keyPath: 'id' }).createIndex('conv', 'convId');
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));

async function tx(stores, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    const rq = fn(t);
    if (rq && 'onsuccess' in rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const get = (s, k) => tx(s, 'readonly', (t) => t.objectStore(s).get(k));
export const put = (s, v) => tx(s, 'readwrite', (t) => t.objectStore(s).put(v));
export const del = (s, k) => tx(s, 'readwrite', (t) => t.objectStore(s).delete(k));
export const all = (s) => tx(s, 'readonly', (t) => t.objectStore(s).getAll());
export const byConv = (id) => tx('msgs', 'readonly', (t) => t.objectStore('msgs').index('conv').getAll(id));

function wipeMsgs(t, convId) {
  const idx = t.objectStore('msgs').index('conv');
  idx.openKeyCursor(IDBKeyRange.only(convId)).onsuccess = (e) => {
    const c = e.target.result;
    if (c) { t.objectStore('msgs').delete(c.primaryKey); c.continue(); }
  };
}
export const deleteConv = (id) => tx(['convs', 'msgs'], 'readwrite', (t) => {
  t.objectStore('convs').delete(id); wipeMsgs(t, id);
});
export const replaceConv = (conv, msgs) => tx(['convs', 'msgs'], 'readwrite', (t) => {
  t.objectStore('convs').put(conv); wipeMsgs(t, conv.id);
  // Cursor delete diantrekan lebih dulu; put berikutnya tetap berurutan dalam transaksi yang sama.
  for (const m of msgs) t.objectStore('msgs').put(m);
});
export const clearAll = () => tx(STORES, 'readwrite', (t) => { STORES.forEach((s) => t.objectStore(s).clear()); });
