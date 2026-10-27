import { effect } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { useEffect, useState } from 'preact/hooks';

/**
 * Reads a signal's value and re-renders the component when it changes.
 * App state is built on signals-core (so rendering can use it without
 * Preact), which means components subscribe explicitly through this hook.
 */
export function useSignalValue<T>(source: ReadonlySignal<T>): T {
  const [value, setValue] = useState(() => source.peek());
  useEffect(
    () =>
      effect(() => {
        const next = source.value;
        // The updater form stores `next` as-is, even when it is itself a function.
        setValue(() => next);
      }),
    [source],
  );
  return value;
}
