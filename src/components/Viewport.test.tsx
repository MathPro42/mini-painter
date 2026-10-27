import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../rendering/createRenderer';
import type { RendererHandle } from '../rendering/createRenderer';
import { createAppState } from '../state/appState';
import { CLICK_TOLERANCE_PX, Viewport, WEBGL_ERROR_MESSAGE } from './Viewport';

vi.mock('../rendering/createRenderer', () => ({ createRenderer: vi.fn() }));

const createRendererMock = vi.mocked(createRenderer);

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="a" width="5" height="5"/><rect id="b" x="5" width="5" height="5"/></svg>';

const fakeHandle = (pickedId: string | null = null): RendererHandle => ({
  pickRegion: vi.fn(() => pickedId),
  dispose: vi.fn(),
});

describe('Viewport', () => {
  beforeEach(() => {
    createRendererMock.mockReset();
  });

  it('starts the renderer on its canvas with the given state', () => {
    createRendererMock.mockReturnValue(fakeHandle());
    const state = createAppState();
    render(<Viewport state={state} />);

    const canvas = screen.getByRole('img', { name: '3D model preview' });
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(createRendererMock).toHaveBeenCalledExactlyOnceWith(canvas, state);
  });

  it('disposes the renderer on unmount', async () => {
    const handle = fakeHandle();
    createRendererMock.mockReturnValue(handle);
    const { unmount } = render(<Viewport state={createAppState()} />);

    expect(handle.dispose).not.toHaveBeenCalled();
    // Preact 11 defers effect cleanups on unmount; act() flushes them.
    await act(() => {
      unmount();
    });
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it('shows a message instead of the canvas when WebGL is unavailable', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createRendererMock.mockImplementation(() => {
      throw new Error('WebGL not supported');
    });
    render(<Viewport state={createAppState()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(WEBGL_ERROR_MESSAGE);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('selects the region under a click', () => {
    const handle = fakeHandle('region-1');
    createRendererMock.mockReturnValue(handle);
    const state = createAppState();
    state.loadSvg(DRAWING);
    render(<Viewport state={state} />);

    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 });
    fireEvent.click(canvas, { clientX: 41, clientY: 30 });

    expect(handle.pickRegion).toHaveBeenCalledExactlyOnceWith(41, 30);
    expect(state.selectedRegionId.value).toBe('region-1');
  });

  it('clears the selection when a click hits no region', () => {
    createRendererMock.mockReturnValue(fakeHandle(null));
    const state = createAppState();
    state.loadSvg(DRAWING);
    state.selectRegion('region-0');
    render(<Viewport state={state} />);

    fireEvent.click(screen.getByRole('img'), { clientX: 5, clientY: 5 });
    expect(state.selectedRegionId.value).toBeNull();
  });

  it('ignores the click that ends an orbit drag', () => {
    const handle = fakeHandle('region-1');
    createRendererMock.mockReturnValue(handle);
    const state = createAppState();
    state.loadSvg(DRAWING);
    render(<Viewport state={state} />);

    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(canvas, { clientX: CLICK_TOLERANCE_PX + 1, clientY: 0 });

    expect(handle.pickRegion).not.toHaveBeenCalled();
    expect(state.selectedRegionId.value).toBeNull();
  });
});
