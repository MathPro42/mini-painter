import { escapeXmlAttribute } from '../xml';
import type { XmlElement } from '../xml';
import type { ArtworkFragment, ViewBox } from './types';

/** Elements that never draw by themselves but that drawn content can refer to. */
const RESOURCE_ELEMENTS = new Set([
  'defs',
  'style',
  'linearGradient',
  'radialGradient',
  'pattern',
  'clipPath',
  'mask',
  'filter',
  'marker',
  'symbol',
]);

/**
 * Top-level elements left out of artwork because they draw nothing. Artwork is
 * only ever rendered as an image, where scripts can't run anyway.
 */
const DROPPED_ELEMENTS = new Set(['title', 'desc', 'metadata', 'script', 'namedview']);

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

export interface LayerTree {
  readonly root: XmlElement;
  /** Groups between the root and the layers, outermost first. Often empty. */
  readonly wrappers: readonly XmlElement[];
  /** Top-level drawable elements, in paint order. */
  readonly layers: readonly XmlElement[];
}

/** The name an editor gave an element: its layer name, else its id. */
export function elementName(element: XmlElement): string | undefined {
  const { attributes } = element;
  return attributes.get('data-name') ?? attributes.get('inkscape:label') ?? attributes.get('id');
}

/** Whether the element's id, layer name or label matches `pattern`. */
export function hasName(element: XmlElement, pattern: RegExp): boolean {
  return ['id', 'data-name', 'inkscape:label'].some((attribute) =>
    pattern.test(element.attributes.get(attribute) ?? ''),
  );
}

/**
 * Finds the drawing's top-level layers: the root's drawable children, or the
 * children of a lone group that wraps everything (editors often add one).
 * Descent stops at `stopAt`, so a selection map is never unwrapped.
 */
export function findLayers(root: XmlElement, stopAt: XmlElement | null): LayerTree {
  const wrappers: XmlElement[] = [];
  let layers = root.children.filter(isDrawable);
  for (;;) {
    const [only, ...others] = layers;
    if (only === undefined || others.length > 0 || only.localName !== 'g' || only === stopAt) {
      return { root, wrappers, layers };
    }
    wrappers.push(only);
    layers = only.children.filter(isDrawable);
  }
}

/**
 * Builds standalone markup for some of the tree's layers, copied verbatim
 * from `source` along with every resource (defs, styles, masks) and wrapper
 * they may rely on. Returns `null` when there are no layers to draw.
 */
export function buildArtwork(
  source: string,
  tree: LayerTree,
  layers: readonly XmlElement[],
): ArtworkFragment | null {
  if (layers.length === 0) {
    return null;
  }
  const markup = (element: XmlElement): string => source.slice(element.start, element.end);
  const resources = (container: XmlElement): string =>
    container.children
      .filter((child) => RESOURCE_ELEMENTS.has(child.localName))
      .map(markup)
      .join('');
  let open = resources(tree.root);
  let close = '';
  for (const wrapper of tree.wrappers) {
    open += source.slice(wrapper.start, wrapper.startTagEnd) + resources(wrapper);
    close = `</${wrapper.name}>${close}`;
  }
  return {
    namespaces: namespaceAttributes(tree.root),
    body: open + layers.map(markup).join('') + close,
  };
}

/**
 * A complete SVG document for an artwork fragment, rendered at `width` ×
 * `height` pixels. An explicit size matters: some browsers refuse to draw an
 * SVG image without one onto a canvas.
 */
export function artworkMarkup(
  fragment: ArtworkFragment,
  viewBox: ViewBox,
  width: number,
  height: number,
): string {
  const box = [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(' ');
  const size = `width="${String(width)}" height="${String(height)}"`;
  return `<svg ${fragment.namespaces} viewBox="${box}" ${size} preserveAspectRatio="none">${fragment.body}</svg>`;
}

function isDrawable(element: XmlElement): boolean {
  return !RESOURCE_ELEMENTS.has(element.localName) && !DROPPED_ELEMENTS.has(element.localName);
}

function namespaceAttributes(root: XmlElement): string {
  const namespaces = new Map([
    ['xmlns', SVG_NAMESPACE],
    ['xmlns:xlink', XLINK_NAMESPACE],
  ]);
  for (const [name, value] of root.attributes) {
    if (name.startsWith('xmlns:')) {
      namespaces.set(name, value);
    }
  }
  return Array.from(namespaces, ([name, value]) => `${name}="${escapeXmlAttribute(value)}"`).join(
    ' ',
  );
}
