import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { PAINT_STEP_LABELS, stepPaintFromPalette } from '../utils/paint/regionPaint';
import type { PaintStep, RegionPaint, StepPaint } from '../utils/paint/regionPaint';
import type { PaletteColor } from '../utils/palette/paletteColor';
import { filterPalette, groupPalette } from '../utils/palette/paletteList';
import type { SvgRegion } from '../utils/svg/types';
import { PaletteAddForm } from './PaletteAddForm';
import { PaletteControls } from './PaletteControls';
import { useSignalValue } from './useSignalValue';

interface PalettePanelProps {
  state: AppState;
}

/** Heading for colors without a group, shown when other colors have one. */
export const UNGROUPED_HEADING = 'Other';
export const NO_PALETTE_HINT =
  'Import a palette spreadsheet (.xlsx, .xls or .csv) or add colors below.';
export const EMPTY_PALETTE_HINT = 'This palette is empty. Add colors below.';
export const NOT_SAVED_WARNING =
  'This browser is not keeping your palettes, so they will be gone when you leave.';

/**
 * The user's palettes: choose, import, export and delete them, filter the
 * one in use by name, add colors, and click one to paint the selected region.
 */
export function PalettePanel({ state }: PalettePanelProps): JSX.Element {
  const palettes = useSignalValue(state.palettes);
  const active = useSignalValue(state.activePalette);
  const saved = useSignalValue(state.palettesSaved);
  const svg = useSignalValue(state.svg);
  const selectedId = useSignalValue(state.selectedRegionId);
  const paints = useSignalValue(state.regionPaints);
  const step = useSignalValue(state.activeStep);
  const region = svg?.regions.find((candidate) => candidate.id === selectedId) ?? null;
  const current = region === null ? undefined : currentPaint(region, paints.get(region.id), step);

  return (
    <aside class="panel panel--start" aria-labelledby="palette-panel-title">
      <h2 id="palette-panel-title" class="panel__title">
        Palettes <span class="panel__count">{palettes.length}</span>
      </h2>
      <PaletteControls state={state} />
      {!saved && palettes.length > 0 && (
        <p class="panel__hint is-warning" role="note">
          {NOT_SAVED_WARNING}
        </p>
      )}
      {active === null || active.colors.length === 0 ? (
        <p class="panel__hint">{active === null ? NO_PALETTE_HINT : EMPTY_PALETTE_HINT}</p>
      ) : (
        <PaletteBrowser
          state={state}
          palette={active.colors}
          region={region}
          step={step}
          current={current}
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
  /** The step a click paints. */
  step: PaintStep;
  /** What that step of the region is painted with now. */
  current: StepPaint | undefined;
}

/**
 * What a region's step is painted with: its paint, or for the Base of an
 * unpainted region, the drawing's own fill.
 */
function currentPaint(
  region: SvgRegion,
  paint: RegionPaint | undefined,
  step: PaintStep,
): StepPaint | undefined {
  const own = paint?.[step];
  if (own !== undefined || step !== 'base' || region.fill === null) {
    return own;
  }
  return { color: region.fill };
}

/** Whether a palette color is what a step is painted with. Unnamed paints match by color. */
function isCurrentColor(color: PaletteColor, current: StepPaint | undefined): boolean {
  return (
    current?.color === color.color && (current.name === undefined || current.name === color.name)
  );
}

/** The filter box and the grouped list of colors. */
function PaletteBrowser({
  state,
  palette,
  region,
  step,
  current,
}: PaletteBrowserProps): JSX.Element {
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
          ? 'Select a region, then pick a paint for it.'
          : `Pick a ${PAINT_STEP_LABELS[step]} paint for ${region.name}.`}
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
                  step={step}
                  isCurrent={isCurrentColor(color, current)}
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
  step: PaintStep;
  /** Whether the selected region's step already has this paint. */
  isCurrent: boolean;
}

function PaletteItem({ state, color, region, step, isCurrent }: PaletteItemProps): JSX.Element {
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
            state.setRegionStep(region.id, step, stepPaintFromPalette(color));
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
