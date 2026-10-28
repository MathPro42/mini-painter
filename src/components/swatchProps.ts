import type { CSSProperties } from 'preact';
import { hexWithAlpha } from '../utils/color';

interface SwatchProps {
  readonly class: string;
  readonly style: CSSProperties;
}

/**
 * Class and style for a `.swatch` showing `paint`: hatched when there is
 * none, and over a checkerboard when it is see-through, so washes read as
 * washes in every list.
 */
export function swatchProps(
  paint: { readonly color: string; readonly opacity?: number } | null | undefined,
): SwatchProps {
  if (paint === null || paint === undefined) {
    return { class: 'swatch swatch--empty', style: {} };
  }
  if (paint.opacity === undefined) {
    return { class: 'swatch', style: { backgroundColor: paint.color } };
  }
  return {
    class: 'swatch swatch--see-through',
    style: { '--swatch-color': hexWithAlpha(paint.color, paint.opacity) },
  };
}
