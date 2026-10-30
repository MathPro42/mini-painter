import { effect } from '@preact/signals-core';
import type { Raycaster, Scene } from 'three';
import type { AppState } from '../state/appState';
import type { ParsedSvg } from '../utils/svg/types';
import { createSvgModel } from './svgModel';
import type { SvgModel } from './svgModel';

export interface SvgLayer {
  /** Id of the region under the ray, or `null`. */
  pickRegion: (raycaster: Raycaster) => string | null;
  /** Repaints the drawing's textures if paints or the selection changed. Call before rendering. */
  flush: () => void;
  /** Stops syncing and frees the current drawing's resources. */
  dispose: () => void;
}

export interface SvgLayerCallbacks {
  /** Runs each time a drawing appears, is replaced or goes away. */
  readonly onDrawingChange: (hasDrawing: boolean) => void;
  /** Runs when the drawing needs a repaint: the owner should flush and render a frame. */
  readonly onChange: () => void;
}

/**
 * Keeps the scene's SVG plane in sync with state: builds a plane for each
 * uploaded drawing, and marks it for a repaint when paints or the selection
 * change. The repaint itself waits for flush, once per rendered frame.
 */
export function createSvgLayer(
  scene: Scene,
  state: AppState,
  callbacks: SvgLayerCallbacks,
): SvgLayer {
  let model: SvgModel | null = null;
  let shown: ParsedSvg | null = null;

  const stopSync = effect(() => {
    const svg = state.svg.value;
    const paints = state.regionPaints.value;
    const selectedRegionIds = state.selectedRegionIds.value;
    if (svg !== shown) {
      shown = svg;
      removeModel(scene, model);
      model = svg === null ? null : addModel(scene, svg, callbacks.onChange);
      callbacks.onDrawingChange(svg !== null);
    }
    model?.paint(paints, selectedRegionIds);
  });

  return {
    pickRegion: (raycaster) => model?.plane.pickRegion(raycaster) ?? null,
    flush: () => {
      model?.flush();
    },
    dispose: () => {
      stopSync();
      removeModel(scene, model);
      model = null;
    },
  };
}

function addModel(scene: Scene, svg: ParsedSvg, onChange: () => void): SvgModel {
  const model = createSvgModel(svg, onChange);
  scene.add(model.plane.mesh);
  return model;
}

function removeModel(scene: Scene, model: SvgModel | null): void {
  if (model !== null) {
    scene.remove(model.plane.mesh);
    model.dispose();
  }
}
