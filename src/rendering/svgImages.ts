import { artworkMarkup } from '../utils/svg/layers';
import type { ArtworkFragment, ParsedSvg } from '../utils/svg/types';
import type { SvgPaintInput } from './paintSvg';
import { NO_TONE_MASK_IMAGES } from './paintTones';

/** Everything the browser renders from the drawing's own markup. */
export type Images = Pick<SvgPaintInput, 'below' | 'above' | 'toneMasks' | 'metal'>;

export const NO_IMAGES: Images = {
  below: null,
  above: null,
  toneMasks: NO_TONE_MASK_IMAGES,
  metal: null,
};

export interface ImageLoad {
  /** Resolves once every image has loaded; each is `null` if absent or broken. */
  readonly loaded: Promise<Images>;
  /** Revokes the Blob URLs the images were loaded from. */
  release: () => void;
}

/** Renders the drawing's artwork, tone masks and metal picture to images of the given size. */
export function loadImages(svg: ParsedSvg, width: number, height: number): ImageLoad {
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
