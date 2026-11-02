import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getBrowserStorage, getBrowserWorkStorage } from './browserStorage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getBrowserStorage', () => {
  it('returns localStorage when the page has it', () => {
    const storage = { getItem: () => null, setItem: () => undefined };
    vi.stubGlobal('localStorage', storage);
    expect(getBrowserStorage()).toBe(storage);
  });

  it('returns null when there is none, or reading it throws', () => {
    vi.stubGlobal('localStorage', undefined);
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(getBrowserStorage()).toBeNull();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    expect(getBrowserStorage()).toBeNull();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });
});

describe('getBrowserWorkStorage', () => {
  it('uses IndexedDB when the page has it', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const storage = getBrowserWorkStorage();
    await storage?.save({ drawing: '<svg/>', history: 'one' });
    expect(await storage?.load()).toEqual({ drawing: '<svg/>', history: 'one' });
  });

  it('returns null when there is none, or reading it throws', () => {
    expect(getBrowserWorkStorage()).toBeNull();

    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    expect(getBrowserWorkStorage()).toBeNull();
    Reflect.deleteProperty(globalThis, 'indexedDB');
  });
});
