import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import type { AppUpdater, UpdateStatus } from '../state/appUpdater';
import { UPDATE_MODES } from '../utils/app/updateMode';
import type { UpdateMode } from '../utils/app/updateMode';
import { useSignalValue } from './useSignalValue';

interface UpdateSettingsProps {
  state: AppState;
  updater: AppUpdater | null;
}

const MODE_LABELS: Record<UpdateMode, string> = {
  auto: 'Automatically',
  manual: 'When I choose',
};

const STATUS_TEXT: Record<UpdateStatus, string> = {
  idle: '',
  checking: 'Checking for updates…',
  'up-to-date': 'Mini Painter is up to date.',
  available: 'A new version is available.',
  applying: 'Updating…',
  error: 'Could not check for updates. Are you online?',
};

/** How updates arrive (auto or manual), what the last check found, and the update button. */
export function UpdateSettings({ state, updater }: UpdateSettingsProps): JSX.Element {
  const mode = useSignalValue(state.updateMode);
  return (
    <fieldset class="settings__section">
      <legend class="settings__heading">Updates</legend>
      {UPDATE_MODES.map((value) => (
        <label key={value} class="settings__choice">
          <input
            type="radio"
            name="update-mode"
            value={value}
            checked={mode === value}
            onChange={() => {
              state.setUpdateMode(value);
            }}
          />
          {MODE_LABELS[value]}
        </label>
      ))}
      {updater === null ? (
        <p class="settings__hint">This page does not update itself. Reload it for the latest.</p>
      ) : (
        <UpdateStatusControls updater={updater} />
      )}
    </fieldset>
  );
}

function UpdateStatusControls({ updater }: { updater: AppUpdater }): JSX.Element {
  const status = useSignalValue(updater.status);
  const busy = status === 'checking' || status === 'applying';
  const download = updater.applies === 'download';
  return (
    <>
      {download && (
        <p class="settings__hint">
          This copy cannot replace its own files: download the new version and unzip it over this
          folder.
        </p>
      )}
      <p class="settings__hint" role="status">
        {STATUS_TEXT[status]}
      </p>
      <div class="toolbar">
        <button
          type="button"
          class="button button--small"
          disabled={busy}
          onClick={() => {
            void updater.check();
          }}
        >
          Check for updates
        </button>
        {status === 'available' && (
          <button
            type="button"
            class="button button--small"
            onClick={() => {
              void updater.apply();
            }}
          >
            {download ? 'Download update' : 'Update now'}
          </button>
        )}
      </div>
    </>
  );
}
