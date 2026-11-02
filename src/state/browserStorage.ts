import type { KeyValueStorage } from './paletteState';
import { createIndexedDbWorkStorage } from './workStorage';
import type { WorkStorage } from './workStorage';

/**
 * The page's `localStorage`, or `null` where there is none. Merely reading
 * `window.localStorage` throws when the user blocks site data.
 */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Work storage in the page's IndexedDB, or `null` where there is none. Like
 * `localStorage`, reading `window.indexedDB` throws when site data is blocked.
 */
export function getBrowserWorkStorage(): WorkStorage | null {
  try {
    return 'indexedDB' in globalThis ? createIndexedDbWorkStorage(globalThis.indexedDB) : null;
  } catch {
    return null;
  }
}
