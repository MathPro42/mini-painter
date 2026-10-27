import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml';
import { ringsBounds } from './geometry';
import { isShapeElement, shapeRings } from './shapes';

const rings = (markup: string): ReturnType<typeof shapeRings> => shapeRings(parseXml(markup));
const bounds = (markup: string): ReturnType<typeof ringsBounds> => ringsBounds(rings(markup) ?? []);

describe('shapeRings', () => {
  it('reads a rect as four corners', () => {
    expect(rings('<rect x="1" y="2" width="3" height="4"/>')).toEqual([
      [
        { x: 1, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 6 },
        { x: 1, y: 6 },
      ],
    ]);
  });

  it('defaults missing or invalid rect coordinates to zero', () => {
    expect(bounds('<rect x="oops" width="5" height="5"/>')).toEqual({
      minX: 0,
      minY: 0,
      maxX: 5,
      maxY: 5,
    });
  });

  it('rounds rect corners, copying a lone radius and capping it', () => {
    const rounded = rings('<rect width="20" height="10" rx="50"/>')?.[0] ?? [];
    expect(rounded.length).toBeGreaterThan(4);
    expect(bounds('<rect width="20" height="10" rx="50"/>')).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 10,
    });
    // With rx capped at 10 and ry at 5, no straight edge is left on the corners.
    expect(rounded).not.toContainEqual({ x: 0, y: 0 });
    expect(rings('<rect width="20" height="10" ry="2"/>')?.[0]?.length).toBeGreaterThan(4);
  });

  it('reads circles and ellipses', () => {
    expect(bounds('<circle cx="10" cy="10" r="5"/>')).toEqual({
      minX: 5,
      minY: 5,
      maxX: 15,
      maxY: 15,
    });
    const ellipse = bounds('<ellipse cx="0" cy="0" rx="8" ry="3"/>');
    expect(ellipse?.maxX).toBeCloseTo(8);
    expect(ellipse?.maxY).toBeCloseTo(3);
  });

  it('reads polygon and polyline points, ignoring a dangling coordinate', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    expect(rings('<polygon points="0,0 10,0 5,8"/>')).toEqual([triangle]);
    expect(rings('<polyline points="0 0 10 0 5 8 3"/>')).toEqual([triangle]);
  });

  it('reads path data', () => {
    expect(rings('<path d="M0 0h4v4h-4z"/>')).toHaveLength(1);
  });

  it.each([
    '<rect width="0" height="5"/>',
    '<circle r="0"/>',
    '<ellipse rx="5"/>',
    '<polygon points="0 0 5 5"/>',
    '<line x2="10" y2="10"/>',
    '<path/>',
  ])('returns no rings for %s, which encloses no area', (markup) => {
    expect(rings(markup)).toEqual([]);
  });

  it('returns null for elements that are not shapes', () => {
    expect(rings('<g/>')).toBeNull();
    expect(rings('<text>hi</text>')).toBeNull();
  });
});

describe('isShapeElement', () => {
  it('recognizes basic shapes by local name', () => {
    expect(isShapeElement(parseXml('<svg:circle/>'))).toBe(true);
    expect(isShapeElement(parseXml('<line/>'))).toBe(true);
    expect(isShapeElement(parseXml('<g/>'))).toBe(false);
  });
});
