import { isWash, TONE_STEPS } from '../utils/paint/regionPaint';
import type { RegionPaint, StepPaint, ToneStep } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
import {
  drawBlended,
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

/**
 * How a wash (a see-through paint) goes over the paint under it: multiplied,
 * at full strength where the mask shows. Recesses darken as much as with an
 * opaque coat, but the paint's own hue shows through, so a colored wash tints
 * it instead of covering it. Mixing the wash in at its own alpha looked faint.
 */
export const WASH_BLEND: GlobalCompositeOperation = 'multiply';

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

/** How a paint is drawn: flat, as the metal picture, or multiplied in as a wash. */
type PaintKind = 'flat' | 'metal' | 'wash';

/** What paintPass draws with, besides the fills. */
interface PassSources {
  /** The metal picture to blend into the fills, or `null` for plain fills. */
  readonly metal: CanvasImageSource | null;
  /** The tone mask to cut the fills to, or `null`. */
  readonly mask: CanvasImageSource | null;
  /** How the pass goes over the drawing. Source-over when missing. */
  readonly blend?: GlobalCompositeOperation;
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
    const fills = stepFills(input, 'base', ['metal']);
    paintPass(ctx, scratch, frame, fills, { metal: input.metal, mask: null });
  }
}

/**
 * Paints the Layer, Shade and Highlight steps in that order, each cut to
 * where the sheet's mask for it shows. Washes multiply the paint under them.
 * Metallic paints show the metal picture, so a metal Layer or Highlight
 * shines on the raised areas and edges. Tones without a mask image, or that
 * no region uses, are skipped.
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
    const flat = stepFills(input, step, metal === null ? ['flat', 'metal'] : ['flat']);
    paintPass(ctx, scratch, frame, flat, { metal: null, mask });
    const washes = stepFills(input, step, ['wash']);
    paintPass(ctx, scratch, frame, washes, { metal: null, mask, blend: WASH_BLEND });
    if (metal !== null) {
      paintPass(ctx, scratch, frame, stepFills(input, step, ['metal']), { metal, mask });
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
  const metallic = input.metal === null ? [] : stepFills(input, 'base', ['metal']);
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
  drawBlended(ctx, 'hard-light', () => {
    ctx.drawImage(source, 0, 0, frame.width, frame.height);
  });
}

/** The regions painted in `step` with a paint of one of `kinds`, with that paint's color. */
function stepFills(input: ToneInput, step: keyof RegionPaint, kinds: readonly PaintKind[]): Fill[] {
  const fills: Fill[] = [];
  for (const region of input.regions) {
    const paint: StepPaint | undefined = input.paints.get(region.id)?.[step];
    if (paint !== undefined && kinds.includes(paintKind(paint))) {
      fills.push({ region, color: paint.color });
    }
  }
  return fills;
}

function paintKind(paint: StepPaint): PaintKind {
  if (isWash(paint)) {
    return 'wash';
  }
  return paint.metallic === true ? 'metal' : 'flat';
}

/**
 * Paints `fills` on the scratch canvas, as metal when a metal picture is
 * given and cut to `mask` when one is given, then lays the result over the
 * drawing with the given blend. Does nothing without fills.
 */
function paintPass(
  ctx: SvgCanvasContext,
  scratch: SvgCanvasContext,
  frame: CanvasFrame,
  fills: readonly Fill[],
  sources: PassSources,
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
  drawBlended(ctx, sources.blend ?? 'source-over', () => {
    ctx.drawImage(scratch.canvas, 0, 0, frame.width, frame.height);
  });
}
