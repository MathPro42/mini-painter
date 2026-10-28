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

describe('paint steps', () => {
  it('keep each step of a region separately, and clear one step at a time', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d', name: 'brick red' });
    state.setRegionStep('region-0', 'shade', { color: '#5c4033', name: ' umber ' });
    state.setRegionStep('region-0', 'highlight', { color: '#F0E0D0', metallic: true });
    expect(state.regionPaints.value.get('region-0')).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
      shade: { color: '#5c4033', name: 'umber' },
      highlight: { color: '#f0e0d0', metallic: true },
    });

    state.setRegionStep('region-0', 'shade', null);
    expect(Object.keys(state.regionPaints.value.get('region-0') ?? {})).toEqual([
      'base',
      'highlight',
    ]);
  });

  it('drop a region once its last step is cleared', () => {
    const state = withDrawing();
    state.setRegionStep('region-1', 'layer', { color: '#2e8b57' });
    state.setRegionStep('region-1', 'layer', null);
    expect(state.regionPaints.value.has('region-1')).toBe(false);
    state.undo();
    expect(state.regionPaints.value.get('region-1')?.layer?.color).toBe('#2e8b57');
  });

  it('record clearing an empty step as nothing', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'shade', null);
    expect(state.canUndo.value).toBe(false);
  });

  it('undo one step at a time across steps', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'base', { color: '#c8553d' });
    state.setRegionStep('region-0', 'shade', { color: '#5c4033' });
    state.undo();
    expect(state.regionPaints.value.get('region-0')).toEqual({ base: { color: '#c8553d' } });
  });
});

describe('activeStep', () => {
  it('starts on Base, switches, and goes back to Base with a new drawing', () => {
    const state = withDrawing();
    expect(state.activeStep.value).toBe('base');
    state.setActiveStep('highlight');
    expect(state.activeStep.value).toBe('highlight');
    expect(state.canUndo.value).toBe(false);
    state.loadSvg(OTHER_DRAWING);
    expect(state.activeStep.value).toBe('base');
  });

  it('rejects unknown steps', () => {
    const state = withDrawing();
    expect(() => {
      state.setActiveStep('varnish' as 'base');
    }).toThrow('Not a paint step: "varnish"');
  });
});

describe('setRegionPaint', () => {
  it('replaces every step of a region as one undo step', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'highlight', { color: '#ffffff' });
    state.setRegionPaint('region-0', {
      base: { color: '#C8553D', name: 'brick red' },
      shade: { color: '#5c4033', name: 'umber wash', opacity: 0.6 },
    });
    expect(state.regionPaints.value.get('region-0')).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
      shade: { color: '#5c4033', name: 'umber wash', opacity: 0.6 },
    });
    state.undo();
    expect(state.regionPaints.value.get('region-0')).toEqual({ highlight: { color: '#ffffff' } });
  });

  it('clears the region with an empty paint, and throws for bad input', () => {
    const state = withDrawing();
    state.setRegionStep('region-1', 'base', { color: '#2e8b57' });
    state.setRegionPaint('region-1', {});
    expect(state.regionPaints.value.has('region-1')).toBe(false);
    expect(() => {
      state.setRegionPaint('nope', {});
    }).toThrow(RangeError);
    expect(() => {
      state.setRegionPaint('region-1', { base: { color: 'brick' } });
    }).toThrow(RangeError);
  });
});

describe('randomizeRegions', () => {
  const PALETTE = [
    { name: 'brick red', color: '#c8553d' },
    { name: 'sea green', color: '#2e8b57' },
  ];
  const WITH_RECIPE = [
    { name: 'brick red', color: '#c8553d', recipe: { shade: 'umber wash #5c4033' } },
    { name: 'umber wash', color: '#5c4033', opacity: 0.6 },
  ];

  it('adds the recipe tones of each Base while recipes are on, the default', () => {
    const state = withDrawing();
    expect(state.useRecipes.value).toBe(true);
    state.randomizeRegions(WITH_RECIPE, () => 0);
    expect(state.regionPaints.value.get('region-0')).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
      shade: { color: '#5c4033', name: 'umber wash', opacity: 0.6 },
    });
    state.setUseRecipes(false);
    state.randomizeRegions(WITH_RECIPE, () => 0);
    expect(state.regionPaints.value.get('region-0')).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
    });
  });

  it('gives every region a random Base and clears the other steps, as one undo step', () => {
    const state = withDrawing();
    state.setRegionStep('region-0', 'shade', { color: '#5c4033' });
    const picks = [0.9, 0.1];
    state.randomizeRegions(PALETTE, () => picks.shift() ?? 0);
    expect(state.regionPaints.value.get('region-0')).toEqual({
      base: { color: '#2e8b57', name: 'sea green' },
    });
    expect(state.regionPaints.value.get('region-1')).toEqual({
      base: { color: '#c8553d', name: 'brick red' },
    });
    state.undo();
    expect(state.regionPaints.value.get('region-0')).toEqual({ shade: { color: '#5c4033' } });
  });

  it('does nothing without a drawing or colors', () => {
    const state = createPaintState();
    state.randomizeRegions(PALETTE);
    expect(state.canUndo.value).toBe(false);
    state.loadSvg(DRAWING);
    state.randomizeRegions([]);
    expect(state.canUndo.value).toBe(false);
  });

  it('uses Math.random by default', () => {
    const state = withDrawing();
    state.randomizeRegions(PALETTE);
    expect(state.regionPaints.value.size).toBe(2);
  });
});
