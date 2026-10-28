import { describe, expect, it } from 'vitest';
import { createBiffReader, readRichString, readSharedStringTable } from './biffStrings';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const ascii = (text: string): number[] =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
const utf16 = (text: string): number[] => ascii(text).flatMap((code) => [code & 0xff, code >> 8]);
const u16 = (value: number): number[] => [value & 0xff, value >> 8];
const u32 = (value: number): number[] => [...u16(value & 0xffff), ...u16(value >>> 16)];

describe('createBiffReader', () => {
  it('reads little-endian integers straight across record boundaries', () => {
    const reader = createBiffReader([bytes(0x01, 0x02), bytes(0x03), bytes(), bytes(0x04, 0x05)]);
    expect(reader.u16()).toBe(0x0201);
    expect(reader.u16()).toBe(0x0403);
    reader.skip(0);
    expect(reader.u8()).toBe(0x05);
    expect(() => reader.u8()).toThrow('truncated or corrupt (string table)');
  });

  it('reads 32-bit values as unsigned', () => {
    expect(createBiffReader([bytes(0xff, 0xff, 0xff, 0xff)]).u32()).toBe(0xffffffff);
  });

  it('skips across boundaries', () => {
    const reader = createBiffReader([bytes(1, 2, 3), bytes(4, 5)]);
    reader.skip(4);
    expect(reader.u8()).toBe(5);
    expect(() => {
      reader.skip(1);
    }).toThrow(RangeError);
  });

  it('switches character width at each continuation’s option byte', () => {
    const reader = createBiffReader([
      bytes(...ascii('brick')),
      bytes(0x01, ...utf16(' Ωred')),
      bytes(0x00, ...ascii('!')),
    ]);
    expect(reader.chars(11, false)).toBe('brick Ωred!');
  });

  it('decodes compressed characters as Latin-1, not a Windows code page', () => {
    expect(createBiffReader([bytes(0x80, 0xfc)]).chars(2, false)).toBe('\u0080ü');
  });

  it('rejects character data that ends early or splits a character', () => {
    expect(() => createBiffReader([bytes(...ascii('ab'))]).chars(3, false)).toThrow(RangeError);
    expect(() => createBiffReader([bytes(0x41)]).chars(1, true)).toThrow(RangeError);
  });
});

describe('readRichString', () => {
  it('reads plain compressed and wide strings', () => {
    expect(readRichString(createBiffReader([bytes(...u16(3), 0x00, ...ascii('ink'))]))).toBe('ink');
    expect(readRichString(createBiffReader([bytes(...u16(2), 0x01, ...utf16('Ωa'))]))).toBe('Ωa');
  });

  it('skips formatting runs and phonetic data after the text', () => {
    const reader = createBiffReader([
      bytes(...u16(4), 0x0c, ...u16(1), ...u32(2), ...ascii('teal'), 0, 0, 1, 0, 9, 9),
      bytes(...u16(1), 0x00, ...ascii('x')),
    ]);
    expect(readRichString(reader)).toBe('teal');
    expect(readRichString(reader)).toBe('x');
  });
});

describe('readSharedStringTable', () => {
  it('reads every unique string, including one split across a CONTINUE record', () => {
    const table = readSharedStringTable([
      bytes(...u32(5), ...u32(2), ...u16(9), 0x00, ...ascii('sea')),
      bytes(0x00, ...ascii(' green'), ...u16(4), 0x00, ...ascii('rust')),
    ]);
    expect(table).toEqual(['sea green', 'rust']);
  });

  it('throws when the table promises more strings than it holds', () => {
    expect(() => readSharedStringTable([bytes(...u32(1), ...u32(2), ...u16(1), 0, 0x61)])).toThrow(
      'truncated or corrupt (string table)',
    );
  });
});
