import { describe, expect, it } from 'vitest';
import { deflate } from '../deflate';
import { insertPngChunk, listPngChunks } from '../png/pngChunks';
import { encodeITxt } from '../png/pngText';
import { onePixelPng } from '../png/testPng';
import {
  embedSavedWork,
  encodeSavedWork,
  extractSavedWork,
  parseSavedWork,
  SAVED_WORK_KEYWORD,
} from './savedWork';
import type { SavedWork } from './savedWork';

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="cube" width="4" height="4"/></svg>';
const WORK: SavedWork = {
  svgSource: DRAWING,
  paints: new Map([
    [
      'region-0',
      {
        base: { color: '#c8553d', name: 'Brick red' },
        shade: { color: '#202020', opacity: 0.6 },
        highlight: { color: '#c0c0c0', metallic: true },
      },
    ],
  ]),
};

const json = (data: Record<string, unknown>): string =>
  JSON.stringify({ format: 'mini-painter-work', version: 1, svg: DRAWING, paints: {}, ...data });

describe('encodeSavedWork and parseSavedWork', () => {
  it('round-trips the drawing and its paints', () => {
    expect(parseSavedWork(encodeSavedWork(WORK))).toEqual(WORK);
  });

  it('normalizes colors as it reads them', () => {
    const work = parseSavedWork(json({ paints: { 'region-0': { base: { color: '#C8553D' } } } }));
    expect(work.paints.get('region-0')).toEqual({ base: { color: '#c8553d' } });
  });

  it('explains work from a newer version', () => {
    expect(() => parseSavedWork(json({ version: 2 }))).toThrow(
      new RangeError('The work was saved by a newer version of Mini Painter'),
    );
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['another JSON format', JSON.stringify({ version: 1 })],
    ['a missing drawing', json({ svg: 3 })],
    ['paints that are a list', json({ paints: [] })],
    ['a region paint that is not an object', json({ paints: { a: 'red' } })],
    ['a step paint that is not an object', json({ paints: { a: { base: 'red' } } })],
    ['a color that is not text', json({ paints: { a: { base: { color: 1 } } } })],
    ['a name that is not text', json({ paints: { a: { base: { color: '#000', name: 1 } } } })],
  ])('refuses %s', (_, text) => {
    expect(() => parseSavedWork(text)).toThrow(new RangeError('The saved work is damaged'));
  });

  it('refuses unknown steps and invalid colors', () => {
    expect(() => parseSavedWork(json({ paints: { a: { glaze: { color: '#000' } } } }))).toThrow(
      'unknown paint step: "glaze"',
    );
    expect(() => parseSavedWork(json({ paints: { a: { base: { color: 'red' } } } }))).toThrow(
      RangeError,
    );
  });
});

describe('embedSavedWork and extractSavedWork', () => {
  it('stores the work in a compressed iTXt chunk the PNG keeps', async () => {
    const png = await embedSavedWork(onePixelPng(), WORK);
    expect(listPngChunks(png).map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'iTXt', 'IEND']);
    expect(await extractSavedWork(png, 1_000_000)).toEqual(WORK);
  });

  it('also reads uncompressed text', async () => {
    const text = new TextEncoder().encode(encodeSavedWork(WORK));
    const chunk = encodeITxt({ keyword: SAVED_WORK_KEYWORD, compressed: false, text });
    expect(await extractSavedWork(insertPngChunk(onePixelPng(), 'iTXt', chunk), 10)).toEqual(WORK);
  });

  it('skips other text chunks', async () => {
    const other = encodeITxt({ keyword: 'Comment', compressed: false, text: new Uint8Array() });
    const png = await embedSavedWork(insertPngChunk(onePixelPng(), 'iTXt', other), WORK);
    expect(await extractSavedWork(png, 1_000_000)).toEqual(WORK);
  });

  it('reports a PNG with no saved work', async () => {
    await expect(extractSavedWork(onePixelPng(), 1_000_000)).rejects.toThrow(
      new RangeError('This PNG has no saved Mini Painter work'),
    );
  });

  it('refuses work that expands past the limit', async () => {
    const png = await embedSavedWork(onePixelPng(), WORK);
    await expect(extractSavedWork(png, 50)).rejects.toThrow(
      new RangeError('The saved work is too large'),
    );
  });

  it('refuses a damaged compressed stream', async () => {
    const text = (await deflate(new TextEncoder().encode('{}'), 'deflate')).subarray(0, 3);
    const chunk = encodeITxt({ keyword: SAVED_WORK_KEYWORD, compressed: true, text });
    await expect(
      extractSavedWork(insertPngChunk(onePixelPng(), 'iTXt', chunk), 100),
    ).rejects.toThrow(RangeError);
  });
});
