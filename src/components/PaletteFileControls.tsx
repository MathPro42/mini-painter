import type { JSX, TargetedEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { MAX_PALETTE_COLORS } from '../utils/palette/paletteColor';
import {
  MAX_PALETTE_FILE_BYTES,
  PALETTE_FILE_ACCEPT,
  readPaletteFile,
  writePaletteFile,
} from '../utils/palette/paletteFile';
import { XLSX_MIME_TYPE } from '../utils/spreadsheet/xlsxWrite';
import { downloadFile } from './downloadFile';
import { useSignalValue } from './useSignalValue';

interface PaletteFileControlsProps {
  state: AppState;
}

interface Message {
  readonly text: string;
  readonly isError: boolean;
}

export const PALETTE_EXPORT_FILE_NAME = 'palette.xlsx';
export const CLEAR_PALETTE_QUESTION = 'Remove every color from the palette?';

const MAX_MEGABYTES = MAX_PALETTE_FILE_BYTES / (1024 * 1024);

/**
 * Import, Export and Clear for the palette. Imports add to the palette, so
 * several files can be combined; exports are .xlsx spreadsheets.
 */
export function PaletteFileControls({ state }: PaletteFileControlsProps): JSX.Element {
  const palette = useSignalValue(state.palette);
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
        disabled={palette.length === 0}
        onClick={() => {
          downloadFile(PALETTE_EXPORT_FILE_NAME, writePaletteFile(palette), XLSX_MIME_TYPE);
        }}
      >
        Export
      </button>
      <button
        type="button"
        class="button"
        disabled={palette.length === 0}
        onClick={() => {
          if (window.confirm(CLEAR_PALETTE_QUESTION)) {
            state.clearPalette();
            setMessage(null);
          }
        }}
      >
        Clear
      </button>
      {message !== null && (
        <p
          class={message.isError ? 'palette-actions__message is-error' : 'palette-actions__message'}
          role={message.isError ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Adds the colors in `file` to the palette and describes the outcome. */
async function importFile(file: File, state: AppState): Promise<Message> {
  if (file.size > MAX_PALETTE_FILE_BYTES) {
    const text = `${file.name} is too large. The limit is ${String(MAX_MEGABYTES)} MB.`;
    return { text, isError: true };
  }
  try {
    const { colors, skipped } = await readPaletteFile(new Uint8Array(await file.arrayBuffer()));
    const added = state.addPaletteColors(colors);
    const notes = [`Added ${count(added, 'color')} from ${file.name}.`];
    if (added < colors.length) {
      notes.push(
        state.palette.peek().length >= MAX_PALETTE_COLORS
          ? 'The palette is full.'
          : `${count(colors.length - added, 'color')} already in the palette.`,
      );
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
