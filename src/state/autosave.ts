import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { encodeAutosavedHistory, parseAutosavedHistory } from '../utils/work/autosaveFormat';
import type { PaintState } from './paintState';
import { createDrawingId } from './workStorage';
import type { WorkStorage } from './workStorage';

/** Keeps the current work in storage and brings it back on the next visit. */
export interface Autosave {
  /** `false` when work can't be kept (no storage, or the last save failed). */
  readonly workSaved: ReadonlySignal<boolean>;
  /** Settles once saved work is restored (or found missing); saving starts then. */
  readonly restored: Promise<void>;
  /** Writes any pending change now, e.g. when the page is hidden. */
  flush: () => Promise<void>;
  /** Stops saving. A pending change is dropped. */
  dispose: () => void;
}

export interface AutosaveOptions {
  /** How long changes settle before they are written. */
  readonly delayMs?: number;
}

/** Long enough to fold a burst of changes into one write, short enough to lose little. */
export const AUTOSAVE_DELAY_MS = 400;

/**
 * Restores the work `storage` holds into `state`, then saves the drawing and
 * its undo history after every committed change. Previews are not saved: they
 * change the paints, not the history. A drawing opened while the restore is
 * still loading wins over the restored one. Tabs share the storage: the last
 * save wins, but a drawing is never kept with another drawing's history.
 */
export function startAutosave(
  state: PaintState,
  storage: WorkStorage | null,
  options: AutosaveOptions = {},
): Autosave {
  if (storage === null) {
    return {
      workSaved: signal(false),
      restored: Promise.resolve(),
      flush: () => Promise.resolve(),
      dispose: () => undefined,
    };
  }
  const writer = createWriter(state, storage, options.delayMs ?? AUTOSAVE_DELAY_MS);
  let stopWatching: (() => void) | null = null;
  let disposed = false;
  const restored = restoreWork(state, storage, writer.markSaved).then(() => {
    if (!disposed) {
      stopWatching = effect(() => {
        writer.changed(state.svgSource.value, state.paintHistory.value);
      });
    }
  });
  return {
    workSaved: writer.workSaved,
    restored,
    flush: writer.flush,
    dispose: () => {
      disposed = true;
      stopWatching?.();
      writer.cancel();
    },
  };
}

/**
 * Restores saved work, and calls `markSaved` unless state then shows a
 * drawing that storage lacks: one the user opened while the restore loaded.
 */
async function restoreWork(
  state: PaintState,
  storage: WorkStorage,
  markSaved: Writer['markSaved'],
): Promise<void> {
  try {
    const saved = await storage.load();
    if (state.svg.peek() !== null) {
      // The user opened a drawing meanwhile: it wins, and is saved next.
      return;
    }
    if (saved === null) {
      markSaved(null);
      return;
    }
    const { past, present, future } = parseAutosavedHistory(saved.history);
    state.loadWork({ svgSource: saved.drawing, paints: present }, { past, future });
    markSaved(saved.drawingId);
  } catch (error) {
    console.warn('Could not restore the last drawing', error);
    // The work stays in storage until a drawing replaces it: a later version
    // may read what this one can't.
    if (state.svg.peek() === null) {
      markSaved(null);
    }
  }
}

interface Writer {
  readonly workSaved: ReadonlySignal<boolean>;
  /**
   * Treats what state shows now as already saved, under `drawingId`, the id
   * storage keeps its drawing under (`null` when state shows no drawing).
   */
  markSaved: (drawingId: string | null) => void;
  /** Schedules a save if the drawing or the history changed since the last one. */
  changed: (source: string | null, history: PaintState['paintHistory']['value']) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

function createWriter(state: PaintState, storage: WorkStorage, delayMs: number): Writer {
  const workSaved = signal(true);
  let savedSource: string | null | undefined;
  let savedHistory: unknown;
  // Names savedSource in storage. Comparing ids there, not drawings here,
  // catches another tab that saved its own drawing since this one wrote it.
  let drawingId = createDrawingId();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Writes run one after another, so an older one can never land last.
  let queue = Promise.resolve();

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const write = async (): Promise<void> => {
    const source = state.svgSource.peek();
    const history = state.paintHistory.peek();
    if (source !== savedSource) {
      drawingId = createDrawingId();
    }
    savedSource = source;
    savedHistory = history;
    try {
      if (source === null) {
        await storage.clear();
      } else {
        const text = encodeAutosavedHistory(history);
        await storage.save({ drawingId, drawing: source, history: text });
      }
      workSaved.value = true;
    } catch (error) {
      // A failed save changes nothing, and storage rewrites the drawing whenever it lacks it.
      console.warn('Could not save the drawing in this browser', error);
      workSaved.value = false;
    }
  };
  const flush = (): Promise<void> => {
    cancel();
    queue = queue.then(write);
    return queue;
  };
  return {
    workSaved,
    markSaved: (storedId) => {
      savedSource = state.svgSource.peek();
      savedHistory = state.paintHistory.peek();
      drawingId = storedId ?? drawingId;
    },
    changed: (source, history) => {
      if (source === savedSource && history === savedHistory) {
        return;
      }
      cancel();
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    },
    flush: () => (timer === null ? queue : flush()),
    cancel,
  };
}
