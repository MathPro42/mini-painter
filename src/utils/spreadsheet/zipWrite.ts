import { concatBytes, viewOf } from './bytes';

export interface ZipFile {
  /** Path inside the archive, with forward slashes. */
  readonly name: string;
  readonly data: Uint8Array;
}

// 1980-01-01 (month 1 in bits 5-8, day 1 in bits 0-4), the earliest DOS date.
// A fixed timestamp keeps exports byte-identical.
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES_FLAG = 0x0800;

/**
 * Builds an uncompressed zip archive. Palettes are a few kilobytes, so
 * compressing them is not worth any code.
 */
export function createZip(files: readonly ZipFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = header(30, name, (view) => {
      view.setUint32(0, 0x04034b50, true);
      writeCommonFields(view, 4, crc, file.data.byteLength, name.byteLength);
    });
    directory.push(
      header(46, name, (view) => {
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        writeCommonFields(view, 6, crc, file.data.byteLength, name.byteLength);
        view.setUint32(42, offset, true);
      }),
    );
    parts.push(local, file.data);
    offset += local.byteLength + file.data.byteLength;
  }
  const directoryBytes = concatBytes(directory);
  const end = new Uint8Array(22);
  const view = viewOf(end);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directoryBytes.byteLength, true);
  view.setUint32(16, offset, true);
  return concatBytes([...parts, directoryBytes, end]);
}

function header(size: number, name: Uint8Array, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size + name.byteLength);
  write(viewOf(bytes));
  bytes.set(name, size);
  return bytes;
}

/** Writes the fields local and central headers share, starting at "version needed". */
function writeCommonFields(
  view: DataView,
  at: number,
  crc: number,
  size: number,
  nameLength: number,
): void {
  view.setUint16(at, 20, true);
  view.setUint16(at + 2, UTF8_NAMES_FLAG, true);
  view.setUint16(at + 8, DOS_DATE, true);
  view.setUint32(at + 10, crc, true);
  view.setUint32(at + 14, size, true);
  view.setUint32(at + 18, size, true);
  view.setUint16(at + 22, nameLength, true);
}

let crcTable: Uint32Array | null = null;

/** CRC-32 as zip uses it (IEEE polynomial, reflected). */
export function crc32(bytes: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
