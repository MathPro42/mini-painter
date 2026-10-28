import { effect } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { createPaintState } from './paintState';
import type { PaintState } from './paintState';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10"/><rect id="right" x="5" width="5" height="10"/></svg>';
const OTHER_DRAWING = '<svg viewBox="0 0 4 4"><circle id="dot" cx="2" cy="2" r="2"/></svg>';

const withDrawing = (): PaintState => {
  const state = createPaintState();
  state.loadSvg(DRAWING);
  return state;
};

const colors = (state: PaintState): [string, string | undefined][] =>
  Array.from(state.regionPaints.value, ([id, paint]) => [id, paint.base?.color]);
const baseOf = (state: PaintState, id: string): string | undefined =>
  state.regionPaints.value.get(id)?.base?.color;

describe('loadSvg', () => {
  it('starts with no SVG, no colors and no selection', () => {
    const state = createPaintState();
    expect(state.svg.value).toBeNull();
    expect(state.regionPaints.value.size).toBe(0);
    expect(state.selectedRegionId.value).toBeNull();
  });

  it('parses the markup into regions', () => {
    const state = createPaintState();
    state.loadSvg(DRAWING);
    expect(state.svg.value?.regions.map((region) => region.name)).toEqual(['left', 'right']);
  });

  it('clears colors and selection from the previous drawing in a single update', () => {
    const state = createPaintState();
    state.loadSvg(DRAWING);
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.selectRegion('region-1');
    const seen: [number, string | null][] = [];
    const stop = effect(() => {
      seen.push([state.regionPaints.value.size, state.selectedRegionId.value]);
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
    const state = createPaintState();
    state.loadSvg(DRAWING);
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    const before = state.svg.value;
    expect(() => {
      state.loadSvg('<svg><text>no shapes</text></svg>');
    }).toThrow(RangeError);
    expect(state.svg.value).toBe(before);
    expect(baseOf(state, 'region-0')).toBe('#c8553d');
  });
});

describe('selectRegion', () => {
  it('selects and deselects regions of the current drawing', () => {
    const state = createPaintState();
    state.loadSvg(DRAWING);
    state.selectRegion('region-1');
    expect(state.selectedRegionId.value).toBe('region-1');
    state.selectRegion(null);
    expect(state.selectedRegionId.value).toBeNull();
  });

  it('rejects ids that are not regions, including before any upload', () => {
    const state = createPaintState();
    expect(() => {
      state.selectRegion('region-0');
    }).toThrow(RangeError);
    state.loadSvg(DRAWING);
    expect(() => {
      state.selectRegion('region-9');
    }).toThrow('No region with id "region-9" in the current SVG');
  });
});

describe('setRegionStep', () => {
  it('assigns normalized colors per region without mutating the previous map', () => {
    const state = createPaintState();
    state.loadSvg(DRAWING);
    const before = state.regionPaints.value;
    state.setRegionStep('region-0', 'base', { color: '#ABC' });
    state.setRegionStep('region-1', 'base', { color: '2e8b57' });
    expect(colors(state)).toEqual([
      ['region-0', '#aabbcc'],
      ['region-1', '#2e8b57'],
    ]);
    expect(before.size).toBe(0);
  });

  it('rejects unknown regions and invalid colors without changing anything', () => {
    const state = createPaintState();
    state.loadSvg(DRAWING);
    expect(() => {
      state.setRegionStep('region-5', 'base', { color: '#ffffff' });
    }).toThrow(RangeError);
    expect(() => {
      state.setRegionStep('region-0', 'base', { color: 'brick' });
    }).toThrow(RangeError);
    expect(state.regionPaints.value.size).toBe(0);
  });
});

describe('undo and redo', () => {
  it('start with nothing to undo or redo', () => {
    const state = withDrawing();
    expect(state.canUndo.value).toBe(false);
    expect(state.canRedo.value).toBe(false);
    state.undo();
    state.redo();
    expect(colors(state)).toEqual([]);
  });

  it('step back and forth through painting steps', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.setRegionStep('region-1', 'base', { color: '#2e8b57' });
    state.setRegionStep('region-0', 'base', { color: '#111111' });

    state.undo();
    expect(colors(state)).toEqual([
      ['region-0', '#c8553d'],
      ['region-1', '#2e8b57'],
    ]);
    state.undo();
    state.undo();
    expect(colors(state)).toEqual([]);
    expect(state.canUndo.value).toBe(false);
    expect(state.canRedo.value).toBe(true);

    state.redo();
    expect(colors(state)).toEqual([['region-0', '#c8553d']]);
    state.redo();
    state.redo();
    expect(baseOf(state, 'region-0')).toBe('#111111');
    expect(state.canRedo.value).toBe(false);
  });

  it('forget undone steps once something new is painted', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.undo();
    state.setRegionStep('region-1', 'base', { color: '#2e8b57' });
    expect(state.canRedo.value).toBe(false);
    state.redo();
    expect(colors(state)).toEqual([['region-1', '#2e8b57']]);
  });

  it('do not record painting a region the color it already has', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.setRegionStep('region-0', 'base', { color: '#C8553D' });
    state.undo();
    expect(colors(state)).toEqual([]);
    expect(state.canUndo.value).toBe(false);
  });

  it('notify subscribers once per step, with colors and availability in sync', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    const seen: [number, boolean, boolean][] = [];
    const stop = effect(() => {
      seen.push([state.regionPaints.value.size, state.canUndo.value, state.canRedo.value]);
    });
    state.undo();
    stop();
    expect(seen).toEqual([
      [1, true, false],
      [0, false, true],
    ]);
  });

  it('start over when a new drawing is loaded', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.loadSvg(OTHER_DRAWING);
    expect(state.canUndo.value).toBe(false);
    state.undo();
    expect(colors(state)).toEqual([]);
  });
});

describe('previewRegionStep', () => {
  it('shows a color without recording a step; the next commit records the whole change', () => {
    const state = withDrawing();
    state.previewRegionStep('region-0', 'base', { color: '#aaaaaa' });
    state.previewRegionStep('region-0', 'base', { color: '#bbbbbb' });
    expect(baseOf(state, 'region-0')).toBe('#bbbbbb');
    expect(state.canUndo.value).toBe(false);

    state.setRegionStep('region-0', 'base', { color: '#cccccc' });
    expect(state.canUndo.value).toBe(true);
    state.undo();
    expect(colors(state)).toEqual([]);
  });

  it('is discarded by undo', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.previewRegionStep('region-1', 'base', { color: '#2e8b57' });
    state.undo();
    expect(colors(state)).toEqual([]);
    state.redo();
    expect(colors(state)).toEqual([['region-0', '#c8553d']]);
  });

  it('records nothing when the user settles back on the original color', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.previewRegionStep('region-0', 'base', { color: '#ffffff' });
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.undo();
    expect(colors(state)).toEqual([]);
  });

  it('validates like setRegionStep', () => {
    const state = withDrawing();
    expect(() => {
      state.previewRegionStep('region-9', 'base', { color: '#ffffff' });
    }).toThrow(RangeError);
    expect(() => {
      state.previewRegionStep('region-0', 'base', { color: 'brick' });
    }).toThrow(RangeError);
    expect(colors(state)).toEqual([]);
  });
});
