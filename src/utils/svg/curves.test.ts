import { describe, expect, it } from 'vitest';
import type { ArcParameters } from './curves';
import { flattenArc, flattenCubic, flattenQuadratic, MAX_CURVE_SEGMENTS } from './curves';
import type { Point } from './geometry';

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from `point` to the closest segment of `polyline`. */
const distanceToPolyline = (point: Point, polyline: readonly Point[]): number =>
  Math.min(
    ...polyline.slice(1).map((end, index) => {
      const start = polyline[index] ?? end;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
      );
      return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
    }),
  );

const circleArc = (sweep: boolean, largeArc = false): ArcParameters => ({
  rx: 10,
  ry: 10,
  rotation: 0,
  largeArc,
  sweep,
});

describe('flattenCubic', () => {
  const [p0, p1, p2, p3] = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
  ];

  it('ends exactly at the last control point', () => {
    expect(flattenCubic(p0, p1, p2, p3, 0.2).at(-1)).toEqual(p3);
  });

  it('stays within the tolerance of the true curve', () => {
    const polyline = [p0, ...flattenCubic(p0, p1, p2, p3, 0.2)];
    for (let t = 0; t <= 1; t += 0.01) {
      const u = 1 - t;
      const exact = {
        x: 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      };
      expect(distanceToPolyline(exact, polyline)).toBeLessThanOrEqual(0.2);
    }
  });

  it('uses a single segment for a straight curve', () => {
    expect(flattenCubic(p0, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.2)).toHaveLength(1);
  });

  it('caps the number of segments', () => {
    expect(flattenCubic(p0, p1, p2, p3, 1e-9)).toHaveLength(MAX_CURVE_SEGMENTS);
  });
});

describe('flattenQuadratic', () => {
  it('ends at the end point and bends toward the control point', () => {
    const points = flattenQuadratic({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 0.2);
    expect(points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(50, 0);
  });
});

describe('flattenArc', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 20, y: 0 };

  it('draws a semicircle whose points sit on the circle', () => {
    const points = flattenArc(from, circleArc(true), to, 0.1);
    expect(points.at(-1)).toEqual(to);
    for (const point of points) {
      expect(distance(point, { x: 10, y: 0 })).toBeCloseTo(10);
    }
  });

  it('follows the sweep flag: positive angles go through negative y', () => {
    const positive = flattenArc(from, circleArc(true), to, 0.1);
    const negative = flattenArc(from, circleArc(false), to, 0.1);
    expect(Math.min(...positive.map((point) => point.y))).toBeCloseTo(-10);
    expect(Math.max(...negative.map((point) => point.y))).toBeCloseTo(10);
  });

  it('picks the large or small arc by flag', () => {
    const near = { x: 10, y: 10 };
    const small = flattenArc(from, circleArc(false), near, 0.1);
    const large = flattenArc(from, circleArc(false, true), near, 0.1);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('scales radii up when they cannot reach the end point', () => {
    const points = flattenArc(from, { ...circleArc(true), rx: 1, ry: 1 }, to, 0.1);
    for (const point of points) {
      expect(distance(point, { x: 10, y: 0 })).toBeCloseTo(10);
    }
  });

  it('honors the x-axis rotation of an ellipse', () => {
    const tilted = flattenArc(
      from,
      { rx: 20, ry: 5, rotation: 90, largeArc: false, sweep: true },
      { x: 0, y: 40 },
      0.1,
    );
    expect(Math.max(...tilted.map((point) => point.x))).toBeCloseTo(5, 1);
  });

  it('draws nothing between identical points and a line for a zero radius', () => {
    expect(flattenArc(from, circleArc(true), from, 0.1)).toEqual([]);
    expect(flattenArc(from, { ...circleArc(true), rx: 0 }, to, 0.1)).toEqual([to]);
  });
});
