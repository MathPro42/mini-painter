import type { JSX, TargetedEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { MAX_SVG_FILE_BYTES } from '../utils/svg/parseSvg';

interface SvgUploadProps {
  state: AppState;
}

const MAX_MEGABYTES = MAX_SVG_FILE_BYTES / (1024 * 1024);

/** "Open SVG" control. Loads the chosen file into state and reports failures inline. */
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
        Open SVG…
        <input
          class="visually-hidden"
          type="file"
          accept=".svg,image/svg+xml"
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
  if (file.size > MAX_SVG_FILE_BYTES) {
    return `${file.name} is too large. The limit is ${String(MAX_MEGABYTES)} MB.`;
  }
  try {
    state.loadSvg(await file.text());
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not open ${file.name}. ${reason}`;
  }
}
