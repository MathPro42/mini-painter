import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { isRecord } from '../utils/isRecord';
import { DEFAULT_UPDATE_MODE, normalizeUpdateMode, parseUpdateMode } from '../utils/app/updateMode';
import type { UpdateMode } from '../utils/app/updateMode';
import type { KeyValueStorage } from './paletteState';

export const SETTINGS_STORAGE_KEY = 'mini-painter:settings';

/** App preferences, kept between visits next to the palettes. */
export interface SettingsState {
  readonly updateMode: ReadonlySignal<UpdateMode>;
  /** Saves the choice. Throws a RangeError when `mode` is not an UpdateMode. */
  setUpdateMode: (mode: string) => void;
}

export function createSettingsState(storage: KeyValueStorage | null = null): SettingsState {
  const updateMode = signal(restoreUpdateMode(storage));
  return {
    updateMode,
    setUpdateMode: (mode) => {
      updateMode.value = parseUpdateMode(mode);
      saveSettings(storage, updateMode.value);
    },
  };
}

function restoreUpdateMode(storage: KeyValueStorage | null): UpdateMode {
  try {
    const text = storage?.getItem(SETTINGS_STORAGE_KEY) ?? null;
    const data: unknown = text === null ? null : JSON.parse(text);
    return (isRecord(data) ? normalizeUpdateMode(data['updateMode']) : null) ?? DEFAULT_UPDATE_MODE;
  } catch {
    return DEFAULT_UPDATE_MODE;
  }
}

function saveSettings(storage: KeyValueStorage | null, updateMode: UpdateMode): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, updateMode }));
  } catch (error) {
    // The choice still holds for this visit; only the next one forgets it.
    console.warn('Could not save settings', error);
  }
}
