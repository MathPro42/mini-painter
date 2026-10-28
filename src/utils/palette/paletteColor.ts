import { normalizeHexColor } from '../color';

/** One named color in the user's palette. */
export interface PaletteColor {
  /** Display name, trimmed, single-spaced and never empty. */
  readonly name: string;
  /** Lowercase `#rrggbb`. */
  readonly color: string;
  /** Optional heading the color is listed under, such as "metallic". */
  readonly group?: string;
}

/** Unvalidated palette color, as typed by the user or read from a file. */
export interface PaletteColorInput {
  readonly name: string;
  readonly color: string;
  readonly group?: string | undefined;
}

/** One palette holds at most this many colors. */
export const MAX_PALETTE_COLORS = 2000;

/** Longer names and groups are cut to this many characters. */
export const MAX_PALETTE_TEXT_LENGTH = 80;

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
 * is blank. A blank group is dropped.
 */
export function normalizePaletteColor(input: PaletteColorInput): PaletteColor | null {
  const name = cleanPaletteText(input.name);
  const color = normalizeHexColor(input.color);
  if (name === '' || color === null) {
    return null;
  }
  const group = cleanPaletteText(input.group ?? '');
  return group === '' ? { name, color } : { name, color, group };
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
