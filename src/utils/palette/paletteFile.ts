import { cssColorAlpha, normalizeCssColor, normalizeHexColor, rgbaText } from '../color';
import { readSpreadsheet } from '../spreadsheet/readSpreadsheet';
import type { SheetRows } from '../spreadsheet/sheetRows';
import { writeXlsx } from '../spreadsheet/xlsxWrite';
import { MAX_PALETTE_COLORS, normalizePaletteColor } from './paletteColor';
import type { PaletteColor } from './paletteColor';
import { findRecipeColumns, recipeColumns, withRecipes } from './paletteRecipe';
import type { PaletteRowColor } from './paletteRecipe';

/** Palette files are a few kilobytes; anything past this is refused unread. */
export const MAX_PALETTE_FILE_BYTES = 8 * 1024 * 1024;

/** The `accept` list for palette file inputs. */
export const PALETTE_FILE_ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt';

/** Column headings of exported palettes. Importing recognizes them, among others. */
export const PALETTE_HEADERS = ['Name', 'Value', 'Type'] as const;

/** Colors read from a palette file, and how many non-blank rows had no usable color. */
export interface PaletteImport {
  readonly colors: readonly PaletteColor[];
  readonly skipped: number;
}

// Headings compared lowercase with everything but letters removed ("Hex code" → "hexcode").
const COLOR_HEADERS = new Set([
  'value',
  'color',
  'colour',
  'hex',
  'hexcode',
  'hexcolor',
  'hexcolour',
  'hexvalue',
  'rgb',
  'colorcode',
  'colourcode',
  'colorvalue',
  'colourvalue',
]);
const NAME_HEADERS = new Set(['name', 'paint', 'paintname', 'colorname', 'colourname', 'label']);
const GROUP_HEADERS = new Set(['type', 'group', 'category', 'range', 'series']);
/** A heading row is looked for this far down, below any title rows. */
const HEADER_SEARCH_ROWS = 10;
/** Without headings, only unmistakable colors count: "#c8553d" or "rgb(…)", not "red". */
const EXPLICIT_COLOR = /^\s*(?:#|rgba?\()/i;

/**
 * Reads a palette from an .xlsx, .xls, .csv or tab-separated file. Throws a
 * RangeError when the file can't be read or holds no colors.
 */
export async function readPaletteFile(bytes: Uint8Array): Promise<PaletteImport> {
  return paletteFromRows(await readSpreadsheet(bytes));
}

/** A download name for an exported palette: its name, minus characters file systems reject. */
export function paletteFileName(paletteName: string): string {
  return `${paletteName.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
}

/** Builds an .xlsx file with one row per color, under PALETTE_HEADERS. */
export function writePaletteFile(colors: readonly PaletteColor[]): Uint8Array {
  return writeXlsx(paletteToRows(colors), 'Palette');
}

/**
 * Finds the colors in spreadsheet rows. With a heading row (a "Value",
 * "Color", "Hex"… column, plus optional "Name" and "Type", and "Layer",
 * "Shade" and "Highlight" recipe columns naming other rows by "Id" or name),
 * each row below it is a color. An `rgba()` color keeps its alpha. Without one, each row's first hex or rgb() cell is the color
 * and its first other non-blank cell the name. Unnamed colors are named by
 * their hex value.
 */
export function paletteFromRows(rows: SheetRows): PaletteImport {
  const headerRow = rows.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => row.some(isColorHeader));
  const result = headerRow === -1 ? readUnlabeled(rows) : readLabeled(rows, headerRow);
  if (result.colors.length === 0) {
    throw new RangeError('No colors found. Expected a column of hex colors such as #c8553d.');
  }
  if (result.colors.length > MAX_PALETTE_COLORS) {
    throw new RangeError(`The file has more than ${String(MAX_PALETTE_COLORS)} colors`);
  }
  return result;
}

/**
 * The rows writePaletteFile stores. See-through colors are written as
 * `rgba()`. The Type column is left out when no color has a group, and the
 * Id and recipe columns when no color has a recipe.
 */
export function paletteToRows(colors: readonly PaletteColor[]): string[][] {
  const withGroups = colors.some((color) => color.group !== undefined);
  const recipes = recipeColumns(colors);
  const header = [
    ...(withGroups ? PALETTE_HEADERS : PALETTE_HEADERS.slice(0, 2)),
    ...recipes.header,
  ];
  const rows = colors.map((color, index) => [
    color.name,
    color.opacity === undefined ? color.color : rgbaText(color.color, color.opacity),
    ...(withGroups ? [color.group ?? ''] : []),
    ...(recipes.rows[index] ?? []),
  ]);
  return [header, ...rows];
}

function readLabeled(rows: SheetRows, headerRow: number): PaletteImport {
  const header = (rows[headerRow] ?? []).map(headerKey);
  const column = (names: ReadonlySet<string>): number => header.findIndex((key) => names.has(key));
  const colorColumn = column(COLOR_HEADERS);
  const nameColumn = column(NAME_HEADERS);
  const groupColumn = column(GROUP_HEADERS);
  const { entries, skipped } = collect(rows.slice(headerRow + 1), (row) => {
    const value = row[colorColumn] ?? '';
    const color = normalizeCssColor(value) ?? normalizeHexColor(value);
    return toPaletteColor(row[nameColumn] ?? '', color, value, row[groupColumn]);
  });
  const recipes = findRecipeColumns(header);
  const colors =
    recipes === null ? entries.map((entry) => entry.color) : withRecipes(entries, recipes);
  return { colors, skipped };
}

function readUnlabeled(rows: SheetRows): PaletteImport {
  const { entries, skipped } = collect(rows, (row) => {
    const colorColumn = row.findIndex(
      (cell) => EXPLICIT_COLOR.test(cell) && normalizeCssColor(cell) !== null,
    );
    const name = row.find((cell, column) => column !== colorColumn && cell.trim() !== '') ?? '';
    const value = row[colorColumn] ?? '';
    return toPaletteColor(name, normalizeCssColor(value), value);
  });
  return { colors: entries.map((entry) => entry.color), skipped };
}

/** Maps each non-blank row to a color, counting the rows that give none. */
function collect(
  rows: SheetRows,
  read: (row: readonly string[]) => PaletteColor | null,
): { entries: PaletteRowColor[]; skipped: number } {
  const entries: PaletteRowColor[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.every((cell) => cell.trim() === '')) {
      continue;
    }
    const color = read(row);
    if (color === null) {
      skipped += 1;
    } else {
      entries.push({ row, color });
    }
  }
  return { entries, skipped };
}

/** A palette color from a row's cells; `value` is the color cell, whose alpha becomes the opacity. */
function toPaletteColor(
  name: string,
  color: string | null,
  value: string,
  group?: string,
): PaletteColor | null {
  if (color === null) {
    return null;
  }
  const opacity = cssColorAlpha(value);
  return (
    normalizePaletteColor({ name, color, group, opacity }) ??
    normalizePaletteColor({ name: color, color, group, opacity })
  );
}

/** Whether a cell is a color column heading. Digits rule out values such as "rgb(1, 2, 3)". */
function isColorHeader(cell: string): boolean {
  return !/\d/.test(cell) && COLOR_HEADERS.has(headerKey(cell));
}

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z]/g, '');
}
