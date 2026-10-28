import { describe, expect, it } from 'vitest';
import xlsFixture from './fixtures/palette.xls?inline';
import { viewOf } from './bytes';
import { isCfb, readCfbStream } from './cfb';

const SECTOR = 512;
const FREE = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const FAT_SECTOR = 0xfffffffd;
const DIFAT_SECTOR = 0xfffffffc;

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

interface BuildOptions {
  /** List the FAT sector in a DIFAT sector instead of the header. */
  readonly useDifat?: boolean;
}

/**
 * Builds a version 3 compound file whose streams are all stored in regular
 * sectors (the mini stream cutoff is 0). Layout: FAT, directory, DIFAT, data.
 */
function buildCfb(streams: Record<string, Uint8Array>, options: BuildOptions = {}): Uint8Array {
  const names = Object.keys(streams);
  const fat: number[] = [FAT_SECTOR, END_OF_CHAIN, options.useDifat === true ? DIFAT_SECTOR : FREE];
  const starts = names.map((name) => {
    const sectors = Math.max(1, Math.ceil((streams[name]?.byteLength ?? 0) / SECTOR));
    const start = fat.length;
    for (let index = 1; index < sectors; index += 1) {
      fat.push(start + index);
    }
    fat.push(END_OF_CHAIN);
    return start;
  });
  const bytes = new Uint8Array(SECTOR * (fat.length + 1));
  const view = viewOf(bytes);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  view.setUint16(30, 9, true); // 2^9 = 512-byte sectors
  view.setUint32(44, 1, true); // one FAT sector
  view.setUint32(48, 1, true); // directory in sector 1
  view.setUint32(56, 0, true); // no mini stream
  view.setUint32(60, END_OF_CHAIN, true);
  for (let index = 0; index < 109; index += 1) {
    view.setUint32(76 + index * 4, FREE, true);
  }
  const sectorAt = (sector: number): number => (sector + 1) * SECTOR;
  if (options.useDifat === true) {
    view.setUint32(68, 2, true);
    view.setUint32(72, 1, true);
    for (let index = 0; index < SECTOR / 4; index += 1) {
      view.setUint32(sectorAt(2) + index * 4, index === 0 ? 0 : FREE, true);
    }
    view.setUint32(sectorAt(2) + SECTOR - 4, END_OF_CHAIN, true);
  } else {
    view.setUint32(68, END_OF_CHAIN, true);
    view.setUint32(76, 0, true);
  }
  for (let index = 0; index < SECTOR / 4; index += 1) {
    view.setUint32(sectorAt(0) + index * 4, fat[index] ?? FREE, true);
  }
  const entry = (index: number, name: string, type: number, start: number, size: number): void => {
    const at = sectorAt(1) + index * 128;
    for (let char = 0; char < name.length; char += 1) {
      view.setUint16(at + char * 2, name.charCodeAt(char), true);
    }
    view.setUint16(at + 64, (name.length + 1) * 2, true);
    view.setUint8(at + 66, type);
    view.setUint32(at + 68, FREE, true);
    view.setUint32(at + 72, index < names.length && index > 0 ? index + 1 : FREE, true);
    view.setUint32(at + 76, type === 5 && names.length > 0 ? 1 : FREE, true);
    view.setUint32(at + 116, start, true);
    view.setUint32(at + 120, size, true);
  };
  entry(0, 'Root Entry', 5, END_OF_CHAIN, 0);
  names.forEach((name, index) => {
    const data = streams[name] ?? new Uint8Array();
    entry(index + 1, name, 2, starts[index] ?? 0, data.byteLength);
    bytes.set(data, sectorAt(starts[index] ?? 0));
  });
  return bytes;
}

const filled = (size: number, value: number): Uint8Array => new Uint8Array(size).fill(value);

describe('readCfbStream', () => {
  it('reads a small stream from the mini stream of a real workbook', async () => {
    const bytes = await loadFixture(xlsFixture);
    expect(isCfb(bytes)).toBe(true);
    const workbook = readCfbStream(bytes, 'workbook');
    if (workbook === null) {
      throw new Error('missing workbook stream');
    }
    expect(workbook.byteLength).toBeLessThan(4096);
    // Every BIFF8 workbook stream opens with a BOF record.
    expect(viewOf(workbook).getUint16(0, true)).toBe(0x0809);
  });

  it('follows sector chains of regular streams', () => {
    const big = filled(1300, 7);
    big[1299] = 9;
    const bytes = buildCfb({ First: filled(10, 1), Workbook: big });
    expect(readCfbStream(bytes, 'Workbook')).toEqual(big);
    expect(readCfbStream(bytes, 'first')).toEqual(filled(10, 1));
  });

  it('finds the FAT through DIFAT sectors', () => {
    const bytes = buildCfb({ Workbook: filled(600, 3) }, { useDifat: true });
    expect(readCfbStream(bytes, 'Workbook')).toEqual(filled(600, 3));
  });

  it('returns null when there is no such stream', () => {
    expect(readCfbStream(buildCfb({ Book: filled(4, 1) }), 'Workbook')).toBeNull();
    expect(readCfbStream(buildCfb({}), 'Workbook')).toBeNull();
  });

  it('rejects unknown sector sizes', () => {
    const bytes = buildCfb({ Workbook: filled(4, 1) });
    viewOf(bytes).setUint16(30, 10, true);
    expect(() => readCfbStream(bytes, 'Workbook')).toThrow('truncated or corrupt (sector size)');
  });

  it('rejects looping and broken sector chains', () => {
    const looping = buildCfb({ Workbook: filled(1024, 1) });
    // The stream starts in sector 3; point its second sector back at it.
    viewOf(looping).setUint32(SECTOR + 4 * 4, 3, true);
    expect(() => readCfbStream(looping, 'Workbook')).toThrow('truncated or corrupt (sector chain)');

    const broken = buildCfb({ Workbook: filled(1024, 1) });
    viewOf(broken).setUint32(SECTOR + 3 * 4, FREE, true);
    expect(() => readCfbStream(broken, 'Workbook')).toThrow('truncated or corrupt (sector chain)');
  });

  it('rejects streams longer than their chain', () => {
    const bytes = buildCfb({ Workbook: filled(10, 1) });
    viewOf(bytes).setUint32(2 * SECTOR + 128 + 120, 5000, true);
    expect(() => readCfbStream(bytes, 'Workbook')).toThrow('truncated or corrupt (stream)');
  });

  it('rejects files cut short', () => {
    expect(() => readCfbStream(new Uint8Array(100), 'Workbook')).toThrow(
      'truncated or corrupt (header)',
    );
  });
});
