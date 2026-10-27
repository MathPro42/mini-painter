import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { parseHexColor } from '../utils/color';

export const DEFAULT_CUBE_COLOR = '#c8553d';

export interface AppState {
  /** Current cube color as lowercase `#rrggbb`. */
  readonly cubeColor: ReadonlySignal<string>;
  /** Sets the cube color. Throws a RangeError when `value` is not a hex color. */
  setCubeColor: (value: string) => void;
}

/**
 * Creates the app's reactive state. Each call returns an independent store,
 * so tests never share state; the app creates exactly one in main.tsx.
 */
export function createAppState(initialCubeColor: string = DEFAULT_CUBE_COLOR): AppState {
  const cubeColor = signal(parseHexColor(initialCubeColor));
  return {
    cubeColor,
    setCubeColor: (value) => {
      cubeColor.value = parseHexColor(value);
    },
  };
}
