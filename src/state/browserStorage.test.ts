import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserStorage } from './browserStorage';

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
