import type { ReadonlySignal } from '@preact/signals-core';
import { SITE_OFFLINE_ZIP_URL, SITE_VERSION_URL } from '../utils/app/distribution';
import type { UpdateMode } from '../utils/app/updateMode';
import { createAppUpdater } from './appUpdater';
import type { AppUpdater, UpdateSource } from './appUpdater';
import { createInstallPrompt } from './installPrompt';
import type { InstallPrompt } from './installPrompt';
import { createRemoteVersionSource } from './remoteVersionSource';
import { createServiceWorkerSource } from './serviceWorkerSource';
import type { ContainerLike } from './serviceWorkerSource';

/** Which build is running: the site (installable) or the offline copy from the zip. */
export type Distribution = 'site' | 'offline';

/** The parts of `window` updates and installs use; tests pass fakes. */
export interface BrowserEnv {
  readonly navigator: { readonly serviceWorker?: ContainerLike };
  readonly location: { reload: () => void; assign: (url: string) => void };
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  matchMedia: (query: string) => { readonly matches: boolean };
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
}

export interface BrowserUpdaterOptions {
  readonly distribution: Distribution;
  /** The path the site is served from (`import.meta.env.BASE_URL`). */
  readonly baseUrl: string;
  readonly currentVersion: string;
  readonly updateMode: ReadonlySignal<UpdateMode>;
  readonly beforeApply: () => Promise<void>;
}

/** The updater for the running build, or `null` where it can't update. */
export function getBrowserUpdater(
  options: BrowserUpdaterOptions,
  env: BrowserEnv,
): AppUpdater | null {
  const source = getUpdateSource(options, env);
  return source === null
    ? null
    : createAppUpdater({
        source,
        updateMode: options.updateMode,
        beforeApply: options.beforeApply,
      });
}

function getUpdateSource(options: BrowserUpdaterOptions, env: BrowserEnv): UpdateSource | null {
  if (options.distribution === 'offline') {
    return createRemoteVersionSource({
      currentVersion: options.currentVersion,
      versionUrl: SITE_VERSION_URL,
      downloadUrl: SITE_OFFLINE_ZIP_URL,
      fetch: (url, init) => env.fetch(url, init),
      // The zip is served as a download, so the page stays where it is.
      download: (url) => {
        env.location.assign(url);
      },
    });
  }
  const container = env.navigator.serviceWorker;
  // Service workers need HTTPS (or localhost); without them nothing updates or works offline.
  return container === undefined
    ? null
    : createServiceWorkerSource({
        container,
        scriptUrl: `${options.baseUrl}sw.js`,
        scope: options.baseUrl,
        reload: () => {
          env.location.reload();
        },
      });
}

/** The browser's install offer for the site build; the offline copy has none. */
export function getBrowserInstallPrompt(
  distribution: Distribution,
  env: BrowserEnv,
): InstallPrompt | null {
  if (distribution === 'offline') {
    return null;
  }
  return createInstallPrompt(env, env.matchMedia('(display-mode: standalone)').matches);
}
