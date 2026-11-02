import type { History } from '../history';
import { isRecord } from '../isRecord';
import type { RegionPaint } from '../paint/regionPaint';
import { parseSavedRegionPaint } from './savedWork';

type RegionPaints = ReadonlyMap<string, RegionPaint>;

/** Bump when the saved shape changes, and teach parseAutosavedHistory to read the old one. */
export const AUTOSAVE_VERSION = 1;

const FORMAT = 'mini-painter-autosave';

/**
 * Serializes an undo history of region paints as versioned JSON. Snapshots
 * share their unchanged region paints, so each distinct paint is written
 * once and snapshots refer to it by index: 200 undo steps stay small.
 */
export function encodeAutosavedHistory(history: History<RegionPaints>): string {
  const indices = new Map<RegionPaint, number>();
  const paints: RegionPaint[] = [];
  const snapshot = (map: RegionPaints): Record<string, number> => {
    const entry: Record<string, number> = {};
    for (const [id, paint] of map) {
      let index = indices.get(paint);
      if (index === undefined) {
        index = paints.length;
        indices.set(paint, index);
        paints.push(paint);
      }
      entry[id] = index;
    }
    return entry;
  };
  return JSON.stringify({
    format: FORMAT,
    version: AUTOSAVE_VERSION,
    past: history.past.map(snapshot),
    present: snapshot(history.present),
    future: history.future.map(snapshot),
    paints,
  });
}

/**
 * Reads what encodeAutosavedHistory wrote. Throws a RangeError when the text
 * is not that format or anything in it is invalid. Region ids are not
 * checked here: that needs the drawing.
 */
export function parseAutosavedHistory(text: string): History<RegionPaints> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw damaged();
  }
  if (!isRecord(data) || data['format'] !== FORMAT || data['version'] !== AUTOSAVE_VERSION) {
    throw damaged();
  }
  const { past, present, future, paints } = data;
  if (!Array.isArray(past) || !Array.isArray(future) || !Array.isArray(paints)) {
    throw damaged();
  }
  const table = paints.map(parseSavedRegionPaint);
  const snapshot = (value: unknown): RegionPaints => readSnapshot(value, table);
  return { past: past.map(snapshot), present: snapshot(present), future: future.map(snapshot) };
}

function readSnapshot(value: unknown, table: readonly RegionPaint[]): RegionPaints {
  if (!isRecord(value)) {
    throw damaged();
  }
  const map = new Map<string, RegionPaint>();
  for (const [id, index] of Object.entries(value)) {
    const paint = typeof index === 'number' ? table[index] : undefined;
    if (paint === undefined) {
      throw damaged();
    }
    map.set(id, paint);
  }
  return map;
}

function damaged(): RangeError {
  return new RangeError('The autosaved work is damaged');
}
