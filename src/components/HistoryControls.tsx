import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { useSignalValue } from './useSignalValue';

interface HistoryControlsProps {
  state: AppState;
}

type HistoryAction = 'undo' | 'redo';

// Inputs where Ctrl+Z belongs to the browser's own text undo.
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Undo and Redo buttons for painting, plus the usual shortcuts anywhere on
 * the page: Ctrl+Z (⌘Z) to undo; Ctrl+Shift+Z (⇧⌘Z) or Ctrl+Y to redo.
 */
export function HistoryControls({ state }: HistoryControlsProps): JSX.Element {
  const canUndo = useSignalValue(state.canUndo);
  const canRedo = useSignalValue(state.canRedo);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = shortcutAction(event);
      if (action === null || isTextField(event.target)) {
        return;
      }
      event.preventDefault();
      if (action === 'undo') {
        state.undo();
      } else {
        state.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [state]);

  return (
    <div class="toolbar" role="group" aria-label="Painting history">
      <button
        type="button"
        class="button"
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        onClick={() => {
          state.undo();
        }}
      >
        Undo
      </button>
      <button
        type="button"
        class="button"
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
        onClick={() => {
          state.redo();
        }}
      >
        Redo
      </button>
    </div>
  );
}

function shortcutAction(event: KeyboardEvent): HistoryAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  return key === 'y' && !event.shiftKey ? 'redo' : null;
}

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
