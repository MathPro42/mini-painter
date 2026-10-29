import { isWash } from '../utils/paint/regionPaint';
import type { RegionPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg, SvgRegion } from '../utils/svg/types';
import {
  drawBlended,
  fillRegionShapes,
  traceRings,
  usePixels,
  useViewBoxUnits,
} from './canvasPaths';
import type { CanvasFrame, SvgCanvasContext } from './canvasPaths';
import { paintMetal, paintShading, paintTones, WASH_BLEND } from './paintTones';
import type { ToneMaskImages } from './paintTones';

export type { SvgCanvasContext } from './canvasPaths';

export interface SvgPaintInput {
  readonly svg: ParsedSvg;
  /** User-applied paints by region id; regions without a Base keep their original fills. */
  readonly paints: ReadonlyMap<string, RegionPaint>;
  /** Regions to outline, by id. */
  readonly selectedRegionIds: readonly string[];
  /** Rendered artwork, or `null` while it loads or when the drawing has none. */
  readonly below: CanvasImageSource | null;
  readonly above: CanvasImageSource | null;
  /** Rendered tone masks, each `null` while it loads or when the drawing has none. */
  readonly toneMasks: ToneMaskImages;
  /** The rendered bare-metal picture, or `null`. */
  readonly metal: CanvasImageSource | null;
}

/** Width of a selected region's outline, in texture pixels. */
export const SELECTION_OUTLINE_PX = 6;
export const SELECTION_OUTLINE_COLORS = { outer: '#16181d', inner: '#ffffff' } as const;

/**
 * Paints a drawing onto a `width` × `height` canvas, in the order paint goes
 * on a model: artwork below; each region's Base (or original fill; unpainted
 * regions stay clear), as bare metal for metallic paints; the Layer, Shade
 * and Highlight tones through the sheet's masks; the artwork above blended
 * in as shading (except over metal); then an outline around each selected
 * region. `scratch` is a second canvas of the same size for the metal and
 * tone passes.
 */
export function paintSvg(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  width: number,
  height: number,
  input: SvgPaintInput,
): void {
  const { svg, paints, selectedRegionIds, below, above } = input;
  const frame: CanvasFrame = { width, height, viewBox: svg.viewBox };
  const tones = { regions: svg.regions, paints, toneMasks: input.toneMasks, metal: input.metal };

  usePixels(ctx);
  ctx.clearRect(0, 0, width, height);
  if (below !== null) {
    ctx.drawImage(below, 0, 0, width, height);
  }
  useViewBoxUnits(ctx, frame);
  for (const region of svg.regions) {
    fillBase(ctx, region, paints.get(region.id));
  }
  paintMetal(ctx, scratch, frame, tones);
  paintTones(ctx, scratch, frame, tones);
  if (above !== null) {
    paintShading(ctx, scratch, frame, tones, above);
  }
  const selected = svg.regions.filter((region) => selectedRegionIds.includes(region.id));
  if (selected.length > 0) {
    useViewBoxUnits(ctx, frame);
    const pixelsPerUnit = Math.min(width / svg.viewBox.width, height / svg.viewBox.height);
    for (const region of selected) {
      outlineRegion(ctx, region, pixelsPerUnit);
    }
  }
}

function fillBase(ctx: SvgCanvasContext, region: SvgRegion, paint: RegionPaint | undefined): void {
  const base = paint?.base;
  if (base !== undefined) {
    // A wash used as Base tints the artwork below it, as it does in the Shade step.
    drawBlended(ctx, isWash(base) ? WASH_BLEND : 'source-over', () => {
      fillRegionShapes(ctx, region, base.color);
    });
    return;
  }
  for (const shape of region.shapes) {
    if (shape.fill !== null) {
      ctx.beginPath();
      traceRings(ctx, shape.rings);
      ctx.fillStyle = shape.fill;
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
