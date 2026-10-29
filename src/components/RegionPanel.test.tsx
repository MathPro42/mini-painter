import { fireEvent, render, screen, within } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { MULTI_SELECT_HINT, RegionPanel, UNPAINTED_INPUT_COLOR } from './RegionPanel';

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
    expect(state.selectedRegionIds.value).toEqual(['region-0']);
    expect(left).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(left);
    expect(state.selectedRegionIds.value).toEqual([]);
    expect(left).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds and removes regions with Shift, Ctrl or ⌘ held', () => {
    const state = renderPanel();
    const [left, right] = regionButtons();
    if (left === undefined || right === undefined) {
      throw new Error('expected two regions');
    }
    fireEvent.click(left);
    fireEvent.click(right, { shiftKey: true });
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-1']);
    expect(left).toHaveAttribute('aria-pressed', 'true');
    expect(right).toHaveAttribute('aria-pressed', 'true');
    expect(colorInput()).toHaveAccessibleName('Base color of 2 regions');

    fireEvent.click(left, { ctrlKey: true });
    expect(state.selectedRegionIds.value).toEqual(['region-1']);
    fireEvent.click(left, { metaKey: true });
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-1']);

    // A plain click goes back to that one region.
    fireEvent.click(right);
    expect(state.selectedRegionIds.value).toEqual(['region-1']);
  });

  it('adds and removes regions with each tap on a touch screen', () => {
    const state = renderPanel();
    const tap = (name: string): void => {
      const button = screen.getByRole('button', { name });
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      fireEvent.click(button);
    };
    tap('left');
    tap('right');
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-1']);
    tap('left');
    expect(state.selectedRegionIds.value).toEqual(['region-1']);

    // A mouse press after the taps selects only its region again.
    const left = screen.getByRole('button', { name: 'left' });
    fireEvent.pointerDown(left, { pointerType: 'mouse' });
    fireEvent.click(left);
    expect(state.selectedRegionIds.value).toEqual(['region-0']);
  });

  it('forgets a touch that turned into a scroll', () => {
    const state = renderPanel();
    const right = screen.getByRole('button', { name: 'right' });
    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    fireEvent.pointerDown(right, { pointerType: 'touch' });
    fireEvent.pointerCancel(right);
    // Keyboard presses click without a pointer press, so they select only their region.
    fireEvent.click(right);
    expect(state.selectedRegionIds.value).toEqual(['region-1']);
  });

  it('selects every region, and clears the selection', () => {
    const state = renderPanel();
    const selectAll = screen.getByRole('button', { name: 'Select all' });
    const clear = screen.getByRole('button', { name: 'Clear selection' });
    expect(screen.getByText(MULTI_SELECT_HINT)).toBeInTheDocument();
    expect(clear).toBeDisabled();

    fireEvent.click(selectAll);
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-1']);
    expect(selectAll).toBeDisabled();
    expect(clear).toBeEnabled();

    fireEvent.click(clear);
    expect(state.selectedRegionIds.value).toEqual([]);
    expect(colorInput()).toBeDisabled();
  });

  it('paints every selected region from the color picker', () => {
    const state = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    // The regions' original fills differ, so the picker starts neutral.
    expect(colorInput()).toHaveValue(UNPAINTED_INPUT_COLOR);
    fireEvent.change(colorInput(), { target: { value: '#2e8b57' } });
    expect([...state.regionPaints.value.values()].map((paint) => paint.base?.color)).toEqual([
      '#2e8b57',
      '#2e8b57',
    ]);
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
      state.setRegionsStep(['region-0'], 'base', { color: '#c8553d', name: 'brick red' });
      state.setRegionsStep(['region-1'], 'base', { color: '#123456' });
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
    expect(screen.queryByRole('group', { name: /^Paint steps/ })).not.toBeInTheDocument();
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
      state.setRegionsStep(['region-0'], 'base', { color: '#e0b13c' });
    });
    const swatch = screen.getByRole('button', { name: 'cap' }).querySelector('.swatch');
    expect(swatch).not.toHaveClass('swatch--empty');
    expect(swatch).toHaveStyle({ backgroundColor: '#e0b13c' });
  });
});
