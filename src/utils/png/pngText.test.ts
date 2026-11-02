import { describe, expect, it } from 'vitest';
import { decodeITxt, encodeITxt } from './pngText';

const encoder = new TextEncoder();

describe('encodeITxt and decodeITxt', () => {
  it.each([true, false])('round-trips text (compressed: %s)', (compressed) => {
    const text = encoder.encode('brick red ✓');
    expect(decodeITxt(encodeITxt({ keyword: 'Comment', compressed, text }))).toEqual({
      keyword: 'Comment',
      compressed,
      text,
    });
  });

  it('skips a language tag and translated keyword', () => {
    const data = encoder.encode('Title\0\0\0en\0Titre\0cube');
    expect(decodeITxt(data)).toEqual({
      keyword: 'Title',
      compressed: false,
      text: encoder.encode('cube'),
    });
  });

  it('refuses invalid keywords', () => {
    const text = new Uint8Array();
    expect(() => encodeITxt({ keyword: '', compressed: false, text })).toThrow(RangeError);
    expect(() => encodeITxt({ keyword: 'x'.repeat(80), compressed: false, text })).toThrow(
      RangeError,
    );
  });

  it.each([
    ['no keyword', '\0\0\0\0\0text'],
    ['no terminators', 'Title'],
    ['an unknown flag', 'Title\0\x02\0\0\0'],
    ['an unknown method', 'Title\0\x01\x05\0\0'],
  ])('refuses data with %s', (_, data) => {
    expect(() => decodeITxt(encoder.encode(data))).toThrow(
      new RangeError('The file is truncated or corrupt (png text)'),
    );
  });
});
