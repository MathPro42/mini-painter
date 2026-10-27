import type { ArcParameters } from './curves';
import { flattenArc, flattenCubic, flattenQuadratic } from './curves';
import type { Point, Ring } from './geometry';
import { NUMBER_PATTERN } from './numbers';

/** Max distance, in the path's own units, between a curve and the polyline replacing it. */
export const FLATTEN_TOLERANCE = 0.2;

const COMMAND = /[\s,]*([MmZzLlHhVvCcSsQqTtAa])/y;
const NUMBER = new RegExp(String.raw`[\s,]*(${NUMBER_PATTERN})`, 'y');
const FLAG = /[\s,]*([01])/y;
const ONLY_SEPARATORS = /[\s,]*$/y;
const STARTS_WITH_MOVE = /^[\s,]*[Mm]/;

const ARGUMENT_COUNTS: ReadonlyMap<string, number> = new Map([
  ['m', 2],
  ['l', 2],
  ['h', 1],
  ['v', 1],
  ['c', 6],
  ['s', 4],
  ['q', 4],
  ['t', 2],
  ['a', 7],
  ['z', 0],
]);

const ORIGIN: Point = { x: 0, y: 0 };

interface Cursor {
  readonly text: string;
  pos: number;
}

/** Last control points, which the S and T shorthands reflect. */
interface Controls {
  readonly cubic: Point | null;
  readonly quad: Point | null;
}

interface PathState {
  readonly tolerance: number;
  readonly rings: Point[][];
  ring: Point[] | null;
  current: Point;
  start: Point;
  controls: Controls;
}

type Handler = (state: PathState, args: readonly number[], previous: Controls) => void;

const at = (args: readonly number[], index: number): number => args[index] ?? 0;
const pointAt = (args: readonly number[], index: number): Point => ({
  x: at(args, index),
  y: at(args, index + 1),
});

const HANDLERS: ReadonlyMap<string, Handler> = new Map<string, Handler>([
  [
    'M',
    (s, a) => {
      moveTo(s, pointAt(a, 0));
    },
  ],
  [
    'L',
    (s, a) => {
      extend(s, [pointAt(a, 0)]);
    },
  ],
  [
    'H',
    (s, a) => {
      extend(s, [{ x: at(a, 0), y: s.current.y }]);
    },
  ],
  [
    'V',
    (s, a) => {
      extend(s, [{ x: s.current.x, y: at(a, 0) }]);
    },
  ],
  [
    'C',
    (s, a) => {
      cubicTo(s, pointAt(a, 0), pointAt(a, 2), pointAt(a, 4));
    },
  ],
  [
    'S',
    (s, a, p) => {
      cubicTo(s, reflect(p.cubic, s.current), pointAt(a, 0), pointAt(a, 2));
    },
  ],
  [
    'Q',
    (s, a) => {
      quadTo(s, pointAt(a, 0), pointAt(a, 2));
    },
  ],
  [
    'T',
    (s, a, p) => {
      quadTo(s, reflect(p.quad, s.current), pointAt(a, 0));
    },
  ],
  [
    'A',
    (s, a) => {
      arcTo(s, arcParameters(a), pointAt(a, 5));
    },
  ],
  ['Z', closePath],
]);

/**
 * Converts SVG path data (`d`) to polygons, replacing curves and arcs with
 * line segments. Like browsers, it keeps everything before the first error
 * and ignores the rest. Rings with fewer than 3 points enclose no area and
 * are dropped.
 */
export function flattenPathData(d: string, tolerance = FLATTEN_TOLERANCE): Ring[] {
  if (!STARTS_WITH_MOVE.test(d)) {
    return [];
  }
  const state: PathState = {
    tolerance,
    rings: [],
    ring: null,
    current: ORIGIN,
    start: ORIGIN,
    controls: { cubic: null, quad: null },
  };
  const cursor: Cursor = { text: d, pos: 0 };
  let command: string | null = null;
  for (;;) {
    const explicit = readToken(COMMAND, cursor);
    command = explicit ?? implicitRepeat(command);
    if (command === null || (explicit === null && atEnd(cursor))) {
      break;
    }
    const args = readArguments(cursor, command);
    if (args === null) {
      break;
    }
    applyCommand(state, command, args);
  }
  return state.rings.filter((ring) => ring.length >= 3);
}

