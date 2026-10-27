import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          // Pure logic: utils, state, rendering (Three.js objects need no WebGL).
          extends: true,
          test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
        },
        {
          // Preact components render into jsdom.
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['src/test/setup.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        reporter: ['text', 'html'],
        thresholds: {
          'src/utils/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
          'src/state/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        },
      },
    },
  }),
);
