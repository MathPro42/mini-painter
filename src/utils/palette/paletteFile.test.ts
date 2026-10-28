import { describe, expect, it } from 'vitest';
import xlsFixture from '../spreadsheet/fixtures/palette.xls?inline';
import xlsxFixture from '../spreadsheet/fixtures/palette.xlsx?inline';
import { readSpreadsheet } from '../spreadsheet/readSpreadsheet';
import { MAX_PALETTE_COLORS } from './paletteColor';
import type { PaletteColor } from './paletteColor';
import {
  paletteFileName,
  paletteFromRows,
  paletteToRows,
  readPaletteFile,
  writePaletteFile,
} from './paletteFile';

const loadFixture = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

// Recipes name rows by numeric Id ("1"), or by name ignoring case ("Slate Blue").
const FIXTURE_COLORS: PaletteColor[] = [
  {
    name: 'brick red',
    color: '#c8553d',
    group: 'base',
    recipe: { layer: 'mustard #e0b13c', shade: 'ωmega teal #2a9d8f' },
  },
  { name: 'sea green', color: '#2e8b57', group: 'base', recipe: { layer: 'slate blue #3d5a80' } },
  { name: 'mustard', color: '#e0b13c', group: 'layer' },
  { name: 'slate blue', color: '#3d5a80', group: 'layer' },
  { name: 'grüne Wiese', color: '#6a994e' },
  { name: 'Ωmega teal', color: '#2a9d8f', group: 'wash', opacity: 0.6 },
];

describe('readPaletteFile', () => {
  it.each([
    ['.xlsx', xlsxFixture],
    ['.xls', xlsFixture],
  ])('reads a %s palette, skipping the row without a color', async (_, fixture) => {
    expect(await readPaletteFile(await loadFixture(fixture))).toEqual({
      colors: FIXTURE_COLORS,
      skipped: 1,
    });
  });

  it('reads a CSV palette', async () => {
    const csv = 'Name,Colour\nbrick red,#c8553d\n';
    expect(await readPaletteFile(new TextEncoder().encode(csv))).toEqual({
      colors: [{ name: 'brick red', color: '#c8553d' }],
      skipped: 0,
    });
  });
});

describe('writePaletteFile', () => {
  it('writes an .xlsx file that reads back as the same palette', async () => {
    const bytes = writePaletteFile(FIXTURE_COLORS);
    expect(await readPaletteFile(bytes)).toEqual({ colors: FIXTURE_COLORS, skipped: 0 });
    expect((await readSpreadsheet(bytes))[0]).toEqual([
      'Name',
      'Value',
      'Type',
      'Id',
      'Layer',
      'Shade',
      'Highlight',
    ]);
  });

  it('keeps washes and recipes through an export and import', async () => {
    const colors: PaletteColor[] = [
      {
        name: 'brick red',
        color: '#c8553d',
        group: 'base',
        recipe: { layer: 'coral #e07a5f', shade: 'umber wash #5c4033' },
      },
      { name: 'coral', color: '#e07a5f', group: 'layer', recipe: { shade: 'umber wash #5c4033' } },
      { name: 'umber wash', color: '#5c4033', group: 'wash', opacity: 0.6 },
    ];
    expect(await readPaletteFile(writePaletteFile(colors))).toEqual({ colors, skipped: 0 });
  });
});

