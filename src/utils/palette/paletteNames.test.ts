import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE_NAME,
  normalizePaletteName,
  paletteNameFromFile,
  uniquePaletteName,
} from './paletteNames';

describe('normalizePaletteName', () => {
  it('tidies whitespace and falls back to the default name when blank', () => {
    expect(normalizePaletteName('  base \t coats ')).toBe('base coats');
    expect(normalizePaletteName(' \u0000 ')).toBe(DEFAULT_PALETTE_NAME);
  });
});

describe('paletteNameFromFile', () => {
  it('drops the last extension only', () => {
    expect(paletteNameFromFile('base coats.xlsx')).toBe('base coats');
    expect(paletteNameFromFile('v1.2 washes.csv')).toBe('v1.2 washes');
    expect(paletteNameFromFile('no extension')).toBe('no extension');
  });

  it('keeps a leading dot, and falls back to the default name', () => {
    expect(paletteNameFromFile('.hidden')).toBe('.hidden');
    expect(paletteNameFromFile('')).toBe(DEFAULT_PALETTE_NAME);
  });
});

describe('uniquePaletteName', () => {
  it('returns free names unchanged', () => {
    expect(uniquePaletteName('metals', ['washes'])).toBe('metals');
  });

  it('numbers taken names, ignoring case', () => {
    expect(uniquePaletteName('Metals', ['metals'])).toBe('Metals (2)');
    expect(uniquePaletteName('metals', ['metals', 'METALS (2)'])).toBe('metals (3)');
  });
});
