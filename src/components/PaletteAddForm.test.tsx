import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { NEW_COLOR_START, PaletteAddForm } from './PaletteAddForm';

const renderForm = (): AppState => {
  const state = createAppState();
  render(<PaletteAddForm state={state} />);
  return state;
};

const nameInput = (): HTMLElement => screen.getByLabelText('Name of the new color');

describe('PaletteAddForm', () => {
  it('adds the chosen color under the typed name, then clears the name', () => {
    const state = renderForm();
    fireEvent.input(screen.getByLabelText('New color'), { target: { value: '#2e8b57' } });
    fireEvent.input(nameInput(), { target: { value: ' sea green ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(state.activePalette.value?.colors).toEqual([{ name: 'sea green', color: '#2e8b57' }]);
    expect(nameInput()).toHaveValue('');
  });

  it('names the color by its hex value when no name is given', () => {
    const state = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(state.activePalette.value?.colors).toEqual([
      { name: NEW_COLOR_START, color: NEW_COLOR_START },
    ]);
  });

  it('says when the color is already in the palette, until the name changes', () => {
    const state = renderForm();
    fireEvent.input(nameInput(), { target: { value: 'brick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.input(nameInput(), { target: { value: 'brick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('status')).toHaveTextContent('That color is already in the palette.');
    expect(nameInput()).toHaveValue('brick');
    expect(state.activePalette.value?.colors).toHaveLength(1);

    fireEvent.input(nameInput(), { target: { value: 'brick 2' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
