import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import { PaintStepPicker } from './PaintStepPicker';
import { RegionList } from './RegionList';
import { selectedRegions } from './selection';
import { useSignalValue } from './useSignalValue';

interface RegionPanelProps {
  state: AppState;
}

export { UNPAINTED_INPUT_COLOR } from './PaintStepPicker';

export const MULTI_SELECT_HINT =
  'Shift- or Ctrl/⌘-click to select several regions. On a touch screen, tap them in the list.';

/**
 * Lists the drawing's regions and paints the selected ones, step by step.
 * Selecting here and clicking the drawing in the viewport share the same
 * state. A region with a named Base paint shows that name.
 */
export function RegionPanel({ state }: RegionPanelProps): JSX.Element | null {
  const svg = useSignalValue(state.svg);
  const selectedIds = useSignalValue(state.selectedRegionIds);
  const palette = useSignalValue(state.activePalette);
  if (svg === null) {
    return null;
  }
  const selected = selectedRegions(svg, selectedIds);
  const colors = palette?.colors ?? [];

  return (
    <aside class="panel" aria-labelledby="region-panel-title">
      <div class="panel__header">
        <h2 id="region-panel-title" class="panel__title">
          Regions <span class="panel__count">{svg.regions.length}</span>
        </h2>
        <button
          type="button"
          class="button button--small"
          disabled={colors.length === 0}
          title="Give every region a random Base paint from the palette in use"
          onClick={() => {
            state.randomizeRegions(colors);
          }}
        >
          Randomize
        </button>
      </div>
      <PaintStepPicker state={state} regions={selected} />
      <div class="region-selection" role="group" aria-label="Selection">
        <button
          type="button"
          class="button button--small"
          disabled={selected.length === svg.regions.length}
          onClick={() => {
            state.selectAllRegions();
          }}
        >
          Select all
        </button>
        <button
          type="button"
          class="button button--small"
          disabled={selected.length === 0}
          onClick={() => {
            state.selectRegion(null);
          }}
        >
          Clear selection
        </button>
      </div>
      <p class="panel__hint">{MULTI_SELECT_HINT}</p>
      <RegionList state={state} regions={svg.regions} selectedIds={selectedIds} />
    </aside>
  );
}
