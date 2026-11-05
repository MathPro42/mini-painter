import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { AppUpdater } from '../state/appUpdater';
import type { Distribution } from '../state/browserUpdates';
import type { InstallPrompt } from '../state/installPrompt';
import { InstallOptions } from './InstallOptions';
import { UpdateSettings } from './UpdateSettings';
import { useSignalValue } from './useSignalValue';

export interface SettingsMenuProps {
  state: AppState;
  distribution: Distribution;
  updater: AppUpdater | null;
  install: InstallPrompt | null;
}

const PANEL_ID = 'settings-panel';

/** The app title, which opens the settings: offline use and updates. */
export function SettingsMenu(props: SettingsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useCloseOnOutsideOrEscape(open, root, setOpen);

  return (
    <div class="settings" ref={root}>
      <h1 class="app__title">
        <button
          type="button"
          class="settings__toggle"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          title="Settings"
          onClick={() => {
            setOpen(!open);
          }}
        >
          Mini Painter
          {props.updater !== null && <UpdateBadge updater={props.updater} />}
        </button>
      </h1>
      {open && (
        <div id={PANEL_ID} class="settings__panel" role="dialog" aria-label="Settings">
          <InstallOptions distribution={props.distribution} install={props.install} />
          <UpdateSettings state={props.state} updater={props.updater} />
          <p class="settings__version">Version {__APP_VERSION__}</p>
        </div>
      )}
    </div>
  );
}

/** A dot on the title while an update waits; the panel says so in words. */
function UpdateBadge({ updater }: { updater: AppUpdater }): JSX.Element | null {
  const status = useSignalValue(updater.status);
  return status === 'available' ? <span class="settings__badge" aria-hidden="true" /> : null;
}

function useCloseOnOutsideOrEscape(
  open: boolean,
  root: { readonly current: HTMLElement | null },
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: Event): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, root, setOpen]);
}
