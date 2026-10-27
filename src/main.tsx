import { render } from 'preact';
import { App } from './components/App';
import { createAppState } from './state/appState';
import './styles/global.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element in index.html');
}

render(<App state={createAppState()} />, root);
