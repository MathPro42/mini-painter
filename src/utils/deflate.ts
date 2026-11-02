import { concatBytes } from './spreadsheet/bytes';

/** `deflate` is zlib-wrapped (PNG); `deflate-raw` has no wrapper (zip). */
export type DeflateFormat = 'deflate' | 'deflate-raw';

/** Compresses `data` with the browser's CompressionStream. */
export async function deflate(data: Uint8Array, format: DeflateFormat): Promise<Uint8Array> {
  const reader = streamOf(data).pipeThrough(new CompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    chunks.push(chunk.value);
  }
  return concatBytes(chunks);
}

/**
 * Decompresses `data`. Throws a RangeError naming `name` when it is not
 * valid compressed data or would expand past `maxBytes`.
 */
export async function inflate(
  data: Uint8Array,
  format: DeflateFormat,
  maxBytes: number,
  name: string,
): Promise<Uint8Array> {
  // A declared size can lie, so the output is counted as it streams.
  const reader = streamOf(data).pipeThrough(new DecompressionStream(format)).getReader();
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

/** A stream of `data`. Not `Blob.stream()`: jsdom's Blob lacks it. */
function streamOf(data: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream({
    start: (controller) => {
      controller.enqueue(data.slice());
      controller.close();
    },
  });
}
