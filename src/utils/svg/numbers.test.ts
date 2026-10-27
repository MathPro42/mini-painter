import { describe, expect, it } from 'vitest';
import { readNumbers, readPlainLength } from './numbers';

describe('readNumbers', () => {
  it.each<[string, number[]]>([
    ['0 0 1200 1234', [0, 0, 1200, 1234]],
    ['10,20 30,40', [10, 20, 30, 40]],
    ['10-5.5.25', [10, -5.5, 0.25]],
    ['1e2 -1.5E-1 +3', [100, -0.15, 3]],
    ['', []],
  ])('reads %j', (text, expected) => {
    expect(readNumbers(text)).toEqual(expected);
  });
});

describe('readPlainLength', () => {
  it.each<[string | undefined, number | null]>([
    ['120', 120],
    [' 42.5px ', 42.5],
    ['10mm', null],
    ['50%', null],
    ['wide', null],
    [undefined, null],
  ])('reads %j as %j', (text, expected) => {
    expect(readPlainLength(text)).toBe(expected);
  });
});
