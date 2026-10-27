import { render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../rendering/createRenderer';
import { createAppState } from '../state/appState';
import { Viewport, WEBGL_ERROR_MESSAGE } from './Viewport';

vi.mock('../rendering/createRenderer', () => ({ createRenderer: vi.fn() }));

const createRendererMock = vi.mocked(createRenderer);

describe('Viewport', () => {
  beforeEach(() => {
    createRendererMock.mockReset();
  });

  it('starts the renderer on its canvas with the given state', () => {
    createRendererMock.mockReturnValue({ dispose: vi.fn() });
    const state = createAppState();
    render(<Viewport state={state} />);

    const canvas = screen.getByRole('img', { name: '3D model preview' });
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(createRendererMock).toHaveBeenCalledExactlyOnceWith(canvas, state);
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    createRendererMock.mockReturnValue({ dispose });
    const { unmount } = render(<Viewport state={createAppState()} />);

    expect(dispose).not.toHaveBeenCalled();
    // Preact 11 defers effect cleanups on unmount; act() flushes them.
    await act(() => {
      unmount();
    });
    expect(dispose).toHaveBeenCalledOnce();
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
});
