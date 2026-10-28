import { parseHexColor } from '../color';
import type { PaletteColor } from '../palette/paletteColor';

/**
 * The four steps of painting a part, in the order they go on: a base coat,
 * a layer over it, a shade in the recesses and a highlight on the edges.
 */
export type PaintStep = 'base' | ToneStep;

/** The steps after the base coat, each shown only where the drawing's mask for it allows. */
export type ToneStep = 'layer' | 'shade' | 'highlight';

export const TONE_STEPS: readonly ToneStep[] = ['layer', 'shade', 'highlight'];
export const PAINT_STEPS: readonly PaintStep[] = ['base', ...TONE_STEPS];

/** Display names, also used in hints ("Pick a Shade paint"). */
export const PAINT_STEP_LABELS: Readonly<Record<PaintStep, string>> = {
  base: 'Base',
  layer: 'Layer',
  shade: 'Shade',
  highlight: 'Highlight',
};

/** The paint used for one step. */
export interface StepPaint {
  /** Lowercase `#rrggbb`. */
  readonly color: string;
  /** Palette name, when the paint came from a palette. */
  readonly name?: string;
  /** Metallic paints get a sheen in the render. */
  readonly metallic?: boolean;
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
 * name is dropped. Throws a RangeError for an invalid color.
 */
export function parseStepPaint(paint: StepPaint): StepPaint {
  const color = parseHexColor(paint.color);
  const name = paint.name?.trim() ?? '';
  return {
    color,
    ...(name === '' ? {} : { name }),
    ...(paint.metallic === true ? { metallic: true } : {}),
  };
}

/** Builds the step paint for a palette color. */
export function stepPaintFromPalette(color: PaletteColor): StepPaint {
  return {
    color: color.color,
    name: color.name,
    ...(isMetallicPaint(color) ? { metallic: true } : {}),
  };
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
    a.color === b.color && a.name === b.name && (a.metallic ?? false) === (b.metallic ?? false)
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

// Washes and shades are see-through; as a base coat they make odd random schemes.
const WASH_GROUP = /shade|wash/i;

/**
 * Picks a random Base paint for each region from `colors`, preferring paints
 * that aren't shades or washes when there are any. `random` returns a number
 * in [0, 1), like Math.random, so tests can pass a seeded one. Returns an
 * empty map when there are no colors.
 */
export function randomBasePaints(
  regionIds: readonly string[],
  colors: readonly PaletteColor[],
  random: () => number,
): Map<string, StepPaint> {
  const opaque = colors.filter((color) => !WASH_GROUP.test(color.group ?? ''));
  const pool = opaque.length > 0 ? opaque : colors;
  const result = new Map<string, StepPaint>();
  for (const id of regionIds) {
    const color = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (color !== undefined) {
      result.set(id, stepPaintFromPalette(color));
    }
  }
  return result;
}
