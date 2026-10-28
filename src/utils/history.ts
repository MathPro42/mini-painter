/**
 * An undo/redo timeline. `present` is the current value; `past` holds older
 * values (oldest first) and `future` holds undone ones (next redo first).
 * Values are never mutated, so a history can be shared or compared by identity.
 * `undefined` is not a valid value: it reads as "nothing to undo or redo".
 */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

/** How many undo steps a history keeps by default. Older steps are dropped. */
export const DEFAULT_HISTORY_LIMIT = 200;

/** Starts a history at `present`, with nothing to undo or redo. */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Records `next` as the new present. The old present becomes undoable, and
 * anything that was undone can no longer be redone.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  limit: number = DEFAULT_HISTORY_LIMIT,
): History<T> {
  const past = [...history.past, history.present];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [] };
}

/** Steps back one value. Returns `history` itself when there is nothing to undo. */
export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Steps forward one undone value. Returns `history` itself when there is nothing to redo. */
export function redoHistory<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) {
    return history;
  }
  return { past: [...history.past, history.present], present: next, future };
}
