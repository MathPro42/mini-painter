import { normalizeCssColor } from '../color';
import { parseXml } from '../xml';
import type { XmlElement } from '../xml';
import { ringsBounds, unionBounds } from './geometry';
import type { FillRule } from './geometry';
import { buildArtwork, elementName, findLayers, hasName } from './layers';
import type { LayerTree } from './layers';
import { readNumbers, readPlainLength } from './numbers';
import { isShapeElement, shapeRings } from './shapes';
import { declaredValue, parseStyleSheet } from './styles';
import type { StyleRule } from './styles';
import { IDENTITY, multiply, transformMatrix, transformRings } from './transform';
import type { Matrix } from './transform';
import type { ParsedSvg, RegionLayout, SvgRegion, SvgShape, ViewBox } from './types';

/** Larger uploads are refused before reading. The biggest real sheets are a few MB. */
export const MAX_SVG_FILE_BYTES = 32 * 1024 * 1024;

/** Stand-in for fills that aren't one flat color (gradients, patterns, `currentColor`). */
export const UNRESOLVED_FILL = '#9e9e9e';

/** Name of the region that gathers loose shapes sitting directly in a selection map. */
export const UNGROUPED_REGION_NAME = 'Ungrouped shapes';

const SELECTION_MAP_NAME = /^selection[\s_-]?map$/i;
const ARTWORK_LAYER_NAME = /^image$/i;
const CONTAINER_ELEMENTS = new Set(['g', 'a', 'svg', 'switch']);

/** Inherited state while walking the tree, mirroring how SVG cascades it. */
interface Context {
  readonly matrix: Matrix;
  readonly fill: string | null;
  readonly fillRule: FillRule;
  readonly hidden: boolean;
}

interface Detection {
  readonly layout: RegionLayout;
  readonly regions: readonly SvgRegion[];
  /** Layers drawn as regions (or invisible hit areas), left out of the artwork. */
  readonly regionLayers: ReadonlySet<XmlElement>;
  /** Index into the layers where region fills are drawn: artwork before it goes below. */
  readonly paintSlot: number;
}

const ROOT_CONTEXT: Context = {
  matrix: IDENTITY,
  fill: '#000000',
  fillRule: 'nonzero',
  hidden: false,
};

/**
 * Parses SVG markup into paintable regions plus the artwork around them.
 *
 * Paint-scheme sheets mark regions with a `selectionMap` group: each child is
 * one region of invisible hit shapes, painted under the `Image` layer (the
 * shading that sits on top). Any other SVG falls back to one region per
 * top-level element with a visible fill.
 *
 * Throws a RangeError when the markup is malformed, isn't SVG, or has
 * nothing to paint.
 */
export function parseSvg(source: string): ParsedSvg {
  const root = parseXml(source);
  if (root.localName !== 'svg') {
    throw new RangeError(`Not an SVG file: the root element is <${root.name}>.`);
  }
  const rules = parseStyleSheet(collectStyleText(root));
  const selectionPath = findPath(root, (element) => hasName(element, SELECTION_MAP_NAME));
  const tree = findLayers(root, selectionPath?.at(-1) ?? null);
  const detection =
    (selectionPath && detectSelectionMap(selectionPath, tree, rules)) ??
    detectTopLevel(tree, rules);
  if (detection === null) {
    throw new RangeError('No paintable regions found: this SVG has no filled shapes.');
  }
  const { layout, regions, regionLayers, paintSlot } = detection;
  const artworkLayers = (from: number, to?: number): XmlElement[] =>
    tree.layers.slice(from, to).filter((layer) => !regionLayers.has(layer));
  return {
    viewBox: readViewBox(root) ?? viewBoxAround(regions),
    layout,
    regions,
    artwork: {
      below: buildArtwork(source, tree, artworkLayers(0, paintSlot)),
      above: buildArtwork(source, tree, artworkLayers(paintSlot)),
    },
  };
}

function detectSelectionMap(
  path: readonly XmlElement[],
  tree: LayerTree,
  rules: readonly StyleRule[],
): Detection | null {
  const selectionMap = path.at(-1);
  if (selectionMap === undefined) {
    return null;
  }
  const context = path.reduce(
    (parent, element) => deriveContext(parent, element, rules),
    ROOT_CONTEXT,
  );
  const regions = selectionMapRegions(selectionMap, context, rules);
  if (regions.length === 0) {
    return null;
  }
  const artworkIndex = tree.layers.findIndex((layer) => hasName(layer, ARTWORK_LAYER_NAME));
  const mapIndex = tree.layers.indexOf(selectionMap);
  const paintSlot =
    artworkIndex >= 0 ? artworkIndex : mapIndex >= 0 ? mapIndex : tree.layers.length;
  return { layout: 'selectionMap', regions, regionLayers: new Set([selectionMap]), paintSlot };
}

/**
 * One region per child group. Loose shapes beside the groups are usually
 * stray slivers, so they share one region; if there are no groups at all,
 * each loose shape is a region.
 */
