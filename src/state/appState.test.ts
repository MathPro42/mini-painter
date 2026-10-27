import { effect } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { createAppState, DEFAULT_CUBE_COLOR } from './appState';

describe('createAppState', () => {
  it('starts with the default cube color', () => {
    expect(createAppState().cubeColor.value).toBe(DEFAULT_CUBE_COLOR);
  });

  it('normalizes a custom initial color', () => {
    expect(createAppState('#ABC').cubeColor.value).toBe('#aabbcc');
  });

  it('rejects an invalid initial color', () => {
    expect(() => createAppState('purple')).toThrow(RangeError);
  });

  it('returns independent stores', () => {
    const first = createAppState();
    const second = createAppState();
    first.setCubeColor('#000000');
    expect(second.cubeColor.value).toBe(DEFAULT_CUBE_COLOR);
  });
});

describe('setCubeColor', () => {
  it('updates and normalizes the color', () => {
    const state = createAppState();
    state.setCubeColor('0F0');
    expect(state.cubeColor.value).toBe('#00ff00');
  });

  it('keeps the previous color when given an invalid one', () => {
    const state = createAppState('#123456');
    expect(() => {
      state.setCubeColor('not-a-color');
    }).toThrow(RangeError);
    expect(state.cubeColor.value).toBe('#123456');
  });

  it('notifies subscribers', () => {
    const state = createAppState();
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(state.cubeColor.value);
    });
    state.setCubeColor('#ffffff');
    stop();
    expect(seen).toEqual([DEFAULT_CUBE_COLOR, '#ffffff']);
  });
});
