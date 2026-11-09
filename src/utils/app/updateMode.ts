/** How updates reach the app: on their own, or when the user says so. */
export type UpdateMode = 'auto' | 'manual';

export const UPDATE_MODES: readonly UpdateMode[] = ['auto', 'manual'];

export const DEFAULT_UPDATE_MODE: UpdateMode = 'auto';

/** `value` as an UpdateMode, or `null` when it is not one. */
export function normalizeUpdateMode(value: unknown): UpdateMode | null {
  return UPDATE_MODES.find((mode) => mode === value) ?? null;
}

/** `value` as an UpdateMode. Throws a RangeError when it is not one. */
export function parseUpdateMode(value: unknown): UpdateMode {
  const mode = normalizeUpdateMode(value);
  if (mode === null) {
    throw new RangeError(`Unknown update mode: ${String(value)}`);
  }
  return mode;
}
