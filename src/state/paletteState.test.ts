import { effect } from '@preact/signals-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE_NAME } from '../utils/palette/paletteNames';
import { encodeSavedPalettes } from '../utils/palette/savedPalettes';
import { createPaletteState, PALETTE_STORAGE_KEY } from './paletteState';
import type { KeyValueStorage, PaletteState } from './paletteState';

/** An in-memory stand-in for localStorage. */
function memoryStorage(initial?: string): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) {
    data.set(PALETTE_STORAGE_KEY, initial);
  }
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const names = (state: PaletteState): string[] => state.palettes.value.map((p) => p.name);
const activeName = (state: PaletteState): string | undefined => state.activePalette.value?.name;
const colorNames = (state: PaletteState): string[] =>
  state.activePalette.value?.colors.map((color) => color.name) ?? [];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('addPalette', () => {
  it('adds a palette next to the others and makes it the one in use', () => {
    const state = createPaletteState();
    expect(state.activePalette.value).toBeNull();
    const first = state.addPalette('base coats', [{ name: 'brick red', color: '#C8553D' }]);
    const second = state.addPalette('washes', [{ name: 'rust', color: '#8b3a1e' }]);
    expect(names(state)).toEqual(['base coats', 'washes']);
    expect(state.activePaletteId.value).toBe(second.id);
    expect(first.id).not.toBe(second.id);
    expect(first.colors).toEqual([{ name: 'brick red', color: '#c8553d' }]);
  });

  it('keeps names unique and drops duplicate colors', () => {
    const state = createPaletteState();
    state.addPalette('metals', []);
    const again = state.addPalette(' Metals ', [
      { name: 'steel', color: '#8a8a8a' },
      { name: 'STEEL', color: '#8A8A8A' },
    ]);
    expect(again.name).toBe('Metals (2)');
    expect(again.colors).toHaveLength(1);
  });

  it('adds nothing when a color is invalid', () => {
    const state = createPaletteState();
    expect(() => state.addPalette('bad', [{ name: 'teal', color: 'teal' }])).toThrow(RangeError);
    expect(state.palettes.value).toEqual([]);
  });
});

describe('selectPalette and deletePalette', () => {
  const threePalettes = (): PaletteState => {
    const state = createPaletteState();
    state.addPalette('a', []);
    state.addPalette('b', []);
    state.addPalette('c', []);
    return state;
  };
  const idOf = (state: PaletteState, name: string): string =>
    state.palettes.value.find((palette) => palette.name === name)?.id ?? 'missing';

  it('switch the palette in use', () => {
    const state = threePalettes();
    state.selectPalette(idOf(state, 'a'));
    expect(activeName(state)).toBe('a');
    expect(() => {
      state.selectPalette('palette-99');
    }).toThrow('No palette with id "palette-99"');
  });

  it('hand over to the next palette, else the previous one, when the active one goes', () => {
    const state = threePalettes();
    state.selectPalette(idOf(state, 'b'));
    state.deletePalette(idOf(state, 'b'));
    expect(names(state)).toEqual(['a', 'c']);
    expect(activeName(state)).toBe('c');
    state.deletePalette(idOf(state, 'c'));
    expect(activeName(state)).toBe('a');
    state.deletePalette(idOf(state, 'a'));
    expect(state.activePalette.value).toBeNull();
  });

  it('keep the active palette when another one is deleted', () => {
    const state = threePalettes();
    state.deletePalette(idOf(state, 'a'));
    expect(activeName(state)).toBe('c');
    expect(() => {
      state.deletePalette('palette-99');
    }).toThrow(RangeError);
  });

  it('update palettes and the active one together', () => {
    const state = threePalettes();
    const seen: [number, string | undefined][] = [];
    const stop = effect(() => {
      seen.push([state.palettes.value.length, state.activePalette.value?.name]);
    });
    state.deletePalette(idOf(state, 'c'));
    stop();
    expect(seen).toEqual([
      [3, 'c'],
      [2, 'b'],
    ]);
  });
});

