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

describe('loadWork', () => {
  const work = {
    svgSource: DRAWING,
    paints: new Map([['region-1', { base: { color: '#C8553D' } }]]),
  };

  it('keeps the source of the loaded drawing', () => {
    const state = withDrawing();
    expect(state.svgSource.value).toBe(DRAWING);
  });

  it('restores the drawing and its paints with nothing to undo', () => {
    const state = createPaintState();
    state.loadSvg(OTHER_DRAWING);
    state.setRegionsStep(['region-0'], 'base', { color: '#202020' });
    state.selectRegion('region-0');
    state.setActiveStep('shade');

    state.loadWork(work);

    expect(state.svgSource.value).toBe(DRAWING);
    expect(state.svg.value?.regions.map((region) => region.name)).toEqual(['left', 'right']);
    expect(colors(state)).toEqual([['region-1', '#c8553d']]);
    expect(state.canUndo.value).toBe(false);
    expect(state.selectedRegionIds.value).toEqual([]);
    expect(state.activeStep.value).toBe('base');
  });

  it('undoes back to the restored paints, not to an empty drawing', () => {
    const state = createPaintState();
    state.loadWork(work);
    state.setRegionsStep(['region-0'], 'base', { color: '#202020' });
    state.undo();
    expect(colors(state)).toEqual([['region-1', '#c8553d']]);
    expect(state.canUndo.value).toBe(false);
  });

  it('changes nothing when a paint names an unknown region', () => {
    const state = withDrawing();
    const bad = { svgSource: OTHER_DRAWING, paints: new Map([['region-9', {}]]) };
    expect(() => {
      state.loadWork(bad);
    }).toThrow(new RangeError('No region with id "region-9" in the current SVG'));
    expect(state.svgSource.value).toBe(DRAWING);
  });

  it('changes nothing when a paint is invalid', () => {
    const state = withDrawing();
    const bad = { svgSource: DRAWING, paints: new Map([['region-0', { base: { color: 'x' } }]]) };
    expect(() => {
      state.loadWork(bad);
    }).toThrow(RangeError);
    expect(state.regionPaints.value.size).toBe(0);
  });
});

describe('loadWork with undo steps', () => {
  const red = { base: { color: '#c8553d' } };
  const grey = { base: { color: '#808080' } };

  it('restores the steps around the saved paints', () => {
    const state = createPaintState();
    state.loadWork(
      { svgSource: DRAWING, paints: new Map([['region-0', red]]) },
      {
        past: [new Map()],
        future: [
          new Map([
            ['region-0', red],
            ['region-1', grey],
          ]),
        ],
      },
    );
    expect(colors(state)).toEqual([['region-0', '#c8553d']]);
    state.redo();
    expect(baseOf(state, 'region-1')).toBe('#808080');
    state.undo();
    state.undo();
    expect(state.regionPaints.value.size).toBe(0);
    expect(state.canUndo.value).toBe(false);
  });

  it('keeps a region paint shared by several steps shared', () => {
    const state = createPaintState();
    const paints = new Map([['region-0', red]]);
    state.loadWork({ svgSource: DRAWING, paints }, { past: [paints], future: [] });
    const { past, present } = state.paintHistory.value;
    expect(past[0]?.get('region-0')).toBe(present.get('region-0'));
  });

  it('changes nothing when a step names an unknown region', () => {
    const state = withDrawing();
    expect(() => {
      state.loadWork(
        { svgSource: OTHER_DRAWING, paints: new Map() },
        { past: [new Map([['region-5', red]])], future: [] },
      );
    }).toThrow(RangeError);
    expect(state.svgSource.value).toBe(DRAWING);
  });
});

describe('closeDrawing', () => {
  it('goes back to the empty view with nothing to undo', () => {
    const state = withDrawing();
    state.setRegionsStep(['region-0'], 'base', { color: '#c8553d' });
    state.selectRegion('region-0');
    state.setActiveStep('shade');

    state.closeDrawing();

    expect(state.svg.value).toBeNull();
    expect(state.svgSource.value).toBeNull();
    expect(state.regionPaints.value.size).toBe(0);
    expect(state.canUndo.value).toBe(false);
    expect(state.selectedRegionIds.value).toEqual([]);
    expect(state.activeStep.value).toBe('base');
  });
});
