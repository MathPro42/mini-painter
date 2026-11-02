import { inflate, deflate } from '../deflate';
import { isRecord } from '../isRecord';
import { PAINT_STEPS, parseStepPaint } from '../paint/regionPaint';
import type { PaintStep, RegionPaint, StepPaint } from '../paint/regionPaint';
import { insertPngChunk, listPngChunks } from '../png/pngChunks';
import { decodeITxt, encodeITxt } from '../png/pngText';

/** Bump when the saved shape changes, and teach parseSavedWork to read the old one. */
export const SAVED_WORK_VERSION = 1;

/** The PNG text keyword the work is stored under. */
export const SAVED_WORK_KEYWORD = 'mini-painter';

const FORMAT = 'mini-painter-work';

/** What a saved PNG carries so the work can be opened again. */
export interface SavedWork {
  /** The drawing's original SVG markup. */
  readonly svgSource: string;
  /** Paints by region id. */
  readonly paints: ReadonlyMap<string, RegionPaint>;
}

/** Serializes saved work as versioned JSON. */
export function encodeSavedWork(work: SavedWork): string {
  return JSON.stringify({
    format: FORMAT,
    version: SAVED_WORK_VERSION,
    svg: work.svgSource,
    paints: Object.fromEntries(work.paints),
  });
}

/**
 * Reads what encodeSavedWork wrote. Throws a RangeError when the text is not
 * that format, or any paint in it is invalid: half a scheme is worse than an
 * error.
 */
export function parseSavedWork(text: string): SavedWork {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RangeError('The saved work is damaged');
  }
  if (!isRecord(data) || data['format'] !== FORMAT) {
    throw new RangeError('The saved work is damaged');
  }
  if (data['version'] !== SAVED_WORK_VERSION) {
    throw new RangeError('The work was saved by a newer version of Mini Painter');
  }
  const svgSource = data['svg'];
  const paints = data['paints'];
  if (typeof svgSource !== 'string' || !isRecord(paints)) {
    throw new RangeError('The saved work is damaged');
  }
  return {
    svgSource,
    paints: new Map(Object.entries(paints).map(([id, paint]) => [id, readRegionPaint(paint)])),
  };
}

/** A copy of `png` with `work` stored in a compressed `iTXt` chunk. */
export async function embedSavedWork(png: Uint8Array, work: SavedWork): Promise<Uint8Array> {
  const text = await deflate(new TextEncoder().encode(encodeSavedWork(work)), 'deflate');
  const chunk = encodeITxt({ keyword: SAVED_WORK_KEYWORD, compressed: true, text });
  return insertPngChunk(png, 'iTXt', chunk);
}

/**
 * Reads the work embedSavedWork stored in `png`. Throws a RangeError when
 * the PNG is corrupt, holds no saved work, or its work would expand past
 * `maxBytes`.
 */
export async function extractSavedWork(png: Uint8Array, maxBytes: number): Promise<SavedWork> {
  const texts = listPngChunks(png)
    .filter((chunk) => chunk.type === 'iTXt')
    .map((chunk) => decodeITxt(chunk.data));
  const found = texts.find((text) => text.keyword === SAVED_WORK_KEYWORD);
  if (found === undefined) {
    throw new RangeError('This PNG has no saved Mini Painter work');
  }
  const bytes = found.compressed
    ? await inflate(found.text, 'deflate', maxBytes, 'The saved work')
    : found.text;
  return parseSavedWork(new TextDecoder().decode(bytes));
}

function readRegionPaint(value: unknown): RegionPaint {
  if (!isRecord(value)) {
    throw new RangeError('The saved work is damaged');
  }
  const paint: Partial<Record<PaintStep, StepPaint>> = {};
  for (const [key, step] of Object.entries(value)) {
    if (!isPaintStep(key)) {
      throw new RangeError(`The saved work has an unknown paint step: "${key}"`);
    }
    paint[key] = parseStepPaint(readStepPaint(step));
  }
  return paint;
}

function readStepPaint(value: unknown): StepPaint {
  if (!isRecord(value)) {
    throw new RangeError('The saved work is damaged');
  }
  const { color, name, metallic, opacity } = value;
  if (
    typeof color !== 'string' ||
    !optional(name, 'string') ||
    !optional(metallic, 'boolean') ||
    !optional(opacity, 'number')
  ) {
    throw new RangeError('The saved work is damaged');
  }
  return {
    color,
    ...(typeof name === 'string' ? { name } : {}),
    ...(metallic === true ? { metallic } : {}),
    ...(typeof opacity === 'number' ? { opacity } : {}),
  };
}

function optional(value: unknown, type: 'string' | 'boolean' | 'number'): boolean {
  return value === undefined || typeof value === type;
}

function isPaintStep(key: string): key is PaintStep {
  return (PAINT_STEPS as readonly string[]).includes(key);
}
