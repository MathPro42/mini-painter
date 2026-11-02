import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { encodeAutosavedHistory, parseAutosavedHistory } from '../utils/work/autosaveFormat';
import type { PaintState } from './paintState';
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
 * still loading wins over the restored one.
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
  const restored = restoreWork(state, storage).then((inSync) => {
    if (!disposed) {
      if (inSync) {
        writer.markSaved();
      }
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

/** Restores saved work. Resolves to whether state now shows exactly what storage holds. */
async function restoreWork(state: PaintState, storage: WorkStorage): Promise<boolean> {
  try {
    const saved = await storage.load();
    if (state.svg.peek() !== null) {
      // The user opened a drawing meanwhile: it wins, and is saved next.
      return false;
    }
    if (saved === null) {
      return true;
    }
    const { past, present, future } = parseAutosavedHistory(saved.history);
    state.loadWork({ svgSource: saved.drawing, paints: present }, { past, future });
    return true;
  } catch (error) {
    console.warn('Could not restore the last drawing', error);
    await storage.clear().catch(() => undefined);
    return state.svg.peek() === null;
  }
}

interface Writer {
  readonly workSaved: ReadonlySignal<boolean>;
  /** Treats what state shows now as already saved. */
  markSaved: () => void;
  /** Schedules a save if the drawing or the history changed since the last one. */
  changed: (source: string | null, history: PaintState['paintHistory']['value']) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

function createWriter(state: PaintState, storage: WorkStorage, delayMs: number): Writer {
  const workSaved = signal(true);
  let savedSource: string | null | undefined;
  let savedHistory: unknown;
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
    const drawingChanged = source !== savedSource;
    savedSource = source;
    savedHistory = history;
    try {
      if (source === null) {
        await storage.clear();
      } else {
        const text = encodeAutosavedHistory(history);
        await storage.save(drawingChanged ? { drawing: source, history: text } : { history: text });
      }
      workSaved.value = true;
    } catch (error) {
      console.warn('Could not save the drawing in this browser', error);
      // Rewrite everything next time rather than trust a half-known state.
      savedSource = undefined;
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
    markSaved: () => {
      savedSource = state.svgSource.peek();
      savedHistory = state.paintHistory.peek();
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
