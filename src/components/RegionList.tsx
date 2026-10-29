import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { StepPaint } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
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
  // The pointer type of the press that ends in the next click; keyboard presses have none.
  const pressRef = useRef<string | null>(null);
  const baseOf = (region: SvgRegion): StepPaint | null =>
    paints.get(region.id)?.base ?? (region.fill === null ? null : { color: region.fill });

  const onClick = (id: string, event: MouseEvent): void => {
    const pointer = pressRef.current;
    pressRef.current = null;
    if (pointer === 'touch' || pointer === 'pen' || isToggleClick(event)) {
      state.toggleRegion(id);
    } else {
      const isOnlySelected = selectedIds.length === 1 && selectedIds[0] === id;
      state.selectRegion(isOnlySelected ? null : id);
    }
  };

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
        <li key={region.id}>
          <button
            type="button"
            class="region-list__item"
            aria-pressed={selectedIds.includes(region.id)}
            onClick={(event) => {
              onClick(region.id, event);
            }}
          >
            <span {...swatchProps(baseOf(region))} aria-hidden="true" />
            <RegionText name={region.name} paint={paints.get(region.id)?.base?.name} />
          </button>
        </li>
      ))}
    </ul>
  );
}

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
