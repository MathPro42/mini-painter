import { effect } from '@preact/signals-core';
import { Raycaster, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AppState } from '../state/appState';
import { createHelloCubeScene } from './helloCubeScene';
import { createSvgLayer } from './svgLayer';

export interface RendererHandle {
  /**
   * Id of the SVG region drawn under a point of the canvas, given in client
   * (viewport) coordinates as pointer events report them, or `null`.
   */
  pickRegion: (clientX: number, clientY: number) => string | null;
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

  // Wheel or pinch zooms and right-drag pans. Drag orbits the cube, but drawings
  // stay facing the viewer: they are flat, so zoom goes toward the pointer instead.
  const controls = new OrbitControls(view.camera, canvas);
  controls.enableDamping = true;
  const svgLayer = createSvgLayer(view.scene, state, (hasDrawing) => {
    view.cube.visible = !hasDrawing;
    controls.enableRotate = !hasDrawing;
    controls.zoomToCursor = hasDrawing;
    // An undamped update spends any leftover orbit momentum, so the reset
    // view sticks and a drawing always appears facing the viewer.
    controls.enableDamping = false;
    controls.update();
    controls.reset();
    controls.enableDamping = true;
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
    controls.update();
    renderer.render(view.scene, view.camera);
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  return {
    pickRegion: (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, view.camera);
      return svgLayer.pickRegion(raycaster);
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      stopColorSync();
      svgLayer.dispose();
      controls.dispose();
      view.dispose();
      renderer.dispose();
    },
  };
}
