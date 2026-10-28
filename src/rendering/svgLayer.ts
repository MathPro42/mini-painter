import { effect } from '@preact/signals-core';
import type { Raycaster, Scene } from 'three';
import type { AppState } from '../state/appState';
import type { ParsedSvg } from '../utils/svg/types';
import { createSvgModel } from './svgModel';
import type { SvgModel } from './svgModel';

export interface SvgLayer {
  /** Id of the region under the ray, or `null`. */
  pickRegion: (raycaster: Raycaster) => string | null;
  /** Stops syncing and frees the current drawing's resources. */
  dispose: () => void;
}

/**
 * Keeps the scene's SVG plane in sync with state: builds a plane for each
 * uploaded drawing, and repaints it when paints or the selection change.
 * `onDrawingChange` runs each time a drawing appears, is replaced or goes away.
 */
export function createSvgLayer(
  scene: Scene,
  state: AppState,
  onDrawingChange: (hasDrawing: boolean) => void,
): SvgLayer {
  let model: SvgModel | null = null;
  let shown: ParsedSvg | null = null;

  const stopSync = effect(() => {
    const svg = state.svg.value;
    const paints = state.regionPaints.value;
    const selectedRegionId = state.selectedRegionId.value;
    if (svg !== shown) {
      shown = svg;
      removeModel(scene, model);
      model = svg === null ? null : addModel(scene, svg);
      onDrawingChange(svg !== null);
    }
    model?.paint(paints, selectedRegionId);
  });

  return {
    pickRegion: (raycaster) => model?.plane.pickRegion(raycaster) ?? null,
    dispose: () => {
      stopSync();
      removeModel(scene, model);
      model = null;
    },
  };
}

function addModel(scene: Scene, svg: ParsedSvg): SvgModel {
  const model = createSvgModel(svg);
  scene.add(model.plane.mesh);
  return model;
}

function removeModel(scene: Scene, model: SvgModel | null): void {
  if (model !== null) {
    scene.remove(model.plane.mesh);
    model.dispose();
  }
}
