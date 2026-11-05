import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Files of the installable app that mean nothing in a copy opened from disk. */
const PWA_ONLY = [
  'sw.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];
const PWA_ONLY_TAGS = /\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g;

const README = `Mini Painter, offline copy
==========================

Open index.html in your browser. No internet or install needed.

Your work and palettes stay in the browser that opened this folder. Keep the
folder where it is: a copy moved elsewhere starts empty in some browsers.

To update, click "Mini Painter" at the top left. The settings show when a newer
version is out and download it. Unzip it over this folder.
`;

/**
 * Makes the offline build open straight from disk (`file://`). Browsers refuse
 * module scripts and \`crossorigin\` loads from files, so the bundle is one
 * classic script that runs once the page has parsed.
 */
export function offlinePlugin(): Plugin {
  let outDir = '';
  return {
    name: 'mini-painter:offline',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(PWA_ONLY_TAGS, '')
          .replaceAll(' crossorigin', '')
          .replaceAll('<script type="module"', '<script defer'),
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'README.txt', source: README });
    },
    // Vite copies public/ after the bundle is written, so the extras go last.
    closeBundle() {
      for (const file of PWA_ONLY) {
        rmSync(join(outDir, file), { force: true });
      }
    },
  };
}
