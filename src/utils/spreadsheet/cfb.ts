import { concatBytes, sliceBytes, startsWithBytes, viewOf } from './bytes';

// Compound File Binary format ([MS-CFB]): the container of legacy .xls files.
// A FAT-like table chains fixed-size sectors into streams; streams smaller than
// the cutoff live in 64-byte "mini sectors" inside the root entry's stream.

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const NO_SECTOR = 0xffffffff;
const HEADER_DIFAT_ENTRIES = 109;
const DIRECTORY_ENTRY_BYTES = 128;
const STREAM = 2;

interface DirectoryEntry {
  readonly name: string;
  readonly type: number;
  readonly left: number;
  readonly right: number;
  readonly child: number;
  readonly start: number;
  readonly size: number;
}

interface Container {
  readonly bytes: Uint8Array;
  readonly sectorSize: number;
  readonly fat: readonly number[];
}

/** Whether `bytes` starts like a compound file (which is what an .xls file is). */
export function isCfb(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, SIGNATURE);
}

/**
 * Returns the contents of the top-level stream called `name` (case-insensitive),
 * or `null` when there is none. Throws a RangeError when the file is corrupt.
 */
export function readCfbStream(bytes: Uint8Array, name: string): Uint8Array | null {
  const header = viewOf(sliceBytes(bytes, 0, 512, 'header'));
  const sectorSize = 2 ** header.getUint16(30, true);
  if (sectorSize !== 512 && sectorSize !== 4096) {
    throw new RangeError('The file is truncated or corrupt (sector size)');
  }
  const container: Container = { bytes, sectorSize, fat: readFat(bytes, header, sectorSize) };
  const entries = readDirectory(container, header.getUint32(48, true));
  const root = entries[0];
  const entry = findChild(entries, root?.child ?? NO_SECTOR, name.toLowerCase());
  if (root === undefined || entry === undefined) {
    return null;
  }
  if (entry.size >= header.getUint32(56, true)) {
    return readChain(container, entry.start, entry.size);
  }
  const miniStream = readChain(container, root.start, root.size);
  const miniFat = toNumbers(readChain(container, header.getUint32(60, true)));
  const miniContainer: Container = { bytes: miniStream, sectorSize: 64, fat: miniFat };
  return readChain(miniContainer, entry.start, entry.size, false);
}

function readFat(bytes: Uint8Array, header: DataView, sectorSize: number): number[] {
  const fatSectors: number[] = [];
  for (let index = 0; index < HEADER_DIFAT_ENTRIES; index += 1) {
    fatSectors.push(header.getUint32(76 + index * 4, true));
  }
  // Large files continue the sector list in a chain of DIFAT sectors, each ending in a "next" link.
  // The count is capped by the file's sector count, so a looping chain still ends.
  const sectorCount = Math.floor(bytes.byteLength / sectorSize);
  let difat = header.getUint32(68, true);
  for (
    let count = Math.min(header.getUint32(72, true), sectorCount);
    count > 0 && difat < END_OF_CHAIN;
    count -= 1
  ) {
    const ids = toNumbers(sliceBytes(bytes, (difat + 1) * sectorSize, sectorSize, 'DIFAT'));
    difat = ids.pop() ?? END_OF_CHAIN;
    fatSectors.push(...ids);
  }
  // Unused slots hold NO_SECTOR; skipping them keeps the list in order either way.
  const used = fatSectors
    .filter((sector) => sector !== NO_SECTOR)
    .slice(0, header.getUint32(44, true));
  return used.flatMap((sector) =>
    toNumbers(sliceBytes(bytes, (sector + 1) * sectorSize, sectorSize, 'FAT')),
  );
}

/**
 * Concatenates the sectors chained from `start`, cut to `size` when given.
 * Regular sectors are offset by the header, which takes up sector "-1".
 */
function readChain(
  container: Container,
  start: number,
  size?: number,
  headerOffset = true,
): Uint8Array {
  const { bytes, sectorSize, fat } = container;
  const chunks: Uint8Array[] = [];
  for (let sector = start; sector !== END_OF_CHAIN; sector = fat[sector] ?? NO_SECTOR) {
    // A chain longer than the table loops back on itself.
    if (sector >= fat.length || chunks.length >= fat.length) {
      throw new RangeError('The file is truncated or corrupt (sector chain)');
    }
    const offset = (sector + (headerOffset ? 1 : 0)) * sectorSize;
    chunks.push(
      sliceBytes(bytes, offset, Math.min(sectorSize, bytes.byteLength - offset), 'sector'),
    );
  }
  const data = concatBytes(chunks);
  if (size === undefined) {
    return data;
  }
  return sliceBytes(data, 0, size, 'stream');
}

function readDirectory(container: Container, start: number): DirectoryEntry[] {
  const data = readChain(container, start);
  const view = viewOf(data);
  const entries: DirectoryEntry[] = [];
  for (
    let offset = 0;
    offset + DIRECTORY_ENTRY_BYTES <= data.byteLength;
    offset += DIRECTORY_ENTRY_BYTES
  ) {
    const nameBytes = Math.min(64, Math.max(0, view.getUint16(offset + 64, true) - 2));
    entries.push({
      name: new TextDecoder('utf-16le').decode(data.subarray(offset, offset + nameBytes)),
      type: view.getUint8(offset + 66),
      left: view.getUint32(offset + 68, true),
      right: view.getUint32(offset + 72, true),
      child: view.getUint32(offset + 76, true),
      start: view.getUint32(offset + 116, true),
      // Version 3 files leave the high 32 bits of the size undefined, so only the low half is read.
      size: view.getUint32(offset + 120, true),
    });
  }
  return entries;
}

/** Searches the siblings tree under a storage (a red-black tree linked by left/right ids). */
function findChild(
  entries: readonly DirectoryEntry[],
  first: number,
  lowerCaseName: string,
): DirectoryEntry | undefined {
  const pending = [first];
  const visited = new Set<number>();
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const entry = entries[id];
    if (entry === undefined || visited.has(id)) {
      continue;
    }
    visited.add(id);
    if (entry.type === STREAM && entry.name.toLowerCase() === lowerCaseName) {
      return entry;
    }
    pending.push(entry.left, entry.right);
  }
  return undefined;
}

function toNumbers(bytes: Uint8Array): number[] {
  const view = viewOf(bytes);
  return Array.from({ length: Math.floor(bytes.byteLength / 4) }, (_, index) =>
    view.getUint32(index * 4, true),
  );
}
