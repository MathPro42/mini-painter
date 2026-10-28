import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import { paletteNamesByColor } from '../utils/palette/paletteList';
import type { SvgRegion } from '../utils/svg/types';
import { useSignalValue } from './useSignalValue';

interface RegionPanelProps {
  state: AppState;
}

/** What the color input shows for a region that has no color yet. */
export const UNPAINTED_INPUT_COLOR = '#808080';

/**
 * Lists the drawing's regions and paints the selected one. Selecting here
 * and clicking the drawing in the viewport share the same state. A region
 * painted with a palette color shows that color's name.
 */
export function RegionPanel({ state }: RegionPanelProps): JSX.Element | null {
  const svg = useSignalValue(state.svg);
  const colors = useSignalValue(state.regionColors);
  const selectedId = useSignalValue(state.selectedRegionId);
  const palette = useSignalValue(state.palette);
  if (svg === null) {
    return null;
  }
  const colorOf = (region: SvgRegion): string | null => colors.get(region.id) ?? region.fill;
  const paintNames = paletteNamesByColor(palette);
  const paintOf = (region: SvgRegion): string | undefined => {
    const color = colorOf(region);
    return color === null ? undefined : paintNames.get(color);
  };
  const selected = svg.regions.find((region) => region.id === selectedId) ?? null;

  return (
    <aside class="panel" aria-labelledby="region-panel-title">
      <h2 id="region-panel-title" class="panel__title">
        Regions <span class="panel__count">{svg.regions.length}</span>
      </h2>
      <ColorField state={state} region={selected} color={selected && colorOf(selected)} />
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
              <span
                class={colorOf(region) === null ? 'swatch swatch--empty' : 'swatch'}
                style={{ backgroundColor: colorOf(region) ?? 'transparent' }}
                aria-hidden="true"
              />
              <span class="region-list__text">
                <span class="region-list__name">{region.name}</span>
                {paintOf(region) !== undefined && (
                  // The space keeps screen readers from running the two names together.
                  <>
                    {' '}
                    <span class="region-list__paint">{paintOf(region)}</span>
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface ColorFieldProps {
  state: AppState;
  region: SvgRegion | null;
  color: string | null;
}

function ColorField({ state, region, color }: ColorFieldProps): JSX.Element {
  return (
    <label class="color-field">
      <span>{region === null ? 'Select a region to paint it' : `Color of ${region.name}`}</span>
      <input
        type="color"
        class="color-field__input"
        value={color ?? UNPAINTED_INPUT_COLOR}
        disabled={region === null}
        // While the picker is open, colors only preview; closing it records one undo step.
        onInput={(event) => {
          if (region !== null) {
            state.previewRegionColor(region.id, event.currentTarget.value);
          }
        }}
        onChange={(event) => {
          if (region !== null) {
            state.setRegionColor(region.id, event.currentTarget.value);
          }
        }}
      />
    </label>
  );
}
