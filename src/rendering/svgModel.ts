import { CanvasTexture, SRGBColorSpace } from 'three';
import { artworkMarkup } from '../utils/svg/layers';
import type { ArtworkFragment, ParsedSvg } from '../utils/svg/types';
import { paintSvg } from './paintSvg';
import type { SvgPaintInput } from './paintSvg';
import { createSvgPlane, textureSize } from './svgPlane';
import type { SvgPlane } from './svgPlane';

export interface SvgModel {
  readonly plane: SvgPlane;
  /** Repaints the texture with these colors and this selection. */
  paint: (colors: ReadonlyMap<string, string>, selectedRegionId: string | null) => void;
  /** Frees the texture, canvas and plane. Artwork that finishes loading later is ignored. */
  dispose: () => void;
}

type Artwork = Pick<SvgPaintInput, 'below' | 'above'>;

/**
 * Builds the textured plane for a drawing. The texture is a 2D canvas that
 * paintSvg redraws on every change; the drawing's artwork is rendered by the
 * browser from SVG markup into images drawn below and above the regions.
 *
 * Browser-only (canvas, Image, Blob URLs), like createRenderer: check changes
 * in a browser. The logic it wires together (paintSvg, svgPlane) is tested.
 */
export function createSvgModel(svg: ParsedSvg): SvgModel {
  const { width, height } = textureSize(svg.viewBox);
  const painter = createPainter(svg, width, height);
  const plane = createSvgPlane(svg, painter.texture);
  let disposed = false;

  const artwork = loadArtwork(svg, width, height);
  void artwork.images.then(([below, above]) => {
    if (disposed) {
      return;
    }
    painter.showArtwork({ below, above });
  });

  return {
    plane,
    paint: (colors, selectedRegionId) => {
      painter.update({ colors, selectedRegionId });
    },
    dispose: () => {
      disposed = true;
      artwork.release();
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
   * Paints with the artwork and returns it, or returns no artwork if drawing
   * it tainted the canvas: WebGL refuses a tainted canvas as a texture.
   */
  showArtwork: (artwork: Artwork) => Artwork;
  dispose: () => void;
}

function createPainter(svg: ParsedSvg, width: number, height: number): Painter {
  const { canvas, ctx } = createCanvas(width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  let input: SvgPaintInput = {
    svg,
    colors: new Map(),
    selectedRegionId: null,
    below: null,
    above: null,
  };
  const update = (changes: Partial<SvgPaintInput>): void => {
    input = { ...input, ...changes };
    paintSvg(ctx, width, height, input);
    texture.needsUpdate = true;
  };
  update({});
  return {
    texture,
    update,
    showArtwork: (artwork) => {
      update(artwork);
      if (isReadable(ctx)) {
        return artwork;
      }
      console.warn(
        'The browser blocked this SVG’s artwork from the 3D view; showing regions only.',
      );
      const none = { below: null, above: null };
      update(none);
      return none;
    },
    dispose: () => {
      texture.dispose();
      // Releases the canvas backing store now rather than at garbage collection.
      canvas.width = 0;
      canvas.height = 0;
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

interface ArtworkLoad {
  /** Resolves to the rendered below and above artwork; either is `null` if absent or broken. */
  readonly images: Promise<[HTMLImageElement | null, HTMLImageElement | null]>;
  /** Revokes the Blob URLs the images were loaded from. */
  release: () => void;
}

function loadArtwork(svg: ParsedSvg, width: number, height: number): ArtworkLoad {
  const toUrl = (fragment: ArtworkFragment | null): string | null =>
    fragment === null ? null : artworkUrl(fragment, svg, width, height);
  const below = toUrl(svg.artwork.below);
  const above = toUrl(svg.artwork.above);
  return {
    images: Promise.all([loadImage(below), loadImage(above)]),
    release: () => {
      for (const url of [below, above]) {
        if (url !== null) {
          URL.revokeObjectURL(url);
        }
      }
    },
  };
}

function artworkUrl(
  fragment: ArtworkFragment,
  svg: ParsedSvg,
  width: number,
  height: number,
): string {
  const markup = artworkMarkup(fragment, svg.viewBox, width, height);
  return URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
}

/**
 * Loads SVG markup as an image. Browsers render SVG images without running
 * scripts or fetching external resources, so untrusted files stay inert.
 */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (url === null) {
    return Promise.resolve(null);
  }
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
