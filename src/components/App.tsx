import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import type { Autosave } from '../state/autosave';
import { AutosaveStatus } from './AutosaveStatus';
import { HistoryControls } from './HistoryControls';
import { NewDrawingButton } from './NewDrawingButton';
import { PalettePanel } from './PalettePanel';
import { RegionPanel } from './RegionPanel';
import { SaveWorkButton } from './SaveWorkButton';
import { SvgUpload } from './SvgUpload';
import { Viewport } from './Viewport';

interface AppProps {
  state: AppState;
  /** Keeps the drawing between visits; without it, the drawing lasts until the page closes. */
  autosave?: Autosave;
}

export function App({ state, autosave }: AppProps): JSX.Element {
  return (
    <main class="app">
      <header class="app__header">
        <h1 class="app__title">Mini Painter</h1>
        <div class="app__actions">
          {autosave !== undefined && <AutosaveStatus state={state} autosave={autosave} />}
          <HistoryControls state={state} />
          <NewDrawingButton state={state} />
          <SvgUpload state={state} />
          <SaveWorkButton state={state} />
        </div>
      </header>
      <div class="app__body">
        <PalettePanel state={state} />
        <Viewport state={state} />
        <RegionPanel state={state} />
      </div>
    </main>
  );
}
