import { describe, expect, it } from 'vitest';
import type { PaletteColor } from './paletteColor';
import { filterPalette, groupPalette, paletteNamesByColor } from './paletteList';

const BRICK: PaletteColor = { name: 'brick red', color: '#c8553d', group: 'base' };
const MEADOW: PaletteColor = { name: 'grüne Wiese', color: '#6a994e' };
const RUST: PaletteColor = { name: 'Rust red', color: '#8b3a1e', group: 'wash' };
const CLAY: PaletteColor = { name: 'clay', color: '#c8553d', group: 'base' };

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

describe('paletteNamesByColor', () => {
  it('names each color value after its first palette color', () => {
    expect([...paletteNamesByColor([BRICK, MEADOW, CLAY])]).toEqual([
      ['#c8553d', 'brick red'],
      ['#6a994e', 'grüne Wiese'],
    ]);
  });
});
