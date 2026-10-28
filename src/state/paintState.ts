import { batch, computed, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { parseHexColor } from '../utils/color';
import { createHistory, pushHistory, redoHistory, undoHistory } from '../utils/history';
import type { History } from '../utils/history';
import { parseSvg } from '../utils/svg/parseSvg';
import type { ParsedSvg } from '../utils/svg/types';

type RegionColors = ReadonlyMap<string, string>;

/** The uploaded drawing, the colors painted on it, and their undo history. */
export interface PaintState {
  /** The uploaded SVG split into paintable regions, or `null` before any upload. */
  readonly svg: ReadonlySignal<ParsedSvg | null>;
  /**
   * Colors the user assigned, as lowercase `#rrggbb` keyed by region id.
   * Regions without an entry keep their original fill.
   */
  readonly regionColors: ReadonlySignal<RegionColors>;
  /** Id of the region being painted, or `null`. */
  readonly selectedRegionId: ReadonlySignal<string | null>;
  /**
   * Parses SVG markup and makes it the current drawing, clearing colors,
   * selection and undo history. Throws a RangeError (and keeps the current
   * drawing) when the markup is invalid or has nothing paintable.
   */
  loadSvg: (source: string) => void;
  /** Selects a region, or clears the selection with `null`. Throws a RangeError for unknown ids. */
  selectRegion: (id: string | null) => void;
  /**
   * Paints a region as one undoable step. Throws a RangeError for unknown ids
   * or invalid colors. Painting a region the color it already has is not a step.
   */
  setRegionColor: (id: string, color: string) => void;
  /**
   * Shows a color on a region without recording an undo step, for live
   * feedback while the user is still choosing. The next setRegionColor
   * records the change; undo discards it. Throws like setRegionColor.
   */
  previewRegionColor: (id: string, color: string) => void;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  /** Reverts the last painting step. Does nothing when there is none. */
  undo: () => void;
  /** Re-applies the last undone step. Does nothing when there is none. */
  redo: () => void;
}

/** Creates the drawing and painting part of the app state. */
export function createPaintState(): PaintState {
  const svg = signal<ParsedSvg | null>(null);
  const regionColors = signal<RegionColors>(new Map());
  const selectedRegionId = signal<string | null>(null);
  // `present` is the last committed colors; regionColors may run ahead of it during a preview.
  const history = signal<History<RegionColors>>(createHistory(regionColors.peek()));

  const requireRegion = (id: string): string => {
    if (svg.peek()?.regions.some((region) => region.id === id) !== true) {
      throw new RangeError(`No region with id "${id}" in the current SVG`);
    }
    return id;
  };

  const withColor = (id: string, color: string): RegionColors =>
    new Map(regionColors.peek()).set(requireRegion(id), parseHexColor(color));

  const travel = (step: (current: History<RegionColors>) => History<RegionColors>): void => {
    const next = step(history.peek());
    batch(() => {
      history.value = next;
      regionColors.value = next.present;
    });
  };

  return {
    svg,
    regionColors,
    selectedRegionId,
    loadSvg: (source) => {
      const parsed = parseSvg(source);
      const colors: RegionColors = new Map();
      // One update, so subscribers never see the new drawing with old colors.
      batch(() => {
        svg.value = parsed;
        regionColors.value = colors;
        selectedRegionId.value = null;
        history.value = createHistory(colors);
      });
    },
    selectRegion: (id) => {
      selectedRegionId.value = id === null ? null : requireRegion(id);
    },
    setRegionColor: (id, color) => {
      const next = withColor(id, color);
      const current = history.peek();
      batch(() => {
        if (!sameColors(next, current.present)) {
          history.value = pushHistory(current, next);
        }
        regionColors.value = next;
      });
    },
    previewRegionColor: (id, color) => {
      regionColors.value = withColor(id, color);
    },
    canUndo: computed(() => history.value.past.length > 0),
    canRedo: computed(() => history.value.future.length > 0),
    undo: () => {
      travel(undoHistory);
    },
    redo: () => {
      travel(redoHistory);
    },
  };
}

function sameColors(a: RegionColors, b: RegionColors): boolean {
  return a.size === b.size && [...a].every(([id, color]) => b.get(id) === color);
}
