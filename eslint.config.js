import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer boundaries (see CLAUDE.md → Architecture). Each entry is an import that
// the layer must not reach for; `regex` is matched against the import specifier.
const FORBIDDEN = {
  three: { regex: '^three(/|$)', message: 'Three.js belongs in src/rendering/ only.' },
  preact: {
    regex: '^(preact|@preact/signals)(/|$)',
    message: 'Preact belongs in src/components/ only. State uses @preact/signals-core.',
  },
  signalsCore: {
    regex: '^@preact/signals-core$',
    message: 'utils/ is framework-free: no reactive state here.',
  },
  components: {
    regex: '(^|/)components(/|$)',
    message: 'Only main.tsx and other components may import components.',
  },
  rendering: {
    regex: '(^|/)rendering(/|$)',
    message: 'Only components may import rendering.',
  },
  state: { regex: '(^|/)state(/|$)', message: 'utils/ must not depend on state.' },
};

const restrictImports = (...keys) => ({
  'no-restricted-imports': ['error', { patterns: keys.map((key) => FORBIDDEN[key]) }],
});

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: 'error',
      curly: 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-param-reassign': 'error',
      'prefer-const': 'error',
      complexity: ['error', 10],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      // Named exports only: greppable, refactor-safe, one name per thing.
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
      ],
    },
  },
  {
    files: ['src/**/*.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
  },

  {
    files: ['src/utils/**'],
    rules: restrictImports('three', 'preact', 'signalsCore', 'components', 'rendering', 'state'),
  },
  { files: ['src/state/**'], rules: restrictImports('three', 'preact', 'components', 'rendering') },
  { files: ['src/rendering/**'], rules: restrictImports('preact', 'components') },
  { files: ['src/components/**'], rules: restrictImports('three') },

  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
]);
