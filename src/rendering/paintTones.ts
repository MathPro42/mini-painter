import { TONE_STEPS } from '../utils/paint/regionPaint';
import type { RegionPaint, ToneStep } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
import { fillRegionShapes, resetCanvas, usePixels, useViewBoxUnits } from './canvasPaths';
import type { CanvasFrame, SvgCanvasContext } from './canvasPaths';

/** Rendered tone masks: opaque white where each tone shows, or `null` while loading or absent. */
export type ToneMaskImages = Readonly<Record<ToneStep, CanvasImageSource | null>>;

export const NO_TONE_MASK_IMAGES: ToneMaskImages = { layer: null, shade: null, highlight: null };

export interface ToneInput {
  readonly regions: readonly SvgRegion[];
  readonly paints: ReadonlyMap<string, RegionPaint>;
  readonly toneMasks: ToneMaskImages;
  /** The sheet's picture of the model as bare metal, or `null`. */
  readonly metal: CanvasImageSource | null;
}

/**
 * Paints the bare-metal picture over regions with a metallic Base, tinted by
 * that paint: hard light keeps its reflections and shadows (lighter or darker
 * than mid grey) while mid grey shows the paint's own color. Drawn in place
 * of the flat base coat, so tones still go on top.
 */
export function paintMetal(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  input: ToneInput,
): void {
  const metallic = input.regions.filter(
    (region) => input.paints.get(region.id)?.base?.metallic === true,
  );
  if (input.metal === null || metallic.length === 0) {
    return;
  }
  resetCanvas(scratch, frame);
  useViewBoxUnits(scratch, frame);
  for (const region of metallic) {
    fillRegionShapes(scratch, region, input.paints.get(region.id)?.base?.color ?? '#808080');
  }
  usePixels(scratch);
  scratch.globalCompositeOperation = 'hard-light';
  scratch.drawImage(input.metal, 0, 0, frame.width, frame.height);
  // The picture covered the whole canvas; keep it only inside the metallic regions.
  scratch.globalCompositeOperation = 'destination-in';
  useViewBoxUnits(scratch, frame);
  for (const region of metallic) {
    fillRegionShapes(scratch, region, '#000000');
  }
  composite(ctx, scratch, frame);
}

/**
 * Paints the Layer, Shade and Highlight steps in that order. Each tone is
 * painted region by region on the scratch canvas, cut to where the sheet's
 * mask for it shows, then laid over the drawing. Tones without a mask image,
 * or that no region uses, are skipped.
 */
export function paintTones(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  input: ToneInput,
): void {
  for (const step of TONE_STEPS) {
    const mask = input.toneMasks[step];
    const painted = input.regions.filter(
      (region) => input.paints.get(region.id)?.[step] !== undefined,
    );
    if (mask === null || painted.length === 0) {
      continue;
    }
    resetCanvas(scratch, frame);
    useViewBoxUnits(scratch, frame);
    for (const region of painted) {
      fillRegionShapes(scratch, region, input.paints.get(region.id)?.[step]?.color ?? '#000000');
    }
    usePixels(scratch);
    scratch.globalCompositeOperation = 'destination-in';
    scratch.drawImage(mask, 0, 0, frame.width, frame.height);
    composite(ctx, scratch, frame);
  }
}

/** Lays the scratch canvas over the drawing. */
function composite(ctx: SvgCanvasContext, scratch: SvgCanvasContext, frame: CanvasFrame): void {
  scratch.globalCompositeOperation = 'source-over';
  usePixels(ctx);
  ctx.drawImage(scratch.canvas, 0, 0, frame.width, frame.height);
}
