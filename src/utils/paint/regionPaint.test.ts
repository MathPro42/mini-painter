import { describe, expect, it } from 'vitest';
import type { PaletteColor } from '../palette/paletteColor';
import {
  isMetallicPaint,
  PAINT_STEPS,
  parseStepPaint,
  randomBasePaints,
  sameRegionPaint,
  sameRegionPaints,
  sameStepPaint,
  stepPaintFromPalette,
  withStep,
} from './regionPaint';

const BRICK = { color: '#c8553d', name: 'brick red' };
const INK = { color: '#111111' };

/** Returns the given values in turn, like a seeded Math.random. */
const sequence = (...values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};

describe('PAINT_STEPS', () => {
  it('lists the steps in painting order', () => {
    expect(PAINT_STEPS).toEqual(['base', 'layer', 'shade', 'highlight']);
  });
});

describe('withStep', () => {
  it('sets and clears one step without touching the others', () => {
    const painted = withStep(withStep(undefined, 'base', BRICK), 'shade', INK);
    expect(painted).toEqual({ base: BRICK, shade: INK });
    expect(withStep(painted, 'shade', null)).toEqual({ base: BRICK });
    expect(painted).toEqual({ base: BRICK, shade: INK });
  });
});

describe('parseStepPaint', () => {
  it('normalizes the color and drops a blank name or a false metallic flag', () => {
    expect(parseStepPaint({ color: 'C8553D', name: ' brick red ', metallic: true })).toEqual({
      color: '#c8553d',
      name: 'brick red',
      metallic: true,
    });
    expect(parseStepPaint({ color: '#111', name: ' ', metallic: false })).toEqual(INK);
  });

  it('throws a RangeError for an invalid color', () => {
    expect(() => parseStepPaint({ color: 'brick' })).toThrow(RangeError);
  });
});

describe('stepPaintFromPalette and isMetallicPaint', () => {
  it('carry the name, and flag paints grouped as metallic', () => {
    const steel: PaletteColor = { name: 'steel', color: '#8a8a8a', group: 'Metallic' };
    expect(isMetallicPaint(steel)).toBe(true);
    expect(isMetallicPaint({ name: 'ink', color: '#111111', group: 'base' })).toBe(false);
    expect(isMetallicPaint({ name: 'ink', color: '#111111' })).toBe(false);
    expect(stepPaintFromPalette(steel)).toEqual({
      color: '#8a8a8a',
      name: 'steel',
      metallic: true,
    });
    expect(stepPaintFromPalette({ name: 'ink', color: '#111111' })).toEqual({
      color: '#111111',
      name: 'ink',
    });
  });
});

describe('sameStepPaint, sameRegionPaint and sameRegionPaints', () => {
  it('compare color, name and the metallic flag', () => {
    expect(sameStepPaint(BRICK, { ...BRICK })).toBe(true);
    expect(sameStepPaint(undefined, undefined)).toBe(true);
    expect(sameStepPaint(BRICK, undefined)).toBe(false);
    expect(sameStepPaint(BRICK, { ...BRICK, name: 'clay' })).toBe(false);
    expect(sameStepPaint(INK, { ...INK, metallic: false })).toBe(true);
    expect(sameStepPaint(INK, { ...INK, metallic: true })).toBe(false);
  });

  it('compare every step of every region', () => {
    expect(sameRegionPaint({ base: BRICK }, { base: { ...BRICK } })).toBe(true);
    expect(sameRegionPaint({ base: BRICK }, { base: BRICK, shade: INK })).toBe(false);
    expect(sameRegionPaint(undefined, {})).toBe(true);
    const a = new Map([['region-0', { base: BRICK }]]);
    expect(sameRegionPaints(a, new Map([['region-0', { base: { ...BRICK } }]]))).toBe(true);
    expect(sameRegionPaints(a, new Map())).toBe(false);
    expect(sameRegionPaints(new Map([['region-1', {}]]), new Map())).toBe(true);
  });
});

describe('randomBasePaints', () => {
  const palette: PaletteColor[] = [
    { name: 'brick red', color: '#c8553d', group: 'Base' },
    { name: 'umber wash', color: '#5c4033', group: 'Shade' },
    { name: 'steel', color: '#8a8a8a', group: 'Metallic' },
  ];

  it('gives each region a paint picked by the random source, skipping washes', () => {
    const picks = randomBasePaints(['a', 'b', 'c'], palette, sequence(0, 0.6, 0.99));
    expect([...picks]).toEqual([
      ['a', { color: '#c8553d', name: 'brick red' }],
      ['b', { color: '#8a8a8a', name: 'steel', metallic: true }],
      ['c', { color: '#8a8a8a', name: 'steel', metallic: true }],
    ]);
  });

  it('uses washes when the palette has nothing else', () => {
    const washes = palette.filter((color) => color.group === 'Shade');
    expect(randomBasePaints(['a'], washes, sequence(0)).get('a')?.name).toBe('umber wash');
  });

  it('stays in range even if the random source returns 1, and is empty without colors', () => {
    expect(randomBasePaints(['a'], palette, sequence(1)).get('a')?.name).toBe('steel');
    expect(randomBasePaints(['a'], [], sequence(0.5)).size).toBe(0);
  });
});
