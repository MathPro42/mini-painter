import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import { useSignalValue } from './useSignalValue';

interface NewDrawingButtonProps {
  state: AppState;
}

export const CLOSE_DRAWING_QUESTION =
  'Close this drawing? It will not come back on your next visit. Use Save PNG first to keep it.';

/** "New": closes the drawing, which also drops it from autosave, after asking. */
export function NewDrawingButton({ state }: NewDrawingButtonProps): JSX.Element {
  const svg = useSignalValue(state.svg);
  return (
    <button
      type="button"
      class="button"
      disabled={svg === null}
      title="Close this drawing and start over"
      onClick={() => {
        if (window.confirm(CLOSE_DRAWING_QUESTION)) {
          state.closeDrawing();
        }
      }}
    >
      New
    </button>
  );
}
