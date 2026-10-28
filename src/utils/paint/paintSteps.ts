/**
 * The four steps of painting a part, in the order they go on: a base coat,
 * a layer over it, a shade in the recesses and a highlight on the edges.
 */
export type PaintStep = 'base' | ToneStep;

/** The steps after the base coat, each shown only where the drawing's mask for it allows. */
export type ToneStep = 'layer' | 'shade' | 'highlight';

export const TONE_STEPS: readonly ToneStep[] = ['layer', 'shade', 'highlight'];
export const PAINT_STEPS: readonly PaintStep[] = ['base', ...TONE_STEPS];

/** Display names, also used in hints ("Pick a Shade paint"). */
export const PAINT_STEP_LABELS: Readonly<Record<PaintStep, string>> = {
  base: 'Base',
  layer: 'Layer',
  shade: 'Shade',
  highlight: 'Highlight',
};