describe('paletteFromRows', () => {
  it('finds the heading row below title rows and maps its columns', () => {
    const rows = [
      ['My colors'],
      ['Type', 'Paint', 'Hex code'],
      ['base', 'brick red', 'c8553d'],
      ['', 'ink', 'black'],
    ];
    expect(paletteFromRows(rows).colors).toEqual([
      { name: 'brick red', color: '#c8553d', group: 'base' },
      { name: 'ink', color: '#000000' },
    ]);
  });

  it('names unnamed colors by their hex value, keeping any alpha as the opacity', () => {
    const rows = [['RGB'], ['rgb(200, 85, 61)'], ['#2e8b57aa']];
    expect(paletteFromRows(rows).colors).toEqual([
      { name: '#c8553d', color: '#c8553d' },
      { name: '#2e8b57', color: '#2e8b57', opacity: 0.667 },
    ]);
  });

  it('keeps the alpha of rgba() washes', () => {
    const rows = [
      ['Name', 'Value', 'Type'],
      ['umber wash', 'Rgba(92, 64, 51,.6)', 'Shade'],
    ];
    expect(paletteFromRows(rows).colors).toEqual([
      { name: 'umber wash', color: '#5c4033', group: 'Shade', opacity: 0.6 },
    ]);
  });

  it('reads recipes from Layer, Shade and Highlight columns naming rows by Id', () => {
    const rows = [
      ['Name', 'Value', 'Id', 'Shade', 'Layer', 'Highlight'],
      ['brick red', '#c8553d', 'p-1', 'p-3', 'p-2', 'p-9'],
      ['coral', '#e07a5f', 'p-2', '', '', ''],
      ['umber wash', 'rgba(92, 64, 51, .6)', 'p-3', '', '', ''],
    ];
    expect(paletteFromRows(rows).colors[0]).toEqual({
      name: 'brick red',
      color: '#c8553d',
      recipe: { layer: 'coral #e07a5f', shade: 'umber wash #5c4033' },
    });
  });

  it('falls back to the hex value when the name cell is unusable', () => {
    const rows = [
      ['Name', 'Color'],
      ['\u0001', '#c8553d'],
    ];
    expect(paletteFromRows(rows).colors).toEqual([{ name: '#c8553d', color: '#c8553d' }]);
  });

  it('counts non-blank rows without a usable color, but not blank ones', () => {
    const rows = [
      ['Name', 'Value'],
      ['brick red', '#c8553d'],
      ['', '  '],
      ['unknown', 'tbd'],
    ];
    expect(paletteFromRows(rows)).toEqual({
      colors: [{ name: 'brick red', color: '#c8553d' }],
      skipped: 1,
    });
  });

  it('reads rows without headings, taking only unmistakable colors', () => {
    const rows = [
      ['brick red', '#c8553d'],
      ['red', 'black'],
      ['rgb(46, 139, 87)', 'sea green', 'extra'],
      ['', '#111'],
    ];
    expect(paletteFromRows(rows)).toEqual({
      colors: [
        { name: 'brick red', color: '#c8553d' },
        { name: 'sea green', color: '#2e8b57' },
        { name: '#111111', color: '#111111' },
      ],
      skipped: 1,
    });
  });

  it('throws a RangeError when there are no colors', () => {
    expect(() =>
      paletteFromRows([
        ['Name', 'Value'],
        ['a', 'b'],
      ]),
    ).toThrow('No colors found');
    expect(() => paletteFromRows([])).toThrow(RangeError);
  });

  it('throws a RangeError for more colors than a palette holds', () => {
    const rows = Array.from({ length: MAX_PALETTE_COLORS + 1 }, () => ['#c8553d']);
    expect(() => paletteFromRows(rows)).toThrow(`more than ${String(MAX_PALETTE_COLORS)} colors`);
  });
});

describe('paletteToRows', () => {
  it('writes name, color and group under headings', () => {
    expect(
      paletteToRows([
        { name: 'brick red', color: '#c8553d', group: 'base' },
        { name: 'ink', color: '#111111' },
      ]),
    ).toEqual([
      ['Name', 'Value', 'Type'],
      ['brick red', '#c8553d', 'base'],
      ['ink', '#111111', ''],
    ]);
  });

  it('writes washes as rgba() and recipes as Ids', () => {
    expect(
      paletteToRows([
        { name: 'brick red', color: '#c8553d', recipe: { shade: 'umber wash #5c4033' } },
        { name: 'umber wash', color: '#5c4033', opacity: 0.6 },
      ]),
    ).toEqual([
      ['Name', 'Value', 'Id', 'Layer', 'Shade', 'Highlight'],
      ['brick red', '#c8553d', '1', '', '2', ''],
      ['umber wash', 'rgba(92, 64, 51, 0.6)', '2', '', '', ''],
    ]);
  });

  it('leaves out the Type column when no color has a group', () => {
    expect(paletteToRows([{ name: 'ink', color: '#111111' }])).toEqual([
      ['Name', 'Value'],
      ['ink', '#111111'],
    ]);
  });
});

describe('paletteFileName', () => {
  it('names the export after the palette, replacing characters file systems reject', () => {
    expect(paletteFileName('base coats')).toBe('base coats.xlsx');
    expect(paletteFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.xlsx');
  });
});
