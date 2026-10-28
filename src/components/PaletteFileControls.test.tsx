import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { MAX_PALETTE_COLORS } from '../utils/palette/paletteColor';
import { MAX_PALETTE_FILE_BYTES, readPaletteFile } from '../utils/palette/paletteFile';
import {
  CLEAR_PALETTE_QUESTION,
  PALETTE_EXPORT_FILE_NAME,
  PaletteFileControls,
} from './PaletteFileControls';

const CSV = 'Name,Value,Type\nbrick red,#c8553d,base\nsea green,#2e8b57,base\nnote,tbd,\n';

const renderControls = (): AppState => {
  const state = createAppState();
  render(<PaletteFileControls state={state} />);
  return state;
};

const choose = (file: File): void => {
  fireEvent.change(screen.getByLabelText('Import…'), { target: { files: [file] } });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PaletteFileControls', () => {
  it('accepts spreadsheet and text files', () => {
    renderControls();
    expect(screen.getByLabelText('Import…')).toHaveAttribute('accept', '.xlsx,.xls,.csv,.tsv,.txt');
  });

  it('adds the colors of an imported file and summarizes the import', async () => {
    const state = renderControls();
    choose(new File([CSV], 'colors.csv'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added 2 colors from colors.csv. 1 row had no color.',
    );
    expect(state.palette.value.map((color) => color.name)).toEqual(['brick red', 'sea green']);
  });

  it('says which colors were already in the palette', async () => {
    const state = renderControls();
    await act(() => {
      state.addPaletteColors([{ name: 'brick red', color: '#c8553d' }]);
    });
    choose(new File(['Name,Value\nbrick red,#c8553d\nink,#111111'], 'more.csv'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added 1 color from more.csv. 1 color already in the palette.',
    );
  });

  it('says when the palette is full', async () => {
    const state = renderControls();
    await act(() => {
      state.addPaletteColors(
        Array.from({ length: MAX_PALETTE_COLORS }, (_, index) => ({
          name: `color ${String(index)}`,
          color: '#000000',
        })),
      );
    });
    choose(new File(['Name,Value\nink,#111111'], 'one.csv'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added 0 colors from one.csv. The palette is full.',
    );
  });

  it('explains why a file could not be imported', async () => {
    const state = renderControls();
    choose(new File(['just some words'], 'notes.txt'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not import notes.txt. No colors found.',
    );
    expect(state.palette.value).toEqual([]);
  });

  it('refuses files over the size limit without reading them', async () => {
    renderControls();
    const huge = new File(['x'], 'huge.xlsx');
    Object.defineProperty(huge, 'size', { value: MAX_PALETTE_FILE_BYTES + 1 });
    choose(huge);
    expect(await screen.findByRole('alert')).toHaveTextContent('huge.xlsx is too large');
  });

  it('exports the palette as an .xlsx download', async () => {
    const state = renderControls();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    await act(() => {
      state.addPaletteColors([{ name: 'brick red', color: '#c8553d', group: 'base' }]);
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
    expect(link).toHaveAttribute('download', PALETTE_EXPORT_FILE_NAME);
    expect(link).toHaveAttribute('href', 'blob:palette');

    const blob = createObjectURL.mock.calls[0]?.[0];
    if (blob === undefined) {
      throw new Error('no blob');
    }
    const exported = await readPaletteFile(new Uint8Array(await blob.arrayBuffer()));
    expect(exported.colors).toEqual([{ name: 'brick red', color: '#c8553d', group: 'base' }]);
  });

  it('clears the palette after confirmation', async () => {
    const state = renderControls();
    await act(() => {
      state.addPaletteColors([{ name: 'ink', color: '#111111' }]);
    });
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(confirm).toHaveBeenCalledWith(CLEAR_PALETTE_QUESTION);
    expect(state.palette.value).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    });
    expect(state.palette.value).toEqual([]);
  });
});
