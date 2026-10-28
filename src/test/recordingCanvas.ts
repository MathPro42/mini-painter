import type { SvgCanvasContext } from '../rendering/canvasPaths';

const style = (value: unknown): string => (typeof value === 'string' ? value : 'gradient');

export interface RecordingOptions {
  /** Shared log, so two canvases can record into one sequence. */
  readonly log?: string[];
  /** Put before every entry, such as "scratch: ". */
  readonly prefix?: string;
  /** Names drawImage logs for known images ("image metal"); others log as "unknown". */
  readonly imageNames: ReadonlyMap<unknown, string>;
  /** What the fake's `canvas` property returns. */
  readonly canvas: HTMLCanvasElement;
}

/**
 * A canvas 2D fake for paint tests. Each call is logged as a short string
 * (each fill and stroke with the style in effect), plus every change of
 * composite operation.
 */
export function recordingContext(options: RecordingOptions): {
  ctx: SvgCanvasContext;
  log: string[];
} {
  const log = options.log ?? [];
  const record = (entry: string): number => log.push((options.prefix ?? '') + entry);
  let composite: GlobalCompositeOperation = 'source-over';
  const ctx: SvgCanvasContext = {
    canvas: options.canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(operation: GlobalCompositeOperation) {
      composite = operation;
      record(`composite ${operation}`);
    },
    save: () => record('save'),
    restore: () => record('restore'),
    clip: (rule?: unknown) => record(`clip ${String(rule)}`),
    setTransform: (...args: unknown[]) => record(`transform ${args.join(',')}`),
    clearRect: () => record('clear'),
    drawImage: (image: unknown) => record(`image ${options.imageNames.get(image) ?? 'unknown'}`),
    beginPath: () => record('begin'),
    moveTo: (x: number, y: number) => record(`move ${String(x)},${String(y)}`),
    lineTo: () => record('line'),
    closePath: () => record('close'),
    fill: (rule?: unknown) => record(`fill ${style(ctx.fillStyle)} ${String(rule)}`),
    stroke: () => record(`stroke ${style(ctx.strokeStyle)} ${String(ctx.lineWidth)}`),
    setLineDash: () => record('dash'),
  };
  return { ctx, log };
}
