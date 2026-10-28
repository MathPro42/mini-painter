import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('name,color\nbrick red,#c8553d\n')).toEqual([
      ['name', 'color'],
      ['brick red', '#c8553d'],
    ]);
  });

  it('accepts CRLF and CR line endings and a missing final newline', () => {
    expect(parseCsv('a,b\r\nc,d\re,f')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('unquotes cells, keeping delimiters, line breaks and doubled quotes inside them', () => {
    expect(parseCsv('"brick, red","say ""hi""\nthere"\nx,y')).toEqual([
      ['brick, red', 'say "hi"\nthere'],
      ['x', 'y'],
    ]);
  });

  it('reads malformed quoting leniently', () => {
    expect(parseCsv('"open"ended,"never closed')).toEqual([['openended', 'never closed']]);
  });

  it('keeps empty cells, including a trailing one at the end of the text', () => {
    expect(parseCsv(',a,,\n,')).toEqual([
      ['', 'a', '', ''],
      ['', ''],
    ]);
  });

  it('keeps blank lines as single empty cells', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('detects semicolons and tabs from the first non-blank line', () => {
    expect(parseCsv('\nname;color;note\nsea green;#2e8b57;a, b')).toEqual([
      [''],
      ['name', 'color', 'note'],
      ['sea green', '#2e8b57', 'a, b'],
    ]);
    expect(parseCsv('name\tcolor\nink\t#1b1b1e')).toEqual([
      ['name', 'color'],
      ['ink', '#1b1b1e'],
    ]);
  });

  it('ignores the commas inside rgb() when detecting the delimiter', () => {
    expect(parseCsv('mustard;rgb(224, 177, 60)')).toEqual([['mustard', 'rgb(224, 177, 60)']]);
  });

  it('returns no rows for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
