import { render } from 'preact';
import { App } from './components/App';
import { createAppState } from './state/appState';
import { startAutosave } from './state/autosave';
import { getBrowserStorage, getBrowserWorkStorage } from './state/browserStorage';
import './styles/global.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element in index.html');
}

const state = createAppState({ storage: getBrowserStorage() });
render(<App state={state} autosave={startAutosave(state, getBrowserWorkStorage())} />, root);
