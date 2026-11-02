import { CanvasTexture, SRGBColorSpace } from 'three';
import type { RegionPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg } from '../utils/svg/types';
import { createCanvas, isReadable, releaseCanvases } from './canvases';
import { paintSelection, paintSvg } from './paintSvg';
import type { SvgPaintInput } from './paintSvg';
import { createSvgPlane, textureSize } from './svgPlane';
import type { SvgPlane } from './svgPlane';
import { loadImages, NO_IMAGES } from './svgImages';
import type { Images } from './svgImages';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

export interface SvgModel {
  readonly plane: SvgPlane;
  /**
   * Takes new paints and a new selection. Nothing is drawn yet: the textures
   * repaint on the next flush, so several changes in one frame cost one repaint.
   */
  paint: (paints: RegionPaints, selectedRegionIds: readonly string[]) => void;
  /** Repaints whichever texture changed since the last flush. Call it right before rendering. */
  flush: () => void;
  /** Frees the textures, canvases and plane. Images that finish loading later are ignored. */
  dispose: () => void;
}

/**
 * Builds the textured plane for a drawing. The paint texture is a 2D canvas
 * that paintSvg redraws when paints change; the drawing's artwork, tone masks
 * and metal picture are rendered by the browser from SVG markup into images.
 * The selection outlines live on a second, overlay texture, so selecting
 * never repaints the paint. `onChange` runs whenever a texture needs a
 * repaint: the owner then flushes and renders a frame.
 *
 * Browser-only (canvas, Image, Blob URLs), like createRenderer: check changes
 * in a browser. The logic it wires together (paintSvg, svgPlane) is tested.
 */
export function createSvgModel(svg: ParsedSvg, onChange: () => void): SvgModel {
  const { width, height } = textureSize(svg.viewBox);
  const painter = createPainter(svg, width, height, onChange);
  const selection = createSelectionPainter(svg, width, height, onChange);
  const plane = createSvgPlane(svg, painter.texture, selection.texture);
  let disposed = false;

  const images = loadImages(svg, width, height);
  void images.loaded.then((loaded) => {
    if (!disposed) {
      painter.showImages(loaded);
    }
  });

  return {
    plane,
    paint: (paints, selectedRegionIds) => {
      painter.setPaints(paints);
      selection.setSelection(selectedRegionIds);
    },
    flush: () => {
      painter.flush();
      selection.flush();
    },
    dispose: () => {
      disposed = true;
      images.release();
      plane.dispose();
      painter.dispose();
      selection.dispose();
    },
  };
}

interface Painter {
  readonly texture: CanvasTexture;
  /** Paints with these paints from the next flush on. */
  setPaints: (paints: RegionPaints) => void;
  /** Repaints the texture if anything changed since the last flush. */
  flush: () => void;
  /**
   * Paints with the images, or without any if drawing them tainted the
   * canvas: WebGL refuses a tainted canvas as a texture.
   */
  showImages: (images: Images) => void;
  dispose: () => void;
}

function createPainter(
  svg: ParsedSvg,
  width: number,
  height: number,
  onChange: () => void,
): Painter {
  const main = createCanvas(width, height);
  const scratch = createCanvas(width, height);
  const texture = createTexture(main.canvas);
  let input: SvgPaintInput = { svg, paints: new Map(), ...NO_IMAGES };
  let dirty = true;
  const update = (changes: Partial<SvgPaintInput>): void => {
    input = { ...input, ...changes };
    dirty = true;
    onChange();
  };
  const flush = (): void => {
    if (dirty) {
      dirty = false;
      paintSvg(main.ctx, scratch.ctx, width, height, input);
      texture.needsUpdate = true;
    }
  };
  return {
    texture,
    setPaints: (paints) => {
      if (paints !== input.paints) {
        update({ paints });
      }
    },
    flush,
    showImages: (images) => {
      update(images);
      // Paint now: only drawing them tells whether the images tainted the canvas.
      flush();
      if (!isReadable(main.ctx)) {
        console.warn(
          'The browser blocked this SVG’s artwork from the 3D view; showing regions only.',
        );
        update(NO_IMAGES);
      }
    },
    dispose: () => {
      texture.dispose();
      releaseCanvases(main.canvas, scratch.canvas);
    },
  };
}

interface SelectionPainter {
  readonly texture: CanvasTexture;
  /** Outlines these regions from the next flush on. */
  setSelection: (ids: readonly string[]) => void;
  /** Redraws the outlines if the selection changed since the last flush. */
  flush: () => void;
  dispose: () => void;
}

function createSelectionPainter(
  svg: ParsedSvg,
  width: number,
  height: number,
  onChange: () => void,
): SelectionPainter {
  const overlay = createCanvas(width, height);
  const texture = createTexture(overlay.canvas);
  let selected: readonly string[] = [];
  let dirty = false;
  return {
    texture,
    setSelection: (ids) => {
      if (ids !== selected) {
        selected = ids;
        dirty = true;
        onChange();
      }
    },
    flush: () => {
      if (dirty) {
        dirty = false;
        paintSelection(overlay.ctx, width, height, svg, new Set(selected));
        texture.needsUpdate = true;
      }
    },
    dispose: () => {
      texture.dispose();
      releaseCanvases(overlay.canvas);
    },
  };
}

function createTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
