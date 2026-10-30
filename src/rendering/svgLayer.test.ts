import { Mesh, Raycaster, Scene } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import type { ParsedSvg } from '../utils/svg/types';
import { createSvgLayer } from './svgLayer';
import type { SvgLayerCallbacks } from './svgLayer';
import { createSvgModel } from './svgModel';
import type { SvgModel } from './svgModel';

vi.mock('./svgModel', () => ({ createSvgModel: vi.fn() }));

const createSvgModelMock = vi.mocked(createSvgModel);

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="a" width="5" height="5"/><rect id="b" x="5" width="5" height="5"/></svg>';

interface FakeModel extends SvgModel {
  readonly svg: ParsedSvg;
  readonly paint: ReturnType<typeof vi.fn<SvgModel['paint']>>;
  readonly flush: ReturnType<typeof vi.fn<SvgModel['flush']>>;
  readonly dispose: ReturnType<typeof vi.fn<SvgModel['dispose']>>;
}

const callbacks = (onDrawingChange = vi.fn(), onChange = vi.fn()): SvgLayerCallbacks => ({
  onDrawingChange,
  onChange,
});

describe('createSvgLayer', () => {
  let models: FakeModel[];

  beforeEach(() => {
    models = [];
    createSvgModelMock.mockReset();
    createSvgModelMock.mockImplementation((svg) => {
      const model: FakeModel = {
        svg,
        plane: {
          mesh: new Mesh(),
          overlay: new Mesh(),
          pickRegion: vi.fn(() => 'region-1'),
          dispose: vi.fn(),
        },
        paint: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn(),
      };
      models.push(model);
      return model;
    });
  });

  it('does nothing until a drawing is loaded', () => {
    const scene = new Scene();
    const onDrawingChange = vi.fn();
    const layer = createSvgLayer(scene, createAppState(), callbacks(onDrawingChange));
    expect(createSvgModelMock).not.toHaveBeenCalled();
    expect(onDrawingChange).not.toHaveBeenCalled();
    expect(layer.pickRegion(new Raycaster())).toBeNull();
    layer.flush();
  });

  it('adds a painted plane for a loaded drawing and reports it', () => {
    const scene = new Scene();
    const state = createAppState();
    const onDrawingChange = vi.fn();
    createSvgLayer(scene, state, callbacks(onDrawingChange));
    state.loadSvg(DRAWING);

    expect(models).toHaveLength(1);
    expect(models[0]?.svg).toBe(state.svg.value);
    expect(scene.children).toContain(models[0]?.plane.mesh);
    expect(models[0]?.paint).toHaveBeenLastCalledWith(new Map(), []);
    expect(onDrawingChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('repaints on paint and selection changes without rebuilding', () => {
    const state = createAppState();
    createSvgLayer(new Scene(), state, callbacks());
    state.loadSvg(DRAWING);
    state.setRegionsStep(['region-0'], 'shade', { color: '#c8553d' });
    state.selectRegion('region-1');
    state.toggleRegion('region-0');

    expect(models).toHaveLength(1);
    expect(models[0]?.paint).toHaveBeenLastCalledWith(
      new Map([['region-0', { shade: { color: '#c8553d' } }]]),
      ['region-0', 'region-1'],
    );
  });

  it('replaces the plane when another drawing is loaded', () => {
    const scene = new Scene();
    const state = createAppState();
    const onDrawingChange = vi.fn();
    createSvgLayer(scene, state, callbacks(onDrawingChange));
    state.loadSvg(DRAWING);
    state.loadSvg(DRAWING);

    const [first, second] = models;
    expect(first?.dispose).toHaveBeenCalledOnce();
    expect(scene.children).not.toContain(first?.plane.mesh);
    expect(scene.children).toContain(second?.plane.mesh);
    expect(onDrawingChange).toHaveBeenCalledTimes(2);
  });

  it('hands the model the change callback, and flushes it on request', () => {
    const state = createAppState();
    const onChange = vi.fn();
    const layer = createSvgLayer(new Scene(), state, callbacks(vi.fn(), onChange));
    state.loadSvg(DRAWING);
    expect(createSvgModelMock).toHaveBeenCalledWith(state.svg.value, onChange);
    layer.flush();
    expect(models[0]?.flush).toHaveBeenCalledOnce();
  });

  it('picks through the current plane', () => {
    const state = createAppState();
    const layer = createSvgLayer(new Scene(), state, callbacks());
    state.loadSvg(DRAWING);
    const raycaster = new Raycaster();
    expect(layer.pickRegion(raycaster)).toBe('region-1');
    expect(models[0]?.plane.pickRegion).toHaveBeenCalledWith(raycaster);
  });

  it('dispose removes the plane and stops following state', () => {
    const scene = new Scene();
    const state = createAppState();
    const layer = createSvgLayer(scene, state, callbacks());
    state.loadSvg(DRAWING);
    layer.dispose();

    expect(models[0]?.dispose).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
    state.loadSvg(DRAWING);
    expect(models).toHaveLength(1);
    expect(layer.pickRegion(new Raycaster())).toBeNull();
  });
});
