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
 * Frames are drawn on demand (a camera move, a repaint, a resize), and every
 * frame only while the placeholder cube spins, so a drawing nobody touches
 * costs no GPU time. Throws if WebGL is unavailable. This is the only module
 * that touches WebGLRenderer, so it is covered by the browser smoke check,
 * not unit tests.
 */
export function createRenderer(canvas: HTMLCanvasElement, state: AppState): RendererHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const view = createHelloCubeScene(state.cubeColor.value);
  const frames = createFrameScheduler(renderFrame);
  let lastTime: number | undefined;

  // Wheel or pinch zooms and right-drag pans. Drag orbits the cube, but drawings
  // stay facing the viewer: they are flat, so zoom goes toward the pointer instead.
  const controls = new OrbitControls(view.camera, canvas);
  controls.enableDamping = true;
  // Fires on every camera move, damping included, so a glide keeps asking for frames until it stops.
  controls.addEventListener('change', frames.request);
  const svgLayer = createSvgLayer(view.scene, state, {
    onDrawingChange: (hasDrawing) => {
      view.cube.visible = !hasDrawing;
      resetControls(controls, hasDrawing);
      frames.request();
    },
    onChange: frames.request,
  });
  const stopColorSync = effect(() => {
    view.setColor(state.cubeColor.value);
    frames.request();
  });

  function renderFrame(time: number): void {
    const spinning = view.cube.visible;
    view.tick(spinning && lastTime !== undefined ? (time - lastTime) / 1000 : 0);
    // A stopped spin restarts without jumping ahead by the time it was hidden.
    lastTime = spinning ? time : undefined;
    controls.update();
    svgLayer.flush();
    renderer.render(view.scene, view.camera);
    if (spinning) {
      frames.request();
    }
  }

  const stopResizeSync = watchSize(canvas, (width, height) => {
    renderer.setSize(width, height, false);
    view.setAspect(width / height);
    frames.request();
  });

  const raycaster = new Raycaster();
  return {
    pickRegion: (clientX, clientY) => {
      raycaster.setFromCamera(pointerPosition(canvas, clientX, clientY), view.camera);
      return svgLayer.pickRegion(raycaster);
    },
    dispose: () => {
      frames.cancel();
      controls.removeEventListener('change', frames.request);
      stopResizeSync();
      stopColorSync();
      svgLayer.dispose();
      controls.dispose();
      view.dispose();
      renderer.dispose();
    },
  };
}

/** Calls `draw` on the next animation frame when asked; asking again before then changes nothing. */
function createFrameScheduler(draw: (time: number) => void): {
  request: () => void;
  cancel: () => void;
} {
  let frame: number | null = null;
  return {
    request: () => {
      frame ??= requestAnimationFrame((time) => {
        frame = null;
        draw(time);
      });
    },
    cancel: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}

/** Sets the controls up for a drawing (zoom and pan) or the cube (orbit too), from the start view. */
function resetControls(controls: OrbitControls, hasDrawing: boolean): void {
  controls.enableRotate = !hasDrawing;
  controls.zoomToCursor = hasDrawing;
  // An undamped update spends any leftover orbit momentum, so the reset
  // view sticks and a drawing always appears facing the viewer.
  controls.enableDamping = false;
  controls.update();
  controls.reset();
  controls.enableDamping = true;
}

/** Calls `onSize` with the canvas's CSS size now and whenever it changes, skipping empty sizes. */
function watchSize(
  canvas: HTMLCanvasElement,
  onSize: (width: number, height: number) => void,
): () => void {
  const resize = (): void => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (width > 0 && height > 0) {
      onSize(width, height);
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return () => {
    observer.disconnect();
  };
}

/** A point of the canvas in client coordinates, as normalized device coordinates (-1 to 1). */
function pointerPosition(canvas: HTMLCanvasElement, clientX: number, clientY: number): Vector2 {
  const rect = canvas.getBoundingClientRect();
  return new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((clientY - rect.top) / rect.height) * 2,
  );
}
