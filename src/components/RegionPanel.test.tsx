import { fireEvent, render, screen } from '@testing-library/preact';
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

const colorInput = (): HTMLInputElement => screen.getByLabelText(/Color of|Select a region/);

describe('RegionPanel', () => {
  it('renders nothing before a drawing is loaded', () => {
    renderPanel(null);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('lists every region with a count', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Regions 2' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'left',
      'right',
    ]);
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
    expect(colorInput()).toHaveAccessibleName('Color of right');
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
    expect(state.regionColors.value.get('region-0')).toBe('#2e8b57');
    expect(colorInput()).toHaveValue('#2e8b57');
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
      state.setRegionColor('region-0', '#e0b13c');
    });
    const swatch = screen.getByRole('button', { name: 'cap' }).querySelector('.swatch');
    expect(swatch).not.toHaveClass('swatch--empty');
    expect(swatch).toHaveStyle({ backgroundColor: '#e0b13c' });
  });
});
