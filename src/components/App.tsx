import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import type { AppUpdater } from '../state/appUpdater';
import type { Autosave } from '../state/autosave';
import type { Distribution } from '../state/browserUpdates';
import type { InstallPrompt } from '../state/installPrompt';
import type { UpdateNoticeState } from '../state/updateNotice';
import { AutosaveStatus } from './AutosaveStatus';
import { HistoryControls } from './HistoryControls';
import { NewDrawingButton } from './NewDrawingButton';
import { PalettePanel } from './PalettePanel';
import { RegionPanel } from './RegionPanel';
import { SaveWorkButton } from './SaveWorkButton';
import { SettingsMenu } from './SettingsMenu';
import { SvgUpload } from './SvgUpload';
import { UpdateNoticeBar } from './UpdateNoticeBar';
import { Viewport } from './Viewport';

interface AppProps {
  state: AppState;
  /** Keeps the drawing between visits; without it, the drawing lasts until the page closes. */
  autosave?: Autosave;
  /** Which build runs; decides how it installs and updates. Defaults to the site. */
  distribution?: Distribution;
  /** Finds and applies updates; `null` (the default) where the build can't update. */
  updater?: AppUpdater | null;
  /** The browser's install offer; `null` (the default) where there is none. */
  install?: InstallPrompt | null;
  /** Warns before an automatic update; `null` (the default) where nothing updates. */
  updateNotice?: UpdateNoticeState | null;
}

export function App({
  state,
  autosave,
  distribution = 'site',
  updater = null,
  install = null,
  updateNotice = null,
}: AppProps): JSX.Element {
  return (
    <main class="app">
      <header class="app__header">
        <SettingsMenu
          state={state}
          distribution={distribution}
          updater={updater}
          install={install}
        />
        <div class="app__actions">
          {autosave !== undefined && <AutosaveStatus state={state} autosave={autosave} />}
          <HistoryControls state={state} />
          <NewDrawingButton state={state} />
          <SvgUpload state={state} />
          <SaveWorkButton state={state} />
        </div>
      </header>
      {updateNotice !== null && <UpdateNoticeBar notice={updateNotice} />}
      <div class="app__body">
        <PalettePanel state={state} />
        <Viewport state={state} />
        <RegionPanel state={state} />
      </div>
    </main>
  );
}
