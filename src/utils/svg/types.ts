import type { ToneStep } from '../paint/regionPaint';
import type { Bounds, FillRule, Ring } from './geometry';

/** The SVG's user coordinate system, from its `viewBox`. */
export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One filled outline, already transformed into viewBox coordinates. */
export interface SvgShape {
  readonly rings: readonly Ring[];
  readonly fillRule: FillRule;
  /** Original fill as `#rrggbb`, or `null` when the shape starts unpainted. */
  readonly fill: string | null;
  readonly bounds: Bounds;
}

/** A part of the drawing the user can paint as a whole. */
export interface SvgRegion {
  /** Stable key for this region within its document (`region-0`, `region-1`…). */
  readonly id: string;
  /** Human-readable name taken from the file, or a generated one. */
  readonly name: string;
  /** Fill of the region's first shape: its color before the user paints it. */
  readonly fill: string | null;
  /** Shapes in paint order; later shapes are drawn over earlier ones. */
  readonly shapes: readonly SvgShape[];
  readonly bounds: Bounds;
}

/**
 * Markup for part of the original drawing that is not paintable (background,
 * shading, line art). It is drawn as-is, below or above the region fills.
 */
export interface ArtworkFragment {
  /** `xmlns` declarations from the original root, ready to put in a start tag. */
  readonly namespaces: string;
  /** Inner markup, copied verbatim from the source. */
  readonly body: string;
}

/**
 * How regions were found:
 * - `selectionMap`: each child of the `selectionMap` group is one region.
 * - `topLevel`: each top-level element with a visible fill is one region.
 */
export type RegionLayout = 'selectionMap' | 'topLevel';

/**
 * Per tone step, artwork that renders opaque white where that tone shows on
 * the model (the sheet's mask for it), or `null` when the sheet has none.
 */
export type ToneMasks = Readonly<Record<ToneStep, ArtworkFragment | null>>;

export interface ParsedSvg {
  readonly viewBox: ViewBox;
  readonly layout: RegionLayout;
  /** In paint order: later regions are drawn over earlier ones. */
  readonly regions: readonly SvgRegion[];
  readonly artwork: {
    readonly below: ArtworkFragment | null;
    readonly above: ArtworkFragment | null;
  };
  /** Where Layer, Shade and Highlight paints show. Only paint-scheme sheets have them. */
  readonly toneMasks: ToneMasks;
  /** The sheet's picture of the model as bare metal, for metallic paints, or `null`. */
  readonly metal: ArtworkFragment | null;
}
