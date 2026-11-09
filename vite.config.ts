import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { readAppVersion } from './scripts/appVersion.ts';
import { offlinePlugin } from './scripts/offlinePlugin.ts';
import { pwaPlugin } from './scripts/pwaPlugin.ts';

// `vite build --mode offline` makes the copy that runs from a downloaded zip.
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  const version = readAppVersion();
  return {
    // GitHub Pages serves the site from https://<owner>.github.io/mini-painter/.
    // The offline copy can sit in any folder, so its paths are relative.
    base: offline ? './' : '/mini-painter/',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [preact(), offline ? offlinePlugin() : pwaPlugin(version)],
    build: offline
      ? {
          // A file:// page can only load classic scripts, and those can't share chunks.
          chunkSizeWarningLimit: 1000,
          rolldownOptions: { output: { format: 'iife', codeSplitting: false } },
        }
      : {
          // Three.js on its own is ~530 kB minified (~135 kB gzip). It goes in its own
          // chunk so app changes don't bust its cache, and the limit is raised to fit it.
          chunkSizeWarningLimit: 600,
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
              },
            },
          },
        },
  };
});
