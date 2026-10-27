import type { Point, Ring } from './geometry';
import { readNumbers } from './numbers';

/**
 * A 2D affine matrix `[a, b, c, d, e, f]`, as in SVG: it maps (x, y) to
 * (a·x + c·y + e, b·x + d·y + f).
 */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const TRANSFORM_ITEM = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/y;
const ONLY_SEPARATORS = /^[\s,]*$/;

type MatrixBuilder = (args: readonly number[]) => Matrix | null;

const arg = (args: readonly number[], index: number): number => args[index] ?? 0;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const BUILDERS: ReadonlyMap<string, MatrixBuilder> = new Map<string, MatrixBuilder>([
  [
    'matrix',
    (a) =>
      a.length === 6 ? [arg(a, 0), arg(a, 1), arg(a, 2), arg(a, 3), arg(a, 4), arg(a, 5)] : null,
  ],
  [
    'translate',
    (a) => (a.length === 1 || a.length === 2 ? [1, 0, 0, 1, arg(a, 0), arg(a, 1)] : null),
  ],
  [
    'scale',
    (a) => (a.length === 1 || a.length === 2 ? [arg(a, 0), 0, 0, a[1] ?? arg(a, 0), 0, 0] : null),
  ],
  [
    'rotate',
    (a) =>
      a.length === 1 || a.length === 3 ? rotation(radians(arg(a, 0)), arg(a, 1), arg(a, 2)) : null,
  ],
  ['skewX', (a) => (a.length === 1 ? [1, 0, Math.tan(radians(arg(a, 0))), 1, 0, 0] : null)],
  ['skewY', (a) => (a.length === 1 ? [1, Math.tan(radians(arg(a, 0))), 0, 1, 0, 0] : null)],
]);

/** Returns `m · n`: the transform that applies `n` first, then `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, { x, y }: Point): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function transformRings(m: Matrix, rings: readonly Ring[]): Ring[] {
  if (m === IDENTITY) {
    return [...rings];
  }
  return rings.map((ring) => ring.map((point) => applyMatrix(m, point)));
}

/**
 * Converts an SVG `transform` attribute to one matrix. Returns `null` when the
 * attribute is malformed; SVG renderers then ignore the whole attribute.
 */
export function transformMatrix(value: string): Matrix | null {
  let matrix = IDENTITY;
  let consumed = 0;
  for (;;) {
    TRANSFORM_ITEM.lastIndex = consumed;
    const match = TRANSFORM_ITEM.exec(value);
    if (match === null) {
      break;
    }
    const item = BUILDERS.get(match[1] ?? '')?.(readNumbers(match[2] ?? '')) ?? null;
    if (item === null) {
      return null;
    }
    matrix = multiply(matrix, item);
    consumed = TRANSFORM_ITEM.lastIndex;
  }
  return ONLY_SEPARATORS.test(value.slice(consumed)) ? matrix : null;
}

/** Rotation by `angle` radians around (cx, cy). */
function rotation(angle: number, cx: number, cy: number): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}
