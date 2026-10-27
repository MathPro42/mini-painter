export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A closed polygon. The last point connects back to the first. */
export type Ring = readonly Point[];

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** SVG `fill-rule`: how overlapping rings decide what is inside. */
export type FillRule = 'nonzero' | 'evenodd';

/** Smallest axis-aligned box around every point, or `null` when there are none. */
export function ringsBounds(rings: readonly Ring[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const ring of rings) {
    for (const { x, y } of ring) {
      bounds =
        bounds === null
          ? { minX: x, minY: y, maxX: x, maxY: y }
          : {
              minX: Math.min(bounds.minX, x),
              minY: Math.min(bounds.minY, y),
              maxX: Math.max(bounds.maxX, x),
              maxY: Math.max(bounds.maxY, y),
            };
    }
  }
  return bounds;
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boundsContain(bounds: Bounds, { x, y }: Point): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/** Whether `point` is inside the area the rings fill under `fillRule`. */
export function ringsContain(rings: readonly Ring[], fillRule: FillRule, point: Point): boolean {
  let winding = 0;
  let crossings = 0;
  for (const ring of rings) {
    ring.forEach((from, index) => {
      const to = ring[(index + 1) % ring.length] ?? from;
      const crossing = edgeCrossing(from, to, point);
      winding += crossing;
      crossings += Math.abs(crossing);
    });
  }
  return fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}

/**
 * +1 when the edge crosses the horizontal ray to the right of `point` going
 * up, -1 going down, 0 when it misses. Summed over a ring this is the winding
 * number; the count of non-zero results is the even-odd crossing count.
 */
function edgeCrossing(from: Point, to: Point, point: Point): number {
  const side = (to.x - from.x) * (point.y - from.y) - (point.x - from.x) * (to.y - from.y);
  if (from.y <= point.y) {
    return to.y > point.y && side > 0 ? 1 : 0;
  }
  return to.y <= point.y && side < 0 ? -1 : 0;
}
