import { crc32 } from '../crc32';
import { concatBytes, sliceBytes, startsWithBytes, viewOf } from '../spreadsheet/bytes';

/** One chunk of a PNG file. */
export interface PngChunk {
  /** Four ASCII letters, such as `IHDR` or `iTXt`. */
  readonly type: string;
  readonly data: Uint8Array;
  /** Where the chunk's length field starts in the file. */
  readonly offset: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// The PNG spec caps chunk lengths at 2^31 - 1.
const MAX_CHUNK_BYTES = 0x7fffffff;
const latin1 = new TextDecoder('latin1');

/** Whether `bytes` starts with the PNG signature. */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= SIGNATURE.length && startsWithBytes(bytes, SIGNATURE);
}

/**
 * Lists the chunks up to and including `IEND`. Throws a RangeError for a
 * file that is not a PNG, is truncated, or has a chunk whose CRC is wrong.
 */
export function listPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) {
    throw new RangeError('Not a PNG image');
  }
  const chunks: PngChunk[] = [];
  let offset = SIGNATURE.length;
  for (;;) {
    const length = viewOf(sliceBytes(bytes, offset, 4, 'png chunk')).getUint32(0);
    if (length > MAX_CHUNK_BYTES) {
      throw new RangeError('The file is truncated or corrupt (png chunk)');
    }
    const typeAndData = sliceBytes(bytes, offset + 4, 4 + length, 'png chunk');
    const crc = viewOf(sliceBytes(bytes, offset + 8 + length, 4, 'png chunk')).getUint32(0);
    if (crc !== crc32(typeAndData)) {
      throw new RangeError('The file is truncated or corrupt (png checksum)');
    }
    const type = latin1.decode(typeAndData.subarray(0, 4));
    chunks.push({ type, data: typeAndData.subarray(4), offset });
    if (type === 'IEND') {
      return chunks;
    }
    offset += 12 + length;
  }
}

/** Encodes one chunk: length, type, data and CRC. */
export function encodePngChunk(type: string, data: Uint8Array): Uint8Array {
  if (!/^[A-Za-z]{4}$/.test(type)) {
    throw new RangeError(`Not a PNG chunk type: "${type}"`);
  }
  const typeAndData = concatBytes([new TextEncoder().encode(type), data]);
  const length = new Uint8Array(4);
  viewOf(length).setUint32(0, data.byteLength);
  const crc = new Uint8Array(4);
  viewOf(crc).setUint32(0, crc32(typeAndData));
  return concatBytes([length, typeAndData, crc]);
}

/** A copy of `png` with a new chunk right before `IEND`. Throws like listPngChunks. */
export function insertPngChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const end = listPngChunks(png).at(-1)?.offset ?? png.byteLength;
  return concatBytes([png.subarray(0, end), encodePngChunk(type, data), png.subarray(end)]);
}
