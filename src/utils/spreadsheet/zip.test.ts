import { describe, expect, it } from 'vitest';
import xlsxFixture from './fixtures/palette.xlsx?inline';
import { viewOf } from './bytes';
import { isZip, listZipEntries, readZipEntry } from './zip';
import type { ZipEntry } from './zip';
import { createZip, crc32 } from './zipWrite';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

const sample = (): Uint8Array =>
  createZip([
    { name: 'a.txt', data: encoder.encode('brick red') },
    { name: 'dir/b.txt', data: encoder.encode('') },
  ]);

const entry = (bytes: Uint8Array, name: string): ZipEntry => {
  const found = listZipEntries(bytes).find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`missing ${name}`);
  }
  return found;
};

/** Offset of the first central directory header. */
const centralOffset = (bytes: Uint8Array): number => {
  const view = viewOf(bytes);
  return view.getUint32(bytes.byteLength - 22 + 16, true);
};

describe('createZip and crc32', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes an archive that lists and extracts its files', async () => {
    const bytes = sample();
    expect(isZip(bytes)).toBe(true);
    expect(listZipEntries(bytes).map(({ name, method, size }) => [name, method, size])).toEqual([
      ['a.txt', 0, 9],
      ['dir/b.txt', 0, 0],
    ]);
    expect(decoder.decode(await readZipEntry(bytes, entry(bytes, 'a.txt'), 100))).toBe('brick red');
  });

  it('is deterministic', () => {
    expect(sample()).toEqual(sample());
  });
});

describe('listZipEntries', () => {
  it('rejects data that is not a zip archive', () => {
    expect(isZip(encoder.encode('name,color'))).toBe(false);
    expect(() => listZipEntries(new Uint8Array(40))).toThrow('Not a zip archive');
  });

  it('rejects zip64 archives', () => {
    const bytes = sample();
    viewOf(bytes).setUint16(bytes.byteLength - 22 + 10, 0xffff, true);
    expect(() => listZipEntries(bytes)).toThrow('Zip64 archives are not supported');
  });

  it('rejects a damaged directory', () => {
    const bytes = sample();
    viewOf(bytes).setUint32(centralOffset(bytes), 0, true);
    expect(() => listZipEntries(bytes)).toThrow('truncated or corrupt (zip directory)');
  });
});

describe('readZipEntry', () => {
  it('inflates deflated entries', async () => {
    const bytes = await loadFixture(xlsxFixture);
    const workbook = entry(bytes, 'xl/workbook.xml');
    expect(workbook.method).toBe(8);
    const xml = decoder.decode(await readZipEntry(bytes, workbook, 1_000_000));
    expect(xml).toContain('<sheet name="Colors"');
  });

  it('refuses entries that expand past the limit, even when their declared size is small', async () => {
    const bytes = await loadFixture(xlsxFixture);
    const workbook = entry(bytes, 'xl/workbook.xml');
    await expect(readZipEntry(bytes, workbook, 10)).rejects.toThrow('xl/workbook.xml is too large');
    await expect(readZipEntry(bytes, { ...workbook, size: 1 }, 10)).rejects.toThrow('too large');
  });

  it('reports data that does not decompress', async () => {
    const bytes = sample();
    const broken = { ...entry(bytes, 'a.txt'), method: 8 };
    await expect(readZipEntry(bytes, broken, 100)).rejects.toThrow(
      'a.txt could not be decompressed',
    );
  });

  it('refuses encrypted entries and unknown compression methods', async () => {
    const bytes = sample();
    const plain = entry(bytes, 'a.txt');
    await expect(readZipEntry(bytes, { ...plain, flags: 1 }, 100)).rejects.toThrow(
      'a.txt is encrypted',
    );
    await expect(readZipEntry(bytes, { ...plain, method: 12 }, 100)).rejects.toThrow(
      'unsupported compression method',
    );
  });

  it('rejects an entry whose local header is missing', async () => {
    const bytes = sample();
    const plain = entry(bytes, 'a.txt');
    await expect(readZipEntry(bytes, { ...plain, localHeaderOffset: 5 }, 100)).rejects.toThrow(
      'truncated or corrupt (zip entry)',
    );
  });
});
