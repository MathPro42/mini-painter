import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import type { StepPaint } from '../utils/paint/regionPaint';
import type { SvgRegion } from '../utils/svg/types';
import { PaintStepPicker } from './PaintStepPicker';
import { swatchProps } from './swatchProps';
import { useSignalValue } from './useSignalValue';

interface RegionPanelProps {
  state: AppState;
}

export { UNPAINTED_INPUT_COLOR } from './PaintStepPicker';

/**
 * Lists the drawing's regions and paints the selected one, step by step.
 * Selecting here and clicking the drawing in the viewport share the same
 * state. A region with a named Base paint shows that name.
 */
export function RegionPanel({ state }: RegionPanelProps): JSX.Element | null {
  const svg = useSignalValue(state.svg);
  const paints = useSignalValue(state.regionPaints);
  const selectedId = useSignalValue(state.selectedRegionId);
  const palette = useSignalValue(state.activePalette);
  if (svg === null) {
    return null;
  }
  const baseOf = (region: SvgRegion): StepPaint | null =>
    paints.get(region.id)?.base ?? (region.fill === null ? null : { color: region.fill });
  const selected = svg.regions.find((region) => region.id === selectedId) ?? null;
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
      <PaintStepPicker state={state} region={selected} />
      <ul class="region-list">
        {svg.regions.map((region) => (
          <li key={region.id}>
            <button
              type="button"
              class="region-list__item"
              aria-pressed={region.id === selectedId}
              onClick={() => {
                state.selectRegion(region.id === selectedId ? null : region.id);
              }}
            >
              <span {...swatchProps(baseOf(region))} aria-hidden="true" />
              <RegionText name={region.name} paint={paints.get(region.id)?.base?.name} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
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
