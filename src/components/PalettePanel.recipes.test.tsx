import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import toneMasksSvg from '../utils/svg/fixtures/tone-masks.svg?raw';
import { PalettePanel } from './PalettePanel';

const COLORS = [
  {
    name: 'brick red',
    color: '#c8553d',
    group: 'base',
    recipe: { layer: 'coral #e07a5f', shade: 'umber wash #5c4033' },
  },
  { name: 'coral', color: '#e07a5f', group: 'layer' },
  { name: 'umber wash', color: '#5c4033', group: 'wash', opacity: 0.6 },
];

const BRICK_RECIPE = {
  base: { color: '#c8553d', name: 'brick red' },
  layer: { color: '#e07a5f', name: 'coral' },
  shade: { color: '#5c4033', name: 'umber wash', opacity: 0.6 },
};

/** A palette with a recipe, and the tone-mask sheet with its "left" region selected. */
const renderPanel = (): AppState => {
  const state = createAppState();
  state.addPalette('recipes', COLORS);
  state.loadSvg(toneMasksSvg);
  state.selectRegion('region-0');
  render(<PalettePanel state={state} />);
  return state;
};

const paintButton = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('PalettePanel recipes', () => {
  it('paints a Base with its recipe tones as one undo step, replacing earlier tones', () => {
    const state = renderPanel();
    state.setRegionStep('region-0', 'highlight', { color: '#ffffff' });
    fireEvent.click(paintButton('brick red'));
    expect(state.regionPaints.value.get('region-0')).toEqual(BRICK_RECIPE);
    state.undo();
    expect(state.regionPaints.value.get('region-0')).toEqual({ highlight: { color: '#ffffff' } });
  });

  it('paints only the Base while recipes are off', async () => {
    const state = renderPanel();
    await act(() => {
      state.setUseRecipes(false);
    });
    fireEvent.click(paintButton('brick red'));
    expect(state.regionPaints.value.get('region-0')).toEqual({ base: BRICK_RECIPE.base });
  });

  it('paints only the active step on other steps', async () => {
    const state = renderPanel();
    await act(() => {
      state.setActiveStep('layer');
    });
    fireEvent.click(paintButton('brick red'));
    expect(state.regionPaints.value.get('region-0')).toEqual({ layer: BRICK_RECIPE.base });
  });

  it('lists the recipe in the tooltip, and shows washes over a checkerboard', () => {
    renderPanel();
    expect(paintButton('brick red')).toHaveAttribute(
      'title',
      '#c8553d\nLayer: coral\nShade: umber wash',
    );
    expect(paintButton('umber wash')).toHaveAttribute('title', 'rgba(92, 64, 51, 0.6)');
    expect(paintButton('umber wash').querySelector('.swatch')).toHaveClass('swatch--see-through');
    expect(paintButton('coral').querySelector('.swatch')).not.toHaveClass('swatch--see-through');
  });
});
