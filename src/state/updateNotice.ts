import { computed, effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import type { UpdateMode } from '../utils/app/updateMode';
import type { AppUpdater } from './appUpdater';

/** How long the "updating" message shows before the app reloads. */
export const UPDATE_COUNTDOWN_SECONDS = 5;

/**
 * What the app tells the user about an update found in auto mode:
 * - `countdown`: nothing is open, so it updates when `secondsLeft` reaches 0.
 * - `on-close`: a drawing is open; it updates once the drawing is closed.
 *   `workAtRisk` is set when autosave can't keep the drawing across a reload.
 * - `download`: the offline copy, which only the user can update.
 */
export type UpdateNotice =
  | { readonly kind: 'none' }
  | { readonly kind: 'countdown'; readonly secondsLeft: number }
  | { readonly kind: 'on-close'; readonly workAtRisk: boolean }
  | { readonly kind: 'download' };

export interface UpdateNoticeState {
  readonly notice: ReadonlySignal<UpdateNotice>;
  /** "Update now" (or "Download"): applies at once. */
  applyNow: () => void;
  /** "Later": no automatic update this visit. The settings still offer it. */
  postpone: () => void;
  dispose: () => void;
}

export interface UpdateNoticeOptions {
  readonly updater: AppUpdater;
  readonly updateMode: ReadonlySignal<UpdateMode>;
  /** `true` while a drawing is open; a reload would interrupt the work. */
  readonly drawingOpen: ReadonlySignal<boolean>;
  /** `false` when autosave can't keep the drawing. */
  readonly workSaved: ReadonlySignal<boolean>;
}

const NONE: UpdateNotice = { kind: 'none' };

/**
 * Applies updates in auto mode without surprising the user. With nothing
 * open, a short countdown says the app is about to reload; with a drawing
 * open, the update waits until it is closed. Switching to manual, or
 * "Later", cancels the automatic update.
 */
export function createUpdateNotice(options: UpdateNoticeOptions): UpdateNoticeState {
  const { updater, updateMode, drawingOpen } = options;
  const postponed = signal(false);
  const secondsLeft = signal(UPDATE_COUNTDOWN_SECONDS);

  const kind = computed<UpdateNotice['kind']>(() => {
    if (updater.status.value !== 'available' || updateMode.value !== 'auto' || postponed.value) {
      return 'none';
    }
    if (updater.applies === 'download') {
      return 'download';
    }
    return drawingOpen.value ? 'on-close' : 'countdown';
  });

  // Starts over each time the countdown shows, e.g. after the drawing is closed.
  const stopCountdown = effect(() => {
    if (kind.value !== 'countdown') {
      return undefined;
    }
    secondsLeft.value = UPDATE_COUNTDOWN_SECONDS;
    const timer = setInterval(() => {
      secondsLeft.value -= 1;
      if (secondsLeft.peek() <= 0) {
        clearInterval(timer);
        void updater.apply();
      }
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  });

  const notice = computed<UpdateNotice>(() => {
    switch (kind.value) {
      case 'none':
        return NONE;
      case 'countdown':
        return { kind: 'countdown', secondsLeft: secondsLeft.value };
      case 'on-close':
        return { kind: 'on-close', workAtRisk: !options.workSaved.value };
      case 'download':
        return { kind: 'download' };
    }
  });

  return {
    notice,
    applyNow: () => {
      void updater.apply();
    },
    postpone: () => {
      postponed.value = true;
    },
    dispose: stopCountdown,
  };
}
