import { boundsContain, ringsContain } from './geometry';
import type { Point } from './geometry';
import type { SvgRegion } from './types';

/**
 * The topmost region whose fill covers `point` (viewBox coordinates), or
 * `null`. Regions later in the list are painted on top, so they win.
 */
export function findRegionAt(regions: readonly SvgRegion[], point: Point): SvgRegion | null {
  return (
    regions.findLast(
      (region) =>
        boundsContain(region.bounds, point) &&
        region.shapes.some(
          (shape) =>
            boundsContain(shape.bounds, point) && ringsContain(shape.rings, shape.fillRule, point),
        ),
    ) ?? null
  );
}
