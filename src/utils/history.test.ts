import { describe, expect, it } from 'vitest';
import { createHistory, pushHistory, redoHistory, undoHistory } from './history';

describe('createHistory', () => {
  it('starts with nothing to undo or redo', () => {
    expect(createHistory('a')).toEqual({ past: [], present: 'a', future: [] });
  });
});

describe('pushHistory', () => {
  it('makes the old present undoable', () => {
    const history = pushHistory(pushHistory(createHistory('a'), 'b'), 'c');
    expect(history).toEqual({ past: ['a', 'b'], present: 'c', future: [] });
  });

  it('drops the redo branch', () => {
    const undone = undoHistory(pushHistory(createHistory('a'), 'b'));
    expect(pushHistory(undone, 'c')).toEqual({ past: ['a'], present: 'c', future: [] });
  });

  it('keeps only the newest steps past the limit', () => {
    let history = createHistory(0);
    for (let step = 1; step <= 5; step += 1) {
      history = pushHistory(history, step, 3);
    }
    expect(history.past).toEqual([2, 3, 4]);
    expect(history.present).toBe(5);
  });

  it('does not mutate the previous history', () => {
    const before = createHistory('a');
    pushHistory(before, 'b');
    expect(before).toEqual({ past: [], present: 'a', future: [] });
  });
});

describe('undoHistory and redoHistory', () => {
  it('step back and forth through the timeline', () => {
    const pushed = pushHistory(pushHistory(createHistory('a'), 'b'), 'c');
    const once = undoHistory(pushed);
    expect(once).toEqual({ past: ['a'], present: 'b', future: ['c'] });
    const twice = undoHistory(once);
    expect(twice).toEqual({ past: [], present: 'a', future: ['b', 'c'] });
    expect(redoHistory(twice)).toEqual(once);
    expect(redoHistory(once)).toEqual(pushed);
  });

  it('return the same history when there is nothing to do', () => {
    const history = createHistory('a');
    expect(undoHistory(history)).toBe(history);
    expect(redoHistory(history)).toBe(history);
  });
});
