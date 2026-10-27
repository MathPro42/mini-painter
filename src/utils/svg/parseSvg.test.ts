import { describe, expect, it } from 'vitest';
import selectionMapSvg from './fixtures/selection-map.svg?raw';
import topLevelSvg from './fixtures/top-level-shapes.svg?raw';
import { parseSvg, UNGROUPED_REGION_NAME, UNRESOLVED_FILL } from './parseSvg';
import type { ParsedSvg, SvgRegion } from './types';

const svg = (body: string, attributes = 'viewBox="0 0 100 100"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;

const region = (parsed: ParsedSvg, name: string): SvgRegion => {
  const found = parsed.regions.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`No region named ${name}`);
  }
  return found;
};

const fills = (parsed: ParsedSvg): (string | null)[][] =>
  parsed.regions.map((candidate) => candidate.shapes.map((shape) => shape.fill));

describe('parseSvg with a selection map', () => {
  const parsed = parseSvg(selectionMapSvg);

  it('makes one region per selection-map group, plus one for loose shapes', () => {
    expect(parsed.layout).toBe('selectionMap');
    expect(parsed.regions.map((candidate) => candidate.name)).toEqual([
      'one',
      'two',
      'three',
      'four',
      UNGROUPED_REGION_NAME,
    ]);
    expect(parsed.regions.map((candidate) => candidate.id)).toEqual([
      'region-0',
      'region-1',
      'region-2',
      'region-3',
      'region-4',
    ]);
  });

  it('keeps each region’s geometry in viewBox coordinates', () => {
    expect(parsed.viewBox).toEqual({ x: 0, y: 0, width: 200, height: 120 });
    expect(region(parsed, 'one').bounds).toEqual({ minX: 20, minY: 20, maxX: 80, maxY: 80 });
    const circle = region(parsed, 'two').bounds;
    expect(circle.minX).toBeCloseTo(120);
    expect(circle.maxX).toBeCloseTo(180);
    expect(circle.minY).toBeCloseTo(20);
    expect(circle.maxY).toBeCloseTo(80);
    expect(region(parsed, 'three').shapes).toHaveLength(2);
    expect(region(parsed, 'three').bounds).toEqual({ minX: 90, minY: 90, maxX: 150, maxY: 110 });
    expect(region(parsed, 'four').shapes[0]?.fillRule).toBe('evenodd');
  });

  it('starts every region unpainted, since hit shapes are invisible', () => {
    expect(parsed.regions.every((candidate) => candidate.fill === null)).toBe(true);
    expect(
      fills(parsed)
        .flat()
        .every((fill) => fill === null),
    ).toBe(true);
  });

  it('splits the artwork around the Image layer and leaves the selection map out', () => {
    const { below, above } = parsed.artwork;
    expect(below?.body).toContain('id="Background"');
    expect(below?.body).toContain('id="Highlight"');
    expect(below?.body).not.toContain('id="Image"');
    expect(above?.body).toContain('id="Image"');
    expect(above?.body).toContain('data:image/png;base64,');
    for (const { body, namespaces } of [below, above].filter((fragment) => fragment !== null)) {
      expect(body).toMatch(/^<defs><style>.*<mask id="mask-2"/);
      expect(body).not.toContain('selectionMap');
      expect(body).not.toContain('<title>');
      expect(namespaces).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
  });

  it('unwraps a lone wrapper group and applies its transforms to regions', () => {
    const wrapped = parseSvg(
      svg(
        '<defs><style>.hit{fill:none}</style></defs><g class="iso" transform="translate(10 0)">' +
          '<style>.x{}</style><g id="Background"><rect width="100" height="100"/></g><g id="Image"/>' +
          '<g id="selection_map" transform="scale(2)"><g data-name="Body 1"><rect class="hit" width="5" height="5"/></g></g></g>',
      ),
    );
    expect(wrapped.regions.map((candidate) => candidate.name)).toEqual(['Body 1']);
    expect(wrapped.regions[0]?.bounds).toEqual({ minX: 10, minY: 0, maxX: 20, maxY: 10 });
    expect(wrapped.artwork.below?.body).toBe(
      '<defs><style>.hit{fill:none}</style></defs><g class="iso" transform="translate(10 0)"><style>.x{}</style>' +
        '<g id="Background"><rect width="100" height="100"/></g></g>',
    );
    expect(wrapped.artwork.above?.body).toBe(
      '<defs><style>.hit{fill:none}</style></defs><g class="iso" transform="translate(10 0)"><style>.x{}</style><g id="Image"/></g>',
    );
  });

  it('paints in place of the selection map when there is no Image layer', () => {
    const parsed = parseSvg(
      svg(
        '<g id="Art"><rect width="5" height="5"/></g><g id="selectionMap"><g><rect width="5" height="5"/></g></g><g id="Top"/>',
      ),
    );
    expect(parsed.regions.map((candidate) => candidate.name)).toEqual(['Region 1']);
    expect(parsed.artwork.below?.body).toContain('id="Art"');
    expect(parsed.artwork.above?.body).toContain('id="Top"');
  });

  it('paints on top when the selection map is nested inside a layer', () => {
    const parsed = parseSvg(
      svg(
        '<rect width="5" height="5"/><g id="Layer"><g id="selectionMap"><g><rect width="5" height="5"/></g></g></g>',
      ),
    );
    expect(parsed.layout).toBe('selectionMap');
    expect(parsed.artwork.above).toBeNull();
    expect(parsed.artwork.below?.body).toContain('id="Layer"');
  });

  it('makes each loose shape a region when the selection map has no groups', () => {
    const parsed = parseSvg(
      svg(
        '<g id="selectionMap"><rect id="left" width="5" height="5"/><circle r="2" cx="20" cy="20"/></g>',
      ),
    );
    expect(parsed.regions.map((candidate) => candidate.name)).toEqual(['left', 'Region 2']);
  });

  it('ignores display on hit shapes, which are invisible anyway', () => {
    const parsed = parseSvg(
      svg(
        '<g id="selectionMap" style="display:none"><g display="none"><rect width="5" height="5"/></g></g>',
      ),
    );
    expect(parsed.regions).toHaveLength(1);
  });

  it('falls back to top-level regions when the selection map has no shapes', () => {
    const parsed = parseSvg(
      svg('<rect width="5" height="5" fill="#c8553d"/><g id="selectionMap"><g/></g>'),
    );
    expect(parsed.layout).toBe('topLevel');
    expect(parsed.regions).toHaveLength(1);
  });
});

describe('parseSvg without a selection map', () => {
  const parsed = parseSvg(topLevelSvg);

  it('makes one region per top-level element with a visible fill', () => {
    expect(parsed.layout).toBe('topLevel');
    expect(parsed.regions.map((candidate) => candidate.name)).toEqual([
      'backdrop',
      'Region 2',
      'pair',
    ]);
  });

  it('resolves fills from attributes, classes, inline styles and inheritance', () => {
    expect(fills(parsed)).toEqual([['#f0ead6'], ['#c8553d'], ['#3d7ac8', '#2e8b57']]);
    expect(parsed.regions.map((candidate) => candidate.fill)).toEqual([
      '#f0ead6',
      '#c8553d',
      '#3d7ac8',
    ]);
  });

  it('applies group transforms and reads the size from width and height', () => {
    expect(parsed.viewBox).toEqual({ x: 0, y: 0, width: 120, height: 80 });
    expect(region(parsed, 'pair').shapes[0]?.bounds).toEqual({
      minX: 60,
      minY: 20,
      maxX: 80,
      maxY: 40,
    });
  });

  it('keeps unfilled elements as artwork drawn above the regions', () => {
    expect(parsed.artwork.below).toBeNull();
    expect(parsed.artwork.above?.body).toContain('id="outline"');
    expect(parsed.artwork.above?.body).toContain('<text');
    expect(parsed.artwork.above?.body).not.toContain('id="pair"');
  });

  it('puts artwork that precedes the first region below it', () => {
    const parsed = parseSvg(
      svg('<path d="M0 0L9 9" stroke="#000" fill="none"/><rect width="5" height="5"/>'),
    );
    expect(parsed.artwork.below?.body).toContain('<path');
    expect(parsed.artwork.above).toBeNull();
  });

  it('defaults to black, honors inherit, none and transparent, and stands in for gradients', () => {
    const parsed = parseSvg(
      svg(
        '<rect width="5" height="5"/>' +
          '<g fill="#c8553d"><rect width="5" height="5" fill="inherit"/></g>' +
          '<rect width="5" height="5" fill="url(#gradient)"/>' +
          '<rect width="5" height="5" fill="none"/><rect width="5" height="5" style="fill:transparent"/>',
      ),
    );
    expect(fills(parsed)).toEqual([['#000000'], ['#c8553d'], [UNRESOLVED_FILL]]);
  });

  it('skips hidden elements and inherits fill-rule', () => {
    const parsed = parseSvg(
      svg(
        '<g fill-rule="evenodd"><rect width="5" height="5"/><rect width="5" height="5" display="none"/></g>' +
          '<g style="display:none"><rect width="5" height="5"/></g>',
      ),
    );
    expect(parsed.regions).toHaveLength(1);
    expect(parsed.regions[0]?.shapes).toHaveLength(1);
    expect(parsed.regions[0]?.shapes[0]?.fillRule).toBe('evenodd');
  });

  it('ignores malformed transforms, as browsers do', () => {
    const parsed = parseSvg(svg('<rect width="5" height="5" transform="translate(oops)"/>'));
    expect(parsed.regions[0]?.bounds).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
  });

  it('drops top-level scripts and metadata from the artwork', () => {
    const parsed = parseSvg(
      svg('<script>alert(1)</script><metadata/><rect width="5" height="5"/><g><script/></g>'),
    );
    expect(parsed.artwork.above?.body).toBe('<g><script/></g>');
  });

  it('frames the regions when the size is not in plain user units', () => {
    const parsed = parseSvg(
      svg('<rect x="10" y="20" width="30" height="40"/>', 'width="10cm" height="5cm"'),
    );
    expect(parsed.viewBox).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});

describe('parseSvg errors', () => {
  it.each([
    ['', /No root element/],
    ['not markup at all', /No root element/],
    ['<svg><g></svg>', /Unexpected <\/svg>/],
    ['<html><body/></html>', /Not an SVG file: the root element is <html>/],
    [svg('<path d="M0 0L10 10" stroke="#000"/><text>hi</text>'), /No paintable regions found/],
    [svg(''), /No paintable regions found/],
  ])('rejects %j', (source, message) => {
    expect(() => parseSvg(source)).toThrow(RangeError);
    expect(() => parseSvg(source)).toThrow(message);
  });
});
