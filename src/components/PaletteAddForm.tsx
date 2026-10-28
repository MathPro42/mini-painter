import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { MAX_PALETTE_TEXT_LENGTH } from '../utils/palette/paletteColor';

interface PaletteAddFormProps {
  state: AppState;
}

/** Where the new-color picker starts. */
export const NEW_COLOR_START = '#c8553d';

/** Adds one color to the palette. A blank name falls back to the hex value. */
export function PaletteAddForm({ state }: PaletteAddFormProps): JSX.Element {
  const [color, setColor] = useState(NEW_COLOR_START);
  const [name, setName] = useState('');
  const [duplicate, setDuplicate] = useState(false);

  const add = (): void => {
    const added = state.addPaletteColors([{ name: name.trim() === '' ? color : name, color }]);
    setDuplicate(added === 0);
    if (added > 0) {
      setName('');
    }
  };

  return (
    <form
      class="palette-add"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <input
        type="color"
        class="color-field__input"
        aria-label="New color"
        value={color}
        onInput={(event) => {
          setColor(event.currentTarget.value);
        }}
      />
      <input
        type="text"
        class="palette-add__name"
        aria-label="Name of the new color"
        placeholder="Name (optional)"
        maxLength={MAX_PALETTE_TEXT_LENGTH}
        value={name}
        onInput={(event) => {
          setName(event.currentTarget.value);
          setDuplicate(false);
        }}
      />
      <button type="submit" class="button">
        Add
      </button>
      {duplicate && (
        <p class="palette-add__message" role="status">
          That color is already in the palette.
        </p>
      )}
    </form>
  );
}
