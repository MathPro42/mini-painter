import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
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
        <SvgUpload state={state} />
      </header>
      <div class="app__body">
        <Viewport state={state} />
        <RegionPanel state={state} />
      </div>
    </main>
  );
}
