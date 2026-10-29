import type { ParsedSvg, SvgRegion } from '../utils/svg/types';

/** The drawing's regions with these ids, in drawing order. */
export function selectedRegions(svg: ParsedSvg | null, ids: readonly string[]): SvgRegion[] {
  return svg?.regions.filter((region) => ids.includes(region.id)) ?? [];
}

/** How labels name the selection: a lone region by its name, several by their count. */
export function selectionName(regions: readonly SvgRegion[]): string {
  const [first] = regions;
  return regions.length === 1 && first !== undefined
    ? first.name
    : `${String(regions.length)} regions`;
}

/**
 * Whether a click adds or removes a region rather than selecting only it:
 * Shift, Ctrl or ⌘ is held, as in most drawing apps.
 */
export function isToggleClick(event: MouseEvent): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}
