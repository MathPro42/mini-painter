import { describe, expect, it } from 'vitest';
import type { Ring } from './geometry';
import { boundsContain, ringsBounds, ringsContain, unionBounds } from './geometry';

const square = (min: number, max: number, clockwise = true): Ring => {
  const corners = [
    { x: min, y: min },
    { x: max, y: min },
    { x: max, y: max },
    { x: min, y: max },
  ];
  return clockwise ? corners : corners.reverse();
};

describe('ringsBounds', () => {
  it('spans every point of every ring', () => {
    expect(ringsBounds([square(0, 10), square(5, 20)])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 20,
    });
  });

  it('returns null without points', () => {
    expect(ringsBounds([])).toBeNull();
    expect(ringsBounds([[]])).toBeNull();
  });
});

describe('unionBounds and boundsContain', () => {
  it('combines boxes and tests points, edges included', () => {
    const union = unionBounds(
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { minX: 2, minY: -1, maxX: 3, maxY: 0 },
    );
    expect(union).toEqual({ minX: 0, minY: -1, maxX: 3, maxY: 1 });
    expect(boundsContain(union, { x: 3, y: -1 })).toBe(true);
    expect(boundsContain(union, { x: 3.1, y: 0 })).toBe(false);
  });
});

describe('ringsContain', () => {
  it('finds points inside a simple polygon in either winding direction', () => {
    expect(ringsContain([square(0, 10)], 'nonzero', { x: 5, y: 5 })).toBe(true);
    expect(ringsContain([square(0, 10, false)], 'nonzero', { x: 5, y: 5 })).toBe(true);
    expect(ringsContain([square(0, 10)], 'nonzero', { x: 15, y: 5 })).toBe(false);
    expect(ringsContain([square(0, 10)], 'evenodd', { x: -1, y: 5 })).toBe(false);
  });

  it('applies the fill rule to nested rings', () => {
    const sameDirection = [square(0, 10), square(3, 7)];
    const opposite = [square(0, 10), square(3, 7, false)];
    const center = { x: 5, y: 5 };
    expect(ringsContain(sameDirection, 'nonzero', center)).toBe(true);
    expect(ringsContain(sameDirection, 'evenodd', center)).toBe(false);
    expect(ringsContain(opposite, 'nonzero', center)).toBe(false);
    expect(ringsContain(sameDirection, 'evenodd', { x: 1, y: 5 })).toBe(true);
  });

  it('handles concave polygons', () => {
    const notch: Ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 2 },
      { x: 0, y: 10 },
    ];
    expect(ringsContain([notch], 'nonzero', { x: 5, y: 1 })).toBe(true);
    expect(ringsContain([notch], 'nonzero', { x: 5, y: 8 })).toBe(false);
  });
});
