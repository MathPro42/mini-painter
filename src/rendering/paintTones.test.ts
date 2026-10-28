import { describe, expect, it } from 'vitest';
import type { RegionPaint } from '../utils/paint/regionPaint';
import { parseSvg } from '../utils/svg/parseSvg';
import { recordingContext } from '../test/recordingCanvas';
import type { CanvasFrame } from './canvasPaths';
import {
  METAL_BLEND,
  WASH_BLEND,
  NO_TONE_MASK_IMAGES,
  paintMetal,
  paintShading,
  paintTones,
} from './paintTones';
import type { ToneInput } from './paintTones';

const ABOVE = {} as HTMLImageElement;
const LAYER = {} as HTMLImageElement;
const SHADE = {} as HTMLImageElement;
const HIGHLIGHT = {} as HTMLImageElement;
const METAL = {} as HTMLImageElement;
const SCRATCH_CANVAS = {} as HTMLCanvasElement;
const IMAGE_NAMES = new Map<unknown, string>([
  [ABOVE, 'above'],
  [LAYER, 'layer mask'],
  [SHADE, 'shade mask'],
  [HIGHLIGHT, 'highlight mask'],
  [METAL, 'metal'],
  [SCRATCH_CANVAS, 'scratch'],
]);

// "solo" is one shape; "pair" is two shapes, the second with an even-odd fill rule.
const SVG = parseSvg(
  '<svg viewBox="0 0 20 10"><rect id="solo" width="10" height="10" fill="#c8553d"/>' +
    '<g id="pair"><rect x="10" width="5" height="10" fill="#3d7ac8"/><rect x="15" width="5" height="10" fill-rule="evenodd" fill="#2e8b57"/></g></svg>',
);
const FRAME: CanvasFrame = { width: 200, height: 100, viewBox: SVG.viewBox };
const GOLD = { color: '#b27f34', name: 'gold', metallic: true } as const;
const STEEL = { color: '#8a8a8a', name: 'steel', metallic: true } as const;
const RED = { color: '#c8553d', name: 'red' } as const;
const WASH = { color: '#5c4033', name: 'umber wash', opacity: 0.6 } as const;

type Pass = typeof paintMetal;

/** Runs one pass and returns the draw-related entries of both canvases' shared log. */
const run = (pass: Pass, paints: [string, RegionPaint][], overrides: Partial<ToneInput> = {}) => {
  const { ctx, log } = recordingContext({ imageNames: IMAGE_NAMES, canvas: SCRATCH_CANVAS });
  const { ctx: scratch } = recordingContext({
    log,
    prefix: 'scratch: ',
    imageNames: IMAGE_NAMES,
    canvas: SCRATCH_CANVAS,
  });
  pass(ctx, scratch, FRAME, {
    regions: SVG.regions,
    paints: new Map(paints),
    toneMasks: NO_TONE_MASK_IMAGES,
    metal: METAL,
    ...overrides,
  });
  return log.filter((entry) => /(image|composite|fill|clip|save|restore) /.test(`${entry} `));
};

describe('paintMetal', () => {
  it('blends the metal picture into the paint inside each shape, one clip at a time', () => {
    expect(run(paintMetal, [['region-1', { base: GOLD }]])).toEqual([
      'scratch: composite source-over',
      'scratch: fill #b27f34 nonzero',
      'scratch: fill #b27f34 evenodd',
      `scratch: composite ${METAL_BLEND}`,
      'scratch: save',
      'scratch: clip nonzero',
      'scratch: image metal',
      'scratch: restore',
      'scratch: save',
      'scratch: clip evenodd',
      'scratch: image metal',
      'scratch: restore',
      'scratch: composite source-over',
      'image scratch',
    ]);
  });

  it('never cuts with destination-in, which would erase every shape but the last', () => {
    const log = run(paintMetal, [
      ['region-0', { base: GOLD }],
      ['region-1', { base: STEEL }],
    ]);
    expect(log.filter((entry) => entry.includes('destination-in'))).toEqual([]);
    expect(log.filter((entry) => entry === 'scratch: image metal')).toHaveLength(3);
  });

  it('does nothing without a metal picture or a metallic Base', () => {
    expect(run(paintMetal, [['region-0', { base: GOLD }]], { metal: null })).toEqual([]);
    expect(run(paintMetal, [['region-0', { base: RED, layer: STEEL }]])).toEqual([]);
  });
});

