import { fireEvent, render, screen, within } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import selectionMapSvg from '../utils/svg/fixtures/selection-map.svg?raw';
import toneMasksSvg from '../utils/svg/fixtures/tone-masks.svg?raw';
import {
  MIXED_STEP_TEXT,
  PaintStepPicker,
  RECIPE_TOGGLE_LABEL,
  UNAVAILABLE_STEP_TEXT,
  UNPAINTED_INPUT_COLOR,
} from './PaintStepPicker';

/** Renders the picker for the drawing's first `count` regions ("left" first in the tone-mask sheet). */
const renderPicker = (svg = toneMasksSvg, count = 1): AppState => {
  const state = createAppState();
  state.loadSvg(svg);
  const regions = state.svg.value?.regions.slice(0, count) ?? [];
  render(<PaintStepPicker state={state} regions={regions} />);
  return state;
};

const steps = (): HTMLElement => screen.getByRole('group', { name: /^Paint steps of / });
const stepButton = (label: string): HTMLElement =>
  within(steps()).getByRole('button', { name: new RegExp(`^${label}`) });
const colorInput = (): HTMLInputElement => screen.getByLabelText(/color of/);

describe('PaintStepPicker', () => {
  it('lists the four steps, empty at first, with Base active', () => {
    renderPicker();
    expect(
      within(steps())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Base —', 'Layer —', 'Shade —', 'Highlight —']);
    expect(stepButton('Base')).toHaveAttribute('aria-pressed', 'true');
    expect(colorInput()).toHaveAccessibleName('Base color of left');
    expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
  });

  it('switches the active step, and the color picker paints that step', () => {
    const state = renderPicker();
    fireEvent.click(stepButton('Shade'));
    expect(state.activeStep.value).toBe('shade');
    expect(stepButton('Shade')).toHaveAttribute('aria-pressed', 'true');
    expect(colorInput()).toHaveAccessibleName('Shade color of left');

    fireEvent.input(colorInput(), { target: { value: '#5c4033' } });
    expect(state.canUndo.value).toBe(false);
    fireEvent.change(colorInput(), { target: { value: '#5c4033' } });
    expect(state.regionPaints.value.get('region-0')).toEqual({ shade: { color: '#5c4033' } });
    expect(state.canUndo.value).toBe(true);
    expect(stepButton('Shade')).toHaveTextContent('Shade #5c4033');
  });

  it('shows paint names, and clears a step', async () => {
    const state = renderPicker();
    await act(() => {
      state.setRegionsStep(['region-0'], 'highlight', { color: '#f0e0d0', name: 'bone' });
    });
    expect(stepButton('Highlight')).toHaveTextContent('Highlight bone');
    fireEvent.click(screen.getByRole('button', { name: 'Clear Highlight' }));
    expect(state.regionPaints.value.has('region-0')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Clear Highlight' })).not.toBeInTheDocument();
  });

  it('disables steps the drawing has no layer for', () => {
    renderPicker(selectionMapSvg);
    expect(stepButton('Layer')).toBeDisabled();
    expect(stepButton('Layer')).toHaveTextContent(UNAVAILABLE_STEP_TEXT);
    expect(stepButton('Shade')).toBeEnabled();
  });

  it('starts the color picker from the original fill for the Base only', async () => {
    const state = createAppState();
    state.loadSvg(
      '<svg viewBox="0 0 10 10"><defs><mask id="m"/></defs><g mask="url(#m)"><g id="Shade"/></g>' +
        '<g id="selectionMap"><g id="part"><rect width="10" height="10" fill="#c8553d"/></g></g></svg>',
    );
    render(<PaintStepPicker state={state} regions={state.svg.value?.regions ?? []} />);
    // Selection-map shapes are invisible hit areas, so even a filled one starts unpainted.
    expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
    await act(() => {
      state.setActiveStep('shade');
    });
    expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
  });

  it('offers to use recipes once the palette in use has one', async () => {
    const state = renderPicker();
    expect(screen.queryByLabelText(RECIPE_TOGGLE_LABEL)).not.toBeInTheDocument();
    await act(() => {
      state.addPalette('recipes', [
        { name: 'brick red', color: '#c8553d', recipe: { shade: 'umber wash #5c4033' } },
        { name: 'umber wash', color: '#5c4033', opacity: 0.6 },
      ]);
    });
    const toggle = screen.getByLabelText(RECIPE_TOGGLE_LABEL);
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(state.useRecipes.value).toBe(false);
    expect(toggle).not.toBeChecked();
  });

  it('shows a see-through step paint over a checkerboard', async () => {
    const state = renderPicker();
    await act(() => {
      state.setRegionsStep(['region-0'], 'shade', { color: '#5c4033', opacity: 0.6 });
    });
    expect(stepButton('Shade').querySelector('.swatch')).toHaveClass('swatch--see-through');
  });

  it('asks for a region first', () => {
    const state = createAppState();
    state.loadSvg(toneMasksSvg);
    render(<PaintStepPicker state={state} regions={[]} />);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select a region to paint it')).toBeDisabled();
  });

  describe('with several regions', () => {
    it('names how many regions it paints', () => {
      renderPicker(toneMasksSvg, 2);
      expect(steps()).toHaveAccessibleName('Paint steps of 2 regions');
      expect(colorInput()).toHaveAccessibleName('Base color of 2 regions');
    });

    it('shows a shared paint, and "mixed" with the hatched swatch where the regions differ', async () => {
      const state = renderPicker(toneMasksSvg, 2);
      await act(() => {
        state.setRegionsStep(['region-0', 'region-1'], 'base', {
          color: '#c8553d',
          name: 'brick red',
        });
        state.setRegionsStep(['region-0'], 'shade', { color: '#5c4033' });
      });
      expect(stepButton('Base')).toHaveTextContent('Base brick red');
      expect(colorInput()).toHaveValue('#c8553d');
      expect(stepButton('Shade')).toHaveTextContent(`Shade ${MIXED_STEP_TEXT}`);
      expect(stepButton('Shade').querySelector('.swatch')).toHaveClass('swatch--empty');
      expect(stepButton('Layer')).toHaveTextContent('Layer —');

      fireEvent.click(stepButton('Shade'));
      expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
    });

    it('clears a mixed step on every region as one undo step', async () => {
      const state = renderPicker(toneMasksSvg, 2);
      await act(() => {
        state.setRegionsStep(['region-0'], 'shade', { color: '#5c4033' });
        state.setRegionsStep(['region-1'], 'shade', { color: '#111111' });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Clear Shade' }));
      expect(state.regionPaints.value.size).toBe(0);
      state.undo();
      expect(state.regionPaints.value.size).toBe(2);
    });

    it('paints every region from the color picker as one undo step', () => {
      const state = renderPicker(toneMasksSvg, 2);
      fireEvent.input(colorInput(), { target: { value: '#2e8b57' } });
      fireEvent.change(colorInput(), { target: { value: '#2e8b57' } });
      expect(state.regionPaints.value).toEqual(
        new Map([
          ['region-0', { base: { color: '#2e8b57' } }],
          ['region-1', { base: { color: '#2e8b57' } }],
        ]),
      );
      state.undo();
      expect(state.regionPaints.value.size).toBe(0);
    });
  });
});
