import { batch, computed, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { createHistory, pushHistory, redoHistory, undoHistory } from '../utils/history';
import type { History } from '../utils/history';
import { randomRegionPaints } from '../utils/paint/recipePaint';
import {
  PAINT_STEPS,
  parseStepPaint,
  sameRegionPaints,
  withStep,
} from '../utils/paint/regionPaint';
import type { PaintStep, RegionPaint, StepPaint } from '../utils/paint/regionPaint';
import type { PaletteColor } from '../utils/palette/paletteColor';
import { parseSvg } from '../utils/svg/parseSvg';
import type { ParsedSvg } from '../utils/svg/types';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

/** The uploaded drawing, the paints on it, and their undo history. */
export interface PaintState {
  /** The uploaded SVG split into paintable regions, or `null` before any upload. */
  readonly svg: ReadonlySignal<ParsedSvg | null>;
  /**
   * Paints the user applied, keyed by region id. A region without a Base
   * keeps its original fill.
   */
  readonly regionPaints: ReadonlySignal<RegionPaints>;
  /** Id of the region being painted, or `null`. */
  readonly selectedRegionId: ReadonlySignal<string | null>;
  /** The step palette picks and the color picker apply to. */
  readonly activeStep: ReadonlySignal<PaintStep>;
  /** Whether Base picks and Randomize also use the tones a paint's recipe names. On at first. */
  readonly useRecipes: ReadonlySignal<boolean>;
  /**
   * Parses SVG markup and makes it the current drawing, clearing paints,
   * selection and undo history, and going back to the Base step. Throws a
   * RangeError (and keeps the current drawing) when the markup is invalid or
   * has nothing paintable.
   */
  loadSvg: (source: string) => void;
  /** Selects a region, or clears the selection with `null`. Throws a RangeError for unknown ids. */
  selectRegion: (id: string | null) => void;
  /** Chooses the step to paint. Not an undo step. Throws a RangeError for unknown steps. */
  setActiveStep: (step: PaintStep) => void;
  /**
   * Sets one step of a region's paint, or clears it with `null`, as one undo
   * step. Setting what is already there is not a step. Throws a RangeError
   * for unknown ids or invalid colors.
   */
  setRegionStep: (id: string, step: PaintStep, paint: StepPaint | null) => void;
  /**
   * Replaces all of a region's paints, as one undo step; an empty paint
   * clears the region. Throws like setRegionStep.
   */
  setRegionPaint: (id: string, paint: RegionPaint) => void;
  /** Turns recipes on or off for Base picks and Randomize. Not an undo step. */
  setUseRecipes: (on: boolean) => void;
  /**
   * Shows a paint without recording an undo step, for live feedback while
   * the user is still choosing. The next setRegionStep records the change;
   * undo discards it. Throws like setRegionStep.
   */
  previewRegionStep: (id: string, step: PaintStep, paint: StepPaint) => void;
  /**
   * Gives every region a random Base from `colors`, plus that paint's recipe
   * tones when useRecipes is on, and clears its other steps, as one undo
   * step. Does nothing without a drawing or colors. `random` defaults to
   * Math.random.
   */
  randomizeRegions: (colors: readonly PaletteColor[], random?: () => number) => void;
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
  const selectedRegionId = signal<string | null>(null);
  const activeStep = signal<PaintStep>('base');
  const useRecipes = signal(true);
  const paints = createPaintHistory();

  const requireRegion = (id: string): string => {
    if (svg.peek()?.regions.some((region) => region.id === id) !== true) {
      throw new RangeError(`No region with id "${id}" in the current SVG`);
    }
    return id;
  };

  return {
    svg,
    regionPaints: paints.regionPaints,
    selectedRegionId,
    activeStep,
    useRecipes,
    loadSvg: (source) => {
      const parsed = parseSvg(source);
      // One update, so subscribers never see the new drawing with old paints.
      batch(() => {
        svg.value = parsed;
        paints.reset();
        selectedRegionId.value = null;
        activeStep.value = 'base';
      });
    },
    selectRegion: (id) => {
      selectedRegionId.value = id === null ? null : requireRegion(id);
    },
    setActiveStep: (step) => {
      if (!PAINT_STEPS.includes(step)) {
        throw new RangeError(`Not a paint step: "${step}"`);
      }
      activeStep.value = step;
    },
    ...createPaintActions(paints, requireRegion),
    setUseRecipes: (on) => {
      useRecipes.value = on;
    },
    randomizeRegions: (colors, random = Math.random) => {
      const ids = svg.peek()?.regions.map((region) => region.id) ?? [];
      const picks = randomRegionPaints(ids, colors, random, useRecipes.peek());
      if (picks.size > 0) {
        paints.commit(picks);
      }
    },
    canUndo: paints.canUndo,
    canRedo: paints.canRedo,
    undo: paints.undo,
    redo: paints.redo,
  };
}

type PaintActions = Pick<PaintState, 'setRegionStep' | 'setRegionPaint' | 'previewRegionStep'>;

/** The ways to paint a region; `requireRegion` throws for ids not in the drawing. */
function createPaintActions(
  paints: PaintHistory,
  requireRegion: (id: string) => string,
): PaintActions {
  const withRegionStep = (id: string, step: PaintStep, paint: StepPaint | null): RegionPaints => {
    const current = paints.regionPaints.peek();
    const region = withStep(current.get(id), step, paint && parseStepPaint(paint));
    return withRegion(current, requireRegion(id), region);
  };
  return {
    setRegionStep: (id, step, paint) => {
      paints.commit(withRegionStep(id, step, paint));
    },
    setRegionPaint: (id, paint) => {
      const region = parseRegionPaint(paint);
      paints.commit(withRegion(paints.regionPaints.peek(), requireRegion(id), region));
    },
    previewRegionStep: (id, step, paint) => {
      paints.preview(withRegionStep(id, step, paint));
    },
  };
}

/** A copy of `paints` with region `id` set to `region`; an empty region is dropped. */
function withRegion(paints: RegionPaints, id: string, region: RegionPaint): RegionPaints {
  const next = new Map(paints);
  if (Object.keys(region).length === 0) {
    next.delete(id);
  } else {
    next.set(id, region);
  }
  return next;
}

/** Validates every step of a region paint. Throws a RangeError for an invalid color. */
function parseRegionPaint(paint: RegionPaint): RegionPaint {
  let parsed: RegionPaint = {};
  for (const step of PAINT_STEPS) {
    const stepPaint = paint[step];
    if (stepPaint !== undefined) {
      parsed = withStep(parsed, step, parseStepPaint(stepPaint));
    }
  }
  return parsed;
}

interface PaintHistory {
  readonly regionPaints: Signal<RegionPaints>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Shows `next` and records it as one undo step, unless nothing changed. */
  readonly commit: (next: RegionPaints) => void;
  /** Shows `next` without recording it. */
  readonly preview: (next: RegionPaints) => void;
  /** Starts over with no paints and nothing to undo. */
  readonly reset: () => void;
}

function createPaintHistory(): PaintHistory {
  const regionPaints = signal<RegionPaints>(new Map());
  // `present` is the last committed paints; regionPaints may run ahead of it during a preview.
  const history = signal<History<RegionPaints>>(createHistory(regionPaints.peek()));
  const travel = (step: (current: History<RegionPaints>) => History<RegionPaints>): void => {
    const next = step(history.peek());
    batch(() => {
      history.value = next;
      regionPaints.value = next.present;
    });
  };
  return {
    regionPaints,
    canUndo: computed(() => history.value.past.length > 0),
    canRedo: computed(() => history.value.future.length > 0),
    undo: () => {
      travel(undoHistory);
    },
    redo: () => {
      travel(redoHistory);
    },
    commit: (next) => {
      const current = history.peek();
      batch(() => {
        if (!sameRegionPaints(next, current.present)) {
          history.value = pushHistory(current, next);
        }
        regionPaints.value = next;
      });
    },
    preview: (next) => {
      regionPaints.value = next;
    },
    reset: () => {
      const empty: RegionPaints = new Map();
      batch(() => {
        history.value = createHistory(empty);
        regionPaints.value = empty;
      });
    },
  };
}
