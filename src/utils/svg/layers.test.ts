import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml';
import { artworkMarkup, buildArtwork, elementName, findLayers, hasName } from './layers';

describe('elementName and hasName', () => {
  it('prefers the editor layer name over the id', () => {
    expect(elementName(parseXml('<g id="Body1-2" data-name="Body1"/>'))).toBe('Body1');
    expect(elementName(parseXml('<g id="layer1" inkscape:label="Ink"/>'))).toBe('Ink');
    expect(elementName(parseXml('<g id="plain"/>'))).toBe('plain');
    expect(elementName(parseXml('<g/>'))).toBeUndefined();
  });

  it('matches any of the naming attributes', () => {
    expect(hasName(parseXml('<g id="x" data-name="Image"/>'), /^image$/i)).toBe(true);
    expect(hasName(parseXml('<g id="image"/>'), /^image$/i)).toBe(true);
    expect(hasName(parseXml('<g id="images"/>'), /^image$/i)).toBe(false);
  });
});

describe('findLayers', () => {
  it('descends through lone wrapper groups', () => {
    const root = parseXml(
      '<svg><defs/><title/><g id="outer"><g id="inner"><rect/><circle/></g></g></svg>',
    );
    const tree = findLayers(root, null);
    expect(tree.wrappers.map((wrapper) => wrapper.attributes.get('id'))).toEqual([
      'outer',
      'inner',
    ]);
    expect(tree.layers.map((layer) => layer.name)).toEqual(['rect', 'circle']);
  });

  it('stops at the given element', () => {
    const root = parseXml('<svg><g id="map"><g/><g/></g></svg>');
    const map = root.children[0] ?? null;
    expect(findLayers(root, map).layers).toEqual([map]);
  });

  it('does not unwrap a lone non-group element', () => {
    const root = parseXml('<svg><rect/></svg>');
    expect(findLayers(root, null).layers.map((layer) => layer.name)).toEqual(['rect']);
  });
});

describe('buildArtwork', () => {
  it('returns null when there is nothing to draw', () => {
    const root = parseXml('<svg><rect/></svg>');
    expect(buildArtwork('<svg><rect/></svg>', findLayers(root, null), [])).toBeNull();
  });

  it('copies extra namespace declarations and escapes them', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="urn:a&amp;b"><rect/></svg>';
    const tree = findLayers(parseXml(source), null);
    expect(buildArtwork(source, tree, tree.layers)).toEqual({
      namespaces:
        'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="urn:a&amp;b"',
      body: '<rect/>',
    });
  });
});

describe('artworkMarkup', () => {
  it('wraps the fragment in a sized, stretch-to-fit SVG document', () => {
    const markup = artworkMarkup(
      { namespaces: 'xmlns="http://www.w3.org/2000/svg"', body: '<rect/>' },
      { x: -5, y: 0, width: 200, height: 100 },
      2048,
      1024,
    );
    expect(markup).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 0 200 100" width="2048" height="1024" preserveAspectRatio="none"><rect/></svg>',
    );
    expect(parseXml(markup).children).toHaveLength(1);
  });
});
