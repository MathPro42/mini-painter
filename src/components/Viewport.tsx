import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createRenderer } from '../rendering/createRenderer';
import type { RendererHandle } from '../rendering/createRenderer';
import type { AppState } from '../state/appState';

interface ViewportProps {
  state: AppState;
}

export const WEBGL_ERROR_MESSAGE =
  'Your browser could not start WebGL, so the 3D preview is unavailable.';

/** Pointer travel, in CSS pixels, past which a press is an orbit drag rather than a click. */
export const CLICK_TOLERANCE_PX = 5;

/**
 * Hosts the 3D canvas and ties the renderer's lifetime to this component.
 * A click (not a drag, which moves the camera) selects the region under it.
 */
export function Viewport({ state }: ViewportProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<RendererHandle | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    try {
      const handle = createRenderer(canvas, state);
      handleRef.current = handle;
      return () => {
        handleRef.current = null;
        handle.dispose();
      };
    } catch (error) {
      console.error(error);
      setFailed(true);
      return undefined;
    }
  }, [state]);

  if (failed) {
    return (
      <p class="viewport viewport--error" role="alert">
        {WEBGL_ERROR_MESSAGE}
      </p>
    );
  }

  const onClick = (event: MouseEvent): void => {
    const handle = handleRef.current;
    const press = pressRef.current;
    const dragged =
      press !== null &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE_PX;
    if (handle !== null && !dragged) {
      state.selectRegion(handle.pickRegion(event.clientX, event.clientY));
    }
  };

  return (
    <canvas
      ref={canvasRef}
      class="viewport"
      role="img"
      aria-label="3D model preview"
      onPointerDown={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={onClick}
    />
  );
}
