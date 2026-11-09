import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offlinePlugin, pwaOnlyFiles, toOfflineHtml } from './offlinePlugin.ts';

/** Runs a plugin hook written as a plain function, as Vite would. */
function runHook(hook: unknown, ...args: unknown[]): void {
  if (typeof hook !== 'function') {
    throw new TypeError('Expected a plain function hook');
  }
  (hook as (...hookArgs: unknown[]) => void)(...args);
}

/** What the files left in a built folder are once the plugin has run on it. */
function filesLeftAfterBuild(outDirFor: (dir: string) => { root: string; outDir: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'offline-'));
  try {
    writeFileSync(
      join(dir, 'manifest.webmanifest'),
      JSON.stringify({ icons: [{ src: 'cube.png' }] }),
    );
    for (const file of ['sw.js', 'cube.png', 'index.html']) {
      writeFileSync(join(dir, file), '');
    }
    const plugin = offlinePlugin();
    const { root, outDir } = outDirFor(dir);
    runHook(plugin.configResolved, { root, build: { outDir } });
    runHook(plugin.closeBundle);
    return readdirSync(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('offlinePlugin', () => {
  it('removes the installable app files from an outDir under the root', () => {
    const left = filesLeftAfterBuild((dir) => ({ root: dirname(dir), outDir: basename(dir) }));
    expect(left).toEqual(['index.html']);
  });

  it('removes them from an outDir given as an absolute path', () => {
    const left = filesLeftAfterBuild((dir) => ({ root: join(dir, 'project'), outDir: dir }));
    expect(left).toEqual(['index.html']);
  });
});

describe('toOfflineHtml', () => {
  it('turns the module bundle into a deferred classic script', () => {
    const html =
      '<script type="module" crossorigin src="./assets/app.js"></script>' +
      '<link rel="stylesheet" crossorigin href="./assets/app.css">';
    expect(toOfflineHtml(html)).toBe(
      '<script defer src="./assets/app.js"></script>' +
        '<link rel="stylesheet" href="./assets/app.css">',
    );
  });

  it('drops the manifest and touch icon links, whatever the attribute order', () => {
    const html = [
      '<head>',
      '  <link rel="manifest" href="./manifest.webmanifest" />',
      "  <link href='./icon-192.png' rel='apple-touch-icon'>",
      '  <link rel="icon" href="./favicon.svg" />',
      '</head>',
    ].join('\n');
    expect(toOfflineHtml(html)).toBe('<head>\n  <link rel="icon" href="./favicon.svg" />\n</head>');
  });
});

describe('pwaOnlyFiles', () => {
  it('lists the worker, the manifest and its icons', () => {
    const manifest = JSON.stringify({ icons: [{ src: 'cube.png' }, { src: 'sphere.png' }] });
    expect(pwaOnlyFiles(manifest)).toEqual([
      'sw.js',
      'manifest.webmanifest',
      'cube.png',
      'sphere.png',
    ]);
  });

  it('copes with a manifest without icons', () => {
    expect(pwaOnlyFiles('{}')).toEqual(['sw.js', 'manifest.webmanifest']);
  });

  it("matches the app's own manifest", () => {
    const manifest = readFileSync(join(import.meta.dirname, '../public/manifest.webmanifest'));
    expect(pwaOnlyFiles(manifest.toString())).toContain('icon-maskable-512.png');
  });
});
