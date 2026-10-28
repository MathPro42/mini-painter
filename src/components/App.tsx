import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import { HistoryControls } from './HistoryControls';
import { PalettePanel } from './PalettePanel';
import { RegionPanel } from './RegionPanel';
import { SvgUpload } from './SvgUpload';
import { Viewport } from './Viewport';

interface AppProps {
  state: AppState;
}

export function App({ state }: AppProps): JSX.Element {
  return (
    <main class="app">
      <header class="app__header">
        <h1 class="app__title">Mini Painter</h1>
        <div class="app__actions">
          <HistoryControls state={state} />
          <SvgUpload state={state} />
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
