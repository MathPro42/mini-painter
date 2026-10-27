# Contributing to Mini Painter

Thanks for helping! This guide covers setup, the architecture, and how to run checks
locally. Design decisions and their reasons are in [CLAUDE.md](./CLAUDE.md).

## Content policy

Mini Painter is **generic**. Do not add trademarked miniatures, games, factions, paint
brands or branded paint names anywhere: code, tests, fixtures, docs or commit messages.
The app never ships models. Users bring their own.

## Prerequisites

- Node.js **22** (≥ 22.13). `.nvmrc` pins the major version, so `nvm use` works.
- npm (comes with Node)

## Setup

```bash
git clone https://github.com/MathPro42/mini-painter.git
cd mini-painter
npm ci
npm run dev
```

Open http://localhost:5173/mini-painter/. The `/mini-painter/` path matches GitHub Pages.

## Scripts

| Command                 | What it does                                                |
| ----------------------- | ----------------------------------------------------------- |
| `npm run dev`           | Vite dev server with hot reload                             |
| `npm run build`         | Typecheck, then production build into `dist/`               |
| `npm run preview`       | Serve `dist/` locally (http://localhost:4173/mini-painter/) |
| `npm run typecheck`     | `tsc -b` over app and config files                          |
| `npm run lint`          | ESLint, zero warnings allowed                               |
| `npm run lint:fix`      | ESLint with autofix                                         |
| `npm run format`        | Prettier: rewrite files                                     |
| `npm run format:check`  | Prettier: fail on unformatted files                         |
| `npm test`              | Run all tests once                                          |
| `npm run test:watch`    | Run tests in watch mode                                     |
| `npm run test:coverage` | Run tests with coverage (thresholds enforced)               |
| `npm run check`         | **Everything CI runs.** Run this before you push.           |

## Running tests

```bash
npm test                                   # all tests, once
npm run test:watch                         # re-run on save
npx vitest run src/utils/color.test.ts     # a single file
npx vitest run --project unit              # only Node tests
npx vitest run --project dom               # only component tests
npm run test:coverage                      # coverage report → coverage/index.html
```

### Where tests go

Put tests next to the code they test:

- `src/utils/foo.ts` → `src/utils/foo.test.ts`, which runs in **Node** (project `unit`)
- `src/components/Foo.tsx` → `src/components/Foo.test.tsx`, which runs in **jsdom**
  (project `dom`, with Testing Library and jest-dom matchers)

The extension picks the environment: `.test.ts` for logic, `.test.tsx` for components.

Every non-trivial function needs a unit test. `src/utils/` and `src/state/` must stay at
≥ 90% coverage, or `test:coverage` fails.

Import test helpers explicitly (`import { describe, it, expect } from 'vitest'`). Globals
are off.

### Testing rendering code

- Build Three.js objects in plain functions (see `rendering/helloCubeScene.ts`). They
  run in Node without WebGL, so test them directly.
- Keep `rendering/createRenderer.ts` (the WebGL part) and `rendering/svgModel.ts` (canvas
  and image loading) thin. They are not unit-tested, so check changes to them in a browser
  with `npm run build && npm run preview`.
- In component tests, mock `rendering/createRenderer` (see `Viewport.test.tsx`).

## Architecture

```
src/
  main.tsx        entry: create state, mount <App/>
  components/     Preact UI
  rendering/      Three.js only
  state/          @preact/signals-core stores
  utils/          pure shared helpers (color math, file parsing…)
```

Imports flow one way: `components → rendering → state → utils`. Components may also
import state and utils directly. ESLint enforces the boundaries. If lint says an import is
restricted, the code belongs in a different layer. See [CLAUDE.md](./CLAUDE.md#architecture)
for the full table.

### Adding code: where does it go?

| You're writing…                                   | Put it in     |
| ------------------------------------------------- | ------------- |
| A pure function used in more than one place       | `utils/`      |
| A file parser (OBJ, glTF, SVG…), with no Three.js | `utils/`      |
| Something that builds or updates Three.js objects | `rendering/`  |
| App-wide data that the UI and renderer react to   | `state/`      |
| Buttons, panels, inputs, layout                   | `components/` |

## Code style

- Prettier formats everything. Don't argue with it, run `npm run format`.
- TypeScript strict mode plus `typescript-eslint` strict-type-checked rules.
- Named exports only. Explicit return types on exported functions.
- Files ≤ 300 lines, functions ≤ 60 lines (lint-enforced).

## Pull request checklist

- [ ] `npm run check` passes locally
- [ ] New logic has unit tests next to it
- [ ] Shared logic lives in `utils/`, not copied
- [ ] No trademarked or branded names
- [ ] New architectural decisions are added to the decision log in `CLAUDE.md`

CI (`.github/workflows/ci.yml`) runs the same checks on every pull request. Merging to
`main` triggers `.github/workflows/deploy.yml`, which re-runs CI and then publishes to
GitHub Pages.
