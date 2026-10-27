import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from https://<owner>.github.io/mini-painter/.
  base: '/mini-painter/',
  plugins: [preact()],
  build: {
    // Three.js on its own is ~540 kB minified (~135 kB gzip). It goes in its own
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
});
