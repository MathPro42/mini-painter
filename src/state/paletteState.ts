import { batch, computed, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { paletteColorKey, parsePaletteColor } from '../utils/palette/paletteColor';
import type { PaletteColor, PaletteColorInput } from '../utils/palette/paletteColor';
import { appendPaletteColors } from '../utils/palette/paletteList';
import {
  DEFAULT_PALETTE_NAME,
  normalizePaletteName,
  uniquePaletteName,
} from '../utils/palette/paletteNames';
import { encodeSavedPalettes, normalizeSavedPalettes } from '../utils/palette/savedPalettes';
import type { SavedPalette, SavedPalettes } from '../utils/palette/savedPalettes';

/** Where palettes are kept between visits. `localStorage` fits; tests pass a fake. */
export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const PALETTE_STORAGE_KEY = 'mini-painter:palettes';

/** A named list of colors. Ids are only stable for one visit. */
export interface Palette extends SavedPalette {
  readonly id: string;
}

/** The user's palettes, one of which is in use. */
export interface PaletteState {
  /** Palettes in the order they were added. */
  readonly palettes: ReadonlySignal<readonly Palette[]>;
  readonly activePaletteId: ReadonlySignal<string | null>;
  /** The palette in use, or `null` when there are none. */
  readonly activePalette: ReadonlySignal<Palette | null>;
  /** `false` when palettes can't be kept between visits (no storage, or the last save failed). */
  readonly palettesSaved: ReadonlySignal<boolean>;
  /**
   * Adds a palette and makes it the one in use. A taken name gets a " (2)"
   * suffix; duplicate colors are dropped. Throws a RangeError, adding
   * nothing, if any color is invalid.
   */
  addPalette: (name: string, colors: readonly PaletteColorInput[]) => Palette;
  /** Switches to another palette. Throws a RangeError for unknown ids. */
  selectPalette: (id: string) => void;
  /**
   * Deletes a palette. If it was in use, the next one along (else the
   * previous one) takes over. Throws a RangeError for unknown ids.
   */
  deletePalette: (id: string) => void;
  /**
   * Adds colors to the palette in use, or to a new DEFAULT_PALETTE_NAME
   * palette when there is none. Colors already in it are skipped. Returns
   * how many were added. Throws a RangeError, adding nothing, if any is invalid.
   */
  addPaletteColors: (colors: readonly PaletteColorInput[]) => number;
  /** Removes a color (matched by name and color) from the palette in use. */
  removePaletteColor: (color: PaletteColor) => void;
}

/** The signals behind PaletteState, and the one way to change them. */
interface PaletteStore {
  readonly palettes: Signal<readonly Palette[]>;
  readonly activeId: Signal<string | null>;
  readonly active: ReadonlySignal<Palette | null>;
  readonly saved: Signal<boolean>;
  /** Gives a palette a fresh id. */
  readonly identify: (palette: SavedPalette) => Palette;
  /** Replaces the palettes and the active id together, then saves. */
  readonly commit: (palettes: readonly Palette[], activeId: string | null) => void;
}

/**
 * Creates the palette part of the app state, restoring palettes saved in
 * `storage` and saving every change back to it.
 */
export function createPaletteState(storage: KeyValueStorage | null = null): PaletteState {
  const store = createStore(storage);
  const requireIndex = (id: string): number => {
    const index = store.palettes.peek().findIndex((palette) => palette.id === id);
    if (index === -1) {
      throw new RangeError(`No palette with id "${id}"`);
    }
    return index;
  };
  return {
    palettes: store.palettes,
    activePaletteId: store.activeId,
    activePalette: store.active,
    palettesSaved: store.saved,
    addPalette: (name, colors) => addPalette(store, name, colors),
    selectPalette: (id) => {
      requireIndex(id);
      store.commit(store.palettes.peek(), id);
    },
    deletePalette: (id) => {
      const index = requireIndex(id);
      const next = store.palettes.peek().filter((palette) => palette.id !== id);
      const activeId = store.activeId.peek();
      const fallback = next[Math.min(index, next.length - 1)]?.id ?? null;
      store.commit(next, activeId === id ? fallback : activeId);
    },
    addPaletteColors: (inputs) => {
      const parsed = inputs.map(parsePaletteColor);
      const active = store.active.peek();
      if (active === null) {
        return addPalette(store, DEFAULT_PALETTE_NAME, parsed).colors.length;
      }
      const colors = appendPaletteColors(active.colors, parsed);
      setActiveColors(store, colors);
      return colors.length - active.colors.length;
    },
    removePaletteColor: (color) => {
      const key = paletteColorKey(color);
      const colors = store.active.peek()?.colors ?? [];
      setActiveColors(
        store,
        colors.filter((entry) => paletteColorKey(entry) !== key),
      );
    },
  };
}

function createStore(storage: KeyValueStorage | null): PaletteStore {
  let lastId = 0;
  const identify = (palette: SavedPalette): Palette => {
    lastId += 1;
    return { name: palette.name, colors: palette.colors, id: `palette-${String(lastId)}` };
  };
  const restored = restorePalettes(storage);
  const initial = restored.palettes.map(identify);
  const palettes = signal<readonly Palette[]>(initial);
  const activeId = signal(initial[restored.activeIndex]?.id ?? null);
  const saved = signal(restored.canSave);
  return {
    palettes,
    activeId,
    active: computed(() => palettes.value.find((palette) => palette.id === activeId.value) ?? null),
    saved,
    identify,
    commit: (next, nextActiveId) => {
      batch(() => {
        palettes.value = next;
        activeId.value = nextActiveId;
      });
      if (storage !== null) {
        saved.value = savePalettes(storage, next, nextActiveId);
      }
    },
  };
}

function addPalette(
  store: PaletteStore,
  name: string,
  inputs: readonly PaletteColorInput[],
): Palette {
  const colors = appendPaletteColors([], inputs.map(parsePaletteColor));
  const taken = store.palettes.peek().map((palette) => palette.name);
  const palette = store.identify({
    name: uniquePaletteName(normalizePaletteName(name), taken),
    colors,
  });
  store.commit([...store.palettes.peek(), palette], palette.id);
  return palette;
}

/** Gives the palette in use a new color list. Unchanged lengths mean nothing changed. */
function setActiveColors(store: PaletteStore, colors: readonly PaletteColor[]): void {
  const active = store.active.peek();
  if (active === null || colors.length === active.colors.length) {
    return;
  }
  const next = store.palettes
    .peek()
    .map((palette) => (palette === active ? { ...active, colors } : palette));
  store.commit(next, active.id);
}

interface RestoredPalettes extends SavedPalettes {
  readonly canSave: boolean;
}

function restorePalettes(storage: KeyValueStorage | null): RestoredPalettes {
  const none: SavedPalettes = { palettes: [], activeIndex: -1 };
  if (storage === null) {
    return { ...none, canSave: false };
  }
  try {
    const text = storage.getItem(PALETTE_STORAGE_KEY);
    const saved = text === null ? none : normalizeSavedPalettes(text);
    if (saved === null) {
      console.warn('Ignoring saved palettes in an unknown format');
    }
    return { ...(saved ?? none), canSave: true };
  } catch (error) {
    // Browsers throw here when site data is blocked.
    console.warn('Could not read saved palettes', error);
    return { ...none, canSave: false };
  }
}

/** Saves palettes and reports whether that worked (storage can be full or blocked). */
function savePalettes(
  storage: KeyValueStorage,
  palettes: readonly Palette[],
  activeId: string | null,
): boolean {
  const activeIndex = palettes.findIndex((palette) => palette.id === activeId);
  try {
    storage.setItem(PALETTE_STORAGE_KEY, encodeSavedPalettes({ palettes, activeIndex }));
    return true;
  } catch (error) {
    console.warn('Could not save palettes', error);
    return false;
  }
}
