import { fireEvent, render, screen, within } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { PalettePanel, UNGROUPED_HEADING } from './PalettePanel';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10" fill="#c8553d"/><rect id="right" x="5" width="5" height="10"/></svg>';

const COLORS = [
  { name: 'brick red', color: '#c8553d', group: 'base' },
  { name: 'sea green', color: '#2e8b57', group: 'base' },
  { name: 'rust wash', color: '#8b3a1e', group: 'wash' },
  { name: 'ink', color: '#111111' },
];

const renderPanel = ({ colors = COLORS, drawing = true } = {}): AppState => {
  const state = createAppState();
  state.addPaletteColors(colors);
  if (drawing) {
    state.loadSvg(DRAWING);
  }
  render(<PalettePanel state={state} />);
  return state;
};

const paintButton = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('PalettePanel', () => {
  it('invites an import while the palette is empty', () => {
    renderPanel({ colors: [] });
    expect(screen.getByRole('heading', { name: 'Palette 0' })).toBeInTheDocument();
    expect(screen.getByText(/Import a palette spreadsheet/)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('lists colors under their groups, with ungrouped ones last', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Palette 4' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'base',
      'wash',
      UNGROUPED_HEADING,
    ]);
    const base = headings[0]?.closest('section');
    if (base === null || base === undefined) {
      throw new Error('missing base group');
    }
    expect(within(base).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no group headings when no color has a group', () => {
    renderPanel({ colors: [{ name: 'ink', color: '#111111' }] });
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('paints the selected region with a clicked color, as one undoable step', async () => {
    const state = renderPanel();
    expect(paintButton('sea green')).toBeDisabled();
    expect(screen.getByText('Select a region, then pick a color for it.')).toBeInTheDocument();

    await act(() => {
      state.selectRegion('region-1');
    });
    expect(screen.getByText('Pick a color for right.')).toBeInTheDocument();
    fireEvent.click(paintButton('sea green'));
    expect(state.regionColors.value.get('region-1')).toBe('#2e8b57');
    expect(state.canUndo.value).toBe(true);
  });

  it('marks the color the selected region already has', async () => {
    const state = renderPanel();
    await act(() => {
      state.selectRegion('region-0');
    });
    expect(paintButton('brick red')).toHaveAttribute('aria-current', 'true');
    expect(paintButton('sea green')).toHaveAttribute('aria-current', 'false');
  });

  it('filters colors by name', () => {
    renderPanel();
    const filter = screen.getByRole('searchbox', { name: 'Filter colors by name' });
    fireEvent.input(filter, { target: { value: 'RE' } });
    expect(screen.getByRole('button', { name: 'brick red' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sea green' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ink' })).not.toBeInTheDocument();

    fireEvent.input(filter, { target: { value: 'violet' } });
    expect(screen.getByText('No color names match “violet”.')).toBeInTheDocument();
  });

  it('removes a color', () => {
    const state = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Remove ink' }));
    expect(state.palette.value.map((color) => color.name)).toEqual([
      'brick red',
      'sea green',
      'rust wash',
    ]);
    expect(screen.queryByRole('button', { name: 'ink' })).not.toBeInTheDocument();
  });

  it('works before any drawing is loaded', () => {
    renderPanel({ drawing: false });
    expect(paintButton('ink')).toBeDisabled();
  });
});
