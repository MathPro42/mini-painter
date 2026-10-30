import type { JSX } from 'preact';
import { useCallback, useMemo, useRef } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { RegionPaint, StepPaint } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
import { memo } from './memo';
import { isToggleClick } from './selection';
import { swatchProps } from './swatchProps';
import { useSignalValue } from './useSignalValue';

interface RegionListProps {
  state: AppState;
  regions: readonly SvgRegion[];
  selectedIds: readonly string[];
}

/**
 * The drawing's regions as toggle buttons, each with its Base. A click
 * selects only that region, or deselects it when it is the only one. Shift-,
 * Ctrl- or ⌘-click adds or removes it instead, and so does every tap on a
 * touch screen, which has no keys to hold.
 */
export function RegionList({ state, regions, selectedIds }: RegionListProps): JSX.Element {
  const paints = useSignalValue(state.regionPaints);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  // The pointer type of the press that ends in the next click; keyboard presses have none.
  const pressRef = useRef<string | null>(null);
  // Reads the selection when clicked, so the handler stays the same and items can skip renders.
  const onPress = useCallback(
    (id: string, event: MouseEvent): void => {
      const pointer = pressRef.current;
      pressRef.current = null;
      if (pointer === 'touch' || pointer === 'pen' || isToggleClick(event)) {
        state.toggleRegion(id);
        return;
      }
      const current = state.selectedRegionIds.peek();
      const isOnlySelected = current.length === 1 && current[0] === id;
      state.selectRegion(isOnlySelected ? null : id);
    },
    [state],
  );

  return (
    <ul
      class="region-list"
      onPointerDown={(event) => {
        pressRef.current = event.pointerType;
      }}
      onPointerCancel={() => {
        pressRef.current = null;
      }}
    >
      {regions.map((region) => (
        <RegionItem
          key={region.id}
          region={region}
          paint={paints.get(region.id)}
          isSelected={selected.has(region.id)}
          onPress={onPress}
        />
      ))}
    </ul>
  );
}

interface RegionItemProps {
  region: SvgRegion;
  /** The paints the user applied; the same object until this region's paint changes. */
  paint: RegionPaint | undefined;
  isSelected: boolean;
  onPress: (id: string, event: MouseEvent) => void;
}

/** One region with its Base; it renders again only when its paint or selection changes. */
const RegionItem = memo(function RegionItem({
  region,
  paint,
  isSelected,
  onPress,
}: RegionItemProps): JSX.Element {
  const base: StepPaint | null =
    paint?.base ?? (region.fill === null ? null : { color: region.fill });
  return (
    <li>
      <button
        type="button"
        class="region-list__item"
        aria-pressed={isSelected}
        onClick={(event) => {
          onPress(region.id, event);
        }}
      >
        <span {...swatchProps(base)} aria-hidden="true" />
        <RegionText name={region.name} paint={paint?.base?.name} />
      </button>
    </li>
  );
});

function RegionText({ name, paint }: { name: string; paint: string | undefined }): JSX.Element {
  return (
    <span class="region-list__text">
      <span class="region-list__name">{name}</span>
      {paint !== undefined && (
        // The space keeps screen readers from running the two names together.
        <>
          {' '}
          <span class="region-list__paint">{paint}</span>
        </>
      )}
    </span>
  );
}
