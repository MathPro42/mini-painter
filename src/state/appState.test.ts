import { effect } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { createAppState, DEFAULT_CUBE_COLOR } from './appState';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10"/><rect id="right" x="5" width="5" height="10"/></svg>';
const OTHER_DRAWING = '<svg viewBox="0 0 4 4"><circle id="dot" cx="2" cy="2" r="2"/></svg>';

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

describe('loadSvg', () => {
  it('starts with no SVG, no colors and no selection', () => {
    const state = createAppState();
    expect(state.svg.value).toBeNull();
    expect(state.regionColors.value.size).toBe(0);
    expect(state.selectedRegionId.value).toBeNull();
  });

  it('parses the markup into regions', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    expect(state.svg.value?.regions.map((region) => region.name)).toEqual(['left', 'right']);
  });

  it('clears colors and selection from the previous drawing in a single update', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    state.setRegionColor('region-0', '#c8553d');
    state.selectRegion('region-1');
    const seen: [number, string | null][] = [];
    const stop = effect(() => {
      seen.push([state.regionColors.value.size, state.selectedRegionId.value]);
    });
    state.loadSvg(OTHER_DRAWING);
    stop();
    expect(seen).toEqual([
      [1, 'region-1'],
      [0, null],
    ]);
    expect(state.svg.value?.regions.map((region) => region.name)).toEqual(['dot']);
  });

  it('keeps the current drawing when the new one is invalid', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    state.setRegionColor('region-0', '#c8553d');
    const before = state.svg.value;
    expect(() => {
      state.loadSvg('<svg><text>no shapes</text></svg>');
    }).toThrow(RangeError);
    expect(state.svg.value).toBe(before);
    expect(state.regionColors.value.get('region-0')).toBe('#c8553d');
  });
});

describe('selectRegion', () => {
  it('selects and deselects regions of the current drawing', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    state.selectRegion('region-1');
    expect(state.selectedRegionId.value).toBe('region-1');
    state.selectRegion(null);
    expect(state.selectedRegionId.value).toBeNull();
  });

  it('rejects ids that are not regions, including before any upload', () => {
    const state = createAppState();
    expect(() => {
      state.selectRegion('region-0');
    }).toThrow(RangeError);
    state.loadSvg(DRAWING);
    expect(() => {
      state.selectRegion('region-9');
    }).toThrow('No region with id "region-9" in the current SVG');
  });
});

describe('setRegionColor', () => {
  it('assigns normalized colors per region without mutating the previous map', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    const before = state.regionColors.value;
    state.setRegionColor('region-0', '#ABC');
    state.setRegionColor('region-1', '2e8b57');
    expect([...state.regionColors.value]).toEqual([
      ['region-0', '#aabbcc'],
      ['region-1', '#2e8b57'],
    ]);
    expect(before.size).toBe(0);
  });

  it('rejects unknown regions and invalid colors without changing anything', () => {
    const state = createAppState();
    state.loadSvg(DRAWING);
    expect(() => {
      state.setRegionColor('region-5', '#ffffff');
    }).toThrow(RangeError);
    expect(() => {
      state.setRegionColor('region-0', 'brick');
    }).toThrow(RangeError);
    expect(state.regionColors.value.size).toBe(0);
  });
});
