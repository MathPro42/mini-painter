/** What autosave keeps: the drawing's SVG source and its paints' undo history, serialized. */
export interface AutosavedWork {
  readonly drawing: string;
  readonly history: string;
}

/** Where autosave keeps the current work. IndexedDB in the browser; tests pass a fake. */
export interface WorkStorage {
  /** The saved work, or `null` when there is none (or only half of it). */
  load: () => Promise<AutosavedWork | null>;
  /**
   * Saves the history, and the drawing too when given (it is large and
   * rarely changes). Both are written in one transaction, so they always match.
   */
  save: (work: { readonly drawing?: string; readonly history: string }) => Promise<void>;
  clear: () => Promise<void>;
}

const DATABASE = 'mini-painter';
const STORE = 'work';
const DRAWING_KEY = 'drawing';
const HISTORY_KEY = 'history';

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
        const drawing = store.get(DRAWING_KEY);
        const history = store.get(HISTORY_KEY);
        return () => ({ drawing: drawing.result as unknown, history: history.result as unknown });
      });
      const { drawing, history } = work ?? {};
      return typeof drawing === 'string' && typeof history === 'string'
        ? { drawing, history }
        : null;
    },
    save: async ({ drawing, history }) => {
      await run('readwrite', (store) => {
        if (drawing !== undefined) {
          store.put(drawing, DRAWING_KEY);
        }
        store.put(history, HISTORY_KEY);
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
