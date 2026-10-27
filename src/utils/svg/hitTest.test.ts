import { describe, expect, it } from 'vitest';
import selectionMapSvg from './fixtures/selection-map.svg?raw';
import { findRegionAt } from './hitTest';
import { parseSvg } from './parseSvg';

describe('findRegionAt', () => {
  const { regions } = parseSvg(selectionMapSvg);
  const nameAt = (x: number, y: number): string | undefined =>
    findRegionAt(regions, { x, y })?.name;

  it('finds the region under a point', () => {
    expect(nameAt(50, 50)).toBe('one');
    expect(nameAt(150, 50)).toBe('two');
    expect(nameAt(140, 92)).toBe('three');
  });

  it('follows curved outlines, not just bounding boxes', () => {
    // Inside the circle's bounding box, outside the circle.
    expect(nameAt(123, 23)).toBeUndefined();
  });

  it('honors the even-odd hole of a frame', () => {
    expect(nameAt(22, 100)).toBe('four');
    expect(nameAt(40, 100)).toBeUndefined();
  });

  it('returns null away from every region', () => {
    expect(findRegionAt(regions, { x: 100, y: 5 })).toBeNull();
  });

  it('prefers the region painted last where regions overlap', () => {
    const overlapping = parseSvg(
      '<svg viewBox="0 0 10 10"><rect id="under" width="10" height="10"/><rect id="over" width="5" height="5"/></svg>',
    ).regions;
    expect(findRegionAt(overlapping, { x: 2, y: 2 })?.name).toBe('over');
    expect(findRegionAt(overlapping, { x: 8, y: 8 })?.name).toBe('under');
  });
});
