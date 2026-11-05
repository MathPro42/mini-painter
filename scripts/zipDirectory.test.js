import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { createZip, readEntries } from './zipDirectory.js';

const dirs = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Reads entry names and contents back through the central directory. */
function unzip(zip) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    const nameLength = zip.readUInt16LE(at + 28);
    const packed = zip.readUInt32LE(at + 20);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26);
    files[name] = inflateRawSync(zip.subarray(dataAt, dataAt + packed)).toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

describe('createZip', () => {
  it('stores each entry so it inflates back to its contents', () => {
    const zip = createZip([
      { name: 'app/index.html', data: Buffer.from('<p>cube</p>') },
      { name: 'app/assets/a.js', data: Buffer.from('sphere'.repeat(100)) },
    ]);
    expect(unzip(zip)).toEqual({
      'app/index.html': '<p>cube</p>',
      'app/assets/a.js': 'sphere'.repeat(100),
    });
  });

  it('gives the same bytes for the same entries', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('brick red') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });

  it('is an empty archive for no entries', () => {
    expect(unzip(createZip([]))).toEqual({});
  });
});

describe('readEntries', () => {
  it('lists nested files in order under the folder name', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), 'page');
    writeFileSync(join(dir, 'assets', 'app.js'), 'code');
    const entries = readEntries(dir, 'app');
    expect(entries.map((entry) => [entry.name, entry.data.toString()])).toEqual([
      ['app/assets/app.js', 'code'],
      ['app/index.html', 'page'],
    ]);
  });
});

describe('command line', () => {
  it('writes a zip that unzips', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.txt'), 'cube');
    const out = join(tempDir(), 'nested', 'out.zip');
    execFileSync('node', [join(import.meta.dirname, 'zipDirectory.js'), dir, out, 'app']);
    expect(unzip(readFileSync(out))).toEqual({ 'app/a.txt': 'cube' });
  });
});
