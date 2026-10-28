import { describe, expect, it } from 'vitest';
import type { PaletteColor } from '../palette/paletteColor';
import { createRecipeBook, randomRegionPaints } from './recipePaint';

/** Returns the given values in turn, like a seeded Math.random. */
const sequence = (...values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};

const BRICK: PaletteColor = {
  name: 'brick red',
  color: '#c8553d',
  group: 'Base',
  recipe: { layer: 'coral #e07a5f', shade: 'umber wash #5c4033', highlight: 'gone #ffffff' },
};
const CORAL: PaletteColor = { name: 'coral', color: '#e07a5f', group: 'Layer' };
const WASH: PaletteColor = { name: 'umber wash', color: '#5c4033', group: 'Shade', opacity: 0.6 };
const STEEL: PaletteColor = { name: 'steel', color: '#8a8a8a', group: 'Metallic' };
const PALETTE = [BRICK, CORAL, WASH, STEEL];

describe('createRecipeBook', () => {
  it('gives the color as Base plus the tones its recipe names, skipping missing ones', () => {
    expect(createRecipeBook(PALETTE)(BRICK)).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
      layer: { color: '#e07a5f', name: 'coral' },
      shade: { color: '#5c4033', name: 'umber wash', opacity: 0.6 },
    });
  });

  it('gives the Base alone for a color without a recipe', () => {
    expect(createRecipeBook(PALETTE)(STEEL)).toEqual({
      base: { color: '#8a8a8a', name: 'steel', metallic: true },
    });
  });
});

describe('randomRegionPaints', () => {
  it('gives each region a Base picked by the random source, skipping washes', () => {
    const picks = randomRegionPaints(['a', 'b', 'c'], PALETTE, sequence(0, 0.6, 0.99), false);
    expect([...picks]).toEqual([
      ['a', { base: { color: '#c8553d', name: 'brick red' } }],
      ['b', { base: { color: '#e07a5f', name: 'coral' } }],
      ['c', { base: { color: '#8a8a8a', name: 'steel', metallic: true } }],
    ]);
  });

  it('adds the recipe tones of each Base when asked', () => {
    const picks = randomRegionPaints(['a'], PALETTE, sequence(0), true);
    expect(picks.get('a')).toEqual(createRecipeBook(PALETTE)(BRICK));
  });

  it('skips see-through paints even without a wash group', () => {
    const ungrouped = { name: 'glaze', color: '#5c4033', opacity: 0.5 };
    const picks = randomRegionPaints(['a'], [ungrouped, CORAL], sequence(0), false);
    expect(picks.get('a')?.base?.name).toBe('coral');
  });

  it('uses washes when the palette has nothing else', () => {
    expect(randomRegionPaints(['a'], [WASH], sequence(0), true).get('a')?.base?.name).toBe(
      'umber wash',
    );
  });

  it('stays in range even if the random source returns 1, and is empty without colors', () => {
    expect(randomRegionPaints(['a'], PALETTE, sequence(1), false).get('a')?.base?.name).toBe(
      'steel',
    );
    expect(randomRegionPaints(['a'], [], sequence(0.5), false).size).toBe(0);
  });
});
