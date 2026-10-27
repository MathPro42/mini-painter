import type { Point } from './geometry';

/** Caps the points one curve can produce, whatever its size or the tolerance. */
export const MAX_CURVE_SEGMENTS = 128;

/** An SVG elliptical arc, as written in path data. `rotation` is in degrees. */
export interface ArcParameters {
  readonly rx: number;
  readonly ry: number;
  readonly rotation: number;
  readonly largeArc: boolean;
  readonly sweep: boolean;
}

interface ArcCenter {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly cos: number;
  readonly sin: number;
  readonly startAngle: number;
  readonly sweepAngle: number;
}

const clampSegments = (count: number): number =>
  Math.min(MAX_CURVE_SEGMENTS, Math.max(1, Math.ceil(count)));

/** Second difference of three control points: how far the middle one bends the curve. */
const bend = (a: Point, b: Point, c: Point): number =>
  Math.hypot(a.x - 2 * b.x + c.x, a.y - 2 * b.y + c.y);

/**
 * Points along a cubic Bézier, excluding `p0` and ending exactly at `p3`.
 * Uses enough segments that no point of the curve is farther than `tolerance`
 * from the polyline: the error of n uniform segments is at most 0.75·bend/n².
 */
export function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
): Point[] {
  const maxBend = Math.max(bend(p0, p1, p2), bend(p1, p2, p3));
  const segments = clampSegments(Math.sqrt((0.75 * maxBend) / tolerance));
  return Array.from({ length: segments }, (_, index) => {
    const t = (index + 1) / segments;
    const u = 1 - t;
    const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  });
}

/** Points along a quadratic Bézier, excluding `p0` and ending exactly at `p2`. */
export function flattenQuadratic(p0: Point, p1: Point, p2: Point, tolerance: number): Point[] {
  const segments = clampSegments(Math.sqrt((0.25 * bend(p0, p1, p2)) / tolerance));
  return Array.from({ length: segments }, (_, index) => {
    const t = (index + 1) / segments;
    const u = 1 - t;
    const [a, b, c] = [u * u, 2 * u * t, t * t];
    return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
  });
}

/**
 * Points along an SVG elliptical arc, excluding `from` and ending exactly at
 * `to`. Follows the SVG spec's out-of-range rules: identical endpoints draw
 * nothing, a zero radius draws a straight line, and radii too small to reach
 * `to` are scaled up.
 */
export function flattenArc(from: Point, arc: ArcParameters, to: Point, tolerance: number): Point[] {
  if (from.x === to.x && from.y === to.y) {
    return [];
  }
  if (arc.rx === 0 || arc.ry === 0) {
    return [to];
  }
  const { cx, cy, rx, ry, cos, sin, startAngle, sweepAngle } = arcCenter(from, arc, to);
  const radius = Math.max(rx, ry);
  const maxStep = 2 * Math.acos(Math.max(-1, 1 - tolerance / radius));
  const segments = clampSegments(Math.abs(sweepAngle) / maxStep);
  const points = Array.from({ length: segments - 1 }, (_, index) => {
    const angle = startAngle + (sweepAngle * (index + 1)) / segments;
    const [x, y] = [rx * Math.cos(angle), ry * Math.sin(angle)];
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  });
  points.push(to);
  return points;
}

/** Endpoint-to-center conversion from the SVG spec (implementation notes, B.2.4). */
function arcCenter(from: Point, arc: ArcParameters, to: Point): ArcCenter {
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const growth = Math.sqrt((x1 * x1) / (arc.rx * arc.rx) + (y1 * y1) / (arc.ry * arc.ry));
  const rx = Math.abs(arc.rx) * Math.max(1, growth);
  const ry = Math.abs(arc.ry) * Math.max(1, growth);
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const sign = arc.largeArc === arc.sweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const centerX = (factor * rx * y1) / ry;
  const centerY = (-factor * ry * x1) / rx;
  const startAngle = Math.atan2((y1 - centerY) / ry, (x1 - centerX) / rx);
  const endAngle = Math.atan2((-y1 - centerY) / ry, (-x1 - centerX) / rx);
  let sweepAngle = endAngle - startAngle;
  if (arc.sweep && sweepAngle < 0) {
    sweepAngle += 2 * Math.PI;
  } else if (!arc.sweep && sweepAngle > 0) {
    sweepAngle -= 2 * Math.PI;
  }
  return {
    cx: cos * centerX - sin * centerY + (from.x + to.x) / 2,
    cy: sin * centerX + cos * centerY + (from.y + to.y) / 2,
    rx,
    ry,
    cos,
    sin,
    startAngle,
    sweepAngle,
  };
}
