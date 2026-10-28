import type { ToneStep } from '../paint/regionPaint';
import type { XmlElement } from '../xml';
import { findPath, hasName, nestInElements, wrapArtwork } from './layers';
import type { LayerTree } from './layers';
import { declaredValue } from './styles';
import type { StyleRule } from './styles';
import type { ArtworkFragment, ToneMasks } from './types';

const TONE_LAYER_NAMES: Readonly<Record<ToneStep, RegExp>> = {
  layer: /^layers?$/i,
  shade: /^shades?$/i,
  highlight: /^highlights?$/i,
};

const METAL_LAYER_NAME = /^met(al(lic)?)?$/i;

// Covers any drawing; the masks on the way down decide where (and how strongly) it shows.
// Inline style beats the sheet's own class rules, which often set `fill: none`.
const COVER =
  '<rect x="-1000000" y="-1000000" width="2000000" height="2000000" style="fill:#fff;stroke:none;opacity:1"/>';

export const NO_TONE_MASKS: ToneMasks = { layer: null, shade: null, highlight: null };

/**
 * Finds the sheet's tone layers: groups named Layer, Shade and Highlight
 * that are seen through a mask (on the group itself or a parent). For each,
 * returns artwork that renders opaque white wherever, and as strongly as,
 * that tone shows. The browser applies the mask, so mask units, transforms
 * and embedded mask images all behave as in the original. A tone layer
 * without a mask would cover everything, so it is ignored.
 */
export function findToneMasks(
  source: string,
  tree: LayerTree,
  layers: readonly XmlElement[],
  rules: readonly StyleRule[],
): ToneMasks {
  const coverage = (step: ToneStep): ArtworkFragment | null => {
    const path = findInLayers(layers, TONE_LAYER_NAMES[step]);
    if (path?.some((element) => isMasked(element, rules)) !== true) {
      return null;
    }
    return wrapArtwork(source, tree, nestInElements(source, path, COVER));
  };
  return { layer: coverage('layer'), shade: coverage('shade'), highlight: coverage('highlight') };
}

/**
 * Finds the sheet's metal layer (a group named Met, Metal or Metallic): a
 * picture of the model as bare metal. Sheets hide it behind an empty mask
 * until a metallic paint is used, so it is returned without its parents and
 * their masks. Returns `null` when there is none.
 */
export function findMetalArtwork(
  source: string,
  tree: LayerTree,
  layers: readonly XmlElement[],
): ArtworkFragment | null {
  const metal = findInLayers(layers, METAL_LAYER_NAME)?.at(-1);
  return metal === undefined
    ? null
    : wrapArtwork(source, tree, source.slice(metal.start, metal.end));
}

/** The path from a top-level layer down to the first element named like `pattern`. */
function findInLayers(layers: readonly XmlElement[], pattern: RegExp): XmlElement[] | null {
  for (const layer of layers) {
    const path = findPath(layer, (element) => hasName(element, pattern));
    if (path !== null) {
      return path;
    }
  }
  return null;
}

function isMasked(element: XmlElement, rules: readonly StyleRule[]): boolean {
  const mask = declaredValue(element, 'mask', rules)?.trim().toLowerCase();
  return mask !== undefined && mask !== '' && mask !== 'none';
}
