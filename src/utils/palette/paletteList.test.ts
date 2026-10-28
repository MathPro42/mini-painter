import { describe, expect, it } from 'vitest';
import { MAX_PALETTE_COLORS } from './paletteColor';
import type { PaletteColor } from './paletteColor';
import { appendPaletteColors, filterPalette, groupPalette } from './paletteList';

const BRICK: PaletteColor = { name: 'brick red', color: '#c8553d', group: 'base' };
const MEADOW: PaletteColor = { name: 'grüne Wiese', color: '#6a994e' };
const RUST: PaletteColor = { name: 'Rust red', color: '#8b3a1e', group: 'wash' };
const CLAY: PaletteColor = { name: 'clay', color: '#c8553d', group: 'base' };

describe('appendPaletteColors', () => {
  it('appends new colors, skipping ones already present or repeated', () => {
    const shouting = { name: 'BRICK RED', color: '#c8553d' };
    expect(appendPaletteColors([BRICK], [shouting, MEADOW, MEADOW, CLAY])).toEqual([
      BRICK,
      MEADOW,
      CLAY,
    ]);
  });

  it('returns the same list when nothing is new', () => {
    const existing = [BRICK];
    expect(appendPaletteColors(existing, [BRICK])).toBe(existing);
  });

  it('stops at the palette size limit', () => {
    const many = Array.from({ length: MAX_PALETTE_COLORS + 1 }, (_, index) => ({
      name: `color ${String(index)}`,
      color: '#c8553d',
    }));
    expect(appendPaletteColors([], many)).toHaveLength(MAX_PALETTE_COLORS);
  });
});

describe('filterPalette', () => {
  it('keeps every color for a blank query', () => {
    const colors = [BRICK, MEADOW];
    expect(filterPalette(colors, '  ')).toBe(colors);
  });

  it('matches every word anywhere in the name, ignoring case and accents', () => {
    expect(filterPalette([BRICK, MEADOW, RUST], 'RED')).toEqual([BRICK, RUST]);
    expect(filterPalette([BRICK, MEADOW, RUST], 'red ru')).toEqual([RUST]);
    expect(filterPalette([BRICK, MEADOW, RUST], 'grune WIE')).toEqual([MEADOW]);
    expect(filterPalette([BRICK, MEADOW, RUST], 'blue')).toEqual([]);
  });
});

describe('groupPalette', () => {
  it('groups colors in order of first appearance, ungrouped ones under null', () => {
    expect(groupPalette([BRICK, MEADOW, RUST, CLAY])).toEqual([
      { group: 'base', colors: [BRICK, CLAY] },
      { group: null, colors: [MEADOW] },
      { group: 'wash', colors: [RUST] },
    ]);
  });

  it('returns no groups for no colors', () => {
    expect(groupPalette([])).toEqual([]);
  });
});