describe('paintTones', () => {
  it('paints metallic tones as metal through their mask, after the flat ones', () => {
    const log = run(
      paintTones,
      [
        ['region-0', { base: RED, layer: RED }],
        ['region-1', { base: GOLD, layer: STEEL }],
      ],
      { toneMasks: { layer: LAYER, shade: null, highlight: null } },
    );
    expect(log).toEqual([
      'scratch: composite source-over',
      'scratch: fill #c8553d nonzero',
      'scratch: composite destination-in',
      'scratch: image layer mask',
      'scratch: composite source-over',
      'image scratch',
      'scratch: composite source-over',
      'scratch: fill #8a8a8a nonzero',
      'scratch: fill #8a8a8a evenodd',
      `scratch: composite ${METAL_BLEND}`,
      'scratch: save',
      'scratch: clip nonzero',
      'scratch: image metal',
      'scratch: restore',
      'scratch: save',
      'scratch: clip evenodd',
      'scratch: image metal',
      'scratch: restore',
      'scratch: composite destination-in',
      'scratch: image layer mask',
      'scratch: composite source-over',
      'image scratch',
    ]);
  });

  it('paints metallic tones flat when there is no metal picture', () => {
    const log = run(paintTones, [['region-0', { highlight: STEEL }]], {
      metal: null,
      toneMasks: { layer: null, shade: null, highlight: HIGHLIGHT },
    });
    expect(log).toContain('scratch: fill #8a8a8a nonzero');
    expect(log.some((entry) => entry.includes('metal'))).toBe(false);
  });

  it('multiplies a wash into the paint under it, after the flat paints', () => {
    const log = run(
      paintTones,
      [
        ['region-0', { base: RED, shade: WASH }],
        ['region-1', { shade: RED }],
      ],
      { toneMasks: { layer: null, shade: SHADE, highlight: null } },
    );
    expect(log).toEqual([
      'scratch: composite source-over',
      'scratch: fill #c8553d nonzero',
      'scratch: fill #c8553d evenodd',
      'scratch: composite destination-in',
      'scratch: image shade mask',
      'scratch: composite source-over',
      'image scratch',
      'scratch: composite source-over',
      'scratch: fill #5c4033 nonzero',
      'scratch: composite destination-in',
      'scratch: image shade mask',
      'scratch: composite source-over',
      `composite ${WASH_BLEND}`,
      'image scratch',
      'composite source-over',
    ]);
  });

  it('skips steps without a mask', () => {
    expect(run(paintTones, [['region-0', { highlight: STEEL, shade: RED }]])).toEqual([]);
  });
});

describe('paintShading', () => {
  const shade = (paints: [string, RegionPaint][], overrides: Partial<ToneInput> = {}) =>
    run(
      (ctx, scratch, frame, input) => {
        paintShading(ctx, scratch, frame, input, ABOVE);
      },
      paints,
      overrides,
    );

  it('blends the artwork straight over the drawing when nothing is metal', () => {
    expect(shade([['region-0', { base: RED, highlight: STEEL }]])).toEqual([
      'composite hard-light',
      'image above',
      'composite source-over',
    ]);
  });

  it('leaves the shading off regions with a metallic Base', () => {
    expect(shade([['region-1', { base: GOLD }]])).toEqual([
      'scratch: composite source-over',
      'scratch: image above',
      'scratch: composite destination-out',
      'scratch: fill #000000 nonzero',
      'scratch: fill #000000 evenodd',
      'scratch: composite source-over',
      'composite hard-light',
      'image scratch',
      'composite source-over',
    ]);
  });

  it('keeps the shading on metallic regions when there is no metal picture to replace it', () => {
    expect(shade([['region-1', { base: GOLD }]], { metal: null })).toEqual([
      'composite hard-light',
      'image above',
      'composite source-over',
    ]);
  });
});
