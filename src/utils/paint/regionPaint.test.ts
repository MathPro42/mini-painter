import { describe, expect, it } from 'vitest';
import type { PaletteColor } from '../palette/paletteColor';
import {
  isMetallicPaint,
  isWash,
  PAINT_STEPS,
  parseStepPaint,
  sameRegionPaint,
  sameRegionPaints,
  sameStepPaint,
  stepPaintFromPalette,
  withStep,
} from './regionPaint';

const BRICK = { color: '#c8553d', name: 'brick red' };
const INK = { color: '#111111' };

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

  it('keeps a see-through opacity and drops one that is opaque or invisible', () => {
    expect(parseStepPaint({ color: '#5c4033', opacity: 0.6 })).toEqual({
      color: '#5c4033',
      opacity: 0.6,
    });
    for (const opacity of [1, 0, -0.5, 2, Number.NaN]) {
      expect(parseStepPaint({ color: '#111111', opacity })).toEqual(INK);
    }
  });

  it('throws a RangeError for an invalid color', () => {
    expect(() => parseStepPaint({ color: 'brick' })).toThrow(RangeError);
  });
});

describe('isWash', () => {
  it('is true for see-through paints only', () => {
    expect(isWash(BRICK)).toBe(false);
    expect(isWash({ color: '#5c4033', opacity: 0.6 })).toBe(true);
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

  it('carry the opacity of a wash', () => {
    const wash: PaletteColor = { name: 'umber wash', color: '#5c4033', opacity: 0.6 };
    expect(stepPaintFromPalette(wash)).toEqual({
      color: '#5c4033',
      name: 'umber wash',
      opacity: 0.6,
    });
  });
});

describe('sameStepPaint, sameRegionPaint and sameRegionPaints', () => {
  it('compare color, name, the metallic flag and the opacity', () => {
    expect(sameStepPaint(BRICK, { ...BRICK })).toBe(true);
    expect(sameStepPaint(undefined, undefined)).toBe(true);
    expect(sameStepPaint(BRICK, undefined)).toBe(false);
    expect(sameStepPaint(BRICK, { ...BRICK, name: 'clay' })).toBe(false);
    expect(sameStepPaint(INK, { ...INK, metallic: false })).toBe(true);
    expect(sameStepPaint(INK, { ...INK, metallic: true })).toBe(false);
    expect(sameStepPaint(INK, { ...INK, opacity: 0.6 })).toBe(false);
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
