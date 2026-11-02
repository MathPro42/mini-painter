/** A 2D canvas of the given size. Throws when the browser has no 2D canvas. */
export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Canvas 2D is unavailable');
  }
  return { canvas, ctx };
}

/** Releases the canvas backing stores now rather than at garbage collection. */
export function releaseCanvases(...canvases: HTMLCanvasElement[]): void {
  for (const canvas of canvases) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Whether pixels can be read back: drawing some images taints a canvas for good. */
export function isReadable(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}
