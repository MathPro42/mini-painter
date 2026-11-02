import type { RegionPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg } from '../utils/svg/types';
import { createCanvas, isReadable, releaseCanvases } from './canvases';
import { paintSvg } from './paintSvg';
import { textureSize } from './svgPlane';
import { loadImages, NO_IMAGES } from './svgImages';
import type { Images } from './svgImages';

/**
 * Paints the drawing as the 3D view shows it, without selection outlines,
 * and encodes it as PNG bytes. If the browser blocks reading back the
 * artwork, the picture shows the painted regions only, as the view does.
 *
 * Browser-only (canvas, Image, Blob URLs), like svgModel: check changes in a
 * browser. The painting itself (paintSvg) is tested.
 */
export async function renderDrawingPng(
  svg: ParsedSvg,
  paints: ReadonlyMap<string, RegionPaint>,
): Promise<Uint8Array> {
  const { width, height } = textureSize(svg.viewBox);
  const images = loadImages(svg, width, height);
  try {
    const loaded = await images.loaded;
    return (
      (await paintToPng(svg, paints, width, height, loaded)) ??
      (await paintToPng(svg, paints, width, height, NO_IMAGES)) ??
      failed()
    );
  } finally {
    images.release();
  }
}

/** The PNG bytes, or `null` when the images tainted the canvas. */
async function paintToPng(
  svg: ParsedSvg,
  paints: ReadonlyMap<string, RegionPaint>,
  width: number,
  height: number,
  images: Images,
): Promise<Uint8Array | null> {
  const main = createCanvas(width, height);
  const scratch = createCanvas(width, height);
  try {
    paintSvg(main.ctx, scratch.ctx, width, height, { svg, paints, ...images });
    if (!isReadable(main.ctx)) {
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      main.canvas.toBlob(resolve, 'image/png');
    });
    return blob === null ? failed() : new Uint8Array(await blob.arrayBuffer());
  } finally {
    releaseCanvases(main.canvas, scratch.canvas);
  }
}

function failed(): never {
  throw new Error('The browser could not make a PNG of the drawing');
}