/** Extra coordinates after a command repeat it; after a moveto they mean lineto. */
function implicitRepeat(command: string | null): string | null {
  if (command === 'M') {
    return 'L';
  }
  if (command === 'm') {
    return 'l';
  }
  return command === 'Z' || command === 'z' ? null : command;
}

function readToken(pattern: RegExp, cursor: Cursor): string | null {
  pattern.lastIndex = cursor.pos;
  const match = pattern.exec(cursor.text);
  if (match === null) {
    return null;
  }
  cursor.pos = pattern.lastIndex;
  return match[1] ?? null;
}

function atEnd(cursor: Cursor): boolean {
  ONLY_SEPARATORS.lastIndex = cursor.pos;
  return ONLY_SEPARATORS.exec(cursor.text)?.index === cursor.pos;
}

function readArguments(cursor: Cursor, command: string): number[] | null {
  const lower = command.toLowerCase();
  const count = ARGUMENT_COUNTS.get(lower) ?? 0;
  const args: number[] = [];
  for (let index = 0; index < count; index++) {
    const isFlag = lower === 'a' && (index === 3 || index === 4);
    const token = readToken(isFlag ? FLAG : NUMBER, cursor);
    if (token === null) {
      return null;
    }
    args.push(Number(token));
  }
  return args;
}

function applyCommand(state: PathState, command: string, args: readonly number[]): void {
  const upper = command.toUpperCase();
  const absolute = upper === command ? args : toAbsolute(command, args, state.current);
  const previous = state.controls;
  state.controls = { cubic: null, quad: null };
  HANDLERS.get(upper)?.(state, absolute, previous);
}

function toAbsolute(command: string, args: readonly number[], origin: Point): number[] {
  return args.map((value, index) => value + relativeOffset(command, index, origin));
}

function relativeOffset(command: string, index: number, { x, y }: Point): number {
  if (command === 'h') {
    return x;
  }
  if (command === 'v') {
    return y;
  }
  if (command === 'a') {
    return index === 5 ? x : index === 6 ? y : 0;
  }
  return index % 2 === 0 ? x : y;
}

function arcParameters(args: readonly number[]): ArcParameters {
  return {
    rx: at(args, 0),
    ry: at(args, 1),
    rotation: at(args, 2),
    largeArc: at(args, 3) === 1,
    sweep: at(args, 4) === 1,
  };
}

function reflect(control: Point | null, current: Point): Point {
  return control === null
    ? current
    : { x: 2 * current.x - control.x, y: 2 * current.y - control.y };
}

function moveTo(state: PathState, point: Point): void {
  state.ring = [point];
  state.rings.push(state.ring);
  state.current = point;
  state.start = point;
}

/** Appends points to the current ring, starting a new one after a closepath. */
function extend(state: PathState, points: readonly Point[]): void {
  const last = points.at(-1);
  if (last === undefined) {
    return;
  }
  if (state.ring === null) {
    state.ring = [state.current];
    state.rings.push(state.ring);
  }
  state.ring.push(...points);
  state.current = last;
}

function cubicTo(state: PathState, c1: Point, c2: Point, end: Point): void {
  extend(state, flattenCubic(state.current, c1, c2, end, state.tolerance));
  state.controls = { cubic: c2, quad: null };
}

function quadTo(state: PathState, control: Point, end: Point): void {
  extend(state, flattenQuadratic(state.current, control, end, state.tolerance));
  state.controls = { cubic: null, quad: control };
}

function arcTo(state: PathState, arc: ArcParameters, end: Point): void {
  extend(state, flattenArc(state.current, arc, end, state.tolerance));
}

function closePath(state: PathState): void {
  state.current = state.start;
  state.ring = null;
}
