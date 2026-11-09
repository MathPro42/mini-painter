import { isNewerVersion, parseVersionInfo } from '../utils/app/versionInfo';
import type { UpdateSource } from './appUpdater';

export interface RemoteVersionSourceOptions {
  /** The build running now (`__APP_VERSION__`). */
  readonly currentVersion: string;
  /** The deployed site's `version.json`. */
  readonly versionUrl: string;
  /** The latest offline copy. */
  readonly downloadUrl: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Starts a download of `url` (a link click in the browser). */
  readonly download: (url: string) => void;
}

/**
 * Updates for the offline copy: it asks the site which version is deployed
 * and, when that is another one, downloads the new zip. It can't replace its
 * own files, so the user unzips the download over the old folder.
 */
export function createRemoteVersionSource(options: RemoteVersionSourceOptions): UpdateSource {
  return {
    applies: 'download',
    check: async () => {
      const response = await options.fetch(options.versionUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`version.json: HTTP ${String(response.status)}`);
      }
      return isNewerVersion(options.currentVersion, parseVersionInfo(await response.text()));
    },
    subscribe: () => () => undefined,
    apply: () => {
      options.download(options.downloadUrl);
      return Promise.resolve();
    },
  };
}