function selectionMapRegions(
  selectionMap: XmlElement,
  context: Context,
  rules: readonly StyleRule[],
): SvgRegion[] {
  // Hit shapes are meant to be invisible, so their fill and display don't matter.
  const shapesOf = (element: XmlElement): SvgShape[] =>
    collectShapes(element, context, rules, false).map((shape) => ({ ...shape, fill: null }));
  const regions: SvgRegion[] = [];
  const add = (name: string | undefined, shapes: SvgShape[]): void => {
    const region = createRegion(regions.length, name, shapes);
    if (region !== null) {
      regions.push(region);
    }
  };
  const loose = selectionMap.children.filter(isShapeElement);
  for (const group of selectionMap.children.filter((child) => !isShapeElement(child))) {
    add(elementName(group), shapesOf(group));
  }
  if (regions.length > 0) {
    add(UNGROUPED_REGION_NAME, loose.flatMap(shapesOf));
  } else {
    loose.forEach((shape) => {
      add(elementName(shape), shapesOf(shape));
    });
  }
  return regions;
}

function detectTopLevel(tree: LayerTree, rules: readonly StyleRule[]): Detection | null {
  const context = [tree.root, ...tree.wrappers].reduce(
    (parent, element) => deriveContext(parent, element, rules),
    ROOT_CONTEXT,
  );
  const regions: SvgRegion[] = [];
  const regionLayers = new Set<XmlElement>();
  for (const layer of tree.layers) {
    const shapes = collectShapes(layer, context, rules, true).filter(
      (shape) => shape.fill !== null,
    );
    const region = createRegion(regions.length, elementName(layer), shapes);
    if (region !== null) {
      regions.push(region);
      regionLayers.add(layer);
    }
  }
  if (regions.length === 0) {
    return null;
  }
  const paintSlot = tree.layers.findIndex((layer) => regionLayers.has(layer));
  return { layout: 'topLevel', regions, regionLayers, paintSlot };
}

function createRegion(
  index: number,
  name: string | undefined,
  shapes: SvgShape[],
): SvgRegion | null {
  const [first, ...rest] = shapes;
  if (first === undefined) {
    return null;
  }
  return {
    id: `region-${String(index)}`,
    name: name ?? `Region ${String(index + 1)}`,
    fill: first.fill,
    shapes,
    bounds: rest.reduce((bounds, shape) => unionBounds(bounds, shape.bounds), first.bounds),
  };
}

/** Every shape under `element`, in paint order, transformed into viewBox coordinates. */
function collectShapes(
  element: XmlElement,
  parent: Context,
  rules: readonly StyleRule[],
  visibleOnly: boolean,
): SvgShape[] {
  const context = deriveContext(parent, element, rules);
  if (visibleOnly && context.hidden) {
    return [];
  }
  const rings = shapeRings(element);
  if (rings !== null) {
    const transformed = transformRings(context.matrix, rings);
    const bounds = ringsBounds(transformed);
    return bounds === null
      ? []
      : [{ rings: transformed, fillRule: context.fillRule, fill: context.fill, bounds }];
  }
  if (!CONTAINER_ELEMENTS.has(element.localName)) {
    return [];
  }
  return element.children.flatMap((child) => collectShapes(child, context, rules, visibleOnly));
}

function deriveContext(parent: Context, element: XmlElement, rules: readonly StyleRule[]): Context {
  const transform = element.attributes.get('transform');
  const own = transform === undefined ? null : transformMatrix(transform);
  const fill = declaredValue(element, 'fill', rules);
  const fillRule = declaredValue(element, 'fill-rule', rules);
  return {
    matrix: own === null ? parent.matrix : multiply(parent.matrix, own),
    fill: fill === undefined ? parent.fill : resolvePaint(fill, parent.fill),
    fillRule: fillRule === 'evenodd' || fillRule === 'nonzero' ? fillRule : parent.fillRule,
    hidden: parent.hidden || declaredValue(element, 'display', rules) === 'none',
  };
}

function resolvePaint(value: string, inherited: string | null): string | null {
  const paint = value.trim().toLowerCase();
  if (paint === 'none' || paint === 'transparent') {
    return null;
  }
  return paint === 'inherit' ? inherited : (normalizeCssColor(paint) ?? UNRESOLVED_FILL);
}

function collectStyleText(element: XmlElement): string {
  const own = element.localName === 'style' ? element.text : '';
  return [own, ...element.children.map(collectStyleText)].join('\n');
}

/** Depth-first search; returns the elements from the root down to the first match. */
function findPath(
  element: XmlElement,
  matches: (element: XmlElement) => boolean,
): XmlElement[] | null {
  if (matches(element)) {
    return [element];
  }
  for (const child of element.children) {
    const path = findPath(child, matches);
    if (path !== null) {
      return [element, ...path];
    }
  }
  return null;
}

/** The root's `viewBox`, else its plain `width`/`height`, else `null`. */
function readViewBox(root: XmlElement): ViewBox | null {
  const numbers = readNumbers(root.attributes.get('viewBox') ?? '');
  const [x = 0, y = 0, width = 0, height = 0] = numbers;
  if (numbers.length === 4 && width > 0 && height > 0) {
    return { x, y, width, height };
  }
  return sizeViewBox(
    readPlainLength(root.attributes.get('width')),
    readPlainLength(root.attributes.get('height')),
  );
}

function sizeViewBox(width: number | null, height: number | null): ViewBox | null {
  return width !== null && height !== null && width > 0 && height > 0
    ? { x: 0, y: 0, width, height }
    : null;
}

function viewBoxAround(regions: readonly SvgRegion[]): ViewBox {
  const [first, ...rest] = regions;
  const fallback = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const bounds = rest.reduce(
    (union, region) => unionBounds(union, region.bounds),
    first?.bounds ?? fallback,
  );
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(bounds.maxX - bounds.minX, 1),
    height: Math.max(bounds.maxY - bounds.minY, 1),
  };
}
