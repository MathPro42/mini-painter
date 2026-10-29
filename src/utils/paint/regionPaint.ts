import { normalizeOpacity, parseHexColor } from '../color';
import type { PaletteColor } from '../palette/paletteColor';
import type { SvgRegion } from '../svg/types';
import { PAINT_STEPS } from './paintSteps';
import type { PaintStep } from './paintSteps';

// Steps live in their own module so palette recipes can name them without importing paints.
export { PAINT_STEP_LABELS, PAINT_STEPS, TONE_STEPS } from './paintSteps';
export type { PaintStep, ToneStep } from './paintSteps';

/** The paint used for one step. */
export interface StepPaint {
  /** Lowercase `#rrggbb`. */
  readonly color: string;
  /** Palette name, when the paint came from a palette. */
  readonly name?: string;
  /** Metallic paints get a sheen in the render. */
  readonly metallic?: boolean;
  /** See-through paints (washes), strictly between 0 and 1. Missing means opaque. */
  readonly opacity?: number;
}

/** The paints on one region; a missing step is not painted. */
export type RegionPaint = Readonly<Partial<Record<PaintStep, StepPaint>>>;

/** Returns `paint` with `step` set to `value`, or removed when `value` is `null`. */
export function withStep(
  paint: RegionPaint | undefined,
  step: PaintStep,
  value: StepPaint | null,
): RegionPaint {
  const next: Partial<Record<PaintStep, StepPaint>> = {};
  for (const key of PAINT_STEPS) {
    const kept = key === step ? value : paint?.[key];
    if (kept !== null && kept !== undefined) {
      next[key] = kept;
    }
  }
  return next;
}

/**
 * Validates a step paint: the color becomes lowercase `#rrggbb`, a blank
 * name and an opacity that isn't see-through are dropped. Throws a
 * RangeError for an invalid color.
 */
export function parseStepPaint(paint: StepPaint): StepPaint {
  const color = parseHexColor(paint.color);
  const name = paint.name?.trim() ?? '';
  const opacity = normalizeOpacity(paint.opacity);
  return {
    color,
    ...(name === '' ? {} : { name }),
    ...(paint.metallic === true ? { metallic: true } : {}),
    ...(opacity === null ? {} : { opacity }),
  };
}

/** Builds the step paint for a palette color. */
export function stepPaintFromPalette(color: PaletteColor): StepPaint {
  return {
    color: color.color,
    name: color.name,
    ...(isMetallicPaint(color) ? { metallic: true } : {}),
    ...(color.opacity === undefined ? {} : { opacity: color.opacity }),
  };
}

/** Whether a paint is a wash: see-through, so it tints what is under it. */
export function isWash(paint: StepPaint): boolean {
  return paint.opacity !== undefined;
}

/** Whether a palette color is a metallic paint, judged by its group ("Metallic", "metals"…). */
export function isMetallicPaint(color: PaletteColor): boolean {
  return /metal/i.test(color.group ?? '');
}

/** Whether two step paints are the same, or both absent. */
export function sameStepPaint(a: StepPaint | undefined, b: StepPaint | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return (
    a.color === b.color &&
    a.name === b.name &&
    (a.metallic ?? false) === (b.metallic ?? false) &&
    a.opacity === b.opacity
  );
}

/** Whether two region paints have the same paint in every step. */
export function sameRegionPaint(a: RegionPaint | undefined, b: RegionPaint | undefined): boolean {
  return PAINT_STEPS.every((step) => sameStepPaint(a?.[step], b?.[step]));
}

/** Whether two maps of region paints match region by region. */
export function sameRegionPaints(
  a: ReadonlyMap<string, RegionPaint>,
  b: ReadonlyMap<string, RegionPaint>,
): boolean {
  const ids = new Set([...a.keys(), ...b.keys()]);
  return [...ids].every((id) => sameRegionPaint(a.get(id), b.get(id)));
}

/**
 * What a region's step is painted with: its own paint, or for the Base of an
 * unpainted region, the drawing's original fill.
 */
export function regionStepPaint(
  region: Pick<SvgRegion, 'fill'>,
  paint: RegionPaint | undefined,
  step: PaintStep,
): StepPaint | undefined {
  const own = paint?.[step];
  if (own !== undefined || step !== 'base' || region.fill === null) {
    return own;
  }
  return { color: region.fill };
}

/** The paint several regions share on one step (`undefined`: none has any), or that they differ. */
export type SharedStepPaint =
  { readonly mixed: false; readonly paint: StepPaint | undefined } | { readonly mixed: true };

/** Whether `paints`, one per selected region, are all the same paint. An empty list isn't mixed. */
export function sharedStepPaint(paints: readonly (StepPaint | undefined)[]): SharedStepPaint {
  const [first] = paints;
  return paints.every((paint) => sameStepPaint(paint, first))
    ? { mixed: false, paint: first }
    : { mixed: true };
}
