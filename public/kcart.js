/**
 * KohliLab Konfigurator-Warenkorb (window.KCart).
 *
 * IndexedDB statt localStorage, weil die Positionen die fertigen Druckdateien
 * (base64, mehrere MB möglich) tragen. Gleiche Origin für Konfigurator-iframes
 * und Astro-Seiten -> alle sehen denselben Korb.
 *
 * Item: { id (auto), typ:'schild'|'organizer', titel, menge, stueckRappen,
 *         konfig:{...}, dateien:{...base64}, erstellt }
 */
(function () {
  const DB = 'kohlilab-kcart', ST = 'items';

  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await open();
    try {
      return await new Promise((res, rej) => {
        const t = db.transaction(ST, mode), s = t.objectStore(ST);
        let out;
        fn(s, v => { out = v; });
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } finally { db.close(); }
  }

  window.KCart = {
    add: item => withStore('readwrite', (s, set) => { const r = s.add({ ...item, erstellt: Date.now() }); r.onsuccess = () => set(r.result); }),
    all: () => withStore('readonly', (s, set) => { const r = s.getAll(); r.onsuccess = () => set(r.result); }),
    remove: id => withStore('readwrite', s => { s.delete(id); }),
    setMenge: (id, m) => withStore('readwrite', (s, set) => { const g = s.get(id); g.onsuccess = () => { const it = g.result; if (it) { it.menge = m; s.put(it); } set(true); }; }),
    clear: () => withStore('readwrite', s => { s.clear(); }),
    count: () => withStore('readonly', (s, set) => { const r = s.count(); r.onsuccess = () => set(r.result); }),
  };
})();
