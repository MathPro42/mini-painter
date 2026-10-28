import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import type { PaletteColor } from '../utils/palette/paletteColor';
import { filterPalette, groupPalette } from '../utils/palette/paletteList';
import type { SvgRegion } from '../utils/svg/types';
import { PaletteAddForm } from './PaletteAddForm';
import { PaletteFileControls } from './PaletteFileControls';
import { useSignalValue } from './useSignalValue';

interface PalettePanelProps {
  state: AppState;
}

/** Heading for colors without a group, shown when other colors have one. */
export const UNGROUPED_HEADING = 'Other';

/**
 * The user's palette: import, export and add colors, filter them by name,
 * and click one to paint the selected region with it.
 */
export function PalettePanel({ state }: PalettePanelProps): JSX.Element {
  const palette = useSignalValue(state.palette);
  const svg = useSignalValue(state.svg);
  const selectedId = useSignalValue(state.selectedRegionId);
  const regionColors = useSignalValue(state.regionColors);
  const region = svg?.regions.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <aside class="panel panel--start" aria-labelledby="palette-panel-title">
      <h2 id="palette-panel-title" class="panel__title">
        Palette <span class="panel__count">{palette.length}</span>
      </h2>
      <PaletteFileControls state={state} />
      {palette.length === 0 ? (
        <p class="panel__hint">
          Import a palette spreadsheet (.xlsx, .xls or .csv) or add colors below.
        </p>
      ) : (
        <PaletteBrowser
          state={state}
          palette={palette}
          region={region}
          regionColor={region === null ? null : (regionColors.get(region.id) ?? region.fill)}
        />
      )}
      <PaletteAddForm state={state} />
    </aside>
  );
}

interface PaletteBrowserProps {
  state: AppState;
  palette: readonly PaletteColor[];
  /** The selected region, which a click paints. */
  region: SvgRegion | null;
  regionColor: string | null;
}

/** The filter box and the grouped list of colors. */
function PaletteBrowser({ state, palette, region, regionColor }: PaletteBrowserProps): JSX.Element {
  const [query, setQuery] = useState('');
  const visible = filterPalette(palette, query);
  const groups = groupPalette(visible);
  const showHeadings = groups.some((group) => group.group !== null);

  return (
    <>
      <input
        type="search"
        class="palette-filter"
        aria-label="Filter colors by name"
        placeholder="Filter by name"
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      <p class="panel__hint">
        {region === null
          ? 'Select a region, then pick a color for it.'
          : `Pick a color for ${region.name}.`}
      </p>
      <div class="palette-list">
        {groups.map(({ group, colors }) => (
          <section key={group ?? ''} class="palette-group">
            {showHeadings && <h3 class="palette-group__title">{group ?? UNGROUPED_HEADING}</h3>}
            <ul class="palette-group__colors">
              {colors.map((color) => (
                <PaletteItem
                  key={`${color.name}\n${color.color}`}
                  state={state}
                  color={color}
                  region={region}
                  isCurrent={color.color === regionColor}
                />
              ))}
            </ul>
          </section>
        ))}
        {visible.length === 0 && <p class="panel__hint">No color names match “{query}”.</p>}
      </div>
    </>
  );
}

interface PaletteItemProps {
  state: AppState;
  color: PaletteColor;
  region: SvgRegion | null;
  /** Whether the selected region already has this color. */
  isCurrent: boolean;
}

function PaletteItem({ state, color, region, isCurrent }: PaletteItemProps): JSX.Element {
  return (
    <li class="palette-item">
      <button
        type="button"
        class="palette-item__paint"
        title={color.color}
        disabled={region === null}
        aria-current={isCurrent}
        onClick={() => {
          if (region !== null) {
            state.setRegionColor(region.id, color.color);
          }
        }}
      >
        <span class="swatch" style={{ backgroundColor: color.color }} aria-hidden="true" />
        <span class="palette-item__name">{color.name}</span>
      </button>
      <button
        type="button"
        class="palette-item__remove"
        aria-label={`Remove ${color.name}`}
        title="Remove from palette"
        onClick={() => {
          state.removePaletteColor(color);
        }}
      >
        ×
      </button>
    </li>
  );
}
