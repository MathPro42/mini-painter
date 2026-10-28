import { normalizePaletteColor } from './paletteColor';
import type { PaletteColor } from './paletteColor';
import { appendPaletteColors } from './paletteList';
import { normalizePaletteName } from './paletteNames';

/** Bump when the saved shape changes, and teach normalizeSavedPalettes to read the old one. */
export const SAVED_PALETTES_VERSION = 1;

export interface SavedPalette {
  readonly name: string;
  readonly colors: readonly PaletteColor[];
}

/** Everything that is kept between visits. */
export interface SavedPalettes {
  readonly palettes: readonly SavedPalette[];
  /** Index of the palette in use, or -1 when there are none. */
  readonly activeIndex: number;
}

/** Serializes palettes as versioned JSON, for browser storage. */
export function encodeSavedPalettes(saved: SavedPalettes): string {
  return JSON.stringify({
    version: SAVED_PALETTES_VERSION,
    activeIndex: saved.activeIndex,
    palettes: saved.palettes.map(({ name, colors }) => ({ name, colors })),
  });
}

/**
 * Reads what encodeSavedPalettes wrote. Returns `null` when the text is not
 * that format at all. Inside it, anything unusable (a color that isn't hex,
 * a palette that isn't an object) is dropped rather than failing the rest,
 * since the text may have been edited or damaged outside the app.
 */
export function normalizeSavedPalettes(text: string): SavedPalettes | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(data) ||
    data['version'] !== SAVED_PALETTES_VERSION ||
    !Array.isArray(data['palettes'])
  ) {
    return null;
  }
  const palettes = data['palettes'].filter(isRecord).map(readPalette);
  const index = data['activeIndex'];
  const valid =
    typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < palettes.length;
  return { palettes, activeIndex: valid ? index : Math.min(0, palettes.length - 1) };
}

function readPalette(entry: Readonly<Record<string, unknown>>): SavedPalette {
  const colors: PaletteColor[] = [];
  for (const color of Array.isArray(entry['colors']) ? entry['colors'] : []) {
    const normalized = isRecord(color) ? readColor(color) : null;
    if (normalized !== null) {
      colors.push(normalized);
    }
  }
  return {
    name: normalizePaletteName(asString(entry['name'])),
    colors: appendPaletteColors([], colors),
  };
}

function readColor(color: Readonly<Record<string, unknown>>): PaletteColor | null {
  return normalizePaletteColor({
    name: asString(color['name']),
    color: asString(color['color']),
    group: asString(color['group']),
    opacity: color['opacity'],
    recipe: color['recipe'],
  });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
