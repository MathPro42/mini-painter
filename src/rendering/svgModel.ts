import { CanvasTexture, SRGBColorSpace } from 'three';
import type { RegionPaint } from '../utils/paint/regionPaint';
import { artworkMarkup } from '../utils/svg/layers';
import type { ArtworkFragment, ParsedSvg } from '../utils/svg/types';
import { paintSvg } from './paintSvg';
import type { SvgPaintInput } from './paintSvg';
import { NO_TONE_MASK_IMAGES } from './paintTones';
import { createSvgPlane, textureSize } from './svgPlane';
import type { SvgPlane } from './svgPlane';

export interface SvgModel {
  readonly plane: SvgPlane;
  /** Repaints the texture with these paints and this selection. */
  paint: (paints: ReadonlyMap<string, RegionPaint>, selectedRegionId: string | null) => void;
  /** Frees the texture, canvases and plane. Images that finish loading later are ignored. */
  dispose: () => void;
}

/** Everything the browser renders from the drawing's own markup. */
type Images = Pick<SvgPaintInput, 'below' | 'above' | 'toneMasks' | 'metal'>;

const NO_IMAGES: Images = {
  below: null,
  above: null,
  toneMasks: NO_TONE_MASK_IMAGES,
  metal: null,
};

/**
 * Builds the textured plane for a drawing. The texture is a 2D canvas that
 * paintSvg redraws on every change; the drawing's artwork, tone masks and
 * metal picture are rendered by the browser from SVG markup into images.
 *
 * Browser-only (canvas, Image, Blob URLs), like createRenderer: check changes
 * in a browser. The logic it wires together (paintSvg, svgPlane) is tested.
 */
export function createSvgModel(svg: ParsedSvg): SvgModel {
  const { width, height } = textureSize(svg.viewBox);
  const painter = createPainter(svg, width, height);
  const plane = createSvgPlane(svg, painter.texture);
  let disposed = false;

  const images = loadImages(svg, width, height);
  void images.loaded.then((loaded) => {
    if (!disposed) {
      painter.showImages(loaded);
    }
  });

  return {
    plane,
    paint: (paints, selectedRegionId) => {
      painter.update({ paints, selectedRegionId });
    },
    dispose: () => {
      disposed = true;
      images.release();
      plane.dispose();
      painter.dispose();
    },
  };
}

interface Painter {
  readonly texture: CanvasTexture;
  /** Changes what is painted and repaints the texture. */
  update: (changes: Partial<SvgPaintInput>) => void;
  /**
   * Paints with the images, or without any if drawing them tainted the
   * canvas: WebGL refuses a tainted canvas as a texture.
   */
  showImages: (images: Images) => void;
  dispose: () => void;
}

function createPainter(svg: ParsedSvg, width: number, height: number): Painter {
  const main = createCanvas(width, height);
  const scratch = createCanvas(width, height);
  const texture = new CanvasTexture(main.canvas);
  texture.colorSpace = SRGBColorSpace;
  let input: SvgPaintInput = { svg, paints: new Map(), selectedRegionId: null, ...NO_IMAGES };
  const update = (changes: Partial<SvgPaintInput>): void => {
    input = { ...input, ...changes };
    paintSvg(main.ctx, scratch.ctx, width, height, input);
    texture.needsUpdate = true;
  };
  update({});
  return {
    texture,
    update,
    showImages: (images) => {
      update(images);
      if (!isReadable(main.ctx)) {
        console.warn(
          'The browser blocked this SVG’s artwork from the 3D view; showing regions only.',
        );
        update(NO_IMAGES);
      }
    },
    dispose: () => {
      texture.dispose();
      // Releases the canvas backing stores now rather than at garbage collection.
      for (const { canvas } of [main, scratch]) {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
  };
}

function createCanvas(
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

interface ImageLoad {
  /** Resolves once every image has loaded; each is `null` if absent or broken. */
  readonly loaded: Promise<Images>;
  /** Revokes the Blob URLs the images were loaded from. */
  release: () => void;
}

function loadImages(svg: ParsedSvg, width: number, height: number): ImageLoad {
  const urls: string[] = [];
  const load = (fragment: ArtworkFragment | null): Promise<HTMLImageElement | null> => {
    if (fragment === null) {
      return Promise.resolve(null);
    }
    const markup = artworkMarkup(fragment, svg.viewBox, width, height);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    urls.push(url);
    return loadImage(url);
  };
  const { artwork, toneMasks } = svg;
  return {
    loaded: Promise.all([
      load(artwork.below),
      load(artwork.above),
      load(toneMasks.layer),
      load(toneMasks.shade),
      load(toneMasks.highlight),
      load(svg.metal),
    ]).then(([below, above, layer, shade, highlight, metal]) => ({
      below,
      above,
      toneMasks: { layer, shade, highlight },
      metal,
    })),
    release: () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    },
  };
}

/**
 * Loads SVG markup as an image. Browsers render SVG images without running
 * scripts or fetching external resources, so untrusted files stay inert.
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      console.warn('Part of this SVG’s artwork could not be rendered; painting without it.');
      resolve(null);
    };
    image.src = url;
  });
}

function isReadable(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}
