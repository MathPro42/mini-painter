import type { Ring } from '../utils/svg/geometry';
import type { ParsedSvg, SvgRegion } from '../utils/svg/types';

/** The slice of the canvas 2D API that painting uses, so tests can pass a recording fake. */
export type SvgCanvasContext = Pick<
  CanvasRenderingContext2D,
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

export interface SvgPaintInput {
  readonly svg: ParsedSvg;
  /** User-assigned colors by region id; other regions keep their original fills. */
  readonly colors: ReadonlyMap<string, string>;
  readonly selectedRegionId: string | null;
  /** Rendered artwork, or `null` while it loads or when the drawing has none. */
  readonly below: CanvasImageSource | null;
  readonly above: CanvasImageSource | null;
}

/** Width of the selected region's outline, in texture pixels. */
export const SELECTION_OUTLINE_PX = 6;
export const SELECTION_OUTLINE_COLORS = { outer: '#16181d', inner: '#ffffff' } as const;

/**
 * Paints a drawing onto a `width` × `height` canvas: artwork below, each
 * region in its assigned color or original fill (unpainted regions stay
 * clear), artwork above blended in as shading, then an outline around the
 * selected region.
 */
export function paintSvg(
  ctx: SvgCanvasContext,
  width: number,
  height: number,
  input: SvgPaintInput,
): void {
  const { svg, colors, selectedRegionId, below, above } = input;
  const { viewBox } = svg;
  const scaleX = width / viewBox.width;
  const scaleY = height / viewBox.height;
  const useViewBoxUnits = (): void => {
    ctx.setTransform(scaleX, 0, 0, scaleY, -viewBox.x * scaleX, -viewBox.y * scaleY);
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (below !== null) {
    ctx.drawImage(below, 0, 0, width, height);
  }
  useViewBoxUnits();
  for (const region of svg.regions) {
    fillRegion(ctx, region, colors.get(region.id));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (above !== null) {
    // Hard light: the artwork's greys darken (multiply) or lighten (screen) the paint
    // instead of covering it with grey. Opaque black and white still draw as-is.
    ctx.globalCompositeOperation = 'hard-light';
    ctx.drawImage(above, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  const selected = svg.regions.find((region) => region.id === selectedRegionId);
  if (selected !== undefined) {
    useViewBoxUnits();
    outlineRegion(ctx, selected, Math.min(scaleX, scaleY));
  }
}

function fillRegion(ctx: SvgCanvasContext, region: SvgRegion, assigned: string | undefined): void {
  for (const shape of region.shapes) {
    const color = assigned ?? shape.fill;
    if (color !== null) {
      ctx.beginPath();
      traceRings(ctx, shape.rings);
      ctx.fillStyle = color;
      ctx.fill(shape.fillRule);
    }
  }
}

/** A dark band with white dashes on top, visible over both light and dark paint. */
function outlineRegion(ctx: SvgCanvasContext, region: SvgRegion, pixelsPerUnit: number): void {
  const pixels = (value: number): number => value / pixelsPerUnit;
  ctx.beginPath();
  for (const shape of region.shapes) {
    traceRings(ctx, shape.rings);
  }
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = SELECTION_OUTLINE_COLORS.outer;
  ctx.lineWidth = pixels(SELECTION_OUTLINE_PX);
  ctx.stroke();
  ctx.setLineDash([pixels(12), pixels(8)]);
  ctx.strokeStyle = SELECTION_OUTLINE_COLORS.inner;
  ctx.lineWidth = pixels(SELECTION_OUTLINE_PX / 3);
  ctx.stroke();
}

function traceRings(ctx: SvgCanvasContext, rings: readonly Ring[]): void {
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
