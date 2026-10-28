import type { JSX, TargetedEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { Palette } from '../state/paletteState';
import {
  MAX_PALETTE_FILE_BYTES,
  PALETTE_FILE_ACCEPT,
  paletteFileName,
  readPaletteFile,
  writePaletteFile,
} from '../utils/palette/paletteFile';
import { paletteNameFromFile } from '../utils/palette/paletteNames';
import { XLSX_MIME_TYPE } from '../utils/spreadsheet/xlsxWrite';
import { downloadFile } from './downloadFile';
import { useSignalValue } from './useSignalValue';

interface PaletteControlsProps {
  state: AppState;
}

interface Message {
  readonly text: string;
  readonly isError: boolean;
}

const MAX_MEGABYTES = MAX_PALETTE_FILE_BYTES / (1024 * 1024);

/** The question Delete asks before removing a palette. */
export function deletePaletteQuestion(name: string): string {
  return `Delete the palette “${name}”? Its colors are removed from this browser.`;
}

/**
 * Picks the palette in use and imports, exports or deletes palettes. Each
 * imported file becomes a palette of its own; exports are .xlsx spreadsheets.
 */
export function PaletteControls({ state }: PaletteControlsProps): JSX.Element {
  const palettes = useSignalValue(state.palettes);
  const active = useSignalValue(state.activePalette);
  const [message, setMessage] = useState<Message | null>(null);

  const onChange = (event: TargetedEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset so that picking the same file again still fires a change.
    input.value = '';
    if (file !== undefined) {
      void importFile(file, state).then(setMessage);
    }
  };

  return (
    <div class="palette-controls">
      {palettes.length > 0 && <PaletteSelect state={state} palettes={palettes} active={active} />}
      <div class="palette-actions">
        <label class="button">
          Import…
          <input
            class="visually-hidden"
            type="file"
            accept={PALETTE_FILE_ACCEPT}
            onChange={onChange}
          />
        </label>
        <button
          type="button"
          class="button"
          disabled={active === null || active.colors.length === 0}
          onClick={() => {
            exportPalette(active);
          }}
        >
          Export
        </button>
        <button
          type="button"
          class="button"
          disabled={active === null}
          onClick={() => {
            if (confirmDelete(state, active)) {
              setMessage(null);
            }
          }}
        >
          Delete
        </button>
        {message !== null && <MessageLine message={message} />}
      </div>
    </div>
  );
}

interface PaletteSelectProps {
  state: AppState;
  palettes: readonly Palette[];
  active: Palette | null;
}

function PaletteSelect({ state, palettes, active }: PaletteSelectProps): JSX.Element {
  return (
    <select
      class="palette-select"
      aria-label="Palette in use"
      value={active?.id ?? ''}
      onChange={(event) => {
        state.selectPalette(event.currentTarget.value);
      }}
    >
      {palettes.map((palette) => (
        <option key={palette.id} value={palette.id}>
          {`${palette.name} (${String(palette.colors.length)})`}
        </option>
      ))}
    </select>
  );
}

function MessageLine({ message }: { message: Message }): JSX.Element {
  return (
    <p
      class={message.isError ? 'palette-actions__message is-error' : 'palette-actions__message'}
      role={message.isError ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  );
}

function exportPalette(palette: Palette | null): void {
  if (palette !== null) {
    const data = writePaletteFile(palette.colors);
    downloadFile(paletteFileName(palette.name), data, XLSX_MIME_TYPE);
  }
}

/** Deletes `palette` once the user confirms. Returns whether it was deleted. */
function confirmDelete(state: AppState, palette: Palette | null): boolean {
  if (palette === null || !window.confirm(deletePaletteQuestion(palette.name))) {
    return false;
  }
  state.deletePalette(palette.id);
  return true;
}

/** Adds the colors in `file` as a new palette and describes the outcome. */
async function importFile(file: File, state: AppState): Promise<Message> {
  if (file.size > MAX_PALETTE_FILE_BYTES) {
    const text = `${file.name} is too large. The limit is ${String(MAX_MEGABYTES)} MB.`;
    return { text, isError: true };
  }
  try {
    const { colors, skipped } = await readPaletteFile(new Uint8Array(await file.arrayBuffer()));
    const palette = state.addPalette(paletteNameFromFile(file.name), colors);
    const notes = [
      `Added the palette “${palette.name}” with ${count(palette.colors.length, 'color')}.`,
    ];
    const duplicates = colors.length - palette.colors.length;
    if (duplicates > 0) {
      notes.push(`${count(duplicates, 'duplicate')} left out.`);
    }
    if (skipped > 0) {
      notes.push(`${count(skipped, 'row')} had no color.`);
    }
    return { text: notes.join(' '), isError: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { text: `Could not import ${file.name}. ${reason}`, isError: true };
  }
}

function count(amount: number, noun: string): string {
  return `${String(amount)} ${noun}${amount === 1 ? '' : 's'}`;
}
