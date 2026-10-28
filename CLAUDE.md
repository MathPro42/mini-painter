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
- SVG flow: `state.loadSvg()` parses with `utils/svg/parseSvg.ts` (regions, viewBox, artwork,
  and for paint-scheme sheets the tone masks and metal picture from `utils/svg/toneMasks.ts`).
  `rendering/svgLayer.ts` follows `svg`, `regionPaints` and `selectedRegionId` and repaints
  the plane's canvas texture: `paintSvg.ts` draws the base coats, then `paintTones.ts` the
  metal and the Layer/Shade/Highlight tones on a scratch canvas (washes multiplied in), then
  the shading artwork. Clicks go UI → rendering → state: `Viewport` calls
  `handle.pickRegion(x, y)`, then `state.selectRegion()`. Rendering never writes state.
- Components read signals with `components/useSignalValue.ts`, which re-renders on change.
- `AppState` is composed from `state/paintState.ts` (drawing, per-region paints for the four
  steps in `utils/paint/regionPaint.ts`, the active step, undo history) and
  `state/paletteState.ts` (named palettes, one in use). Undo covers region paints only. Every
  `setRegionStep` or `randomizeRegions` is one step; `previewRegionStep` shows a paint without
  a step (the color picker previews on `input` and commits on `change`). `loadSvg` clears the
  history and goes back to the Base step.
- Palette files: `utils/palette/paletteFile.ts` turns the first sheet into colors (header
  detection, `rgb()`/hex parsing, `rgba()` alpha marking washes) and writes exports.
  `utils/palette/paletteRecipe.ts` reads and writes the Id and Layer/Shade/Highlight recipe
  columns; `utils/paint/recipePaint.ts` turns a recipe into a region's paints.
  `utils/spreadsheet/readSpreadsheet.ts` picks the reader by content, not extension: zip →
  `.xlsx`, compound file → `.xls` (BIFF8), anything else → delimited text. Each reader bounds-checks its input and throws `RangeError`.
- Palettes persist through a `KeyValueStorage` passed to `createAppState({ storage })`.
  `main.tsx` passes `localStorage` (via `state/browserStorage.ts`); tests pass a fake or
  nothing. Every palette change saves; `utils/palette/savedPalettes.ts` owns the JSON format.

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
- Binary spreadsheet fixtures (`src/utils/spreadsheet/fixtures/`) are imported with `?inline`
  (a data URL, enabled by `assetsInclude` in `vitest.config.ts`) and read with `fetch`. Their
  README says how to regenerate them from the `.fods` source with LibreOffice.
- Preact 11 defers effect cleanup on unmount. Wrap `unmount()` in `act()` from
  `preact/test-utils` when asserting on cleanup.

## Decision log

Newest first. Add an entry whenever you make a decision a future contributor would ask
"why?" about.

| Date       | Decision                                                                         | Why                                                                                                         |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | Recipes: Layer/Shade/Highlight cells resolve at import by Id, else by name       | Stored as color keys, so they survive saves and exports. A Base with a recipe replaces the region's tones.  |
| 2026-10-28 | Washes (`rgba()` palette colors) multiply the paint under them through the mask  | At their .6 alpha they looked faint. Multiply keeps depth and the paint's hue. Picked by eye over opaque.   |
| 2026-10-28 | Metal is clipped to each shape in turn, never cut with `destination-in`          | Each `destination-in` draw erases all outside its shape, so regions of several shapes came out empty.       |
| 2026-10-28 | Four paint steps per region; Layer/Shade/Highlight show through the sheet masks  | How models are painted. Supersedes the 2026-10-27 "legend swatches" and "one flat color per region" rows.   |
| 2026-10-28 | Tone masks are browser-rendered images: the masked group refilled with white     | Full SVG mask behavior (units, transforms, embedded images) with no pixel reads of 2048 px textures.        |
| 2026-10-28 | Metallic paints in any step: the sheet's `Met` picture in hard light, no shading | Sheets hide a bare-metal picture for this. Hard light picked by eye over luminosity and doubled hard light. |
| 2026-10-28 | A paint is metallic when its palette group mentions "metal"                      | Sample palettes mark metals in their Type column. Colors from the picker are never metallic.                |
| 2026-10-28 | Randomize: a random Base per region (washes skipped), plus its recipe's tones    | Fast scheme ideas. Recipe tones suit their Base; with recipes off, other steps are cleared. One undo step.  |
| 2026-10-28 | Own readers for `.xlsx`, `.xls` (BIFF8) and CSV; no spreadsheet library          | Real palette sheets are often legacy `.xls`, even named `.xlsx`. npm's SheetJS build is stale and flagged.  |
| 2026-10-28 | `.xlsx` inflates with the browser's `DecompressionStream`, capped at 16 MB/part  | No zip dependency. Output is counted while streaming, so a lying size field can't zip-bomb the tab.         |
| 2026-10-28 | Each imported file becomes its own palette; a list picks the one in use          | Painters own several paint ranges and switch between them. An import never changes existing palettes.       |
| 2026-10-28 | Palettes are saved in `localStorage` as versioned JSON, after every change       | Survives visits with no server. Damaged entries are dropped one by one; a failed save shows a warning.      |
| 2026-10-28 | Palette export is `.xlsx` with Name/Value/Type, uncompressed, fixed timestamp    | CSV opens as one column in Excel locales that use `;`. Same headings as the sample sheets; re-imports.      |
| 2026-10-28 | A palette color is name + hex + optional group, opacity and recipe               | Other columns (links, spray flags) are ignored. Opacity and recipes came once the tones were tinted.        |
| 2026-10-28 | Undo covers region colors only, resets on a new drawing; color picks are 1 step  | Palette edits are not painting. The picker fires `input` per drag, so it previews and commits on `change`.  |
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
