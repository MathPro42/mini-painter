import { describe, expect, it } from 'vitest';
import { normalizeUpdateMode, parseUpdateMode } from './updateMode';

describe('normalizeUpdateMode', () => {
  it('keeps the known modes', () => {
    expect(normalizeUpdateMode('auto')).toBe('auto');
    expect(normalizeUpdateMode('manual')).toBe('manual');
  });

  it.each([['Auto'], [''], [null], [1], [undefined]])('is null for %j', (value) => {
    expect(normalizeUpdateMode(value)).toBeNull();
  });
});

describe('parseUpdateMode', () => {
  it('returns a known mode', () => {
    expect(parseUpdateMode('manual')).toBe('manual');
  });

  it('throws a RangeError for anything else', () => {
    expect(() => parseUpdateMode('never')).toThrow(RangeError);
  });
});
