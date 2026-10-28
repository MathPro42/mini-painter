import { describe, expect, it } from 'vitest';
import { MAX_PALETTE_COLORS } from '../utils/palette/paletteColor';
import { createPaletteState } from './paletteState';

describe('addPaletteColors', () => {
  it('appends normalized colors and reports how many were added', () => {
    const state = createPaletteState();
    expect(state.addPaletteColors([{ name: ' brick red ', color: 'C8553D', group: 'base' }])).toBe(
      1,
    );
    expect(state.addPaletteColors([{ name: 'ink', color: '#111' }])).toBe(1);
    expect(state.palette.value).toEqual([
      { name: 'brick red', color: '#c8553d', group: 'base' },
      { name: 'ink', color: '#111111' },
    ]);
  });

  it('skips colors already in the palette or repeated in the input', () => {
    const state = createPaletteState();
    state.addPaletteColors([{ name: 'Ink', color: '#111111' }]);
    const before = state.palette.value;
    expect(
      state.addPaletteColors([
        { name: 'ink', color: '#111111' },
        { name: 'teal', color: '#2a9d8f' },
        { name: 'TEAL', color: '#2A9D8F' },
      ]),
    ).toBe(1);
    expect(state.palette.value.map((color) => color.name)).toEqual(['Ink', 'teal']);
    expect(before).toHaveLength(1);
  });

  it('keeps the same name with a different color', () => {
    const state = createPaletteState();
    state.addPaletteColors([
      { name: 'grey', color: '#808080' },
      { name: 'grey', color: '#909090' },
    ]);
    expect(state.palette.value).toHaveLength(2);
  });

  it('leaves the palette untouched when nothing is new', () => {
    const state = createPaletteState();
    state.addPaletteColors([{ name: 'ink', color: '#111111' }]);
    const before = state.palette.value;
    expect(state.addPaletteColors([{ name: 'ink', color: '#111111' }])).toBe(0);
    expect(state.palette.value).toBe(before);
  });

  it('stops at the palette size limit', () => {
    const state = createPaletteState();
    const many = Array.from({ length: MAX_PALETTE_COLORS + 5 }, (_, index) => ({
      name: `color ${String(index)}`,
      color: '#c8553d',
    }));
    expect(state.addPaletteColors(many)).toBe(MAX_PALETTE_COLORS);
    expect(state.addPaletteColors([{ name: 'one more', color: '#000' }])).toBe(0);
  });

  it('adds nothing when any input is invalid', () => {
    const state = createPaletteState();
    expect(() =>
      state.addPaletteColors([
        { name: 'ink', color: '#111111' },
        { name: 'teal', color: 'teal' },
      ]),
    ).toThrow(RangeError);
    expect(state.palette.value).toEqual([]);
  });
});

describe('removePaletteColor and clearPalette', () => {
  it('remove one color by name and color, or all of them', () => {
    const state = createPaletteState();
    state.addPaletteColors([
      { name: 'ink', color: '#111111' },
      { name: 'teal', color: '#2a9d8f' },
    ]);
    state.removePaletteColor({ name: 'INK', color: '#111111' });
    expect(state.palette.value.map((color) => color.name)).toEqual(['teal']);

    const before = state.palette.value;
    state.removePaletteColor({ name: 'teal', color: '#000000' });
    expect(state.palette.value).toBe(before);

    state.clearPalette();
    expect(state.palette.value).toEqual([]);
  });
});