describe('addPaletteColors and removePaletteColor', () => {
  it('start a default palette when there is none', () => {
    const state = createPaletteState();
    expect(state.addPaletteColors([{ name: 'ink', color: '#111' }])).toBe(1);
    expect(names(state)).toEqual([DEFAULT_PALETTE_NAME]);
    expect(colorNames(state)).toEqual(['ink']);
  });

  it('change only the palette in use', () => {
    const state = createPaletteState();
    state.addPalette('a', [{ name: 'ink', color: '#111111' }]);
    const b = state.addPalette('b', []);
    expect(
      state.addPaletteColors([
        { name: 'teal', color: '#2a9d8f' },
        { name: 'TEAL', color: '#2A9D8F' },
      ]),
    ).toBe(1);
    expect(state.addPaletteColors([{ name: 'teal', color: '#2a9d8f' }])).toBe(0);
    expect(colorNames(state)).toEqual(['teal']);
    expect(state.palettes.value[0]?.colors.map((color) => color.name)).toEqual(['ink']);

    state.removePaletteColor({ name: 'Teal', color: '#2a9d8f' });
    expect(state.activePalette.value?.colors).toEqual([]);
    expect(state.activePaletteId.value).toBe(b.id);
  });

  it('leave everything untouched when nothing changes', () => {
    const state = createPaletteState();
    state.addPalette('a', [{ name: 'ink', color: '#111111' }]);
    const before = state.palettes.value;
    state.addPaletteColors([{ name: 'ink', color: '#111111' }]);
    state.removePaletteColor({ name: 'ink', color: '#000000' });
    expect(state.palettes.value).toBe(before);
  });

  it('do nothing on removal when there is no palette', () => {
    const state = createPaletteState();
    state.removePaletteColor({ name: 'ink', color: '#111111' });
    expect(state.palettes.value).toEqual([]);
  });

  it('add nothing when any input is invalid', () => {
    const state = createPaletteState();
    expect(() =>
      state.addPaletteColors([
        { name: 'ink', color: '#111111' },
        { name: 'teal', color: 'teal' },
      ]),
    ).toThrow(RangeError);
    expect(state.palettes.value).toEqual([]);
  });
});

describe('saving between visits', () => {
  it('saves every change and restores it in a new state', () => {
    const storage = memoryStorage();
    const first = createPaletteState(storage);
    expect(first.palettesSaved.value).toBe(true);
    first.addPalette('base coats', [{ name: 'brick red', color: '#c8553d', group: 'base' }]);
    first.addPalette('washes', [{ name: 'rust', color: '#8b3a1e' }]);
    first.selectPalette(first.palettes.value[0]?.id ?? '');

    const second = createPaletteState(storage);
    expect(names(second)).toEqual(['base coats', 'washes']);
    expect(activeName(second)).toBe('base coats');
    expect(second.activePalette.value?.colors).toEqual([
      { name: 'brick red', color: '#c8553d', group: 'base' },
    ]);
    second.addPalette('metals', []);
    expect(second.palettes.value.map((palette) => palette.id)).toEqual([
      'palette-1',
      'palette-2',
      'palette-3',
    ]);
  });

  it('restores an empty list from empty storage', () => {
    const state = createPaletteState(memoryStorage());
    expect(state.palettes.value).toEqual([]);
    expect(state.activePalette.value).toBeNull();
  });

  it('ignores saved data in an unknown format, and replaces it on the next change', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = memoryStorage('{"version":0}');
    const state = createPaletteState(storage);
    expect(state.palettes.value).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    state.addPalette('fresh', []);
    expect(storage.data.get(PALETTE_STORAGE_KEY)).toBe(
      encodeSavedPalettes({ palettes: [{ name: 'fresh', colors: [] }], activeIndex: 0 }),
    );
  });

  it('reports when storage cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const state = createPaletteState({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    });
    expect(state.palettesSaved.value).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('reports when a save fails, and recovers when one works again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let full = true;
    const storage = memoryStorage();
    const state = createPaletteState({
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (full) {
          throw new Error('quota exceeded');
        }
        storage.setItem(key, value);
      },
    });
    state.addPalette('a', []);
    expect(state.palettesSaved.value).toBe(false);
    expect(warn).toHaveBeenCalled();
    full = false;
    state.addPalette('b', []);
    expect(state.palettesSaved.value).toBe(true);
  });

  it('is off without storage', () => {
    const state = createPaletteState(null);
    state.addPalette('a', []);
    expect(state.palettesSaved.value).toBe(false);
  });
});
