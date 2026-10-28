import { cleanPaletteText } from './paletteColor';

/** Name of a palette started by adding a color by hand, and of palettes whose name is blank. */
export const DEFAULT_PALETTE_NAME = 'My colors';

/** Tidies a palette name like a color name, falling back to DEFAULT_PALETTE_NAME when blank. */
export function normalizePaletteName(name: string): string {
  const cleaned = cleanPaletteText(name);
  return cleaned === '' ? DEFAULT_PALETTE_NAME : cleaned;
}

/** Names a palette after the file it came from, without the extension ("base coats.xlsx" → "base coats"). */
export function paletteNameFromFile(fileName: string): string {
  return normalizePaletteName(fileName.replace(/(?<=.)\.[^.]*$/, ''));
}

/**
 * Returns `name`, or `name (2)`, `name (3)`… when it is taken (ignoring
 * case), so every palette in the list can be told apart.
 */
export function uniquePaletteName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((existing) => existing.toLowerCase()));
  let candidate = name;
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix += 1) {
    candidate = `${name} (${String(suffix)})`;
  }
  return candidate;
}
