import { describe, expect, it } from 'vitest';
import { parseSvg } from '../utils/svg/parseSvg';
import type { SvgCanvasContext, SvgPaintInput } from './paintSvg';
import { paintSvg, SELECTION_OUTLINE_COLORS, SELECTION_OUTLINE_PX } from './paintSvg';

const style = (value: unknown): string => (typeof value === 'string' ? value : 'gradient');

/**
 * Records each call (and each fill or stroke with the style in effect) as a
 * short string, plus each change of composite operation.
 */
function recordingContext(): { ctx: SvgCanvasContext; log: string[] } {
  const log: string[] = [];
  let composite: GlobalCompositeOperation = 'source-over';
  const ctx: SvgCanvasContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(operation: GlobalCompositeOperation) {
      composite = operation;
      log.push(`composite ${operation}`);
    },
    setTransform: (...args: unknown[]) => log.push(`transform ${args.join(',')}`),
    clearRect: () => log.push('clear'),
    drawImage: (image: unknown) => log.push(`image ${image === BELOW ? 'below' : 'above'}`),
    beginPath: () => log.push('begin'),
    moveTo: (x: number, y: number) => log.push(`move ${String(x)},${String(y)}`),
    lineTo: () => log.push('line'),
    closePath: () => log.push('close'),
    fill: (rule?: unknown) => log.push(`fill ${style(ctx.fillStyle)} ${String(rule)}`),
    stroke: () => log.push(`stroke ${style(ctx.strokeStyle)} ${String(ctx.lineWidth)}`),
    setLineDash: () => log.push('dash'),
  };
  return { ctx, log };
}

const BELOW = {} as HTMLImageElement;
const ABOVE = {} as HTMLImageElement;

// Two regions in a 20 × 10 viewBox offset by (10, 0). "pair" holds two shapes with their own fills.
const SVG = parseSvg(
  '<svg viewBox="10 0 20 10"><rect id="solo" x="10" width="10" height="10" fill="#c8553d"/>' +
    '<g id="pair"><rect x="20" width="5" height="10" fill="#3d7ac8"/><rect x="25" width="5" height="10" fill-rule="evenodd" fill="#2e8b57"/></g></svg>',
);

const paint = (overrides: Partial<SvgPaintInput> = {}): string[] => {
  const { ctx, log } = recordingContext();
  paintSvg(ctx, 200, 100, {
    svg: SVG,
    colors: new Map(),
    selectedRegionId: null,
    below: null,
    above: null,
    ...overrides,
  });
  return log;
};

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
    const log = paint({ colors: new Map([['region-1', '#ffffff']]) });
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
    expect(paint({ svg: unpainted, colors: new Map([['region-0', '#000000']]) })).toContain(
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
});
