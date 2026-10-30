import type { Ring } from '../utils/svg/geometry';
import type { SvgRegion, SvgShape, ViewBox } from '../utils/svg/types';

/** The slice of the canvas 2D API that painting uses, so tests can pass a recording fake. */
export type SvgCanvasContext = Pick<
  CanvasRenderingContext2D,
  | 'canvas'
  | 'save'
  | 'restore'
  | 'clip'
  | 'setTransform'
  | 'clearRect'
  | 'drawImage'
  | 'fill'
  | 'stroke'
  | 'setLineDash'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineJoin'
  | 'globalCompositeOperation'
>;

/** Canvas size in pixels, plus the drawing's coordinate system mapped onto it. */
export interface CanvasFrame {
  readonly width: number;
  readonly height: number;
  readonly viewBox: ViewBox;
}

/** Sets the transform so drawing commands use the drawing's viewBox units. */
export function useViewBoxUnits(ctx: SvgCanvasContext, frame: CanvasFrame): void {
  const { width, height, viewBox } = frame;
  const scaleX = width / viewBox.width;
  const scaleY = height / viewBox.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, -viewBox.x * scaleX, -viewBox.y * scaleY);
}

/** Sets the transform back to canvas pixels. */
export function usePixels(ctx: SvgCanvasContext): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Empties the canvas and resets its transform and compositing. */
export function resetCanvas(ctx: SvgCanvasContext, frame: CanvasFrame): void {
  usePixels(ctx);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, frame.width, frame.height);
}

// Paths are built once per shape and reused by every repaint: tracing a detailed sheet
// point by point on each fill, clip and stroke cost more than the drawing itself.
const shapePaths = new WeakMap<SvgShape, Path2D>();
const regionPaths = new WeakMap<SvgRegion, Path2D>();

/** The shape's outline as a path in viewBox units, built on first use. */
export function shapePath(shape: SvgShape): Path2D {
  let path = shapePaths.get(shape);
  if (path === undefined) {
    path = new Path2D();
    traceRings(path, shape.rings);
    shapePaths.set(shape, path);
  }
  return path;
}

/** The outlines of every shape of the region as one path in viewBox units, built on first use. */
export function regionPath(region: SvgRegion): Path2D {
  let path = regionPaths.get(region);
  if (path === undefined) {
    path = new Path2D();
    for (const shape of region.shapes) {
      path.addPath(shapePath(shape));
    }
    regionPaths.set(region, path);
  }
  return path;
}

/** Fills every shape of `region` with `color`, in the current transform. */
export function fillRegionShapes(ctx: SvgCanvasContext, region: SvgRegion, color: string): void {
  ctx.fillStyle = color;
  for (const shape of region.shapes) {
    ctx.fill(shapePath(shape), shape.fillRule);
  }
}

/**
 * Runs `draw` once per shape of `regions`, clipped to that shape, with the
 * transform back in canvas pixels. Clipping shape by shape keeps each shape's
 * own fill rule. A `destination-in` cut can't do this: every draw of it would
 * erase all the shapes drawn before.
 */
export function drawInsideShapes(
  ctx: SvgCanvasContext,
  frame: CanvasFrame,
  regions: readonly SvgRegion[],
  draw: () => void,
): void {
  for (const region of regions) {
    for (const shape of region.shapes) {
      ctx.save();
      useViewBoxUnits(ctx, frame);
      ctx.clip(shapePath(shape), shape.fillRule);
      usePixels(ctx);
      draw();
      ctx.restore();
    }
  }
}

/** Runs `draw` with `operation` as the composite operation, then goes back to source-over. */
export function drawBlended(
  ctx: SvgCanvasContext,
  operation: GlobalCompositeOperation,
  draw: () => void,
): void {
  if (operation === 'source-over') {
    draw();
    return;
  }
  ctx.globalCompositeOperation = operation;
  draw();
  ctx.globalCompositeOperation = 'source-over';
}

function traceRings(path: Path2D, rings: readonly Ring[]): void {
  for (const ring of rings) {
    ring.forEach(({ x, y }, index) => {
      if (index === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
    path.closePath();
  }
}
