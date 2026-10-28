import { effect } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { createAppState, DEFAULT_CUBE_COLOR } from './appState';

describe('createAppState', () => {
  it('starts with the default cube color', () => {
    expect(createAppState().cubeColor.value).toBe(DEFAULT_CUBE_COLOR);
  });

  it('normalizes a custom initial color', () => {
    expect(createAppState({ cubeColor: '#ABC' }).cubeColor.value).toBe('#aabbcc');
  });

  it('rejects an invalid initial color', () => {
    expect(() => createAppState({ cubeColor: 'purple' })).toThrow(RangeError);
  });

  it('returns independent stores', () => {
    const first = createAppState();
    const second = createAppState();
    first.setCubeColor('#000000');
    first.addPaletteColors([{ name: 'ink', color: '#111111' }]);
    expect(second.cubeColor.value).toBe(DEFAULT_CUBE_COLOR);
    expect(second.palettes.value).toEqual([]);
  });

  it('combines the painting and palette stores', () => {
    const state = createAppState();
    expect(state.svg.value).toBeNull();
    expect(state.canUndo.value).toBe(false);
    expect(state.palettes.value).toEqual([]);
    expect(state.palettesSaved.value).toBe(false);
  });

  it('keeps palettes in the given storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    createAppState({ storage }).addPalette('base coats', []);
    expect(createAppState({ storage }).palettes.value.map((palette) => palette.name)).toEqual([
      'base coats',
    ]);
  });
});

describe('setCubeColor', () => {
  it('updates and normalizes the color', () => {
    const state = createAppState();
    state.setCubeColor('0F0');
    expect(state.cubeColor.value).toBe('#00ff00');
  });

  it('keeps the previous color when given an invalid one', () => {
    const state = createAppState({ cubeColor: '#123456' });
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
