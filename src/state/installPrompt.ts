import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';

/** Chromium's `beforeinstallprompt` event, which lib.dom does not describe. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/** The parts of `window` the install prompt uses; tests pass an EventTarget. */
export interface InstallTarget {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
}

export interface InstallPrompt {
  /** `true` once the browser offers to install the app from a button. */
  readonly canInstall: ReadonlySignal<boolean>;
  /** `true` when running as the installed app, or just installed. */
  readonly installed: ReadonlySignal<boolean>;
  /** Shows the browser's install dialog. Resolves `true` when the user accepts. */
  install: () => Promise<boolean>;
  dispose: () => void;
}

function isInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function';
}

/**
 * Keeps the browser's install offer for a button to use. Only Chromium
 * browsers make one; elsewhere `canInstall` stays `false` and the UI explains
 * the browser's own menu instead.
 */
export function createInstallPrompt(target: InstallTarget, standalone: boolean): InstallPrompt {
  const canInstall = signal(false);
  const installed = signal(standalone);
  let offer: BeforeInstallPromptEvent | null = null;

  const onOffer = (event: Event): void => {
    if (!isInstallPromptEvent(event)) {
      return;
    }
    // Without this, Chromium shows its own mini-infobar on top of the app.
    event.preventDefault();
    offer = event;
    canInstall.value = true;
  };
  const onInstalled = (): void => {
    offer = null;
    canInstall.value = false;
    installed.value = true;
  };
  target.addEventListener('beforeinstallprompt', onOffer);
  target.addEventListener('appinstalled', onInstalled);

  return {
    canInstall,
    installed,
    install: async () => {
      if (offer === null) {
        return false;
      }
      const shown = offer;
      // An offer can be shown once only.
      offer = null;
      canInstall.value = false;
      await shown.prompt();
      return (await shown.userChoice).outcome === 'accepted';
    },
    dispose: () => {
      target.removeEventListener('beforeinstallprompt', onOffer);
      target.removeEventListener('appinstalled', onInstalled);
    },
  };
}
