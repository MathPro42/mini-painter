import type { SvgCanvasContext } from '../rendering/canvasPaths';

const style = (value: unknown): string => (typeof value === 'string' ? value : 'gradient');

/** The fill rule of a `fill(rule)` or `fill(path, rule)` call. */
const ruleOf = (first: unknown, second: unknown): string =>
  String(typeof first === 'string' ? first : second);

/**
 * A stand-in for the browser's Path2D, missing in Node. It keeps its commands
 * as text ("M10,0 L20,0 Z"), so tests can check the paths that get built.
 * Install it with `vi.stubGlobal('Path2D', RecordingPath)`.
 */
export class RecordingPath {
  readonly commands: string[] = [];

  moveTo(x: number, y: number): void {
    this.commands.push(`M${String(x)},${String(y)}`);
  }

  lineTo(x: number, y: number): void {
    this.commands.push(`L${String(x)},${String(y)}`);
  }

  closePath(): void {
    this.commands.push('Z');
  }

  addPath(path: RecordingPath): void {
    this.commands.push(...path.commands);
  }

  toString(): string {
    return this.commands.join(' ');
  }
}

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
    clip: (first?: unknown, second?: unknown) => record(`clip ${ruleOf(first, second)}`),
    setTransform: (...args: unknown[]) => record(`transform ${args.join(',')}`),
    clearRect: () => record('clear'),
    drawImage: (image: unknown) => record(`image ${options.imageNames.get(image) ?? 'unknown'}`),
    fill: (first?: unknown, second?: unknown) =>
      record(`fill ${style(ctx.fillStyle)} ${ruleOf(first, second)}`),
    stroke: () => record(`stroke ${style(ctx.strokeStyle)} ${String(ctx.lineWidth)}`),
    setLineDash: () => record('dash'),
  };
  return { ctx, log };
}
