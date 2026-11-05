import { render } from 'preact';
import { App } from './components/App';
import { createAppState } from './state/appState';
import { startAutosave } from './state/autosave';
import { getBrowserStorage, getBrowserWorkStorage } from './state/browserStorage';
import { startBrowserUpdates } from './state/browserUpdates';
import './styles/global.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element in index.html');
}

const state = createAppState({ storage: getBrowserStorage() });
const autosave = startAutosave(state, getBrowserWorkStorage());
const distribution = import.meta.env.MODE === 'offline' ? 'offline' : 'site';
const { updater, notice, install } = startBrowserUpdates(
  state,
  autosave,
  {
    distribution,
    baseUrl: import.meta.env.BASE_URL,
    version: __APP_VERSION__,
    isProduction: import.meta.env.PROD,
  },
  window,
);

render(
  <App
    state={state}
    autosave={autosave}
    distribution={distribution}
    updater={updater}
    install={install}
    updateNotice={notice}
  />,
  root,
);
