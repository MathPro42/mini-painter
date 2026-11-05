import { render } from 'preact';
import { App } from './components/App';
import { createAppState } from './state/appState';
import { startAutosave } from './state/autosave';
import { getBrowserStorage, getBrowserWorkStorage } from './state/browserStorage';
import { getBrowserInstallPrompt, getBrowserUpdater } from './state/browserUpdates';
import type { BrowserUpdaterOptions } from './state/browserUpdates';
import './styles/global.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element in index.html');
}

const state = createAppState({ storage: getBrowserStorage() });
const autosave = startAutosave(state, getBrowserWorkStorage());
const distribution = import.meta.env.MODE === 'offline' ? 'offline' : 'site';
const updateOptions: BrowserUpdaterOptions = {
  distribution,
  baseUrl: import.meta.env.BASE_URL,
  currentVersion: __APP_VERSION__,
  updateMode: state.updateMode,
  beforeApply: () => autosave.flush(),
};
// The dev server has no service worker or version.json, so updates start in builds only.
const updater = import.meta.env.PROD ? getBrowserUpdater(updateOptions, window) : null;

render(
  <App
    state={state}
    autosave={autosave}
    distribution={distribution}
    updater={updater}
    install={getBrowserInstallPrompt(distribution, window)}
  />,
  root,
);
