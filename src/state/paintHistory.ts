import { batch, computed, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { createHistory, pushHistory, redoHistory, undoHistory } from '../utils/history';
import type { History } from '../utils/history';
import { sameRegionPaints } from '../utils/paint/regionPaint';
import type { RegionPaint } from '../utils/paint/regionPaint';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

/** Region paints with undo and redo. */
export interface PaintHistory {
  /** The committed steps; regionPaints may run ahead of `present` during a preview. */
  readonly history: ReadonlySignal<History<RegionPaints>>;
  readonly regionPaints: Signal<RegionPaints>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Shows `next` and records it as one undo step, unless nothing changed. */
  readonly commit: (next: RegionPaints) => void;
  /** Shows `next` without recording it. */
  readonly preview: (next: RegionPaints) => void;
  /** Replaces the whole history, showing its present. */
  readonly reset: (next: History<RegionPaints>) => void;
}

export function createPaintHistory(): PaintHistory {
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
    history,
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
    reset: (next) => {
      batch(() => {
        history.value = next;
        regionPaints.value = next.present;
      });
    },
  };
}
