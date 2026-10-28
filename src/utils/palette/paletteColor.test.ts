import { describe, expect, it } from 'vitest';
import {
  MAX_PALETTE_TEXT_LENGTH,
  normalizePaletteColor,
  paletteColorKey,
  parsePaletteColor,
} from './paletteColor';

describe('normalizePaletteColor', () => {
  it('normalizes the color and tidies the name and group', () => {
    expect(
      normalizePaletteColor({ name: '  brick\t red ', color: 'C8553D', group: ' base ' }),
    ).toEqual({ name: 'brick red', color: '#c8553d', group: 'base' });
  });

  it('drops a blank or missing group', () => {
    expect(normalizePaletteColor({ name: 'ink', color: '#111', group: '  ' })).toEqual({
      name: 'ink',
      color: '#111111',
    });
    expect(normalizePaletteColor({ name: 'ink', color: '#111', group: undefined })).toEqual({
      name: 'ink',
      color: '#111111',
    });
  });

  it('replaces control characters, which would break an exported file', () => {
    expect(normalizePaletteColor({ name: 'a\u0000b\u007fc', color: '#000' })?.name).toBe('a b c');
  });

  it('caps long names', () => {
    const name = normalizePaletteColor({ name: 'x'.repeat(200), color: '#000' })?.name;
    expect(name).toHaveLength(MAX_PALETTE_TEXT_LENGTH);
  });

  it('returns null for a blank name or a color that is not hex', () => {
    expect(normalizePaletteColor({ name: ' \u0001 ', color: '#000' })).toBeNull();
    expect(normalizePaletteColor({ name: 'red', color: 'red' })).toBeNull();
  });
});

describe('parsePaletteColor', () => {
  it('returns the normalized color', () => {
    expect(parsePaletteColor({ name: 'teal', color: '#2A9D8F' })).toEqual({
      name: 'teal',
      color: '#2a9d8f',
    });
  });

  it('throws a RangeError for invalid input', () => {
    expect(() => parsePaletteColor({ name: '', color: '#000' })).toThrow(RangeError);
    expect(() => parsePaletteColor({ name: 'teal', color: 'teal' })).toThrow(
      'Not a palette color: "teal" teal',
    );
  });
});

describe('paletteColorKey', () => {
  it('matches names regardless of case, but not different colors', () => {
    const key = paletteColorKey({ name: 'Sea Green', color: '#2e8b57' });
    expect(paletteColorKey({ name: 'sea green', color: '#2e8b57', group: 'base' })).toBe(key);
    expect(paletteColorKey({ name: 'sea green', color: '#2e8b58' })).not.toBe(key);
  });
});
