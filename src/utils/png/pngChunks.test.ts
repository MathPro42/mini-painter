import { describe, expect, it } from 'vitest';
import { encodePngChunk, insertPngChunk, isPng, listPngChunks } from './pngChunks';
import { onePixelPng } from './testPng';

const encoder = new TextEncoder();
const types = (png: Uint8Array): string[] => listPngChunks(png).map((chunk) => chunk.type);

describe('isPng', () => {
  it('checks the signature', () => {
    expect(isPng(onePixelPng())).toBe(true);
    expect(isPng(encoder.encode('<svg/>'))).toBe(false);
    expect(isPng(new Uint8Array())).toBe(false);
  });
});

describe('listPngChunks', () => {
  it('lists chunks with their data', () => {
    const chunks = listPngChunks(onePixelPng());
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks[0]?.data.byteLength).toBe(13);
    expect(chunks[0]?.offset).toBe(8);
  });

  it('stops at IEND, ignoring trailing bytes', () => {
    const png = onePixelPng();
    const padded = new Uint8Array(png.byteLength + 3);
    padded.set(png);
    expect(types(padded)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('refuses files that are not PNGs', () => {
    expect(() => listPngChunks(encoder.encode('plain text'))).toThrow(
      new RangeError('Not a PNG image'),
    );
  });

  it('refuses truncated files', () => {
    const png = onePixelPng();
    expect(() => listPngChunks(png.subarray(0, png.byteLength - 6))).toThrow(
      new RangeError('The file is truncated or corrupt (png chunk)'),
    );
  });

  it('refuses a chunk whose checksum is wrong', () => {
    const png = onePixelPng();
    png[20] = (png[20] ?? 0) ^ 0xff;
    expect(() => listPngChunks(png)).toThrow(
      new RangeError('The file is truncated or corrupt (png checksum)'),
    );
  });

  it('refuses lengths past the PNG limit', () => {
    const png = onePixelPng();
    png.set([0x80, 0, 0, 0], 8);
    expect(() => listPngChunks(png)).toThrow(RangeError);
  });
});

describe('encodePngChunk and insertPngChunk', () => {
  it('inserts a chunk right before IEND', () => {
    const png = insertPngChunk(onePixelPng(), 'teXt', encoder.encode('a\0b'));
    const chunks = listPngChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'teXt', 'IEND']);
    expect(chunks[2]?.data).toEqual(encoder.encode('a\0b'));
  });

  it('refuses invalid chunk types', () => {
    expect(() => encodePngChunk('no', new Uint8Array())).toThrow(RangeError);
  });
});
