import { isWash } from '../utils/paint/regionPaint';
import type { RegionPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg, SvgRegion } from '../utils/svg/types';
import {
  drawBlended,
  fillRegionShapes,
  regionPath,
  resetCanvas,
  shapePath,
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
  /** Rendered artwork, or `null` while it loads or when the drawing has none. */
  readonly below: CanvasImageSource | null;
  readonly above: CanvasImageSource | null;
  /** Rendered tone masks, each `null` while it loads or when the drawing has none. */
  readonly toneMasks: ToneMaskImages;
  /** The rendered bare-metal picture, or `null`. */
  readonly metal: CanvasImageSource | null;
}

/** Width of a selected region's outline, in texture pixels of the selection overlay. */
export const SELECTION_OUTLINE_PX = 6;
export const SELECTION_OUTLINE_COLORS = { outer: '#16181d', inner: '#ffffff' } as const;

/**
 * Paints a drawing onto a `width` × `height` canvas, in the order paint goes
 * on a model: artwork below; each region's Base (or original fill; unpainted
 * regions stay clear), as bare metal for metallic paints; the Layer, Shade
 * and Highlight tones through the sheet's masks; the artwork above blended
 * in as shading (except over metal). `scratch` is a second canvas of the
 * same size for the metal and tone passes. The selection is drawn apart, by
 * paintSelection, so selecting never repaints the paint.
 */
export function paintSvg(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  width: number,
  height: number,
  input: SvgPaintInput,
): void {
  const { svg, paints, below, above } = input;
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
}

/**
 * Draws an outline around each selected region on an otherwise clear
 * `width` × `height` canvas, laid over the painted drawing.
 */
export function paintSelection(
  ctx: SvgCanvasContext,
  width: number,
  height: number,
  svg: ParsedSvg,
  selectedRegionIds: ReadonlySet<string>,
): void {
  const frame: CanvasFrame = { width, height, viewBox: svg.viewBox };
  resetCanvas(ctx, frame);
  const selected = svg.regions.filter((region) => selectedRegionIds.has(region.id));
  if (selected.length === 0) {
    return;
  }
  useViewBoxUnits(ctx, frame);
  const pixelsPerUnit = Math.min(width / svg.viewBox.width, height / svg.viewBox.height);
  for (const region of selected) {
    outlineRegion(ctx, region, pixelsPerUnit);
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
      ctx.fillStyle = shape.fill;
      ctx.fill(shapePath(shape), shape.fillRule);
    }
  }
}

/** A dark band with white dashes on top, visible over both light and dark paint. */
function outlineRegion(ctx: SvgCanvasContext, region: SvgRegion, pixelsPerUnit: number): void {
  const pixels = (value: number): number => value / pixelsPerUnit;
  const path = regionPath(region);
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = SELECTION_OUTLINE_COLORS.outer;
  ctx.lineWidth = pixels(SELECTION_OUTLINE_PX);
  ctx.stroke(path);
  ctx.setLineDash([pixels(12), pixels(8)]);
  ctx.strokeStyle = SELECTION_OUTLINE_COLORS.inner;
  ctx.lineWidth = pixels(SELECTION_OUTLINE_PX / 3);
  ctx.stroke(path);
}
