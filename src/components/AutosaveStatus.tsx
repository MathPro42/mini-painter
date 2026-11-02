import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { Autosave } from '../state/autosave';
import { useSignalValue } from './useSignalValue';

interface AutosaveStatusProps {
  state: AppState;
  autosave: Autosave;
}

export const WORK_NOT_SAVED_WARNING =
  'This browser is not keeping your drawing. Use Save PNG to keep it.';

/**
 * Writes pending changes as soon as the page is hidden (a closed tab may
 * never run the save timer), and warns while the drawing can't be kept.
 */
export function AutosaveStatus({ state, autosave }: AutosaveStatusProps): JSX.Element | null {
  const saved = useSignalValue(autosave.workSaved);
  const svg = useSignalValue(state.svg);

  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        void autosave.flush();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [autosave]);

  if (saved || svg === null) {
    return null;
  }
  return (
    <p class="upload__error" role="note">
      {WORK_NOT_SAVED_WARNING}
    </p>
  );
}
