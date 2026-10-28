import { TONE_STEPS } from '../utils/paint/regionPaint';
import type { RegionPaint, StepPaint, ToneStep } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
import {
  drawInsideShapes,
  fillRegionShapes,
  resetCanvas,
  usePixels,
  useViewBoxUnits,
} from './canvasPaths';
import type { CanvasFrame, SvgCanvasContext } from './canvasPaths';

/** Rendered tone masks: opaque white where each tone shows, or `null` while loading or absent. */
export type ToneMaskImages = Readonly<Record<ToneStep, CanvasImageSource | null>>;

export const NO_TONE_MASK_IMAGES: ToneMaskImages = { layer: null, shade: null, highlight: null };

/**
 * How the metal picture is blended over a metallic paint's flat color. With
 * hard light, mid grey keeps the paint's own color while the picture's
 * reflections lighten it and its shadows darken it. Chosen by eye on a real
 * sheet over luminosity (too saturated) and doubled hard light (too harsh).
 */
export const METAL_BLEND: GlobalCompositeOperation = 'hard-light';

export interface ToneInput {
  readonly regions: readonly SvgRegion[];
  readonly paints: ReadonlyMap<string, RegionPaint>;
  readonly toneMasks: ToneMaskImages;
  /** The sheet's picture of the model as bare metal, or `null`. */
  readonly metal: CanvasImageSource | null;
}

interface Fill {
  readonly region: SvgRegion;
  readonly color: string;
}

/**
 * Paints the bare-metal picture over regions with a metallic Base, tinted by
 * that paint, in place of the flat base coat. Tones still go on top.
 */
export function paintMetal(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  input: ToneInput,
): void {
  if (input.metal !== null) {
    const fills = stepFills(input, 'base', true);
    paintPass(ctx, scratch, frame, fills, { metal: input.metal, mask: null });
  }
}

/**
 * Paints the Layer, Shade and Highlight steps in that order, each cut to
 * where the sheet's mask for it shows. Metallic paints show the metal
 * picture, so a metal Layer or Highlight shines on the raised areas and
 * edges. Tones without a mask image, or that no region uses, are skipped.
 */
export function paintTones(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  input: ToneInput,
): void {
  for (const step of TONE_STEPS) {
    const mask = input.toneMasks[step];
    if (mask === null) {
      continue;
    }
    // Without a metal picture, metallic paints are painted flat like the rest.
    const metal = input.metal;
    const flat = stepFills(input, step, metal === null ? null : false);
    paintPass(ctx, scratch, frame, flat, { metal: null, mask });
    if (metal !== null) {
      paintPass(ctx, scratch, frame, stepFills(input, step, true), { metal, mask });
    }
  }
}

/**
 * Blends the drawing's shading artwork over the paint in hard light, except
 * on regions with a metallic Base when there is a metal picture: that picture
 * carries its own reflections, and the matte shading would dull them. Sheets
 * stack their metal layer above the shading for the same reason.
 */
export function paintShading(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  input: ToneInput,
  shading: CanvasImageSource,
): void {
  const metallic = input.metal === null ? [] : stepFills(input, 'base', true);
  let source: CanvasImageSource = shading;
  if (metallic.length > 0) {
    resetCanvas(scratch, frame);
    scratch.drawImage(shading, 0, 0, frame.width, frame.height);
    scratch.globalCompositeOperation = 'destination-out';
    useViewBoxUnits(scratch, frame);
    for (const { region } of metallic) {
      fillRegionShapes(scratch, region, '#000000');
    }
    scratch.globalCompositeOperation = 'source-over';
    source = scratch.canvas;
  }
  usePixels(ctx);
  // Hard light: the artwork's greys darken (multiply) or lighten (screen) the paint
  // instead of covering it with grey. Opaque black and white still draw as-is.
  ctx.globalCompositeOperation = 'hard-light';
  ctx.drawImage(source, 0, 0, frame.width, frame.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * The regions painted in `step`, with that step's color. `metallic` keeps
 * only metallic paints (`true`), only the others (`false`), or all (`null`).
 */
function stepFills(input: ToneInput, step: keyof RegionPaint, metallic: boolean | null): Fill[] {
  const fills: Fill[] = [];
  for (const region of input.regions) {
    const paint: StepPaint | undefined = input.paints.get(region.id)?.[step];
    if (paint !== undefined && (metallic === null || (paint.metallic === true) === metallic)) {
      fills.push({ region, color: paint.color });
    }
  }
  return fills;
}

/**
 * Paints `fills` on the scratch canvas, as metal when a metal picture is
 * given and cut to `mask` when one is given, then lays the result over the
 * drawing. Does nothing without fills.
 */
function paintPass(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  fills: readonly Fill[],
  sources: { readonly metal: CanvasImageSource | null; readonly mask: CanvasImageSource | null },
): void {
  if (fills.length === 0) {
    return;
  }
  resetCanvas(scratch, frame);
  useViewBoxUnits(scratch, frame);
  for (const { region, color } of fills) {
    fillRegionShapes(scratch, region, color);
  }
  const { metal } = sources;
  if (metal !== null) {
    const regions = fills.map((fill) => fill.region);
    scratch.globalCompositeOperation = METAL_BLEND;
    drawInsideShapes(scratch, frame, regions, () => {
      scratch.drawImage(metal, 0, 0, frame.width, frame.height);
    });
  }
  if (sources.mask !== null) {
    usePixels(scratch);
    scratch.globalCompositeOperation = 'destination-in';
    scratch.drawImage(sources.mask, 0, 0, frame.width, frame.height);
  }
  scratch.globalCompositeOperation = 'source-over';
  usePixels(ctx);
  ctx.drawImage(scratch.canvas, 0, 0, frame.width, frame.height);
}
