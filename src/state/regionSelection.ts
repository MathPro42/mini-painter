import { signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import type { ParsedSvg } from '../utils/svg/types';

/** Which regions of the drawing are selected; painting applies to all of them. */
export interface RegionSelection {
  /** Ids of the selected regions, in drawing order. Empty when nothing is selected. */
  readonly selectedRegionIds: ReadonlySignal<readonly string[]>;
  /**
   * Selects only this region, or clears the selection with `null`. Throws a
   * RangeError for unknown ids.
   */
  selectRegion: (id: string | null) => void;
  /** Adds a region to the selection, or removes it. Throws a RangeError for unknown ids. */
  toggleRegion: (id: string) => void;
  /** Selects every region of the drawing. */
  selectAllRegions: () => void;
}

export interface OwnedRegionSelection extends RegionSelection {
  /** Empties the selection; the owner calls it when another drawing loads. */
  readonly clear: () => void;
}

/** Returns `id` when the drawing has a region with that id. Throws a RangeError otherwise. */
export function requireRegion(svg: ParsedSvg | null, id: string): string {
  if (svg?.regions.some((region) => region.id === id) !== true) {
    throw new RangeError(`No region with id "${id}" in the current SVG`);
  }
  return id;
}

/** Creates the selection of regions in the drawing that `svg` holds. */
export function createRegionSelection(svg: ReadonlySignal<ParsedSvg | null>): OwnedRegionSelection {
  const selectedRegionIds = signal<readonly string[]>([]);
  const regionIds = (keep: (id: string) => boolean): string[] =>
    (svg.peek()?.regions ?? []).map((region) => region.id).filter(keep);

  return {
    selectedRegionIds,
    selectRegion: (id) => {
      selectedRegionIds.value = id === null ? [] : [requireRegion(svg.peek(), id)];
    },
    toggleRegion: (id) => {
      requireRegion(svg.peek(), id);
      const ids = new Set(selectedRegionIds.peek());
      if (!ids.delete(id)) {
        ids.add(id);
      }
      selectedRegionIds.value = regionIds((candidate) => ids.has(candidate));
    },
    selectAllRegions: () => {
      selectedRegionIds.value = regionIds(() => true);
    },
    clear: () => {
      selectedRegionIds.value = [];
    },
  };
}
