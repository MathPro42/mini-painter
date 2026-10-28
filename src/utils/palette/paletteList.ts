import { MAX_PALETTE_COLORS, paletteColorKey } from './paletteColor';
import type { PaletteColor } from './paletteColor';

/** Colors listed under one heading. `group` is `null` for colors without one. */
export interface PaletteGroup {
  readonly group: string | null;
  readonly colors: readonly PaletteColor[];
}

/**
 * Appends the colors not already present (same name, ignoring case, and same
 * color), up to MAX_PALETTE_COLORS. Returns `existing` itself when nothing is new.
 */
export function appendPaletteColors(
  existing: readonly PaletteColor[],
  additions: readonly PaletteColor[],
): readonly PaletteColor[] {
  const seen = new Set(existing.map(paletteColorKey));
  const added: PaletteColor[] = [];
  for (const color of additions) {
    const key = paletteColorKey(color);
    if (!seen.has(key) && existing.length + added.length < MAX_PALETTE_COLORS) {
      seen.add(key);
      added.push(color);
    }
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

/**
 * Keeps the colors whose name contains every word of `query`, ignoring case
 * and accents ("grune wie" finds "grüne Wiese"). A blank query keeps all.
 */
export function filterPalette(
  colors: readonly PaletteColor[],
  query: string,
): readonly PaletteColor[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return colors;
  }
  return colors.filter((color) => {
    const name = foldText(color.name);
    return words.every((word) => name.includes(word));
  });
}

/** Splits colors by group, in order of each group's first color. */
export function groupPalette(colors: readonly PaletteColor[]): PaletteGroup[] {
  const groups = new Map<string | null, PaletteColor[]>();
  for (const color of colors) {
    const group = color.group ?? null;
    const members = groups.get(group);
    if (members === undefined) {
      groups.set(group, [color]);
    } else {
      members.push(color);
    }
  }
  return Array.from(groups, ([group, members]) => ({ group, colors: members }));
}

/** Maps each color value to the name of the first palette color with it. */
export function paletteNamesByColor(colors: readonly PaletteColor[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const color of colors) {
    if (!names.has(color.color)) {
      names.set(color.color, color.name);
    }
  }
  return names;
}

function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
