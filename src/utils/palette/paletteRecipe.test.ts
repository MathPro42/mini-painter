import { describe, expect, it } from 'vitest';
import type { PaletteColor } from './paletteColor';
import { findRecipeColumns, recipeColumns, withRecipes } from './paletteRecipe';

const BRICK: PaletteColor = { name: 'brick red', color: '#c8553d' };
const CORAL: PaletteColor = { name: 'Coral', color: '#e07a5f' };
const WASH: PaletteColor = { name: 'umber wash', color: '#5c4033', opacity: 0.6 };

describe('findRecipeColumns', () => {
  it('finds the recipe columns and the Id column', () => {
    expect(findRecipeColumns(['name', 'value', 'id', 'shade', 'layer'])).toEqual({
      id: 2,
      steps: { layer: 4, shade: 3, highlight: -1 },
    });
  });

  it('returns null without a recipe column', () => {
    expect(findRecipeColumns(['name', 'value', 'id'])).toBeNull();
  });
});

describe('withRecipes', () => {
  const columns = { id: 1, steps: { layer: 2, shade: 3, highlight: 4 } };

  it('resolves recipe cells by Id, else by name ignoring case', () => {
    const colors = withRecipes(
      [
        { row: ['', 'p-1', 'coral', 'p-3', ''], color: BRICK },
        { row: ['', 'p-2', '', '', ''], color: CORAL },
        { row: ['', 'p-3', '', '', ''], color: WASH },
      ],
      columns,
    );
    expect(colors).toEqual([
      { ...BRICK, recipe: { layer: 'coral #e07a5f', shade: 'umber wash #5c4033' } },
      CORAL,
      WASH,
    ]);
  });

  it('drops cells that name no color, or the color itself', () => {
    const colors = withRecipes(
      [{ row: ['', 'p-1', 'p-1', 'missing', 'brick red'], color: BRICK }],
      columns,
    );
    expect(colors).toEqual([BRICK]);
  });

  it('works without an Id column', () => {
    const colors = withRecipes(
      [
        { row: ['', '', 'Coral'], color: BRICK },
        { row: [], color: CORAL },
      ],
      { ...columns, id: -1 },
    );
    expect(colors[0]?.recipe).toEqual({ layer: 'coral #e07a5f' });
  });
});

describe('recipeColumns', () => {
  it('numbers the colors and writes recipes as those numbers', () => {
    const colors = [
      { ...BRICK, recipe: { layer: 'coral #e07a5f', highlight: 'gone #ffffff' } },
      CORAL,
    ];
    expect(recipeColumns(colors)).toEqual({
      header: ['Id', 'Layer', 'Shade', 'Highlight'],
      rows: [
        ['1', '2', '', ''],
        ['2', '', '', ''],
      ],
    });
  });

  it('adds no columns when no color has a recipe', () => {
    expect(recipeColumns([BRICK, CORAL])).toEqual({ header: [], rows: [[], []] });
  });
});
