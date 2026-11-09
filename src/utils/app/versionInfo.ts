import { isRecord } from '../isRecord';

/** What the site's `version.json` says about the deployed app. */
export interface VersionInfo {
  /** The commit it was built from, as written by the build. */
  readonly version: string;
}

const VERSION = /^[0-9a-z][0-9a-z.-]{0,63}$/i;

/**
 * Reads a `version.json`. It comes over the network, so anything other than
 * `{ "version": "<short id>" }` throws a RangeError.
 */
export function parseVersionInfo(text: string): VersionInfo {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RangeError('version.json is not JSON');
  }
  const version = isRecord(data) ? data['version'] : undefined;
  if (typeof version !== 'string' || !VERSION.test(version)) {
    throw new RangeError('version.json has no valid version');
  }
  return { version };
}

/**
 * Whether `latest` replaces the running build. Versions are commit ids, which
 * have no order, so any other version is newer: the site only moves forward.
 * A "dev" build never updates, since it has no commit to compare.
 */
export function isNewerVersion(current: string, latest: VersionInfo): boolean {
  return current !== 'dev' && latest.version !== current;
}
