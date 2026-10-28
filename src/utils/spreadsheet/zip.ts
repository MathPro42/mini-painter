import { concatBytes, sliceBytes, startsWithBytes, viewOf } from './bytes';

/** One file listed in a zip archive's central directory. */
export interface ZipEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localHeaderOffset: number;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const ENCRYPTED_FLAG = 0x0001;

/** Whether `bytes` starts like a zip archive (which is what an .xlsx file is). */
export function isZip(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

/** Lists the files in a zip archive. Throws a RangeError when it is not one. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = viewOf(bytes);
  const end = findEndRecord(view);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    throw new RangeError('Zip64 archives are not supported');
  }
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = sliceBytes(bytes, offset, 46, 'zip directory');
    const fields = viewOf(header);
    if (fields.getUint32(0, true) !== CENTRAL_HEADER) {
      throw new RangeError('The file is truncated or corrupt (zip directory)');
    }
    const nameLength = fields.getUint16(28, true);
    const name = sliceBytes(bytes, offset + 46, nameLength, 'zip directory');
    entries.push({
      name: new TextDecoder().decode(name),
      flags: fields.getUint16(8, true),
      method: fields.getUint16(10, true),
      compressedSize: fields.getUint32(20, true),
      size: fields.getUint32(24, true),
      localHeaderOffset: fields.getUint32(42, true),
    });
    offset += 46 + nameLength + fields.getUint16(30, true) + fields.getUint16(32, true);
  }
  return entries;
}

function findEndRecord(view: DataView): number {
  const last = view.byteLength - END_RECORD_BYTES;
  for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT_BYTES); offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new RangeError('Not a zip archive');
}

/**
 * Extracts one file. Throws a RangeError when it is encrypted, uses an
 * unsupported compression method, or would expand past `maxBytes`.
 */
export async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  maxBytes: number,
): Promise<Uint8Array> {
  if ((entry.flags & ENCRYPTED_FLAG) !== 0) {
    throw new RangeError(`${entry.name} is encrypted`);
  }
  if (entry.size > maxBytes) {
    throw new RangeError(`${entry.name} is too large`);
  }
  const header = viewOf(sliceBytes(bytes, entry.localHeaderOffset, 30, 'zip entry'));
  if (header.getUint32(0, true) !== LOCAL_HEADER) {
    throw new RangeError('The file is truncated or corrupt (zip entry)');
  }
  const start =
    entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = sliceBytes(bytes, start, entry.compressedSize, 'zip entry');
  if (entry.method === STORED) {
    return data;
  }
  if (entry.method === DEFLATED) {
    return inflate(data, entry.name, maxBytes);
  }
  throw new RangeError(`${entry.name} uses an unsupported compression method`);
}

async function inflate(data: Uint8Array, name: string, maxBytes: number): Promise<Uint8Array> {
  // The declared size can lie, so the output is counted as it streams.
  const reader = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel();
        throw new RangeError(`${name} is too large`);
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    throw error instanceof RangeError ? error : new RangeError(`${name} could not be decompressed`);
  }
  return concatBytes(chunks);
}
