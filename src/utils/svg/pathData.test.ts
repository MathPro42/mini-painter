import { describe, expect, it } from 'vitest';
import { ringsBounds } from './geometry';
import type { Ring } from './geometry';
import { flattenPathData } from './pathData';

const square: Ring = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('flattenPathData', () => {
  it.each([
    'M0 0 L10 0 L10 10 L0 10 Z',
    'M0,0L10,0L10,10L0,10z',
    'M0 0 H10 V10 H0 Z',
    'm0 0 h10 v10 h-10 z',
    'M0 0 10 0 10 10 0 10z',
    'm0 0 10 0 0 10-10 0z',
  ])('reads %j as a square', (d) => {
    expect(flattenPathData(d)).toEqual([square]);
  });

  it('starts a new ring at each moveto', () => {
    const rings = flattenPathData('M0 0h10v10h-10z M20 0h10v10h-10z');
    expect(rings).toHaveLength(2);
    expect(rings[1]?.[0]).toEqual({ x: 20, y: 0 });
  });

  it('makes a relative moveto after closepath start from the closed ring', () => {
    const rings = flattenPathData('M5 5h10v10h-10z m20 0h10v10h-10z');
    expect(rings[1]?.[0]).toEqual({ x: 25, y: 5 });
  });

  it('continues from the subpath start when drawing after closepath without a moveto', () => {
    const rings = flattenPathData('M0 0h10v10z l-5 5 l-5 -5');
    expect(rings).toHaveLength(2);
    expect(rings[1]).toEqual([
      { x: 0, y: 0 },
      { x: -5, y: 5 },
      { x: -10, y: 0 },
    ]);
  });

  it('flattens cubic curves, including the S shorthand that reflects the last control', () => {
    const [ring] = flattenPathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0 z');
    expect(ring?.at(-1)).toEqual({ x: 20, y: 0 });
    const bounds = ringsBounds(ring ? [ring] : []);
    expect(bounds?.maxY).toBeCloseTo(7.5);
    expect(bounds?.minY).toBeCloseTo(-7.5);
  });

  it('flattens quadratic curves, including the T shorthand', () => {
    const [ring] = flattenPathData('M0 0 Q5 10 10 0 T20 0 z');
    const bounds = ringsBounds(ring ? [ring] : []);
    // Peaks at ±5; vertices may straddle the peak by up to the 0.2 tolerance.
    expect(bounds?.maxY).toBeGreaterThanOrEqual(4.8);
    expect(bounds?.minY).toBeLessThanOrEqual(-4.8);
    expect(ring?.at(-1)).toEqual({ x: 20, y: 0 });
  });

  it('reflects nothing when S or T follow a different command', () => {
    const [ring] = flattenPathData('M0 0 L10 0 S20 10 20 0 L0 -10z');
    expect(ring?.some((point) => point.y > 0)).toBe(true);
    // With no previous control, T's control is the current point: a straight segment.
    const [line] = flattenPathData('M0 0 L10 0 T20 0 L0 -10z');
    expect(line?.filter((point) => point.x > 10).every((point) => point.y === 0)).toBe(true);
  });

  it('reads arcs with compact flags', () => {
    const [ring] = flattenPathData('M0 0a5 5 0 1010 0a5 5 0 1 0-10 0z');
    const bounds = ringsBounds(ring ? [ring] : []);
    expect(bounds?.minX).toBeCloseTo(0);
    expect(bounds?.maxX).toBeCloseTo(10);
    expect(bounds?.minY).toBeCloseTo(-5);
    expect(bounds?.maxY).toBeCloseTo(5);
  });

  it('keeps everything before the first error', () => {
    expect(flattenPathData('M0 0 L10 0 L10 10 L0 10 L5')).toEqual([square]);
    expect(flattenPathData('M0 0 L10 0 L10 10 L0 10 Z 5 5')).toEqual([square]);
    expect(flattenPathData('M0 0 L10 0 L10 10 L0 10 ?')).toEqual([square]);
  });

  it('draws nothing unless the data starts with a moveto', () => {
    expect(flattenPathData('L10 0 L10 10 L0 10')).toEqual([]);
    expect(flattenPathData('')).toEqual([]);
  });

  it('drops rings that enclose no area', () => {
    expect(flattenPathData('M0 0 L10 10 M0 0 L10 0 L10 10z')).toHaveLength(1);
  });

  it('uses the tolerance to choose curve detail', () => {
    const coarse = flattenPathData('M0 0 C0 100 100 100 100 0z', 5)[0]?.length ?? 0;
    const fine = flattenPathData('M0 0 C0 100 100 100 100 0z', 0.05)[0]?.length ?? 0;
    expect(fine).toBeGreaterThan(coarse);
  });
});
