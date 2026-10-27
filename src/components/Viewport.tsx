import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createRenderer } from '../rendering/createRenderer';
import type { AppState } from '../state/appState';

interface ViewportProps {
  state: AppState;
}

export const WEBGL_ERROR_MESSAGE =
  'Your browser could not start WebGL, so the 3D preview is unavailable.';

/** Hosts the 3D canvas and ties the renderer's lifetime to this component. */
export function Viewport({ state }: ViewportProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    try {
      const handle = createRenderer(canvas, state);
      return () => {
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
  return <canvas ref={canvasRef} class="viewport" role="img" aria-label="3D model preview" />;
}
