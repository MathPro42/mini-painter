# Review rules

Drafted by the code-review skill from this repository's docs and configs. Edit freely.

## Check command

`npm run check` (the same steps as `.github/workflows/ci.yml`)

Covers: layer import boundaries, files ≤ 300 lines, functions ≤ 60 lines, complexity ≤ 10,
named exports only, explicit return types on exported functions, type-only imports, no
`console.log`, no `any`, no non-null assertions, no `@ts-ignore`, the strict TypeScript flags,
Prettier formatting, ≥ 90% coverage on `src/utils/` and `src/state/`, and the build. Branch
names are enforced by the `.claude/hooks/checkBranchName.js` hook.

## Project rules

- ABSOLUTE: never bundle, reference or name trademarked miniatures, factions, games,
  publishers, paint brands or branded paint names, in code, tests, comments, commit messages
  or docs. Samples use generic shapes and color names. (source: CLAUDE.md, CONTRIBUTING.md)
- ABSOLUTE: never copy files from `example/`, their file names or their region names into the
  repo. (source: CLAUDE.md)
- Never disable a lint rule to get past it: code that breaks a layer rule moves to the right
  layer. (source: CLAUDE.md)
- `main.tsx` only creates state, starts autosave and mounts `<App/>`. (source: CLAUDE.md)
- `components/Viewport.tsx` is the only bridge between UI and rendering; rendering never calls
  back into components and never writes state. (source: CLAUDE.md)
- Shared logic (color math, file parsing, geometry) lives in `utils/` and is never duplicated.
  (source: CLAUDE.md, CONTRIBUTING.md)
- Every non-trivial function has a test next to it (`*.test.ts` Node, `*.test.tsx` jsdom).
  (source: CLAUDE.md, CONTRIBUTING.md)
- `rendering/createRenderer.ts` and `rendering/svgModel.ts` are not unit-tested and must stay
  thin. (source: CLAUDE.md)
- Factories over classes: `createX()` returning a typed interface. (source: CLAUDE.md)
- Anything allocating GPU or DOM resources returns a `dispose()`, called by its owner.
  (source: CLAUDE.md)
- Invalid parser input: `normalizeX()` returns `null`, `parseX()` throws `RangeError`. State
  setters validate with a `parseX()` from `utils/`. (source: CLAUDE.md)
- File readers bounds-check their input and throw `RangeError`. (source: CLAUDE.md)
- Comments explain why, not what. (source: CLAUDE.md)
- Files are `camelCase.ts` for modules and `PascalCase.tsx` for components. (source:
  CLAUDE.md)
- One purpose per commit; tests and code in separate commits. (source: CLAUDE.md)
- Each feature is developed on its own branch created from `main`. (source: CLAUDE.md)
- New architectural decisions get a decision-log entry in `CLAUDE.md`. (source: CLAUDE.md,
  CONTRIBUTING.md)

## Decision records

- `CLAUDE.md`, section "Decision log"
