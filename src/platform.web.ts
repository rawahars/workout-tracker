interface Snapshot {
  payload: string;
  revision: number;
}

let database: Promise<IDBDatabase> | undefined;
let snapshotsReady: Promise<IDBDatabase> | undefined;
let revision: number | null | undefined;

function storageError(action: string, error?: unknown): Error {
  const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
  return new Error(quota
    ? 'Browser storage is full. Your changes were not saved. Export a backup and free some space, then retry.'
    : `${action} Browser storage may be unavailable. Export a backup if possible, then retry.`);
}

function db(): Promise<IDBDatabase> {
  if (database) return database;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('form-images', 2); }
    catch (error) { reject(storageError('Could not open your saved data.', error)); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('images')) request.result.createObjectStore('images');
      if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
    };
    request.onerror = () => reject(storageError('Could not open your saved data.', request.error));
    request.onblocked = () => {
      failed = true;
      reject(new Error('Storage upgrade is blocked by another FORM window. Close the other windows, then reload this one. Your saved data has not been erased.'));
    };
    request.onsuccess = () => {
      const opened = request.result;
      if (failed) { opened.close(); return; }
      const clearConnection = () => {
        if (database === opening) { database = undefined; snapshotsReady = undefined; }
      };
      opened.onversionchange = () => { opened.close(); clearConnection(); };
      opened.onclose = clearConnection;
      resolve(opened);
    };
  });
  database = opening;
  void opening.catch(() => { if (database === opening) database = undefined; });
  return opening;
}

function transaction<T>(
  opened: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: string,
  run: (store: IDBObjectStore, result: (value: T) => void, abort: (error: unknown) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = opened.transaction(storeName, mode, { durability: 'strict' }); }
    catch (error) { reject(storageError(action, error)); return; }
    let result: T;
    let failure: Error | undefined;
    const abort = (error: unknown) => {
      failure = error instanceof DOMException ? storageError(action, error)
        : error instanceof Error ? error : storageError(action, error);
      try { tx.abort(); }
      catch { reject(failure); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? storageError(action, tx.error));
    try { run(tx.objectStore(storeName), value => { result = value; }, abort); }
    catch (error) { abort(storageError(action, error)); }
  });
}

function onResult<T>(request: IDBRequest<T>, callback: (value: T) => void, abort: (error: unknown) => void) {
  request.onsuccess = () => {
    try { callback(request.result); }
    catch (error) { abort(error); }
  };
}

function snapshot(value: unknown): Snapshot | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null ||
      !('payload' in value) || typeof value.payload !== 'string' ||
      !('revision' in value) || typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('Your saved snapshot could not be read. It has not been overwritten. Recover a previous save or import a backup.');
  }
  return value as Snapshot;
}

function snapshotDb(): Promise<IDBDatabase> {
  if (snapshotsReady) return snapshotsReady;
  const ready = db().then(async opened => {
    await transaction<void>(opened, 'snapshots', 'readwrite', 'Could not migrate your saved data.', (store, done, abort) => {
      onResult(store.get('legacy-migrated'), migrated => {
        if (migrated === true) { done(); return; }
        onResult(store.get('current'), current => {
          onResult(store.get('previous'), previous => {
            // Keep the legacy keys intact, including invalid or empty payloads.
            if (current === undefined && previous === undefined) {
              const legacyCurrent = localStorage.getItem('form-state');
              const legacyPrevious = localStorage.getItem('form-previous');
              if (legacyCurrent !== null) store.put({ payload: legacyCurrent, revision: 1 } satisfies Snapshot, 'current');
              if (legacyPrevious !== null) store.put({ payload: legacyPrevious, revision: 0 } satisfies Snapshot, 'previous');
            }
            store.put(true, 'legacy-migrated');
            done();
          }, abort);
        }, abort);
      }, abort);
    });
    return opened;
  });
  snapshotsReady = ready;
  void ready.catch(() => { if (snapshotsReady === ready) snapshotsReady = undefined; });
  return ready;
}

export async function readSnapshot(previous = false): Promise<string | null> {
  const opened = await snapshotDb();
  const saved = await transaction<Snapshot | null>(opened, 'snapshots', 'readonly', 'Could not read your saved data.', (store, done, abort) => {
    onResult(store.get(previous ? 'previous' : 'current'), value => done(snapshot(value)), abort);
  });
  if (!previous) revision = saved?.revision ?? null;
  return saved?.payload ?? null;
}

export async function writeSnapshot(payload: string): Promise<void> {
  // An explicit recovery can be attempted even if the initial open failed.
  if (revision === undefined) await readSnapshot();
  const expected = revision;
  const opened = await snapshotDb();
  const nextRevision = await transaction<number>(opened, 'snapshots', 'readwrite', 'Could not save your data.', (store, done, abort) => {
    onResult(store.get('current'), value => {
      const current = snapshot(value);
      if ((current?.revision ?? null) !== expected) {
        abort(new Error('Your saved data changed in another window. Export any unsaved changes, then reload this window before saving again.'));
        return;
      }
      const next = (current?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(next)) throw new Error('The save revision limit was reached. Export a backup before continuing.');
      if (current !== null) store.put(current, 'previous');
      store.put({ payload, revision: next } satisfies Snapshot, 'current');
      done(next);
    }, abort);
  });
  revision = nextRevision;
}

export async function saveImage(id: string, data: string): Promise<void> {
  const opened = await db();
  await transaction<void>(opened, 'images', 'readwrite', 'Could not save this image.', (store, done) => {
    store.put(data, id);
    done();
  });
}
export async function imageData(id: string): Promise<string | undefined> {
  const opened = await db();
  return transaction<string | undefined>(opened, 'images', 'readonly', 'Could not load this image.', (store, done, abort) => {
    onResult(store.get(id), done, abort);
  });
}
export const getSecret = async (key: string) => sessionStorage.getItem(`form-${key}`);
export const setSecret = async (key: string, value: string) => { if (value) sessionStorage.setItem(`form-${key}`, value); else sessionStorage.removeItem(`form-${key}`); };
export async function chooseTextFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,.csv';
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > 60 * 1024 * 1024) { reject(new Error('Choose a file smaller than 60 MB.')); return; }
      try { resolve(await file.text()); }
      catch { reject(new Error('Could not read this file. Choose a readable backup and try again.')); }
    };
    input.click();
  });
}
export async function exportText(text: string, filename: string): Promise<void> {
  const file = new File([text], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: 'Save your FORM backup' }); }
    catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
