import type { XmlElement } from '../xml';
import { flattenArc } from './curves';
import type { Point, Ring } from './geometry';
import { readNumbers } from './numbers';
import { FLATTEN_TOLERANCE, flattenPathData } from './pathData';

type ShapeReader = (attributes: ReadonlyMap<string, string>) => Ring[];

const length = (attributes: ReadonlyMap<string, string>, name: string): number => {
  const value = Number.parseFloat(attributes.get(name) ?? '');
  return Number.isFinite(value) ? value : 0;
};

const SHAPE_READERS: ReadonlyMap<string, ShapeReader> = new Map<string, ShapeReader>([
  ['path', (a) => flattenPathData(a.get('d') ?? '')],
  ['rect', readRect],
  ['circle', (a) => ellipse(length(a, 'cx'), length(a, 'cy'), length(a, 'r'), length(a, 'r'))],
  ['ellipse', (a) => ellipse(length(a, 'cx'), length(a, 'cy'), length(a, 'rx'), length(a, 'ry'))],
  ['polygon', readPoints],
  // A polyline's fill closes it implicitly, exactly like a polygon.
  ['polyline', readPoints],
  // Lines enclose no area, so there is nothing to fill.
  ['line', () => []],
]);

/** Whether the element is an SVG basic shape or path. */
export function isShapeElement(element: XmlElement): boolean {
  return SHAPE_READERS.has(element.localName);
}

/**
 * Outline of a shape element in its own coordinates (its `transform` is not
 * applied). Returns `null` for elements that are not shapes and an empty
 * array for shapes that enclose no area.
 */
export function shapeRings(element: XmlElement): Ring[] | null {
  const reader = SHAPE_READERS.get(element.localName);
  return reader === undefined
    ? null
    : reader(element.attributes).filter((ring) => ring.length >= 3);
}

function readRect(attributes: ReadonlyMap<string, string>): Ring[] {
  const x = length(attributes, 'x');
  const y = length(attributes, 'y');
  const right = x + length(attributes, 'width');
  const bottom = y + length(attributes, 'height');
  if (right <= x || bottom <= y) {
    return [];
  }
  const [rx, ry] = cornerRadii(attributes, right - x, bottom - y);
  if (rx === 0 || ry === 0) {
    return [
      [
        { x, y },
        { x: right, y },
        { x: right, y: bottom },
        { x, y: bottom },
      ],
    ];
  }
  const corner = (from: Point, to: Point): Point[] => [
    from,
    ...flattenArc(
      from,
      { rx, ry, rotation: 0, largeArc: false, sweep: true },
      to,
      FLATTEN_TOLERANCE,
    ),
  ];
  return [
    [
      ...corner({ x: right - rx, y }, { x: right, y: y + ry }),
      ...corner({ x: right, y: bottom - ry }, { x: right - rx, y: bottom }),
      ...corner({ x: x + rx, y: bottom }, { x, y: bottom - ry }),
      ...corner({ x, y: y + ry }, { x: x + rx, y }),
    ],
  ];
}

/** A missing corner radius copies the other one; both are capped at half the side. */
function cornerRadii(
  attributes: ReadonlyMap<string, string>,
  width: number,
  height: number,
): [number, number] {
  const rx = attributes.has('rx') ? length(attributes, 'rx') : undefined;
  const ry = attributes.has('ry') ? length(attributes, 'ry') : undefined;
  return [
    Math.min(Math.max(0, rx ?? ry ?? 0), width / 2),
    Math.min(Math.max(0, ry ?? rx ?? 0), height / 2),
  ];
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Ring[] {
  if (rx <= 0 || ry <= 0) {
    return [];
  }
  const left = { x: cx - rx, y: cy };
  const right = { x: cx + rx, y: cy };
  const half = { rx, ry, rotation: 0, largeArc: false, sweep: true };
  return [
    [
      left,
      ...flattenArc(left, half, right, FLATTEN_TOLERANCE),
      ...flattenArc(right, half, left, FLATTEN_TOLERANCE).slice(0, -1),
    ],
  ];
}

function readPoints(attributes: ReadonlyMap<string, string>): Ring[] {
  const numbers = readNumbers(attributes.get('points') ?? '');
  const ring: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    ring.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
  }
  return [ring];
}
