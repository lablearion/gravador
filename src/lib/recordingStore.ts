// IndexedDB para persistir os chunks durante a gravação (REQ-015): nada vive só na RAM.
const DB = "gravador";
const STORE = "chunks";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore(STORE, { autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function appendChunk(b: Blob): Promise<void> {
  const db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).add(b);
    t.oncomplete = () => res(null);
    t.onerror = () => rej(t.error);
  });
  db.close();
}

export async function getChunks(): Promise<Blob[]> {
  const db = await open();
  const out = await new Promise<Blob[]>((res, rej) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result as Blob[]);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return out;
}

export async function clearChunks(): Promise<void> {
  const db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).clear();
    t.oncomplete = () => res(null);
    t.onerror = () => rej(t.error);
  });
  db.close();
}
