import { describe, expect, it } from 'vitest';
import { concatBytes, sliceBytes, startsWithBytes, viewOf } from './bytes';

describe('viewOf', () => {
  it('views only the given window of a larger buffer', () => {
    const window = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 3);
    const view = viewOf(window);
    expect(view.byteLength).toBe(2);
    expect(view.getUint16(0, true)).toBe(0x0201);
  });
});

describe('startsWithBytes', () => {
  it('compares a prefix', () => {
    expect(startsWithBytes(new Uint8Array([1, 2, 3]), [1, 2])).toBe(true);
    expect(startsWithBytes(new Uint8Array([1, 3]), [1, 2])).toBe(false);
    expect(startsWithBytes(new Uint8Array([1]), [1, 2])).toBe(false);
  });
});

describe('concatBytes', () => {
  it('joins chunks in order', () => {
    expect(concatBytes([new Uint8Array([1]), new Uint8Array(), new Uint8Array([2, 3])])).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});

describe('sliceBytes', () => {
  it('returns the requested window', () => {
    expect(sliceBytes(new Uint8Array([1, 2, 3]), 1, 2, 'test')).toEqual(new Uint8Array([2, 3]));
  });

  it('throws a RangeError naming the part when the data ends first', () => {
    const bytes = new Uint8Array(4);
    expect(() => sliceBytes(bytes, 3, 2, 'header')).toThrow(
      'The file is truncated or corrupt (header)',
    );
    expect(() => sliceBytes(bytes, -1, 1, 'header')).toThrow(RangeError);
    expect(() => sliceBytes(bytes, 0, -1, 'header')).toThrow(RangeError);
  });
});
