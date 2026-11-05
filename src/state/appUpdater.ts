import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import type { UpdateMode } from '../utils/app/updateMode';

/**
 * Where updates come from. The installed app gets them from its service
 * worker and applies them itself; the offline copy can only point the user at
 * a new download.
 */
export interface UpdateSource {
  /** `'reload'`: apply() switches to the update. `'download'`: the user fetches it. */
  readonly applies: 'reload' | 'download';
  /** Looks for an update. Resolves `true` when one is ready. */
  check: () => Promise<boolean>;
  /** Calls `onAvailable` for updates found without a check. Returns the unsubscribe. */
  subscribe: (onAvailable: () => void) => () => void;
  /** Switches to the update (reloads the page) or starts its download. */
  apply: () => Promise<void>;
}

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'applying' | 'error';

export interface AppUpdater {
  readonly status: ReadonlySignal<UpdateStatus>;
  readonly applies: UpdateSource['applies'];
  /** Looks for an update now. Never throws: failures show as the `'error'` status. */
  check: () => Promise<void>;
  /** Applies the update found, after `beforeApply`. Never throws. */
  apply: () => Promise<void>;
  dispose: () => void;
}

export interface AppUpdaterOptions {
  readonly source: UpdateSource;
  readonly updateMode: ReadonlySignal<UpdateMode>;
  /** Runs before a reload, so unsaved work is written first (the autosave flush). */
  readonly beforeApply?: () => Promise<void>;
  /** How often to look for updates while the mode is `'auto'`. */
  readonly checkEveryMs?: number;
}

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Finds updates. In `'auto'` the app looks on start and every hour; in
 * `'manual'` only when the user asks. Applying one is the caller's choice:
 * auto mode goes through `createUpdateNotice`, which warns the user first.
 */
export function createAppUpdater(options: AppUpdaterOptions): AppUpdater {
  const { source, updateMode, beforeApply } = options;
  const status = signal<UpdateStatus>('idle');

  const apply = (): Promise<void> => applyUpdate(status, source, beforeApply);

  const onAvailable = (): void => {
    if (status.peek() === 'applying') {
      return;
    }
    status.value = 'available';
  };

  const check = async (): Promise<void> => {
    // Once found, an update stays found: a new check would hide it while it runs.
    if (status.peek() !== 'idle' && status.peek() !== 'up-to-date' && status.peek() !== 'error') {
      return;
    }
    status.value = 'checking';
    try {
      if (await source.check()) {
        onAvailable();
      } else {
        status.value = 'up-to-date';
      }
    } catch (error) {
      console.warn('Update check failed', error);
      status.value = 'error';
    }
  };

  const unsubscribe = source.subscribe(onAvailable);
  const stopChecks = runAutoChecks(updateMode, options.checkEveryMs, () => {
    void check();
  });

  return {
    status,
    applies: source.applies,
    check,
    apply,
    dispose: () => {
      stopChecks();
      unsubscribe();
    },
  };
}

/** Calls `run` whenever the mode turns `'auto'`, then every `everyMs` while it stays so. */
function runAutoChecks(
  updateMode: ReadonlySignal<UpdateMode>,
  everyMs: number | undefined,
  run: () => void,
): () => void {
  return effect(() => {
    if (updateMode.value !== 'auto') {
      return undefined;
    }
    run();
    const timer = setInterval(run, everyMs ?? UPDATE_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  });
}

/** Applies an update and tracks it in `status`. Never throws. */
async function applyUpdate(
  status: Signal<UpdateStatus>,
  source: UpdateSource,
  beforeApply: (() => Promise<void>) | undefined,
): Promise<void> {
  if (status.peek() === 'applying') {
    return;
  }
  status.value = 'applying';
  try {
    await beforeApply?.();
    await source.apply();
    // A download leaves this version running, still out of date.
    if (source.applies === 'download') {
      status.value = 'available';
    }
  } catch (error) {
    console.error('Update failed', error);
    status.value = 'error';
  }
}
