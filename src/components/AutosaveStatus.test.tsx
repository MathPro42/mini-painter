import { signal } from '@preact/signals-core';
import { render, screen, waitFor } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import type { Autosave } from '../state/autosave';
import { AutosaveStatus, WORK_NOT_SAVED_WARNING } from './AutosaveStatus';

const DRAWING = '<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>';

const fakeAutosave = (saved: boolean): Autosave => ({
  workSaved: signal(saved),
  restored: Promise.resolve(),
  flush: vi.fn(() => Promise.resolve()),
  dispose: vi.fn(),
});

const setVisibility = (value: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('AutosaveStatus', () => {
  it('warns while a drawing is open and cannot be saved', async () => {
    const state = createAppState();
    render(<AutosaveStatus state={state} autosave={fakeAutosave(false)} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    state.loadSvg(DRAWING);

    await waitFor(() => {
      expect(screen.getByRole('note')).toHaveTextContent(WORK_NOT_SAVED_WARNING);
    });
  });

  it('says nothing while saving works', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    render(<AutosaveStatus state={state} autosave={fakeAutosave(true)} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('saves at once when the page is hidden, until unmounted', async () => {
    const autosave = fakeAutosave(true);
    const { unmount } = render(<AutosaveStatus state={createAppState()} autosave={autosave} />);

    setVisibility('visible');
    expect(autosave.flush).not.toHaveBeenCalled();
    setVisibility('hidden');
    expect(autosave.flush).toHaveBeenCalledOnce();

    await act(() => {
      unmount();
    });
    setVisibility('hidden');
    expect(autosave.flush).toHaveBeenCalledOnce();
    setVisibility('visible');
  });
});
