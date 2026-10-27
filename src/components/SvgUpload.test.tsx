import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { MAX_SVG_FILE_BYTES } from '../utils/svg/parseSvg';
import { SvgUpload } from './SvgUpload';

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>';

const choose = (file: File): void => {
  fireEvent.change(screen.getByLabelText('Open SVG…'), { target: { files: [file] } });
};

const renderUpload = (): AppState => {
  const state = createAppState();
  render(<SvgUpload state={state} />);
  return state;
};

describe('SvgUpload', () => {
  it('accepts SVG files only', () => {
    renderUpload();
    expect(screen.getByLabelText('Open SVG…')).toHaveAttribute('accept', '.svg,image/svg+xml');
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
    Object.defineProperty(huge, 'size', { value: MAX_SVG_FILE_BYTES + 1 });
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
});
