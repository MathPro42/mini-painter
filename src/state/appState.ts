import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { parseHexColor } from '../utils/color';
import { createPaintState } from './paintState';
import type { PaintState } from './paintState';
import { createPaletteState } from './paletteState';
import type { KeyValueStorage, PaletteState } from './paletteState';

export const DEFAULT_CUBE_COLOR = '#c8553d';

export interface AppState extends PaintState, PaletteState {
  /** Current cube color as lowercase `#rrggbb`. */
  readonly cubeColor: ReadonlySignal<string>;
  /** Sets the cube color. Throws a RangeError when `value` is not a hex color. */
  setCubeColor: (value: string) => void;
}

export interface AppStateOptions {
  /** Starting cube color; any hex form. Defaults to DEFAULT_CUBE_COLOR. */
  readonly cubeColor?: string;
  /** Keeps palettes between visits. Without it, palettes last until the page closes. */
  readonly storage?: KeyValueStorage | null;
}

/**
 * Creates the app's reactive state. Each call returns an independent store,
 * so tests never share state; the app creates exactly one in main.tsx.
 */
export function createAppState(options: AppStateOptions = {}): AppState {
  const cubeColor = signal(parseHexColor(options.cubeColor ?? DEFAULT_CUBE_COLOR));
  return {
    cubeColor,
    setCubeColor: (value) => {
      cubeColor.value = parseHexColor(value);
    },
    ...createPaintState(),
    ...createPaletteState(options.storage ?? null),
  };
}
