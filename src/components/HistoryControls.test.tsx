import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppState } from '../state/appState';
import { HistoryControls } from './HistoryControls';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10"/><rect id="right" x="5" width="5" height="10"/></svg>';

const renderControls = (): AppState => {
  const state = createAppState();
  state.loadSvg(DRAWING);
  render(<HistoryControls state={state} />);
  return state;
};

const undoButton = (): HTMLElement => screen.getByRole('button', { name: 'Undo' });
const redoButton = (): HTMLElement => screen.getByRole('button', { name: 'Redo' });

const paint = async (state: AppState, color: string): Promise<void> => {
  await act(() => {
    state.setRegionColor('region-0', color);
  });
};

describe('HistoryControls', () => {
  it('disables both buttons until there is something to undo or redo', async () => {
    const state = renderControls();
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    await paint(state, '#c8553d');
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();
  });

  it('undoes and redoes painting steps', async () => {
    const state = renderControls();
    await paint(state, '#c8553d');

    fireEvent.click(undoButton());
    expect(state.regionColors.value.size).toBe(0);
    expect(redoButton()).toBeEnabled();

    fireEvent.click(redoButton());
    expect(state.regionColors.value.get('region-0')).toBe('#c8553d');
  });

  it('answers Ctrl+Z, Cmd+Z, Ctrl+Shift+Z and Ctrl+Y anywhere on the page', async () => {
    const state = renderControls();
    await paint(state, '#c8553d');
    await paint(state, '#2e8b57');

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(state.regionColors.value.get('region-0')).toBe('#c8553d');
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(state.regionColors.value.size).toBe(0);
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(state.regionColors.value.get('region-0')).toBe('#c8553d');
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(state.regionColors.value.get('region-0')).toBe('#2e8b57');
  });

  it('prevents the browser default only for its own shortcuts', async () => {
    const state = renderControls();
    await paint(state, '#c8553d');
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(document.body, { key: 'z' })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, altKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true, shiftKey: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(true);
  });

  it('leaves Ctrl+Z to text fields, but not to other inputs', async () => {
    const state = renderControls();
    await paint(state, '#c8553d');
    const text = document.createElement('input');
    const area = document.createElement('textarea');
    const color = document.createElement('input');
    color.type = 'color';
    document.body.append(text, area, color);

    fireEvent.keyDown(text, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(area, { key: 'z', ctrlKey: true });
    expect(state.canUndo.value).toBe(true);

    fireEvent.keyDown(color, { key: 'z', ctrlKey: true });
    expect(state.canUndo.value).toBe(false);
    text.remove();
    area.remove();
    color.remove();
  });

  it('stops listening once unmounted', async () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    const { unmount } = render(<HistoryControls state={state} />);
    await paint(state, '#c8553d');
    await act(() => {
      unmount();
    });
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(state.canUndo.value).toBe(true);
  });
});
