import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPrecacheManifest, listFiles } from './pwaPlugin.ts';

describe('createPrecacheManifest', () => {
  const bundle = ['index.html', 'assets/app-1a.js', 'assets/app-2b.css'];
  const publicFiles = ['sw.js', 'favicon.svg', 'icon-192.png', 'manifest.webmanifest'];

  it('caches the page as ./ and every built and public file, sorted', () => {
    expect(createPrecacheManifest('abc', bundle, publicFiles).files).toEqual([
      './',
      'assets/app-1a.js',
      'assets/app-2b.css',
      'favicon.svg',
      'icon-192.png',
      'manifest.webmanifest',
    ]);
  });

  it('leaves out the worker, its list, version.json and the offline zip', () => {
    const files = createPrecacheManifest(
      'abc',
      ['sw-manifest.js', 'version.json', 'mini-painter-offline.zip', 'assets/sw.js.map'],
      ['sw.js'],
    ).files;
    expect(files).toEqual(['./', 'assets/sw.js.map']);
  });

  it('versions by commit and by file names, so a rebuild with new bundles differs', () => {
    const first = createPrecacheManifest('abc', bundle, []).version;
    expect(first).toMatch(/^abc-[0-9a-f]{8}$/);
    expect(createPrecacheManifest('abc', bundle, []).version).toBe(first);
    expect(createPrecacheManifest('abc', ['assets/app-3c.js'], []).version).not.toBe(first);
  });
});

describe('listFiles', () => {
  it('lists nested files with / separators', () => {
    const dir = mkdtempSync(join(tmpdir(), 'public-'));
    try {
      mkdirSync(join(dir, 'icons'));
      writeFileSync(join(dir, 'favicon.svg'), '');
      writeFileSync(join(dir, 'icons', 'cube.png'), '');
      expect(listFiles(dir).sort()).toEqual(['favicon.svg', 'icons/cube.png']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists nothing without a public dir', () => {
    expect(listFiles('')).toEqual([]);
  });
});
