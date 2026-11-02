import { batch, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { createHistory } from '../utils/history';
import type { History } from '../utils/history';
import { randomRegionPaints } from '../utils/paint/recipePaint';
import { PAINT_STEPS, parseStepPaint, withStep } from '../utils/paint/regionPaint';
import type { PaintStep, RegionPaint, StepPaint } from '../utils/paint/regionPaint';
import type { PaletteColor } from '../utils/palette/paletteColor';
import { parseSvg } from '../utils/svg/parseSvg';
import type { ParsedSvg } from '../utils/svg/types';
import type { SavedWork } from '../utils/work/savedWork';
import { createPaintHistory } from './paintHistory';
import type { PaintHistory } from './paintHistory';
import { createRegionSelection, requireRegion } from './regionSelection';
import type { RegionSelection } from './regionSelection';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

/** The uploaded drawing, the selected regions, the paints on it, and their undo history. */
export interface PaintState extends RegionSelection {
  /** The uploaded SVG split into paintable regions, or `null` before any upload. */
  readonly svg: ReadonlySignal<ParsedSvg | null>;
  /** The markup `svg` was parsed from, kept so the work can be saved. */
  readonly svgSource: ReadonlySignal<string | null>;
  /**
   * Committed paints with their undo and redo steps; regionPaints may run
   * ahead of `present` while a paint is previewed.
   */
  readonly paintHistory: ReadonlySignal<History<RegionPaints>>;
  /**
   * Paints the user applied, keyed by region id. A region without a Base
   * keeps its original fill.
   */
  readonly regionPaints: ReadonlySignal<RegionPaints>;
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
  /**
   * Opens saved work: its drawing as loadSvg does, with its paints as the
   * present. `undo` restores the steps around it; without it there is
   * nothing to undo. Throws a RangeError, changing nothing, when the drawing
   * is invalid or any paint is invalid or names an unknown region.
   */
  loadWork: (work: SavedWork, undo?: UndoSteps) => void;
  /** Closes the drawing, back to the empty view, with nothing to undo. */
  closeDrawing: () => void;
  /** Chooses the step to paint. Not an undo step. Throws a RangeError for unknown steps. */
  setActiveStep: (step: PaintStep) => void;
  /**
   * Sets one step of each listed region's paint, or clears it with `null`,
   * as one undo step however many regions there are. Setting what is already
   * there is not a step. Throws a RangeError, changing nothing, for unknown
   * ids or invalid colors.
   */
  setRegionsStep: (ids: readonly string[], step: PaintStep, paint: StepPaint | null) => void;
  /**
   * Replaces all of each listed region's paints, as one undo step; an empty
   * paint clears the regions. Throws like setRegionsStep.
   */
  setRegionsPaint: (ids: readonly string[], paint: RegionPaint) => void;
  /** Turns recipes on or off for Base picks and Randomize. Not an undo step. */
  setUseRecipes: (on: boolean) => void;
  /**
   * Shows a paint without recording an undo step, for live feedback while
   * the user is still choosing. The next setRegionsStep records the change;
   * undo discards it. Throws like setRegionsStep.
   */
  previewRegionsStep: (ids: readonly string[], step: PaintStep, paint: StepPaint) => void;
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

/** The undo and redo steps around a present, as History keeps them. */
export type UndoSteps = Pick<History<RegionPaints>, 'past' | 'future'>;

/** Creates the drawing and painting part of the app state. */
export function createPaintState(): PaintState {
  const svg = signal<ParsedSvg | null>(null);
  const svgSource = signal<string | null>(null);
  const { clear: clearSelection, ...selection } = createRegionSelection(svg);
  const activeStep = signal<PaintStep>('base');
  const useRecipes = signal(true);
  const paints = createPaintHistory();
  const show: Show = (parsed, source, history) => {
    // One update, so subscribers never see the new drawing with old paints.
    batch(() => {
      svg.value = parsed;
      svgSource.value = source;
      paints.reset(history);
      clearSelection();
      activeStep.value = 'base';
    });
  };

  return {
    svg,
    svgSource,
    paintHistory: paints.history,
    regionPaints: paints.regionPaints,
    ...selection,
    activeStep,
    useRecipes,
    ...createDrawingActions(show),
    setActiveStep: (step) => {
      if (!PAINT_STEPS.includes(step)) {
        throw new RangeError(`Not a paint step: "${step}"`);
      }
      activeStep.value = step;
    },
    ...createPaintActions(paints, (id) => requireRegion(svg.peek(), id)),
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

type Show = (
  parsed: ParsedSvg | null,
  source: string | null,
  history: History<RegionPaints>,
) => void;

/** Opening and closing drawings; `show` makes one current with its paint history. */
function createDrawingActions(
  show: Show,
): Pick<PaintState, 'loadSvg' | 'loadWork' | 'closeDrawing'> {
  return {
    loadSvg: (source) => {
      show(parseSvg(source), source, createHistory(new Map()));
    },
    loadWork: (work, undo = { past: [], future: [] }) => {
      const parsed = parseSvg(work.svgSource);
      const restore = createSnapshotReader(parsed);
      show(parsed, work.svgSource, {
        past: undo.past.map(restore),
        present: restore(work.paints),
        future: undo.future.map(restore),
      });
    },
    closeDrawing: () => {
      show(null, null, createHistory(new Map()));
    },
  };
}

type PaintActions = Pick<PaintState, 'setRegionsStep' | 'setRegionsPaint' | 'previewRegionsStep'>;

/** The ways to paint regions; `requireRegion` throws for ids not in the drawing. */
function createPaintActions(
  paints: PaintHistory,
  requireRegion: (id: string) => string,
): PaintActions {
  const withRegionsStep = (
    ids: readonly string[],
    step: PaintStep,
    paint: StepPaint | null,
  ): RegionPaints => {
    const parsed = paint && parseStepPaint(paint);
    const current = paints.regionPaints.peek();
    return withRegions(current, ids.map(requireRegion), (id) =>
      withStep(current.get(id), step, parsed),
    );
  };
  return {
    setRegionsStep: (ids, step, paint) => {
      paints.commit(withRegionsStep(ids, step, paint));
    },
    setRegionsPaint: (ids, paint) => {
      const region = parseRegionPaint(paint);
      paints.commit(withRegions(paints.regionPaints.peek(), ids.map(requireRegion), () => region));
    },
    previewRegionsStep: (ids, step, paint) => {
      paints.preview(withRegionsStep(ids, step, paint));
    },
  };
}

/** A copy of `paints` with each of `ids` set to `paintOf(id)`; empty regions are dropped. */
function withRegions(
  paints: RegionPaints,
  ids: readonly string[],
  paintOf: (id: string) => RegionPaint,
): RegionPaints {
  const next = new Map(paints);
  for (const id of ids) {
    const region = paintOf(id);
    if (Object.keys(region).length === 0) {
      next.delete(id);
    } else {
      next.set(id, region);
    }
  }
  return next;
}

/**
 * Validates snapshots of a drawing's paints: every id must name one of its
 * regions. A region paint shared by several snapshots stays shared, so
 * restored histories keep their small size.
 */
function createSnapshotReader(svg: ParsedSvg): (paints: RegionPaints) => RegionPaints {
  const parsed = new Map<RegionPaint, RegionPaint>();
  const parseShared = (paint: RegionPaint): RegionPaint => {
    const known = parsed.get(paint) ?? parseRegionPaint(paint);
    parsed.set(paint, known);
    return known;
  };
  return (paints) =>
    new Map(Array.from(paints, ([id, paint]) => [requireRegion(svg, id), parseShared(paint)]));
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
