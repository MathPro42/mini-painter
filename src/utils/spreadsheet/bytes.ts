/** A little-endian view of `bytes` that respects its offset into a larger buffer. */
export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Whether `bytes` begins with `signature`. */
export function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Joins chunks into one array. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Returns `length` bytes at `offset`, or throws a RangeError naming `what`
 * when the file ends first. Corrupt or hostile files must fail loudly here
 * rather than read past the end.
 */
export function sliceBytes(
  bytes: Uint8Array,
  offset: number,
  length: number,
  what: string,
): Uint8Array {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new RangeError(`The file is truncated or corrupt (${what})`);
  }
  return bytes.subarray(offset, offset + length);
}
