import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { renderDrawingPng } from '../rendering/drawingSnapshot';
import type { AppState } from '../state/appState';
import { embedSavedWork } from '../utils/work/savedWork';
import { downloadFile } from './downloadFile';
import { useSignalValue } from './useSignalValue';

interface SaveWorkButtonProps {
  state: AppState;
}

export const SAVED_WORK_FILE_NAME = 'mini-painter.png';

/**
 * "Save PNG": downloads a picture of the painted drawing that also carries
 * the drawing and its paints, so opening it again restores the work.
 */
export function SaveWorkButton({ state }: SaveWorkButtonProps): JSX.Element {
  const svg = useSignalValue(state.svg);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = (): void => {
    setSaving(true);
    void saveWork(state)
      .then(setError)
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div class="upload">
      <button
        type="button"
        class="button"
        disabled={svg === null || saving}
        title="Save a picture of the painted drawing; open it again to keep painting"
        onClick={onClick}
      >
        Save PNG
      </button>
      {error !== null && (
        <p class="upload__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Saves the current work. Resolves to an error message, or `null` on success. */
async function saveWork(state: AppState): Promise<string | null> {
  const svg = state.svg.peek();
  const svgSource = state.svgSource.peek();
  if (svg === null || svgSource === null) {
    return null;
  }
  const paints = state.regionPaints.peek();
  try {
    const png = await embedSavedWork(await renderDrawingPng(svg, paints), { svgSource, paints });
    downloadFile(SAVED_WORK_FILE_NAME, png, 'image/png');
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not save the work. ${reason}`;
  }
}
