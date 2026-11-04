/** What autosave keeps: the drawing's SVG source and its paints' undo history, serialized. */
export interface AutosavedWork {
  /**
   * Which drawing `history` belongs to. Each drawing a tab saves gets a new
   * id, so a save can tell when another tab has replaced the stored drawing.
   */
  readonly drawingId: string;
  readonly drawing: string;
  readonly history: string;
}

/** Where autosave keeps the current work. IndexedDB in the browser; tests pass a fake. */
export interface WorkStorage {
  /** The saved work, or `null` when there is none (or only half of it). */
  load: () => Promise<AutosavedWork | null>;
  /**
   * Saves the history. The drawing is large and rarely changes, so it is
   * written only when storage holds another `drawingId` (another tab may
   * have saved its own drawing meanwhile). Both are written in one
   * transaction, so a drawing is never kept with another drawing's history.
   */
  save: (work: AutosavedWork) => Promise<void>;
  clear: () => Promise<void>;
}

const DATABASE = 'mini-painter';
const STORE = 'work';
const DRAWING_ID_KEY = 'drawingId';
const DRAWING_KEY = 'drawing';
const HISTORY_KEY = 'history';

/**
 * A new drawing id, random so that two tabs never pick the same one. Not
 * `crypto.randomUUID()`: that needs a secure context, which a dev server
 * reached over the local network is not.
 */
export function createDrawingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Work storage in IndexedDB, which holds far more than `localStorage`'s few
 * megabytes: drawings can be tens of megabytes. The database opens on first use.
 */
export function createIndexedDbWorkStorage(factory: IDBFactory): WorkStorage {
  let database: Promise<IDBDatabase> | null = null;
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => (() => T) | undefined,
  ): Promise<T | undefined> => {
    database ??= openDatabase(factory);
    const transaction = (await database).transaction(STORE, mode);
    const result = action(transaction.objectStore(STORE));
    await completion(transaction);
    return result?.();
  };
  return {
    load: async () => {
      const work = await run('readonly', (store) => {
        const drawingId = store.get(DRAWING_ID_KEY);
        const drawing = store.get(DRAWING_KEY);
        const history = store.get(HISTORY_KEY);
        return () => ({
          drawingId: drawingId.result as unknown,
          drawing: drawing.result as unknown,
          history: history.result as unknown,
        });
      });
      const { drawingId, drawing, history } = work ?? {};
      if (typeof drawing !== 'string' || typeof history !== 'string') {
        return null;
      }
      // Work saved before drawings had ids gets a fresh one. It matches
      // nothing stored, so the next save writes the drawing again, with it.
      const id = typeof drawingId === 'string' ? drawingId : createDrawingId();
      return { drawingId: id, drawing, history };
    },
    save: async ({ drawingId, drawing, history }) => {
      await run('readwrite', (store) => {
        const stored = store.get(DRAWING_ID_KEY);
        stored.onsuccess = () => {
          if ((stored.result as unknown) !== drawingId) {
            store.put(drawing, DRAWING_KEY);
            store.put(drawingId, DRAWING_ID_KEY);
          }
          store.put(history, HISTORY_KEY);
        };
        return undefined;
      });
    },
    clear: async () => {
      await run('readwrite', (store) => {
        store.clear();
        return undefined;
      });
    },
  };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error('Could not open the work database', { cause: request.error }));
    };
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    // A failed request aborts its transaction, so abort covers errors too.
    transaction.onabort = () => {
      reject(new Error('Could not access the saved work', { cause: transaction.error }));
    };
  });
}
