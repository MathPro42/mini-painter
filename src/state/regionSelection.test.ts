import { describe, expect, it } from 'vitest';
import { createPaintState } from './paintState';
import type { PaintState } from './paintState';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="a" width="2" height="10"/><rect id="b" x="2" width="2" height="10"/><rect id="c" x="4" width="2" height="10"/></svg>';

const withDrawing = (): PaintState => {
  const state = createPaintState();
  state.loadSvg(DRAWING);
  return state;
};

describe('selectRegion', () => {
  it('selects one region in place of the others, and clears with null', () => {
    const state = withDrawing();
    state.selectRegion('region-1');
    expect(state.selectedRegionIds.value).toEqual(['region-1']);
    state.toggleRegion('region-2');
    state.selectRegion('region-0');
    expect(state.selectedRegionIds.value).toEqual(['region-0']);
    state.selectRegion(null);
    expect(state.selectedRegionIds.value).toEqual([]);
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

describe('toggleRegion', () => {
  it('adds and removes regions, keeping them in drawing order', () => {
    const state = withDrawing();
    state.toggleRegion('region-2');
    state.toggleRegion('region-0');
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-2']);
    state.toggleRegion('region-2');
    expect(state.selectedRegionIds.value).toEqual(['region-0']);
    state.toggleRegion('region-0');
    expect(state.selectedRegionIds.value).toEqual([]);
  });

  it('rejects unknown ids without changing the selection', () => {
    const state = withDrawing();
    state.toggleRegion('region-1');
    expect(() => {
      state.toggleRegion('region-9');
    }).toThrow(RangeError);
    expect(state.selectedRegionIds.value).toEqual(['region-1']);
  });
});

describe('selectAllRegions', () => {
  it('selects every region, and nothing before any upload', () => {
    const empty = createPaintState();
    empty.selectAllRegions();
    expect(empty.selectedRegionIds.value).toEqual([]);

    const state = withDrawing();
    state.selectAllRegions();
    expect(state.selectedRegionIds.value).toEqual(['region-0', 'region-1', 'region-2']);
  });

  it('is cleared by loading another drawing', () => {
    const state = withDrawing();
    state.selectAllRegions();
    state.loadSvg(DRAWING);
    expect(state.selectedRegionIds.value).toEqual([]);
  });
});
