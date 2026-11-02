import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDrawingPng } from '../rendering/drawingSnapshot';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { onePixelPng } from '../utils/png/testPng';
import { extractSavedWork } from '../utils/work/savedWork';
import { downloadFile } from './downloadFile';
import { SaveWorkButton } from './SaveWorkButton';

vi.mock('../rendering/drawingSnapshot', () => ({ renderDrawingPng: vi.fn() }));
vi.mock('./downloadFile', () => ({ downloadFile: vi.fn() }));

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>';

const renderButton = (state: AppState = createAppState()): AppState => {
  render(<SaveWorkButton state={state} />);
  return state;
};
const button = (): HTMLElement => screen.getByRole('button', { name: 'Save PNG' });

describe('SaveWorkButton', () => {
  beforeEach(() => {
    vi.mocked(renderDrawingPng).mockReset().mockResolvedValue(onePixelPng());
    vi.mocked(downloadFile).mockReset();
  });

  it('is disabled until a drawing is open', () => {
    const state = renderButton();
    expect(button()).toBeDisabled();
    state.loadSvg(DRAWING);
    return waitFor(() => {
      expect(button()).toBeEnabled();
    });
  });

  it('downloads a PNG of the drawing that carries the work', async () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    state.setRegionsStep(['region-0'], 'base', { color: '#c8553d' });
    renderButton(state);

    fireEvent.click(button());

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledOnce();
    });
    expect(renderDrawingPng).toHaveBeenCalledWith(state.svg.value, state.regionPaints.value);
    const [name, data, type] = vi.mocked(downloadFile).mock.calls[0] ?? [];
    expect([name, type]).toEqual(['mini-painter.png', 'image/png']);
    expect(await extractSavedWork(data ?? new Uint8Array(), 1_000_000)).toEqual({
      svgSource: DRAWING,
      paints: state.regionPaints.value,
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a failed save', async () => {
    vi.mocked(renderDrawingPng).mockRejectedValue(new Error('No canvas.'));
    const state = createAppState();
    state.loadSvg(DRAWING);
    renderButton(state);

    fireEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the work. No canvas.',
    );
    expect(downloadFile).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });
});
