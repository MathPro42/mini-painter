# Review rules

Drafted by the code-review skill from this repository's docs and configs. Edit freely.

## Check command

`npm run check` (lint, format check, typecheck, tests with coverage, build; same steps as
`.github/workflows/ci.yml`). It covers the layer import rules, file/function size and
complexity caps, named exports, explicit return types, type-only imports, no `console.log`,
the strict TypeScript flags and the 90% coverage threshold on `utils/` and `state/`.

## Project rules

- ABSOLUTE: never bundle, reference or name trademarked miniatures, factions, games,
  publishers, paint brands or branded paint names, in code, tests, comments, commit messages
  or docs. Samples use generic shapes and color names. (source: CLAUDE.md, CONTRIBUTING.md)
- ABSOLUTE: never copy files from `example/`, their file names or their region names into the
  repo. (source: CLAUDE.md)
- Layers: `utils` imports nothing in `src/`; `state` only `utils`; `rendering` only `state` and
  `utils`; `components` never `three`. A violation means moving the code, never disabling the
  rule. (source: CLAUDE.md; enforced by lint)
- `main.tsx` only creates state, starts autosave and mounts `<App/>`. (source: CLAUDE.md)
- `components/Viewport.tsx` is the only bridge between UI and rendering; rendering never calls
  back into components and never writes state. (source: CLAUDE.md)
- Shared logic (color math, file parsing, geometry) lives in `utils/` and is never duplicated.
  (source: CLAUDE.md, CONTRIBUTING.md)
- Every non-trivial function has a test next to it (`*.test.ts` Node, `*.test.tsx` jsdom).
  (source: CLAUDE.md, CONTRIBUTING.md)
- `createRenderer.ts` and `svgModel.ts` are not unit-tested and must stay thin. (source:
  CLAUDE.md)
- Strict TypeScript: no `any`, no non-null assertions, no `@ts-ignore`. (source: CLAUDE.md)
- Factories over classes: `createX()` returning a typed interface. (source: CLAUDE.md)
- Anything allocating GPU or DOM resources returns a `dispose()`, called by its owner.
  (source: CLAUDE.md)
- Invalid parser input: `normalizeX()` returns `null`, `parseX()` throws `RangeError`. State
  setters validate with a `parseX()` from `utils/`. (source: CLAUDE.md)
- File readers bounds-check their input and throw `RangeError`. (source: CLAUDE.md)
- Comments explain why, not what. (source: CLAUDE.md)
- Files `camelCase.ts`, components `PascalCase.tsx`. (source: CLAUDE.md)
- One purpose per commit; tests and code in separate commits. (source: CLAUDE.md)
- One branch per feature, from `main`, named in lowercase hyphenated words. (source:
  CLAUDE.md)
- New architectural decisions get a decision-log entry in `CLAUDE.md`. (source: CLAUDE.md,
  CONTRIBUTING.md)

## Decision records

- `CLAUDE.md`, section "Decision log"
