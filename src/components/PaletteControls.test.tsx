import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { MAX_PALETTE_FILE_BYTES, readPaletteFile } from '../utils/palette/paletteFile';
import { deletePaletteQuestion, PaletteControls } from './PaletteControls';

const CSV = 'Name,Value,Type\nbrick red,#c8553d,base\nsea green,#2e8b57,base\nnote,tbd,\n';

const renderControls = (): AppState => {
  const state = createAppState();
  render(<PaletteControls state={state} />);
  return state;
};

const choose = (file: File): void => {
  fireEvent.change(screen.getByLabelText('Import…'), { target: { files: [file] } });
};

const paletteNames = (state: AppState): string[] =>
  state.palettes.value.map((palette) => palette.name);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PaletteControls', () => {
  it('accepts spreadsheet and text files', () => {
    renderControls();
    expect(screen.getByLabelText('Import…')).toHaveAttribute('accept', '.xlsx,.xls,.csv,.tsv,.txt');
  });

  it('imports a file as a new palette named after it, and summarizes the import', async () => {
    const state = renderControls();
    choose(new File([CSV], 'base coats.csv'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added the palette “base coats” with 2 colors. 1 row had no color.',
    );
    expect(paletteNames(state)).toEqual(['base coats']);
    expect(state.activePalette.value?.colors.map((color) => color.name)).toEqual([
      'brick red',
      'sea green',
    ]);
  });

  it('keeps earlier palettes when importing another, even with the same name', async () => {
    const state = renderControls();
    choose(new File([CSV], 'colors.csv'));
    await screen.findByRole('status');
    choose(new File(['Name,Value\nink,#111111\nink,#111111'], 'colors.csv'));

    expect(await screen.findByText(/“colors \(2\)” with 1 color\. 1 duplicate left out\./)).toBe(
      screen.getByRole('status'),
    );
    expect(paletteNames(state)).toEqual(['colors', 'colors (2)']);
    expect(screen.getByRole('combobox', { name: 'Palette in use' })).toHaveDisplayValue(
      'colors (2) (1)',
    );
  });

  it('switches the palette in use from the list', async () => {
    const state = renderControls();
    await act(() => {
      state.addPalette('base coats', [{ name: 'brick red', color: '#c8553d' }]);
      state.addPalette('washes', []);
    });
    const select = screen.getByRole('combobox', { name: 'Palette in use' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'base coats (1)',
      'washes (0)',
    ]);

    const first = state.palettes.value[0]?.id ?? '';
    fireEvent.change(select, { target: { value: first } });
    expect(state.activePaletteId.value).toBe(first);
  });

  it('hides the list while there are no palettes', () => {
    renderControls();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('explains why a file could not be imported', async () => {
    const state = renderControls();
    choose(new File(['just some words'], 'notes.txt'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not import notes.txt. No colors found.',
    );
    expect(state.palettes.value).toEqual([]);
  });

  it('refuses files over the size limit without reading them', async () => {
    renderControls();
    const huge = new File(['x'], 'huge.xlsx');
    Object.defineProperty(huge, 'size', { value: MAX_PALETTE_FILE_BYTES + 1 });
    choose(huge);
    expect(await screen.findByRole('alert')).toHaveTextContent('huge.xlsx is too large');
  });

  it('exports the palette in use as an .xlsx download named after it', async () => {
    const state = renderControls();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    await act(() => {
      state.addPalette('base coats', [{ name: 'brick red', color: '#c8553d', group: 'base' }]);
    });

    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:palette';
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0];
    expect(link).toHaveAttribute('download', 'base coats.xlsx');
    expect(link).toHaveAttribute('href', 'blob:palette');

    const blob = createObjectURL.mock.calls[0]?.[0];
    if (blob === undefined) {
      throw new Error('no blob');
    }
    const exported = await readPaletteFile(new Uint8Array(await blob.arrayBuffer()));
    expect(exported.colors).toEqual([{ name: 'brick red', color: '#c8553d', group: 'base' }]);
  });

  it('cannot export an empty palette', async () => {
    const state = renderControls();
    await act(() => {
      state.addPalette('empty', []);
    });
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('deletes the palette in use after confirmation', async () => {
    const state = renderControls();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await act(() => {
      state.addPalette('base coats', []);
      state.addPalette('washes', []);
    });
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith(deletePaletteQuestion('washes'));
    expect(paletteNames(state)).toEqual(['base coats', 'washes']);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(paletteNames(state)).toEqual(['base coats']);
    expect(state.activePalette.value?.name).toBe('base coats');
  });
});
