import { describe, expect, it } from 'vitest';
import { createHistory, pushHistory } from '../history';
import type { History } from '../history';
import type { RegionPaint } from '../paint/regionPaint';
import { encodeAutosavedHistory, parseAutosavedHistory } from './autosaveFormat';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

const red: RegionPaint = { base: { color: '#c8553d', name: 'Brick red' } };
const grey: RegionPaint = { base: { color: '#808080' }, shade: { color: '#202020', opacity: 0.6 } };

const sample = (): History<RegionPaints> => {
  let history = createHistory<RegionPaints>(new Map());
  history = pushHistory(history, new Map([['region-0', red]]));
  history = pushHistory(
    history,
    new Map([
      ['region-0', red],
      ['region-1', grey],
    ]),
  );
  return {
    past: history.past.slice(0, 1),
    present: history.past[1] ?? new Map(),
    future: [history.present],
  };
};

const json = (data: Record<string, unknown>): string =>
  JSON.stringify({
    format: 'mini-painter-autosave',
    version: 1,
    past: [],
    present: {},
    future: [],
    paints: [],
    ...data,
  });

describe('encodeAutosavedHistory and parseAutosavedHistory', () => {
  it('round-trips past, present and future', () => {
    const history = sample();
    expect(parseAutosavedHistory(encodeAutosavedHistory(history))).toEqual(history);
  });

  it('writes each shared region paint once', () => {
    const text = encodeAutosavedHistory(sample());
    expect(JSON.parse(text)).toMatchObject({ paints: [red, grey] });
  });

  it('reads an empty history', () => {
    const history = createHistory<RegionPaints>(new Map());
    expect(parseAutosavedHistory(encodeAutosavedHistory(history))).toEqual(history);
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['another format', JSON.stringify({ format: 'other', version: 1 })],
    ['another version', json({ version: 2 })],
    ['a past that is not a list', json({ past: {} })],
    ['a snapshot that is not an object', json({ present: [] })],
    ['an index past the table', json({ present: { a: 0 } })],
    ['an index that is not a number', json({ paints: [red], present: { a: '0' } })],
  ])('refuses %s', (_, text) => {
    expect(() => parseAutosavedHistory(text)).toThrow(
      new RangeError('The autosaved work is damaged'),
    );
  });

  it('refuses invalid paints', () => {
    expect(() => parseAutosavedHistory(json({ paints: [{ base: { color: 'x' } }] }))).toThrow(
      RangeError,
    );
  });
});
