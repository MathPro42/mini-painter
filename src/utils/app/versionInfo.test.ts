import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseVersionInfo } from './versionInfo';

describe('parseVersionInfo', () => {
  it('reads the version', () => {
    expect(parseVersionInfo('{"version":"b67526e02b4f"}')).toEqual({ version: 'b67526e02b4f' });
  });

  it('ignores other fields', () => {
    expect(parseVersionInfo('{"version":"1.2.0","extra":true}')).toEqual({ version: '1.2.0' });
  });

  it.each([
    ['not JSON', '<html>'],
    ['an array', '["abc"]'],
    ['no version', '{}'],
    ['a number', '{"version":3}'],
    ['an empty version', '{"version":""}'],
    ['markup in the version', '{"version":"<b>x</b>"}'],
    ['a long version', JSON.stringify({ version: 'a'.repeat(65) })],
  ])('throws a RangeError for %s', (_label, text) => {
    expect(() => parseVersionInfo(text)).toThrow(RangeError);
  });
});

describe('isNewerVersion', () => {
  it('is false for the running version', () => {
    expect(isNewerVersion('abc', { version: 'abc' })).toBe(false);
  });

  it('is true for any other version', () => {
    expect(isNewerVersion('abc', { version: 'def' })).toBe(true);
  });

  it('is false for a dev build', () => {
    expect(isNewerVersion('dev', { version: 'def' })).toBe(false);
  });
});
