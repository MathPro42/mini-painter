import { describe, expect, it } from 'vitest';
import type { Matrix } from './transform';
import { applyMatrix, IDENTITY, multiply, transformMatrix, transformRings } from './transform';

const expectMatrix = (actual: Matrix | null, expected: Matrix): void => {
  expect(actual).not.toBeNull();
  expected.forEach((value, index) => {
    expect(actual?.[index]).toBeCloseTo(value);
  });
};

describe('transformMatrix', () => {
  it.each<[string, Matrix]>([
    ['translate(10 20)', [1, 0, 0, 1, 10, 20]],
    ['translate(5)', [1, 0, 0, 1, 5, 0]],
    ['translate(0 0)', IDENTITY],
    ['scale(2)', [2, 0, 0, 2, 0, 0]],
    ['scale(2, 3)', [2, 0, 0, 3, 0, 0]],
    ['rotate(90)', [0, 1, -1, 0, 0, 0]],
    ['rotate(90 10 10)', [0, 1, -1, 0, 20, 0]],
    ['skewX(45)', [1, 0, 1, 1, 0, 0]],
    ['skewY(45)', [1, 1, 0, 1, 0, 0]],
    ['matrix(1,2,3,4,5,6)', [1, 2, 3, 4, 5, 6]],
    ['', IDENTITY],
  ])('parses %j', (value, expected) => {
    expectMatrix(transformMatrix(value), expected);
  });

  it('composes a list left to right, like nested groups', () => {
    const matrix = transformMatrix('translate(10, 0) scale(2)');
    expect(matrix && applyMatrix(matrix, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 });
  });

  it.each([
    'translate()',
    'scale(1 2 3)',
    'rotate(1 2)',
    'matrix(1 2 3)',
    'skewX(1 2)',
    'spin(3)',
    'translate(1) junk',
  ])('returns null for malformed %j', (value) => {
    expect(transformMatrix(value)).toBeNull();
  });
});

describe('multiply', () => {
  it('applies the right-hand matrix first', () => {
    const translate: Matrix = [1, 0, 0, 1, 5, 0];
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    expect(applyMatrix(multiply(translate, scale), { x: 1, y: 0 })).toEqual({ x: 7, y: 0 });
    expect(applyMatrix(multiply(scale, translate), { x: 1, y: 0 })).toEqual({ x: 12, y: 0 });
  });
});

describe('transformRings', () => {
  const rings = [[{ x: 1, y: 2 }]];

  it('maps every point', () => {
    expect(transformRings([1, 0, 0, 1, 10, 0], rings)).toEqual([[{ x: 11, y: 2 }]]);
  });

  it('copies rings untouched for the identity matrix', () => {
    expect(transformRings(IDENTITY, rings)).toEqual(rings);
  });
});
