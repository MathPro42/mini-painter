import type { UpdateSource } from './appUpdater';

/** The parts of a ServiceWorker this file uses; tests pass fakes. */
export interface WorkerLike {
  readonly state: string;
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'statechange', listener: () => void) => void;
}

/** The parts of a ServiceWorkerRegistration this file uses. */
export interface RegistrationLike {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update: () => Promise<unknown>;
  addEventListener: (type: 'updatefound', listener: () => void) => void;
}

/** The parts of `navigator.serviceWorker` this file uses. */
export interface ContainerLike {
  /** The worker serving this page; `null` on the very first visit. */
  readonly controller: unknown;
  register: (url: string, options: { scope: string }) => Promise<RegistrationLike>;
  addEventListener: (type: 'controllerchange', listener: () => void) => void;
}

export interface ServiceWorkerSourceOptions {
  readonly container: ContainerLike;
  readonly scriptUrl: string;
  readonly scope: string;
  /** Reloads the page once the new version serves it. */
  readonly reload: () => void;
}

function warnRegisterFailed(error: unknown): void {
  console.warn('Could not start the offline service worker', error);
}

/** Message `public/sw.js` waits for before a new version takes over. */
export const SKIP_WAITING = { type: 'SKIP_WAITING' };

/**
 * Updates for the installed app. The browser downloads a new service worker
 * whenever the site changes; it then waits until apply() tells it to take
 * over, and the page reloads onto the new version.
 */
export function createServiceWorkerSource(options: ServiceWorkerSourceOptions): UpdateSource {
  const { container } = options;
  const registration = container.register(options.scriptUrl, { scope: options.scope });
  // On a first visit there is nothing to update: the new worker just installs.
  const isUpdate = (worker: WorkerLike | null): worker is WorkerLike =>
    worker !== null && container.controller !== null;

  let reloading = false;
  container.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      options.reload();
    }
  });

  return {
    applies: 'reload',
    check: async () => {
      const current = await registration;
      await current.update();
      return isUpdate(current.waiting);
    },
    subscribe: (onAvailable) => {
      let active = true;
      void registration.then((current) => {
        if (isUpdate(current.waiting)) {
          onAvailable();
        }
        current.addEventListener('updatefound', () => {
          const worker = current.installing;
          worker?.addEventListener('statechange', () => {
            if (active && worker.state === 'installed' && isUpdate(worker)) {
              onAvailable();
            }
          });
        });
      }, warnRegisterFailed);
      return () => {
        active = false;
      };
    },
    apply: async () => {
      const waiting = (await registration).waiting;
      if (waiting === null) {
        options.reload();
      } else {
        waiting.postMessage(SKIP_WAITING);
      }
    },
  };
}
