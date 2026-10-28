import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE_NAME } from './paletteNames';
import {
  encodeSavedPalettes,
  normalizeSavedPalettes,
  SAVED_PALETTES_VERSION,
} from './savedPalettes';
import type { SavedPalettes } from './savedPalettes';

const SAVED: SavedPalettes = {
  palettes: [
    {
      name: 'base coats',
      colors: [
        {
          name: 'brick red',
          color: '#c8553d',
          group: 'base',
          recipe: { shade: 'umber wash #5c4033' },
        },
        { name: 'umber wash', color: '#5c4033', group: 'wash', opacity: 0.6 },
      ],
    },
    { name: 'washes', colors: [] },
  ],
  activeIndex: 1,
};

const json = (value: unknown): string => JSON.stringify(value);

describe('encodeSavedPalettes and normalizeSavedPalettes', () => {
  it('round-trip palettes and the active index', () => {
    expect(normalizeSavedPalettes(encodeSavedPalettes(SAVED))).toEqual(SAVED);
  });

  it('store a version and nothing beyond names and colors', () => {
    const withId = { ...SAVED, palettes: [{ ...SAVED.palettes[1], id: 'palette-9' }] };
    expect(JSON.parse(encodeSavedPalettes(withId as SavedPalettes))).toEqual({
      version: SAVED_PALETTES_VERSION,
      activeIndex: 1,
      palettes: [{ name: 'washes', colors: [] }],
    });
  });
});

describe('normalizeSavedPalettes', () => {
  it('returns null for text in another format', () => {
    expect(normalizeSavedPalettes('not json')).toBeNull();
    expect(normalizeSavedPalettes('[]')).toBeNull();
    expect(normalizeSavedPalettes(json({ version: 99, palettes: [] }))).toBeNull();
    expect(normalizeSavedPalettes(json({ version: SAVED_PALETTES_VERSION }))).toBeNull();
  });

  it('drops unusable palettes and colors but keeps the rest', () => {
    const text = json({
      version: SAVED_PALETTES_VERSION,
      activeIndex: 0,
      palettes: [
        'not a palette',
        {
          name: 42,
          colors: [
            { name: 'ink', color: '#111' },
            { name: 'ink', color: '#111111' },
            { name: 'teal', color: 'teal' },
            { name: 'sea green', color: '#2e8b57', group: 7 },
            {
              name: 'glaze',
              color: '#5c4033',
              opacity: 7,
              recipe: { layer: 3, shade: 'ink #111111' },
            },
            null,
          ],
        },
        { name: ' metals ', colors: 'none' },
      ],
    });
    expect(normalizeSavedPalettes(text)).toEqual({
      palettes: [
        {
          name: DEFAULT_PALETTE_NAME,
          colors: [
            { name: 'ink', color: '#111111' },
            { name: 'sea green', color: '#2e8b57' },
            { name: 'glaze', color: '#5c4033', recipe: { shade: 'ink #111111' } },
          ],
        },
        { name: 'metals', colors: [] },
      ],
      activeIndex: 0,
    });
  });

  it('falls back to the first palette when the active index is unusable', () => {
    const palettes = [
      { name: 'a', colors: [] },
      { name: 'b', colors: [] },
    ];
    for (const activeIndex of [5, -1, 0.5, '1', undefined]) {
      const text = json({ version: SAVED_PALETTES_VERSION, activeIndex, palettes });
      expect(normalizeSavedPalettes(text)?.activeIndex).toBe(0);
    }
    const empty = json({ version: SAVED_PALETTES_VERSION, activeIndex: 0, palettes: [] });
    expect(normalizeSavedPalettes(empty)).toEqual({ palettes: [], activeIndex: -1 });
  });
});
