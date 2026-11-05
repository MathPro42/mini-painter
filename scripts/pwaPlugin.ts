import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Files the service worker must not cache: itself, its list, and the offline download. */
const NOT_CACHED = /(^|\/)(sw\.js|sw-manifest\.js|version\.json)$|\.zip$/;

/**
 * Emits what the installable app needs next to the build:
 * - `sw-manifest.js`, the files `public/sw.js` precaches and a version. The
 *   browser compares imported scripts byte for byte, so a new build is what
 *   tells installed copies that an update is waiting.
 * - `version.json`, which the offline copy fetches to look for updates.
 */
export function pwaPlugin(version: string): Plugin {
  let publicDir = '';
  return {
    name: 'mini-painter:pwa',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const manifest = createPrecacheManifest(version, Object.keys(bundle), listFiles(publicDir));
        this.emitFile({
          type: 'asset',
          fileName: 'sw-manifest.js',
          source: `self.precache = ${JSON.stringify(manifest)};\n`,
        });
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: `${JSON.stringify({ version })}\n`,
        });
      },
    },
  };
}

export interface PrecacheManifest {
  readonly version: string;
  readonly files: readonly string[];
}

/**
 * What the service worker precaches, as paths relative to its scope. The page
 * itself is cached as `./`, the URL people open, instead of `index.html`.
 */
export function createPrecacheManifest(
  version: string,
  bundleFiles: readonly string[],
  publicFiles: readonly string[],
): PrecacheManifest {
  const files = ['./', ...bundleFiles, ...publicFiles]
    .filter((file) => !NOT_CACHED.test(file) && file !== 'index.html')
    .sort();
  // Bundle names carry content hashes, so their hash tells two builds of one commit apart.
  const digest = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 8);
  return { version: `${version}-${digest}`, files };
}

/** Every file under `dir`, as `/`-separated relative paths; none when there is no dir. */
export function listFiles(dir: string): string[] {
  if (dir === '') {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}
