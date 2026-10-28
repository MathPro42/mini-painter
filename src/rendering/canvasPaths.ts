import type { Ring } from '../utils/svg/geometry';
import type { SvgRegion, ViewBox } from '../utils/svg/types';

/** The slice of the canvas 2D API that painting uses, so tests can pass a recording fake. */
export type SvgCanvasContext = Pick<
  CanvasRenderingContext2D,
  | 'canvas'
  | 'setTransform'
  | 'clearRect'
  | 'drawImage'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
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

/** Fills every shape of `region` with `color`, in the current transform. */
export function fillRegionShapes(ctx: SvgCanvasContext, region: SvgRegion, color: string): void {
  for (const shape of region.shapes) {
    ctx.beginPath();
    traceRings(ctx, shape.rings);
    ctx.fillStyle = color;
    ctx.fill(shape.fillRule);
  }
}

export function traceRings(ctx: SvgCanvasContext, rings: readonly Ring[]): void {
  for (const ring of rings) {
    ring.forEach(({ x, y }, index) => {
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
  }
}
