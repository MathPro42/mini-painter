# CLAUDE.md

Guidance for Claude (and humans) working in this repository. Read this before changing code.

## Project

**Mini Painter** is a static web app for trying out paint color schemes on 3D models
or SVG files that the **user uploads**. It runs entirely in the browser and is deployed to
GitHub Pages: https://mathpro42.github.io/mini-painter/

### Content rule (non-negotiable)

The app is fully generic. Never bundle, reference, or name:

- trademarked miniatures, factions, games, or publishers
- paint brands or branded paint names

Models come from the user at runtime. Sample assets, fixtures and docs use generic shapes
(cube, sphere) and generic color names ("brick red", `#c8553d`). This applies to code,
tests, comments, commit messages and docs.

## Commands

```bash
npm ci                 # install exactly what package-lock.json pins
npm run dev            # dev server → http://localhost:5173/mini-painter/
npm run check          # everything CI runs: lint, format, typecheck, tests+coverage, build
npm run test:watch     # Vitest in watch mode
npm run lint:fix       # ESLint autofix
npm run format         # Prettier write
```

Run `npm run check` before every commit. CI runs the same steps and must be green before merge.

## Architecture

```
src/
  main.tsx        entry point: creates state, mounts <App/>. Nothing else.
  components/     Preact UI (DOM, events, layout)
  rendering/      Three.js (scene, camera, renderer, model loading)
  state/          reactive app state (@preact/signals-core stores)
  utils/          pure shared logic (color math, file parsing, geometry helpers)
  styles/         global CSS
  test/           test setup only
```

### Dependency rules

```
components ──► state, rendering, utils
rendering  ──► state, utils
state      ──► utils
utils      ──► (nothing in src/)
```

| Layer         | May import                                          | Must not import                                       |
| ------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `utils/`      | other utils, std lib                                | `three`, `preact*`, `@preact/signals-core`, any layer |
| `state/`      | `@preact/signals-core`, `utils/`                    | `three`, `preact*`, `rendering/`, `components/`       |
| `rendering/`  | `three`, `@preact/signals-core`, `state/`, `utils/` | `preact*`, `components/`                              |
| `components/` | `preact`, `state/`, `rendering/`, `utils/`          | `three` (go through `rendering/`)                     |

ESLint (`no-restricted-imports` in `eslint.config.js`) enforces these rules. A lint error
here means the code is in the wrong layer. Move it; don't disable the rule.

### How the layers meet

- `state/appState.ts` exports `createAppState()`, a factory that returns signals plus setters.
  `main.tsx` creates the single instance and passes it down as a prop. Tests create
  their own instance, so no state leaks between tests.
- `components/Viewport.tsx` is the **only** bridge between UI and rendering. It owns the
  `<canvas>`, calls `createRenderer(canvas, state)` on mount and `dispose()` on unmount.
- `rendering/createRenderer.ts` subscribes to state with `effect()` from signals-core and
  pushes changes into the scene. Rendering never calls back into components.
- Scene construction (`rendering/helloCubeScene.ts`) is separate from the WebGL renderer,
  so scene logic is unit-testable in Node without a GPU.

## Principles

1. **DRY.** Shared logic (color math, file parsing, geometry) lives in `utils/` and is
   never duplicated. Before writing a helper, search `utils/`. If two layers need the same
   logic, it belongs in `utils/`.
2. **Test every non-trivial function.** Tests sit next to the source as `*.test.ts`
   (Node) or `*.test.tsx` (jsdom). `utils/` and `state/` keep ≥90% coverage (enforced).
3. **Rendering stays separate from UI and state.** Three.js code lives in `rendering/`
   only; Preact only in `components/`.
4. **No god files.** ESLint caps files at 300 lines and functions at 60. Split by
   responsibility before you hit them.
5. **Green before merge.** Lint, format, typecheck, tests and build must pass in CI.
6. **Strict TypeScript.** No `any`, no non-null assertions, no `@ts-ignore`. Use named
   exports only (no `export default` in `src/`).

## Conventions

- Files: `camelCase.ts` for modules, `PascalCase.tsx` for components.
- Factories over classes: `createX()` returning a typed interface (`createAppState`,
  `createRenderer`, `createHelloCubeScene`).
- Anything that allocates GPU or DOM resources returns a `dispose()` and is disposed by
  its owner.
- Invalid input to a parser: `normalizeX()` returns `null`, `parseX()` throws `RangeError`.
- Comments explain _why_, not _what_.

## Testing notes

- Vitest has two projects (`vitest.config.ts`): **unit** (`*.test.ts`, Node) and **dom**
  (`*.test.tsx`, jsdom with Testing Library).
- Component tests mock `rendering/createRenderer` because jsdom has no WebGL.
- `rendering/createRenderer.ts` itself is not unit-tested (it needs a real WebGL context).
  It is kept thin. Verify changes to it in a browser (`npm run build && npm run preview`).
- Preact 11 defers effect cleanup on unmount. Wrap `unmount()` in `act()` from
  `preact/test-utils` when asserting on cleanup.

## Decision log

Newest first. Add an entry whenever you make a decision a future contributor would ask
"why?" about.

| Date       | Decision                                                                         | Why                                                                                                         |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-27 | Three.js gets its own chunk; `chunkSizeWarningLimit` raised to 600 kB            | Three.js alone is ~530 kB minified. A separate chunk keeps its cache warm across app deploys.               |
| 2026-10-27 | Pages deploy uses `upload-pages-artifact` + `deploy-pages`, no `configure-pages` | Vite sets `base` itself, so configure-pages adds nothing. Fewer moving parts.                               |
| 2026-10-27 | `deploy.yml` reuses `ci.yml` via `workflow_call`                                 | One definition of "green". Deploy can't skip lint or tests.                                                 |
| 2026-10-27 | `createRenderer` has no unit test                                                | Needs WebGL. Kept thin; scene logic is split into `helloCubeScene.ts` and tested.                           |
| 2026-10-27 | Vitest projects: Node for `.ts`, jsdom for `.tsx`                                | Pure logic runs fast without a DOM. Only components pay for jsdom.                                          |
| 2026-10-27 | jsdom 29 (not 30)                                                                | jsdom 30 needs Node ≥22.22.2; 29 supports every Node 22 that Vite/Vitest support.                           |
| 2026-10-27 | `eslint-plugin-jsx-a11y` deferred                                                | No ESLint 10 support yet. Revisit when it ships; until then review a11y by hand.                            |
| 2026-10-27 | TypeScript pinned to `~6.0`                                                      | `typescript-eslint` 8.x supports TS `<6.1`. Move to TS 7 when typescript-eslint does.                       |
| 2026-10-27 | Layer boundaries enforced by ESLint `no-restricted-imports`                      | Rules people must remember get broken. Lint rules don't.                                                    |
| 2026-10-27 | State: `@preact/signals-core` behind a `createAppState()` factory                | Framework-agnostic, so rendering can subscribe without Preact. A factory avoids global singletons in tests. |
| 2026-10-27 | UI: Preact (not vanilla DOM, React or Svelte)                                    | Component model and hooks at ~4 kB. Pairs naturally with signals.                                           |
| 2026-10-27 | Strict TypeScript + `typescript-eslint` strictTypeChecked                        | Catch errors at compile time. The app will parse untrusted user files.                                      |
| 2026-10-27 | Vite + GitHub Pages via Actions                                                  | Static app, zero hosting cost, deploy on push to `main`.                                                    |
