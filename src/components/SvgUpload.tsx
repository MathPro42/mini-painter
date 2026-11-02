import type { JSX, TargetedEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { isPng } from '../utils/png/pngChunks';
import { MAX_SVG_FILE_BYTES } from '../utils/svg/parseSvg';
import { extractSavedWork } from '../utils/work/savedWork';

interface SvgUploadProps {
  state: AppState;
}

/** A saved PNG holds the drawing plus its picture, so it may be larger than the SVG limit. */
export const MAX_OPEN_FILE_BYTES = 2 * MAX_SVG_FILE_BYTES;
/** Saved work inflates to the drawing's markup plus its paints. */
const MAX_SAVED_WORK_BYTES = 2 * MAX_SVG_FILE_BYTES;

/**
 * "Open" control for an SVG, or a PNG saved by Save PNG. Loads the chosen
 * file into state and reports failures inline.
 */
export function SvgUpload({ state }: SvgUploadProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);

  const onChange = (event: TargetedEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset so that picking the same file again still fires a change.
    input.value = '';
    if (file !== undefined) {
      void openFile(file, state).then(setError);
    }
  };

  return (
    <div class="upload">
      <label class="button">
        Open…
        <input
          class="visually-hidden"
          type="file"
          accept=".svg,image/svg+xml,.png,image/png"
          onChange={onChange}
        />
      </label>
      {error !== null && (
        <p class="upload__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Loads `file` into state. Resolves to an error message, or `null` on success. */
async function openFile(file: File, state: AppState): Promise<string | null> {
  if (file.size > MAX_OPEN_FILE_BYTES) {
    return tooLarge(file.name, MAX_OPEN_FILE_BYTES);
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isPng(bytes)) {
      state.loadWork(await extractSavedWork(bytes, MAX_SAVED_WORK_BYTES));
    } else if (bytes.byteLength > MAX_SVG_FILE_BYTES) {
      return tooLarge(file.name, MAX_SVG_FILE_BYTES);
    } else {
      state.loadSvg(new TextDecoder().decode(bytes));
    }
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not open ${file.name}. ${reason}`;
  }
}

function tooLarge(name: string, limit: number): string {
  return `${name} is too large. The limit is ${String(limit / (1024 * 1024))} MB.`;
}
