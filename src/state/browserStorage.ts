import type { KeyValueStorage } from './paletteState';

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
