import { normalizeHexColor, normalizeOpacity } from '../color';
import { TONE_STEPS } from '../paint/paintSteps';
import type { ToneStep } from '../paint/paintSteps';

/**
 * The paints a palette suggests on top of a color used as Base, each the
 * paletteColorKey of another color in the same palette.
 */
export type PaletteRecipe = Readonly<Partial<Record<ToneStep, string>>>;

/** One named color in the user's palette. */
export interface PaletteColor {
  /** Display name, trimmed, single-spaced and never empty. */
  readonly name: string;
  /** Lowercase `#rrggbb`. */
  readonly color: string;
  /** Optional heading the color is listed under, such as "metallic". */
  readonly group?: string;
  /** See-through paints (washes), strictly between 0 and 1. Missing means opaque. */
  readonly opacity?: number;
  /** Paints that go on top of this one, when it is used as a Base. */
  readonly recipe?: PaletteRecipe;
}

/** Unvalidated palette color, as typed by the user or read from a file. */
export interface PaletteColorInput {
  readonly name: string;
  readonly color: string;
  readonly group?: string | undefined;
  readonly opacity?: unknown;
  readonly recipe?: unknown;
}

/** One palette holds at most this many colors. */
export const MAX_PALETTE_COLORS = 2000;

/** Longer names and groups are cut to this many characters. */
export const MAX_PALETTE_TEXT_LENGTH = 80;

/** Longer recipe references can't be a color key ("name #rrggbb") and are dropped. */
const MAX_RECIPE_KEY_LENGTH = MAX_PALETTE_TEXT_LENGTH + 8;

// Control characters would make an exported file invalid XML.
// eslint-disable-next-line no-control-regex
const UNPRINTABLE_OR_SPACE = /[\s\u0000-\u001f\u007f]+/g;

/** Collapses whitespace and control characters to single spaces, trims, and caps the length. */
export function cleanPaletteText(value: string): string {
  return value.replace(UNPRINTABLE_OR_SPACE, ' ').trim().slice(0, MAX_PALETTE_TEXT_LENGTH).trim();
}

/**
 * Normalizes a palette color: tidies the name and group, and the color to
 * lowercase `#rrggbb`. Returns `null` when the color is not hex or the name
 * is blank. A blank group, an opacity that isn't see-through, and recipe
 * entries that aren't color keys or point at the color itself are dropped.
 */
export function normalizePaletteColor(input: PaletteColorInput): PaletteColor | null {
  const name = cleanPaletteText(input.name);
  const color = normalizeHexColor(input.color);
  if (name === '' || color === null) {
    return null;
  }
  const group = cleanPaletteText(input.group ?? '');
  const opacity = normalizeOpacity(input.opacity);
  const recipe = normalizeRecipe(input.recipe, paletteColorKey({ name, color }));
  return {
    name,
    color,
    ...(group === '' ? {} : { group }),
    ...(opacity === null ? {} : { opacity }),
    ...(recipe === null ? {} : { recipe }),
  };
}

/** Like normalizePaletteColor, but throws a RangeError instead of returning `null`. */
export function parsePaletteColor(input: PaletteColorInput): PaletteColor {
  const normalized = normalizePaletteColor(input);
  if (normalized === null) {
    throw new RangeError(`Not a palette color: "${input.name}" ${input.color}`);
  }
  return normalized;
}

/**
 * Identity of a palette color: same name (ignoring case) and same color.
 * Two entries with the same key are duplicates.
 */
export function paletteColorKey(color: PaletteColor): string {
  return `${color.name.toLowerCase()} ${color.color}`;
}

function normalizeRecipe(value: unknown, ownKey: string): PaletteRecipe | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const recipe: Partial<Record<ToneStep, string>> = {};
  for (const step of TONE_STEPS) {
    const key: unknown = (value as Readonly<Record<string, unknown>>)[step];
    if (typeof key === 'string' && isRecipeKey(key, ownKey)) {
      recipe[step] = key;
    }
  }
  return Object.keys(recipe).length === 0 ? null : recipe;
}

function isRecipeKey(key: string, ownKey: string): boolean {
  return key !== '' && key !== ownKey && key.length <= MAX_RECIPE_KEY_LENGTH;
}
