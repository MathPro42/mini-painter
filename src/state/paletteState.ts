import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import {
  MAX_PALETTE_COLORS,
  paletteColorKey,
  parsePaletteColor,
} from '../utils/palette/paletteColor';
import type { PaletteColor, PaletteColorInput } from '../utils/palette/paletteColor';

/** The named colors the user paints with. */
export interface PaletteState {
  /** Palette colors in the order they were added, without duplicates. */
  readonly palette: ReadonlySignal<readonly PaletteColor[]>;
  /**
   * Appends colors, skipping any already in the palette (same name, ignoring
   * case, and same color) and any past MAX_PALETTE_COLORS. Returns how many
   * were added. Throws a RangeError, adding nothing, if any input is invalid.
   */
  addPaletteColors: (colors: readonly PaletteColorInput[]) => number;
  /** Removes the color with the same name and color. Does nothing if there is none. */
  removePaletteColor: (color: PaletteColor) => void;
  clearPalette: () => void;
}

/** Creates the palette part of the app state. */
export function createPaletteState(): PaletteState {
  const palette = signal<readonly PaletteColor[]>([]);
  return {
    palette,
    addPaletteColors: (inputs) => {
      const parsed = inputs.map(parsePaletteColor);
      const current = palette.peek();
      const seen = new Set(current.map(paletteColorKey));
      const added: PaletteColor[] = [];
      for (const color of parsed) {
        const key = paletteColorKey(color);
        if (!seen.has(key) && current.length + added.length < MAX_PALETTE_COLORS) {
          seen.add(key);
          added.push(color);
        }
      }
      if (added.length > 0) {
        palette.value = [...current, ...added];
      }
      return added.length;
    },
    removePaletteColor: (color) => {
      const key = paletteColorKey(color);
      const next = palette.peek().filter((entry) => paletteColorKey(entry) !== key);
      if (next.length !== palette.peek().length) {
        palette.value = next;
      }
    },
    clearPalette: () => {
      palette.value = [];
    },
  };
}
