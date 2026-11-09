import { describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage } from './paletteState';
import { SETTINGS_STORAGE_KEY, createSettingsState } from './settingsState';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('createSettingsState', () => {
  it('updates automatically by default', () => {
    expect(createSettingsState().updateMode.value).toBe('auto');
  });

  it('saves the update mode and restores it on the next visit', () => {
    const storage = memoryStorage();
    createSettingsState(storage).setUpdateMode('manual');
    expect(createSettingsState(storage).updateMode.value).toBe('manual');
  });

  it('rejects an unknown mode and keeps the current one', () => {
    const settings = createSettingsState();
    expect(() => {
      settings.setUpdateMode('never');
    }).toThrow(RangeError);
    expect(settings.updateMode.value).toBe('auto');
  });

  it.each([['not json'], ['[]'], ['{"updateMode":"never"}']])(
    'falls back to auto for saved %s',
    (text) => {
      const storage = memoryStorage({ [SETTINGS_STORAGE_KEY]: text });
      expect(createSettingsState(storage).updateMode.value).toBe('auto');
    },
  );

  it('falls back to auto when storage cannot be read', () => {
    const storage: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(createSettingsState(storage).updateMode.value).toBe('auto');
  });

  it('keeps the choice for this visit when it cannot be saved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    const settings = createSettingsState(storage);
    settings.setUpdateMode('manual');
    expect(settings.updateMode.value).toBe('manual');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
