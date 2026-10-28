import { describe, expect, it } from 'vitest';
import { parseSvg } from '../utils/svg/parseSvg';
import type { SvgPaintInput } from './paintSvg';
import { paintSvg, SELECTION_OUTLINE_COLORS, SELECTION_OUTLINE_PX } from './paintSvg';
import { recordingContext } from '../test/recordingCanvas';
import { NO_TONE_MASK_IMAGES } from './paintTones';

const BELOW = {} as HTMLImageElement;
const ABOVE = {} as HTMLImageElement;
const SHADE = {} as HTMLImageElement;
const HIGHLIGHT = {} as HTMLImageElement;
const METAL = {} as HTMLImageElement;
const SCRATCH_CANVAS = {} as HTMLCanvasElement;
const IMAGE_NAMES = new Map<unknown, string>([
  [BELOW, 'below'],
  [ABOVE, 'above'],
  [SHADE, 'shade mask'],
  [HIGHLIGHT, 'highlight mask'],
  [METAL, 'metal'],
  [SCRATCH_CANVAS, 'scratch'],
]);

// Two regions in a 20 × 10 viewBox offset by (10, 0). "pair" holds two shapes with their own fills.
const SVG = parseSvg(
  '<svg viewBox="10 0 20 10"><rect id="solo" x="10" width="10" height="10" fill="#c8553d"/>' +
    '<g id="pair"><rect x="20" width="5" height="10" fill="#3d7ac8"/><rect x="25" width="5" height="10" fill-rule="evenodd" fill="#2e8b57"/></g></svg>',
);

/** Paints and returns one log for both canvases; scratch entries start with "scratch: ". */
const paint = (overrides: Partial<SvgPaintInput> = {}): string[] => {
  const canvas = SCRATCH_CANVAS;
  const { ctx, log } = recordingContext({ imageNames: IMAGE_NAMES, canvas });
  const { ctx: scratch } = recordingContext({
    log,
    prefix: 'scratch: ',
    imageNames: IMAGE_NAMES,
    canvas,
  });
  paintSvg(ctx, scratch, 200, 100, {
    svg: SVG,
    paints: new Map(),
    selectedRegionId: null,
    below: null,
    above: null,
    toneMasks: NO_TONE_MASK_IMAGES,
    metal: null,
    ...overrides,
  });
  return log;
};

const bases = (entries: [string, string][]): SvgPaintInput['paints'] =>
  new Map(entries.map(([id, color]) => [id, { base: { color } }]));

describe('paintSvg', () => {
  it('clears, then fills each shape with its original color in viewBox units', () => {
    const log = paint();
    expect(log.slice(0, 3)).toEqual([
      'transform 1,0,0,1,0,0',
      'clear',
      'transform 10,0,0,10,-100,0',
    ]);
    expect(log.filter((entry) => entry.startsWith('fill'))).toEqual([
      'fill #c8553d nonzero',
      'fill #3d7ac8 nonzero',
      'fill #2e8b57 evenodd',
    ]);
    expect(log).toContain('move 10,0');
  });

  it('paints every shape of a region in its assigned color', () => {
    const log = paint({ paints: bases([['region-1', '#ffffff']]) });
    expect(log.filter((entry) => entry.startsWith('fill'))).toEqual([
      'fill #c8553d nonzero',
      'fill #ffffff nonzero',
      'fill #ffffff evenodd',
    ]);
  });

  it('leaves unpainted regions clear', () => {
    const unpainted = parseSvg(
      '<svg viewBox="0 0 10 10"><g id="selectionMap"><g><rect width="5" height="5"/></g></g></svg>',
    );
    const log = paint({ svg: unpainted });
    expect(log.some((entry) => entry.startsWith('fill'))).toBe(false);
    expect(paint({ svg: unpainted, paints: bases([['region-0', '#000000']]) })).toContain(
      'fill #000000 nonzero',
    );
  });

  it('draws artwork below and above the regions at full canvas size', () => {
    const log = paint({ below: BELOW, above: ABOVE });
    const order = log.filter((entry) => entry.startsWith('image') || entry.startsWith('fill'));
    expect(order).toEqual([
      'image below',
      'fill #c8553d nonzero',
      'fill #3d7ac8 nonzero',
      'fill #2e8b57 evenodd',
      'image above',
    ]);
  });

  it('blends the artwork above in hard light, and only that artwork', () => {
    const log = paint({ below: BELOW, above: ABOVE, selectedRegionId: 'region-1' });
    const order = log
      .filter((entry) => /^(image|composite|stroke) /.test(entry))
      .map((entry) => entry.replace(/^stroke .*/, 'stroke'));
    expect(order).toEqual([
      'image below',
      'composite hard-light',
      'image above',
      'composite source-over',
      'stroke',
      'stroke',
    ]);
    expect(paint({ below: BELOW }).some((entry) => entry.startsWith('composite'))).toBe(false);
  });

  it('outlines the selected region last, with a constant on-screen width', () => {
    const log = paint({ selectedRegionId: 'region-1', above: ABOVE });
    const strokes = log.filter((entry) => entry.startsWith('stroke'));
    expect(strokes).toEqual([
      `stroke ${SELECTION_OUTLINE_COLORS.outer} ${String(SELECTION_OUTLINE_PX / 10)}`,
      `stroke ${SELECTION_OUTLINE_COLORS.inner} ${String(SELECTION_OUTLINE_PX / 3 / 10)}`,
    ]);
    expect(log.indexOf('image above')).toBeLessThan(log.indexOf(strokes[0] ?? ''));
  });

  it('draws no outline without a selection', () => {
    expect(paint().some((entry) => entry.startsWith('stroke'))).toBe(false);
  });

  it('paints each used tone on the scratch canvas, cuts it to its mask and lays it over', () => {
    const log = paint({
      paints: new Map([
        ['region-0', { base: { color: '#c8553d' }, shade: { color: '#5c4033' } }],
        ['region-1', { highlight: { color: '#f0e0d0' }, layer: { color: '#2e8b57' } }],
      ]),
      toneMasks: { layer: null, shade: SHADE, highlight: HIGHLIGHT },
      above: ABOVE,
    });
    const order = log.filter((entry) => /(image|composite|fill) /.test(entry));
    expect(order).toEqual([
      'fill #c8553d nonzero',
      'fill #3d7ac8 nonzero',
      'fill #2e8b57 evenodd',
      // No layer mask, so the layer paint is not drawn.
      'scratch: composite source-over',
      'scratch: fill #5c4033 nonzero',
      'scratch: composite destination-in',
      'scratch: image shade mask',
      'scratch: composite source-over',
      'image scratch',
      'scratch: composite source-over',
      'scratch: fill #f0e0d0 nonzero',
      'scratch: fill #f0e0d0 evenodd',
      'scratch: composite destination-in',
      'scratch: image highlight mask',
      'scratch: composite source-over',
      'image scratch',
      'composite hard-light',
      'image above',
      'composite source-over',
    ]);
  });

  it('skips tones that no region uses', () => {
    const log = paint({ toneMasks: { layer: SHADE, shade: SHADE, highlight: HIGHLIGHT } });
    expect(log.some((entry) => entry.startsWith('scratch: '))).toBe(false);
  });

  it('paints metallic regions flat when the drawing has no metal picture', () => {
    const log = paint({
      paints: new Map([['region-1', { base: { color: '#b27f34', metallic: true } }]]),
    });
    expect(log.some((entry) => entry.startsWith('scratch: '))).toBe(false);
  });
});
