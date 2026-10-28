import { PAINT_STEP_LABELS, TONE_STEPS } from '../paint/paintSteps';
import type { ToneStep } from '../paint/paintSteps';
import { cleanPaletteText, paletteColorKey } from './paletteColor';
import type { PaletteColor } from './paletteColor';

/** A color read from a spreadsheet, with the row it came from. */
export interface PaletteRowColor {
  readonly row: readonly string[];
  readonly color: PaletteColor;
}

/** Where a heading row puts the Id column and the recipe columns; -1 when one is missing. */
export interface RecipeColumns {
  readonly id: number;
  readonly steps: Readonly<Record<ToneStep, number>>;
}

/** The Id and recipe columns of an export, row by row. */
export interface RecipeExport {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * Finds the "Layer", "Shade" and "Highlight" columns and the "Id" column
 * they may refer to, in headings already reduced to lowercase letters.
 * Returns `null` when there is no recipe column.
 */
export function findRecipeColumns(headings: readonly string[]): RecipeColumns | null {
  const steps = {
    layer: headings.indexOf('layer'),
    shade: headings.indexOf('shade'),
    highlight: headings.indexOf('highlight'),
  };
  if (TONE_STEPS.every((step) => steps[step] === -1)) {
    return null;
  }
  return { id: headings.indexOf('id'), steps };
}

/**
 * Gives each color the recipe its row names. A recipe cell names another
 * color by its Id cell, else by its name (ignoring case). Cells that name no
 * color of `entries`, or the color itself, are dropped.
 */
export function withRecipes(
  entries: readonly PaletteRowColor[],
  columns: RecipeColumns,
): PaletteColor[] {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const { row, color } of entries) {
    addFirst(byId, reference(row[columns.id]), paletteColorKey(color));
    addFirst(byName, reference(color.name), paletteColorKey(color));
  }
  return entries.map(({ row, color }) => {
    const recipe: Partial<Record<ToneStep, string>> = {};
    for (const step of TONE_STEPS) {
      const cell = reference(row[columns.steps[step]]);
      const key = byId.get(cell) ?? byName.get(cell);
      if (key !== undefined && key !== paletteColorKey(color)) {
        recipe[step] = key;
      }
    }
    return Object.keys(recipe).length === 0 ? color : { ...color, recipe };
  });
}

/**
 * The columns that carry recipes in an export: an Id per color (its row
 * number) and recipe cells holding the Ids they name, which withRecipes
 * reads back. Entries naming colors not in `colors` are left blank. No
 * columns at all when no color has a recipe.
 */
export function recipeColumns(colors: readonly PaletteColor[]): RecipeExport {
  if (!colors.some((color) => color.recipe !== undefined)) {
    return { header: [], rows: colors.map(() => []) };
  }
  const idOf = new Map(colors.map((color, index) => [paletteColorKey(color), String(index + 1)]));
  return {
    header: ['Id', ...TONE_STEPS.map((step) => PAINT_STEP_LABELS[step])],
    rows: colors.map((color, index) => [
      String(index + 1),
      ...TONE_STEPS.map((step) => idOf.get(color.recipe?.[step] ?? '') ?? ''),
    ]),
  };
}

/** How a cell and a name are compared: tidied and lowercase, blank for missing cells. */
function reference(cell: string | undefined): string {
  return cleanPaletteText(cell ?? '').toLowerCase();
}

function addFirst(map: Map<string, string>, reference: string, key: string): void {
  if (reference !== '' && !map.has(reference)) {
    map.set(reference, key);
  }
}
