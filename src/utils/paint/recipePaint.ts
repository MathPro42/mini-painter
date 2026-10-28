import { paletteColorKey } from '../palette/paletteColor';
import type { PaletteColor } from '../palette/paletteColor';
import { TONE_STEPS } from './paintSteps';
import type { PaintStep } from './paintSteps';
import { stepPaintFromPalette } from './regionPaint';
import type { RegionPaint, StepPaint } from './regionPaint';

/** The paints for a color used as Base: that color, plus the tones its recipe names. */
export type RecipeBook = (color: PaletteColor) => RegionPaint;

/**
 * Builds a RecipeBook that looks recipe entries up in `colors`. Entries
 * naming colors that aren't there (since removed, say) are skipped.
 */
export function createRecipeBook(colors: readonly PaletteColor[]): RecipeBook {
  const byKey = new Map(colors.map((color) => [paletteColorKey(color), color]));
  return (color) => {
    const paint: Partial<Record<PaintStep, StepPaint>> = { base: stepPaintFromPalette(color) };
    for (const step of TONE_STEPS) {
      const key = color.recipe?.[step];
      const tone = key === undefined ? undefined : byKey.get(key);
      if (tone !== undefined) {
        paint[step] = stepPaintFromPalette(tone);
      }
    }
    return paint;
  };
}

// Washes and shades are see-through; as a base coat they make odd random schemes.
const WASH_GROUP = /shade|wash/i;

/**
 * Picks a random Base paint for each region from `colors`, preferring paints
 * that aren't shades or washes when there are any. With `withRecipes`, each
 * Base brings the tones its recipe names. `random` returns a number in
 * [0, 1), like Math.random, so tests can pass a seeded one. Returns an empty
 * map when there are no colors.
 */
export function randomRegionPaints(
  regionIds: readonly string[],
  colors: readonly PaletteColor[],
  random: () => number,
  withRecipes: boolean,
): Map<string, RegionPaint> {
  const opaque = colors.filter(
    (color) => !WASH_GROUP.test(color.group ?? '') && color.opacity === undefined,
  );
  const pool = opaque.length > 0 ? opaque : colors;
  const book = withRecipes ? createRecipeBook(colors) : null;
  const result = new Map<string, RegionPaint>();
  for (const id of regionIds) {
    const color = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (color !== undefined) {
      result.set(id, book === null ? { base: stepPaintFromPalette(color) } : book(color));
    }
  }
  return result;
}
