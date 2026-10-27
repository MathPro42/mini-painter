import { effect } from '@preact/signals-core';
import { WebGLRenderer } from 'three';
import type { AppState } from '../state/appState';
import { createHelloCubeScene } from './helloCubeScene';

export interface RendererHandle {
  /** Stops the render loop and releases every GPU and DOM resource. */
  dispose: () => void;
}

const MAX_PIXEL_RATIO = 2;

/**
 * Starts rendering into `canvas` and keeps the scene in sync with `state`.
 * Throws if WebGL is unavailable. This is the only module that touches
 * WebGLRenderer, so it is covered by the browser smoke check, not unit tests.
 */
export function createRenderer(canvas: HTMLCanvasElement, state: AppState): RendererHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const view = createHelloCubeScene(state.cubeColor.value);
  const stopColorSync = effect(() => {
    view.setColor(state.cubeColor.value);
  });

  const resize = (): void => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height, false);
    view.setAspect(width / height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  let lastTime: number | undefined;
  renderer.setAnimationLoop((time) => {
    const deltaSeconds = lastTime === undefined ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    view.tick(deltaSeconds);
    renderer.render(view.scene, view.camera);
  });

  return {
    dispose: () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      stopColorSync();
      view.dispose();
      renderer.dispose();
    },
  };
}
