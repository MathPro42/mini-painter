import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaOnlyFiles, toOfflineHtml } from './offlinePlugin.ts';

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
