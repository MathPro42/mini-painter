# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Humans read it too: it is the home of the architecture rules and the decision log.

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
tests, comments, commit messages and docs. Real-world files for manual testing go in
`example/`, which is gitignored. Never copy them, their file names or their region names into the repo.

## Commands

```bash
npm ci                 # install exactly what package-lock.json pins (Node 22, see .nvmrc)
npm run dev            # dev server → http://localhost:5173/mini-painter/
npm run check          # everything CI runs: lint, format, typecheck, tests+coverage, build
npm test               # all tests once, no coverage
npm run test:watch     # Vitest in watch mode
npm run lint:fix       # ESLint autofix
npm run format         # Prettier write
npm run build && npm run preview   # production build → http://localhost:4173/mini-painter/

npx vitest run src/utils/color.test.ts   # one test file
npx vitest run -t "hexColorToInt"        # tests whose full name matches a regex
npx vitest run --project unit            # Node tests only (--project dom: component tests)
```

Run `npm run check` before every commit. CI runs the same steps and must be green before merge.
`ci.yml` runs on pull requests and non-`main` pushes. A push to `main` runs `deploy.yml`,
which calls `ci.yml` and then publishes `dist/` to GitHub Pages. The repo's Settings → Pages →
Source must stay on **GitHub Actions**. With "Deploy from a branch", GitHub also runs its own
Jekyll deploy on every push, and if it finishes last it publishes the raw repo (a blank page).

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
  their own instance, so no state leaks between tests. Setters validate input with a
  `parseX()` from `utils/`, so an invalid value throws before it reaches a signal.
- `components/Viewport.tsx` is the **only** bridge between UI and rendering. It owns the
  `<canvas>`, calls `createRenderer(canvas, state)` on mount and `dispose()` on unmount.
  `createRenderer` throws when WebGL is unavailable. `Viewport` catches that and shows a
  `role="alert"` message in place of the canvas.
- `rendering/createRenderer.ts` subscribes to state with `effect()` from signals-core and
  pushes changes into the scene. Rendering never calls back into components.
- Scene construction (`rendering/helloCubeScene.ts`) is separate from the WebGL renderer,
  so scene logic is unit-testable in Node without a GPU.
- SVG flow: `state.loadSvg()` parses with `utils/svg/parseSvg.ts` (regions, viewBox, artwork).
  `rendering/svgLayer.ts` follows `svg`, `regionColors` and `selectedRegionId` and repaints
  the plane's canvas texture (`paintSvg.ts`). Clicks go UI → rendering → state: `Viewport`
  calls `handle.pickRegion(x, y)`, then `state.selectRegion()`. Rendering never writes state.
- Components read signals with `components/useSignalValue.ts`, which re-renders on change.

## Principles

1. **DRY.** Shared logic (color math, file parsing, geometry) lives in `utils/` and is
   never duplicated. Before writing a helper, search `utils/`. If two layers need the same
   logic, it belongs in `utils/`.
2. **Test every non-trivial function.** Tests sit next to the source as `*.test.ts`
   (Node) or `*.test.tsx` (jsdom). `utils/` and `state/` keep ≥90% coverage (enforced).
3. **Rendering stays separate from UI and state.** Three.js code lives in `rendering/`
   only; Preact only in `components/`.
4. **No god files.** ESLint caps files at 300 lines, functions at 60 (test files exempt)
   and cyclomatic complexity at 10. Split by responsibility before you hit them.
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

### Easy-to-miss rules that fail `npm run check`

- Exported functions need explicit return types. Type-only imports use `import type`.
- `console.log` is a lint error (`console.warn` and `console.error` are allowed). Lint runs
  with `--max-warnings 0`, and an unused `eslint-disable` comment is itself an error.
- `tsconfig.app.json` adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
  `noPropertyAccessFromIndexSignature` on top of `strict`. Indexing returns `T | undefined`,
  an optional property can't be set to `undefined` explicitly, and index-signature keys need
  bracket access.
- Prettier also checks Markdown (100 columns), so run `npm run format` after you edit a
  table in this file.
- Vite 8 bundles with Rolldown. Chunking is configured under `build.rolldownOptions`
  (`codeSplitting.groups`), not with Rollup's `manualChunks`.

## Testing notes

- Vitest has two projects (`vitest.config.ts`): **unit** (`*.test.ts`, Node) and **dom**
  (`*.test.tsx`, jsdom with Testing Library).
- Vitest globals are off: import `describe`, `it`, `expect` and `vi` from `vitest`. That is
  also why `src/test/setup.ts` (dom project only) registers Testing Library's `cleanup()`
  itself.
- Component tests mock `rendering/createRenderer` because jsdom has no WebGL.
- `rendering/createRenderer.ts` itself is not unit-tested (it needs a real WebGL context).
  It is kept thin. Verify changes to it in a browser (`npm run build && npm run preview`).
  The same goes for `rendering/svgModel.ts` (2D canvas, `Image`, Blob URLs).
- SVG parser tests use the synthetic sheets in `src/utils/svg/fixtures/`, imported with `?raw`.
- Preact 11 defers effect cleanup on unmount. Wrap `unmount()` in `act()` from
  `preact/test-utils` when asserting on cleanup.

## Decision log

Newest first. Add an entry whenever you make a decision a future contributor would ask
"why?" about.

| Date       | Decision                                                                         | Why                                                                                                         |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-27 | `Image` artwork composites with `hard-light`; `overlay` failed a browser check   | Greys multiply or screen paint by their value, so opaque black/white stay exact. Overlay keys off paint.    |
| 2026-10-27 | Masked `Layer`/`Shade`/`Highlight` groups are legend swatches, not model shading | In every sample each holds one small square. Per-region tones would paint through the mask images instead.  |
| 2026-10-27 | SVG regions: each `selectionMap` child group, else each filled top-level element | Sheets mark paint zones with invisible hit groups. Other SVGs still load. Nothing filled → a clear error.   |
| 2026-10-27 | A region is a whole `selectionMap` group, painted flat under the `Image` layer   | Simplest v1. Sample layer groups hold only swatches, so there are no visible paths to match groups to.      |
| 2026-10-27 | Limitation: one flat color per region; `Shade`/`Highlight` masks are not tinted  | Shading comes from the `Image` overlay alone. Revisit: per-region shade/highlight tones through the masks.  |
| 2026-10-27 | Loose shapes beside `selectionMap` groups share one "Ungrouped shapes" region    | In samples they are stray slivers. With no groups at all, each loose shape is its own region.               |
| 2026-10-27 | SVGs render to a canvas texture; artwork is drawn by the browser as an image     | No SVG renderer of our own. Images never run scripts or fetch resources, so untrusted files stay inert.     |
| 2026-10-27 | Own small XML parser (`utils/xml.ts`) instead of `DOMParser`                     | `DOMParser` is missing in Node tests, and source offsets let artwork be copied verbatim. No new dependency. |
| 2026-10-27 | Drawings zoom (toward the pointer) and pan, but never rotate                     | Owner's call after trying a 2.5D relief. A flat drawing seen at an angle only distorts it.                  |
| 2026-10-27 | OrbitControls on the shared camera; a click (≤5 px of travel) picks a region     | One rig for the cube and drawings. The threshold keeps a drag from changing the selection.                  |
| 2026-10-27 | Components read signals via `useSignalValue`, not `preact/compat`                | compat's `useSyncExternalStore` also installs global React-style vnode hooks. A 10-line hook is enough.     |
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
