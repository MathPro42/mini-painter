import { SITE_OFFLINE_ZIP_URL, SITE_VERSION_URL } from '../utils/app/distribution';
import { createAppUpdater } from './appUpdater';
import type { AppUpdater, UpdateSource } from './appUpdater';
import type { Autosave } from './autosave';
import { createInstallPrompt } from './installPrompt';
import type { InstallPrompt } from './installPrompt';
import { createRemoteVersionSource } from './remoteVersionSource';
import { createServiceWorkerSource } from './serviceWorkerSource';
import type { ContainerLike } from './serviceWorkerSource';
import type { SettingsState } from './settingsState';

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
  readonly updateMode: SettingsState['updateMode'];
  /** Saves pending work before any reload onto a new version. */
  readonly beforeApply: () => Promise<void>;
  /** Whether work is kept across a reload, so auto mode may apply on its own. */
  readonly canApplyNow: () => boolean;
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
        canApplyNow: options.canApplyNow,
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
        // Every open tab reloads when a new version takes over, not just the one
        // that applied it, so each saves its own pending work first. The reload
        // happens either way: the old version's files may already be gone.
        reload: () => {
          const reload = (): void => {
            env.location.reload();
          };
          void options.beforeApply().then(reload, reload);
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

/** What the build tells the app about itself (from `import.meta.env` and `__APP_VERSION__`). */
export interface BuildInfo {
  readonly distribution: Distribution;
  readonly baseUrl: string;
  readonly version: string;
  /** `false` on the dev server, which has no service worker or version.json. */
  readonly isProduction: boolean;
}

export interface BrowserUpdates {
  readonly updater: AppUpdater | null;
  readonly install: InstallPrompt | null;
}

/**
 * Starts updates and the install offer for the running build. Updates save
 * the drawing first, and auto mode only reloads while the drawing can be saved.
 */
export function startBrowserUpdates(
  settings: SettingsState,
  autosave: Autosave,
  build: BuildInfo,
  env: BrowserEnv,
): BrowserUpdates {
  const options: BrowserUpdaterOptions = {
    distribution: build.distribution,
    baseUrl: build.baseUrl,
    currentVersion: build.version,
    updateMode: settings.updateMode,
    beforeApply: () => autosave.flush(),
    canApplyNow: () => autosave.workSaved.peek(),
  };
  return {
    updater: build.isProduction ? getBrowserUpdater(options, env) : null,
    install: getBrowserInstallPrompt(build.distribution, env),
  };
}
