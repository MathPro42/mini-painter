import { describe, expect, it } from 'vitest';
import selectionMapSvg from './fixtures/selection-map.svg?raw';
import toneMasksSvg from './fixtures/tone-masks.svg?raw';
import topLevelSvg from './fixtures/top-level-shapes.svg?raw';
import { parseSvg } from './parseSvg';
import { NO_TONE_MASKS } from './toneMasks';

const COVER_START = '<rect x="-1000000" y="-1000000" width="2000000" height="2000000"';

/** The fragment body after the shared `<defs>`, where the masked groups are. */
const afterDefs = (body: string | undefined): string => body?.split('</defs>')[1] ?? '';

describe('tone masks', () => {
  const parsed = parseSvg(toneMasksSvg);

  it('cover everything inside the masked parents of the Layer and Shade groups', () => {
    expect(afterDefs(parsed.toneMasks.layer?.body)).toBe(
      `<g class="cls-2"><g id="Layer">${COVER_START} style="fill:#fff;stroke:none;opacity:1"/></g></g>`,
    );
    expect(afterDefs(parsed.toneMasks.shade?.body)).toMatch(
      /^<g class="cls-3"><g id="Shade"><rect x="-1000000"/,
    );
  });

  it('keep the masks and styles they rely on', () => {
    const body = parsed.toneMasks.layer?.body ?? '';
    expect(body).toContain('<mask id="mask-layer"');
    expect(body).toContain('.cls-2{mask:url(#mask-layer);}');
    expect(parsed.toneMasks.layer?.namespaces).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('keep a mask set on the group itself, and the transforms above it', () => {
    expect(afterDefs(parsed.toneMasks.highlight?.body)).toMatch(
      /^<g transform="translate\(0 0\)"><g id="Highlight" mask="url\(#mask-highlight\)"><rect/,
    );
  });

  it('ignore tone groups that no mask limits, which would cover the whole model', () => {
    const unmasked = parseSvg(
      '<svg viewBox="0 0 10 10"><g id="Shade"><rect width="1" height="1"/></g>' +
        '<g id="selectionMap"><g id="part"><rect width="10" height="10"/></g></g></svg>',
    );
    expect(unmasked.toneMasks).toEqual(NO_TONE_MASKS);
  });

  it('open a self-closing tone group to hold the cover', () => {
    const selfClosing = parseSvg(
      '<svg viewBox="0 0 10 10"><defs><mask id="m"/></defs><g id="Highlight" mask="url(#m)"/>' +
        '<g id="selectionMap"><g id="part"><rect width="10" height="10"/></g></g></svg>',
    );
    expect(afterDefs(selfClosing.toneMasks.highlight?.body)).toMatch(
      /^<g id="Highlight" mask="url\(#m\)"><rect .*\/><\/g>$/,
    );
  });

  it('are found in sheets that only have some tone layers', () => {
    const sheet = parseSvg(selectionMapSvg);
    expect(sheet.toneMasks.layer).toBeNull();
    expect(sheet.toneMasks.shade).not.toBeNull();
    expect(sheet.toneMasks.highlight).not.toBeNull();
  });

  it('are not looked for in plain SVGs', () => {
    const plain = parseSvg(topLevelSvg);
    expect(plain.toneMasks).toEqual(NO_TONE_MASKS);
    expect(plain.metal).toBeNull();
  });
});

describe('metal artwork', () => {
  it('is the Met group without the empty mask that hides it', () => {
    const metal = parseSvg(toneMasksSvg).metal;
    expect(afterDefs(metal?.body)).toBe(
      '<g id="Met"><rect width="100" height="50" fill="#c0c0c0"/></g>',
    );
    expect(metal?.body).toContain('<defs>');
  });

  it('is absent from sheets without a metal layer', () => {
    expect(parseSvg(selectionMapSvg).metal).toBeNull();
  });
});
