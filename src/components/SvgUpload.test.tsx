import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { onePixelPng } from '../utils/png/testPng';
import { MAX_SVG_FILE_BYTES } from '../utils/svg/parseSvg';
import { embedSavedWork } from '../utils/work/savedWork';
import { MAX_OPEN_FILE_BYTES, SvgUpload } from './SvgUpload';

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>';

const choose = (file: File): void => {
  fireEvent.change(screen.getByLabelText('Open…'), { target: { files: [file] } });
};

const renderUpload = (): AppState => {
  const state = createAppState();
  render(<SvgUpload state={state} />);
  return state;
};

describe('SvgUpload', () => {
  it('accepts SVG and PNG files', () => {
    renderUpload();
    expect(screen.getByLabelText('Open…')).toHaveAttribute(
      'accept',
      '.svg,image/svg+xml,.png,image/png',
    );
  });

  it('loads the chosen file into state', async () => {
    const state = renderUpload();
    choose(new File([DRAWING], 'drawing.svg', { type: 'image/svg+xml' }));

    await waitFor(() => {
      expect(state.svg.value?.regions.map((region) => region.name)).toEqual(['block']);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains why a file could not be opened', async () => {
    const state = renderUpload();
    choose(new File(['<svg><text>hello</text></svg>'], 'words.svg'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open words.svg. No paintable regions found',
    );
    expect(state.svg.value).toBeNull();
  });

  it('refuses files over the size limit without reading them', async () => {
    const state = renderUpload();
    const huge = new File(['x'], 'huge.svg');
    Object.defineProperty(huge, 'size', { value: MAX_OPEN_FILE_BYTES + 1 });
    choose(huge);

    expect(await screen.findByRole('alert')).toHaveTextContent('huge.svg is too large');
    expect(state.svg.value).toBeNull();
  });

  it('clears an earlier error after a successful upload', async () => {
    renderUpload();
    choose(new File(['not svg'], 'bad.svg'));
    await screen.findByRole('alert');

    choose(new File([DRAWING], 'good.svg'));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('refuses SVGs over the SVG size limit', async () => {
    const state = renderUpload();
    choose(new File([new Uint8Array(MAX_SVG_FILE_BYTES + 1)], 'big.svg'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'big.svg is too large. The limit is 32 MB.',
    );
    expect(state.svg.value).toBeNull();
  });

  it('restores work saved in a PNG', async () => {
    const state = renderUpload();
    const paints = new Map([['region-0', { base: { color: '#c8553d' } }]]);
    const png = await embedSavedWork(onePixelPng(), { svgSource: DRAWING, paints });
    choose(new File([png.slice()], 'mini-painter.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(state.regionPaints.value).toEqual(paints);
    });
    expect(state.svgSource.value).toBe(DRAWING);
    expect(state.canUndo.value).toBe(false);
  });

  it('explains a PNG with no saved work', async () => {
    const state = renderUpload();
    choose(new File([onePixelPng().slice()], 'photo.png'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open photo.png. This PNG has no saved Mini Painter work',
    );
    expect(state.svg.value).toBeNull();
  });
});
