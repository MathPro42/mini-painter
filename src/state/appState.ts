import { batch, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { parseHexColor } from '../utils/color';
import { parseSvg } from '../utils/svg/parseSvg';
import type { ParsedSvg } from '../utils/svg/types';

export const DEFAULT_CUBE_COLOR = '#c8553d';

export interface AppState {
  /** Current cube color as lowercase `#rrggbb`. */
  readonly cubeColor: ReadonlySignal<string>;
  /** Sets the cube color. Throws a RangeError when `value` is not a hex color. */
  setCubeColor: (value: string) => void;

  /** The uploaded SVG split into paintable regions, or `null` before any upload. */
  readonly svg: ReadonlySignal<ParsedSvg | null>;
  /**
   * Colors the user assigned, as lowercase `#rrggbb` keyed by region id.
   * Regions without an entry keep their original fill.
   */
  readonly regionColors: ReadonlySignal<ReadonlyMap<string, string>>;
  /** Id of the region being painted, or `null`. */
  readonly selectedRegionId: ReadonlySignal<string | null>;
  /**
   * Parses SVG markup and makes it the current drawing, clearing colors and
   * selection. Throws a RangeError (and keeps the current drawing) when the
   * markup is invalid or has nothing paintable.
   */
  loadSvg: (source: string) => void;
  /** Selects a region, or clears the selection with `null`. Throws a RangeError for unknown ids. */
  selectRegion: (id: string | null) => void;
  /** Assigns a color to a region. Throws a RangeError for unknown ids or invalid colors. */
  setRegionColor: (id: string, color: string) => void;
}

type SvgState = Pick<
  AppState,
  'svg' | 'regionColors' | 'selectedRegionId' | 'loadSvg' | 'selectRegion' | 'setRegionColor'
>;

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
    ...createSvgState(),
  };
}

function createSvgState(): SvgState {
  const svg = signal<ParsedSvg | null>(null);
  const regionColors = signal<ReadonlyMap<string, string>>(new Map());
  const selectedRegionId = signal<string | null>(null);

  const requireRegion = (id: string): string => {
    if (svg.peek()?.regions.some((region) => region.id === id) !== true) {
      throw new RangeError(`No region with id "${id}" in the current SVG`);
    }
    return id;
  };

  return {
    svg,
    regionColors,
    selectedRegionId,
    loadSvg: (source) => {
      const parsed = parseSvg(source);
      // One update, so subscribers never see the new drawing with old colors.
      batch(() => {
        svg.value = parsed;
        regionColors.value = new Map();
        selectedRegionId.value = null;
      });
    },
    selectRegion: (id) => {
      selectedRegionId.value = id === null ? null : requireRegion(id);
    },
    setRegionColor: (id, color) => {
      const next = new Map(regionColors.peek());
      next.set(requireRegion(id), parseHexColor(color));
      regionColors.value = next;
    },
  };
}
