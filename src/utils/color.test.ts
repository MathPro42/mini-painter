import { describe, expect, it } from 'vitest';
import {
  cssColorAlpha,
  hexColorToInt,
  hexWithAlpha,
  normalizeCssColor,
  normalizeHexColor,
  normalizeOpacity,
  parseHexColor,
  rgbaText,
} from './color';

describe('normalizeHexColor', () => {
  it.each([
    ['#a1b2c3', '#a1b2c3'],
    ['A1B2C3', '#a1b2c3'],
    ['#ABC', '#aabbcc'],
    ['fff', '#ffffff'],
    ['  #123456  ', '#123456'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeHexColor(input)).toBe(expected);
  });

  it.each(['', '#', '#12', '#1234', '#12345g', 'red', '##abc', 'rgb(0,0,0)'])(
    'returns null for %j',
    (input) => {
      expect(normalizeHexColor(input)).toBeNull();
    },
  );
});

describe('parseHexColor', () => {
  it('returns the normalized color', () => {
    expect(parseHexColor('#ABC')).toBe('#aabbcc');
  });

  it('throws a RangeError naming the invalid input', () => {
    expect(() => parseHexColor('nope')).toThrow(new RangeError('Not a hex color: "nope"'));
  });
});

describe('hexColorToInt', () => {
  it('converts a 6-digit hex color', () => {
    expect(hexColorToInt('#ff8000')).toBe(0xff8000);
  });

  it('converts a 3-digit hex color', () => {
    expect(hexColorToInt('#0f0')).toBe(0x00ff00);
  });

  it('throws a RangeError for invalid input', () => {
    expect(() => hexColorToInt('nope')).toThrow(RangeError);
  });
});

describe('normalizeCssColor', () => {
  it.each([
    ['#C8553D', '#c8553d'],
    ['#abc', '#aabbcc'],
    ['#abcd', '#aabbcc'],
    ['#c8553d80', '#c8553d'],
    ['  Teal ', '#008080'],
    ['grey', '#808080'],
    ['rgb(200, 85, 61)', '#c8553d'],
    ['rgb(200 85 61 / 50%)', '#c8553d'],
    ['rgba(0,0,0,0.5)', '#000000'],
    ['rgb(100%, 50%, 0%)', '#ff8000'],
    ['rgb(300, 0, 12.4)', '#ff000c'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeCssColor(input)).toBe(expected);
  });

  it.each([
    'none',
    'currentColor',
    'url(#gradient)',
    '#12',
    '#12345',
    'rgb(1, 2)',
    'rgb(., 1, 2)',
    '',
  ])('returns null for %j', (input) => {
    expect(normalizeCssColor(input)).toBeNull();
  });
});

describe('cssColorAlpha', () => {
  it.each([
    ['Rgba(231, 128, 53,.6)', 0.6],
    ['rgb(200 85 61 / 50%)', 0.5],
    ['rgba(0, 0, 0, 2)', 1],
    ['#c8553d80', 128 / 255],
    ['#abc8', 0x88 / 255],
  ])('reads the alpha of %j', (input, expected) => {
    expect(cssColorAlpha(input)).toBeCloseTo(expected, 6);
  });

  it.each(['rgb(200, 85, 61)', '#c8553d', '#abc', 'teal', 'none', 'rgba(1, 2, 3, .)'])(
    'returns null for %j, which states no alpha',
    (input) => {
      expect(cssColorAlpha(input)).toBeNull();
    },
  );
});

describe('normalizeOpacity', () => {
  it('keeps see-through values, rounded to 3 decimals', () => {
    expect(normalizeOpacity(0.6)).toBe(0.6);
    expect(normalizeOpacity(128 / 255)).toBe(0.502);
  });

  it.each([1, 0, 0.0001, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null])(
    'returns null for %j',
    (input) => {
      expect(normalizeOpacity(input)).toBeNull();
    },
  );
});

describe('hexWithAlpha and rgbaText', () => {
  it('write a color with its opacity', () => {
    expect(hexWithAlpha('#5c4033', 0.6)).toBe('#5c403399');
    expect(hexWithAlpha('#5c4033', 1)).toBe('#5c4033ff');
    expect(rgbaText('#e78035', 0.6)).toBe('rgba(231, 128, 53, 0.6)');
  });
});
