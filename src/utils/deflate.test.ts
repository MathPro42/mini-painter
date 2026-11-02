import { describe, expect, it } from 'vitest';
import { deflate, inflate } from './deflate';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('deflate and inflate', () => {
  it.each(['deflate', 'deflate-raw'] as const)('round-trips %s data', async (format) => {
    const text = 'brick red '.repeat(100);
    const packed = await deflate(encoder.encode(text), format);
    expect(packed.byteLength).toBeLessThan(text.length);
    expect(decoder.decode(await inflate(packed, format, 10_000, 'sample'))).toBe(text);
  });

  it('refuses output past the limit', async () => {
    const packed = await deflate(new Uint8Array(5000), 'deflate');
    await expect(inflate(packed, 'deflate', 4999, 'sample')).rejects.toThrow(
      new RangeError('sample is too large'),
    );
  });

  it('reports data that is not compressed', async () => {
    await expect(inflate(encoder.encode('plain'), 'deflate', 100, 'sample')).rejects.toThrow(
      new RangeError('sample could not be decompressed'),
    );
  });
});
