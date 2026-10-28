import { fireEvent, render, screen, within } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { RegionPanel, UNPAINTED_INPUT_COLOR } from './RegionPanel';

// "left" has an original fill; the selection-map region "cap" starts unpainted.
const FILLED =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10" fill="#c8553d"/><rect id="right" x="5" width="5" height="10" fill="#3d7ac8"/></svg>';
const UNPAINTED =
  '<svg viewBox="0 0 10 10"><g id="selectionMap"><g id="cap"><rect width="5" height="5"/></g></g></svg>';

const renderPanel = (svg: string | null = FILLED): AppState => {
  const state = createAppState();
  if (svg !== null) {
    state.loadSvg(svg);
  }
  render(<RegionPanel state={state} />);
  return state;
};

const colorInput = (): HTMLInputElement => screen.getByLabelText(/color of|Select a region/);
const regionButtons = (): HTMLElement[] => within(screen.getByRole('list')).getAllByRole('button');

const PALETTE = [
  { name: 'brick red', color: '#c8553d' },
  { name: 'sea green', color: '#2e8b57' },
];

describe('RegionPanel', () => {
  it('renders nothing before a drawing is loaded', () => {
    renderPanel(null);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('lists every region with a count', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Regions 2' })).toBeInTheDocument();
    expect(regionButtons().map((button) => button.textContent)).toEqual(['left', 'right']);
  });

  it('selects a region from the list, and deselects it on a second press', () => {
    const state = renderPanel();
    const left = screen.getByRole('button', { name: 'left' });

    fireEvent.click(left);
    expect(state.selectedRegionId.value).toBe('region-0');
    expect(left).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(left);
    expect(state.selectedRegionId.value).toBeNull();
    expect(left).toHaveAttribute('aria-pressed', 'false');
  });

  it('follows selections made elsewhere, such as clicks in the viewport', async () => {
    const state = renderPanel();
    await act(() => {
      state.selectRegion('region-1');
    });
    expect(screen.getByRole('button', { name: 'right' })).toHaveAttribute('aria-pressed', 'true');
    expect(colorInput()).toHaveAccessibleName('Base color of right');
  });

  it('disables the color input until a region is selected', () => {
    renderPanel();
    expect(colorInput()).toBeDisabled();
    expect(colorInput()).toHaveAccessibleName('Select a region to paint it');
  });

  it('shows the selected region’s original fill, then paints it live', () => {
    const state = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    expect(colorInput()).toHaveValue('#c8553d');

    fireEvent.input(colorInput(), { target: { value: '#2e8b57' } });
    expect(state.regionPaints.value.get('region-0')?.base?.color).toBe('#2e8b57');
    expect(colorInput()).toHaveValue('#2e8b57');
  });

  it('records one undo step per pick, when the picker closes', () => {
    const state = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    fireEvent.input(colorInput(), { target: { value: '#aaaaaa' } });
    fireEvent.input(colorInput(), { target: { value: '#2e8b57' } });
    expect(state.canUndo.value).toBe(false);

    fireEvent.change(colorInput(), { target: { value: '#2e8b57' } });
    expect(state.canUndo.value).toBe(true);
    state.undo();
    expect(state.regionPaints.value.size).toBe(0);
  });

  it('names the paint each region has as its Base', async () => {
    const state = renderPanel();
    await act(() => {
      state.setRegionStep('region-0', 'base', { color: '#c8553d', name: 'brick red' });
      state.setRegionStep('region-1', 'base', { color: '#123456' });
    });
    expect(screen.getByRole('button', { name: 'left brick red' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'right' })).toBeInTheDocument();
  });

  it('randomizes Base paints from the palette in use, as one undoable step', async () => {
    const state = renderPanel();
    const randomize = screen.getByRole('button', { name: 'Randomize' });
    expect(randomize).toBeDisabled();
    await act(() => {
      state.addPalette('base coats', PALETTE);
    });
    fireEvent.click(randomize);
    const names = [...state.regionPaints.value.values()].map((paint) => paint.base?.name);
    expect(names).toHaveLength(2);
    expect(names.every((name) => name === 'brick red' || name === 'sea green')).toBe(true);
    state.undo();
    expect(state.regionPaints.value.size).toBe(0);
  });

  it('paints only the Base of plain drawings, without a step list', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('marks unpainted regions and offers a neutral starting color', () => {
    renderPanel(UNPAINTED);
    const button = screen.getByRole('button', { name: 'cap' });
    expect(button.querySelector('.swatch--empty')).not.toBeNull();

    fireEvent.click(button);
    expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
  });

  it('updates swatches when colors change', async () => {
    const state = renderPanel(UNPAINTED);
    await act(() => {
      state.setRegionStep('region-0', 'base', { color: '#e0b13c' });
    });
    const swatch = screen.getByRole('button', { name: 'cap' }).querySelector('.swatch');
    expect(swatch).not.toHaveClass('swatch--empty');
    expect(swatch).toHaveStyle({ backgroundColor: '#e0b13c' });
  });
});
