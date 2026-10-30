import { describe, expect, it, vi } from 'vitest';
import { RecordingPath } from '../test/recordingCanvas';
import { parseSvg } from '../utils/svg/parseSvg';
import { regionPath, shapePath } from './canvasPaths';

vi.stubGlobal('Path2D', RecordingPath);

/** The commands of a path built while Path2D is the recording stand-in. */
const text = (path: Path2D): string => (path as unknown as RecordingPath).toString();

// One region of two squares; the second has a hole, so it has two rings.
const SVG = parseSvg(
  '<svg viewBox="0 0 30 10"><g id="selectionMap"><g id="pair"><rect width="10" height="10"/>' +
    '<path d="M20 0H30V10H20Z M22 2H28V8H22Z" fill-rule="evenodd"/></g></g></svg>',
);
const region = SVG.regions[0];
const [square, ring] = region?.shapes ?? [];
if (region === undefined || square === undefined || ring === undefined) {
  throw new Error('expected one region of two shapes');
}

describe('shapePath', () => {
  it('traces every ring of a shape, in viewBox units', () => {
    expect(text(shapePath(square))).toBe('M0,0 L10,0 L10,10 L0,10 Z');
    expect(text(shapePath(ring))).toBe('M20,0 L30,0 L30,10 L20,10 Z M22,2 L28,2 L28,8 L22,8 Z');
  });

  it('builds each path once and reuses it', () => {
    expect(shapePath(ring)).toBe(shapePath(ring));
  });
});

describe('regionPath', () => {
  it('joins the paths of every shape of the region, once', () => {
    const path = regionPath(region);
    expect(text(path)).toBe(
      'M0,0 L10,0 L10,10 L0,10 Z M20,0 L30,0 L30,10 L20,10 Z M22,2 L28,2 L28,8 L22,8 Z',
    );
    expect(regionPath(region)).toBe(path);
  });
});
