import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import { CLOSE_DRAWING_QUESTION, NewDrawingButton } from './NewDrawingButton';

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>';
const button = (): HTMLElement => screen.getByRole('button', { name: 'New' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NewDrawingButton', () => {
  it('is disabled without a drawing', async () => {
    const state = createAppState();
    render(<NewDrawingButton state={state} />);
    expect(button()).toBeDisabled();
    state.loadSvg(DRAWING);
    await waitFor(() => {
      expect(button()).toBeEnabled();
    });
  });

  it('closes the drawing once the user agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const state = createAppState();
    state.loadSvg(DRAWING);
    render(<NewDrawingButton state={state} />);

    fireEvent.click(button());

    expect(confirm).toHaveBeenCalledWith(CLOSE_DRAWING_QUESTION);
    expect(state.svg.value).toBeNull();
  });

  it('keeps the drawing when the user declines', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const state = createAppState();
    state.loadSvg(DRAWING);
    render(<NewDrawingButton state={state} />);

    fireEvent.click(button());

    expect(state.svg.value).not.toBeNull();
  });
});
