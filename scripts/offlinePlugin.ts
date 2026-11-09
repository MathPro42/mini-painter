import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** The installable app's links, which mean nothing in a copy opened from disk. */
const PWA_ONLY_TAGS = /\s*<link\b[^>]*\brel=["'](?:manifest|apple-touch-icon)["'][^>]*>/g;

const README = `Mini Painter, offline copy
==========================

Open index.html in your browser. No internet or install needed.

Your work and palettes stay in the browser that opened this folder. Keep the
folder where it is: a copy moved elsewhere starts empty in some browsers.

To update, click "Mini Painter" at the top left. The settings show when a newer
version is out and download it. Unzip it over this folder.
`;

/**
 * The page as the offline copy needs it. Browsers refuse module scripts and
 * `crossorigin` loads from files, so the bundle is one classic script that
 * runs once the page has parsed; the installable app's links go.
 */
export function toOfflineHtml(html: string): string {
  return html
    .replace(PWA_ONLY_TAGS, '')
    .replaceAll(' crossorigin', '')
    .replaceAll('<script type="module"', '<script defer');
}

/** The service worker, the web app manifest and every icon it lists. */
export function pwaOnlyFiles(manifestJson: string): string[] {
  const manifest = JSON.parse(manifestJson) as { icons?: readonly { src: string }[] };
  return ['sw.js', 'manifest.webmanifest', ...(manifest.icons ?? []).map((icon) => icon.src)];
}

/** Makes the offline build open straight from disk (`file://`). */
export function offlinePlugin(): Plugin {
  let outDir = '';
  return {
    name: 'mini-painter:offline',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: { order: 'post', handler: toOfflineHtml },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'README.txt', source: README });
    },
    // Vite copies public/ after the bundle is written, so the extras go last.
    closeBundle() {
      const manifest = readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8');
      for (const file of pwaOnlyFiles(manifest)) {
        rmSync(join(outDir, file), { force: true });
      }
    },
  };
}
