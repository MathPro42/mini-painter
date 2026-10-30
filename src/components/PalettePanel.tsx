import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { AppState } from '../state/appState';
import { rgbaText } from '../utils/color';
import { createRecipeBook } from '../utils/paint/recipePaint';
import type { RecipeBook } from '../utils/paint/recipePaint';
import {
  PAINT_STEP_LABELS,
  regionStepPaint,
  sharedStepPaint,
  stepPaintFromPalette,
  TONE_STEPS,
} from '../utils/paint/regionPaint';
import type { PaintStep, StepPaint } from '../utils/paint/regionPaint';
import type { PaletteColor } from '../utils/palette/paletteColor';
import { filterPalette, groupPalette } from '../utils/palette/paletteList';
import type { SvgRegion } from '../utils/svg/types';
import { PaletteAddForm } from './PaletteAddForm';
import { memo } from './memo';
import { PaletteControls } from './PaletteControls';
import { selectedRegions, selectionName } from './selection';
import { swatchProps } from './swatchProps';
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
 * one in use by name, add colors, and click one to paint the selected regions.
 */
export function PalettePanel({ state }: PalettePanelProps): JSX.Element {
  const palettes = useSignalValue(state.palettes);
  const active = useSignalValue(state.activePalette);
  const saved = useSignalValue(state.palettesSaved);
  const svg = useSignalValue(state.svg);
  const selectedIds = useSignalValue(state.selectedRegionIds);
  const paints = useSignalValue(state.regionPaints);
  const step = useSignalValue(state.activeStep);
  const regions = selectedRegions(svg, selectedIds);
  const shared = sharedStepPaint(
    regions.map((region) => regionStepPaint(region, paints.get(region.id), step)),
  );

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
          regions={regions}
          regionIds={selectedIds}
          step={step}
          current={shared.mixed ? undefined : shared.paint}
        />
      )}
      <PaletteAddForm state={state} />
    </aside>
  );
}

interface PaletteBrowserProps {
  state: AppState;
  palette: readonly PaletteColor[];
  /** The selected regions, which a click paints. */
  regions: readonly SvgRegion[];
  /** Their ids, the same array until the selection changes, so items can skip renders. */
  regionIds: readonly string[];
  /** The step a click paints. */
  step: PaintStep;
  /** What that step of every selected region is painted with now; none when they differ. */
  current: StepPaint | undefined;
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
  regions,
  regionIds,
  step,
  current,
}: PaletteBrowserProps): JSX.Element {
  const [query, setQuery] = useState('');
  const useRecipes = useSignalValue(state.useRecipes);
  const book = useMemo(() => createRecipeBook(palette), [palette]);
  // Painting re-renders the browser; the list only changes with the palette or the filter.
  const visible = useMemo(() => filterPalette(palette, query), [palette, query]);
  const groups = useMemo(() => groupPalette(visible), [visible]);
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
        {regions.length === 0
          ? 'Select a region, then pick a paint for it.'
          : `Pick a ${PAINT_STEP_LABELS[step]} paint for ${selectionName(regions)}.`}
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
                  regionIds={regionIds}
                  step={step}
                  book={book}
                  useRecipes={useRecipes}
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
  /** The regions a click paints; empty disables the paint. */
  regionIds: readonly string[];
  step: PaintStep;
  /** Follows the palette's recipes. */
  book: RecipeBook;
  /** Whether a Base pick also paints the tones of the color's recipe. */
  useRecipes: boolean;
  /** Whether every selected region's step already has this paint. */
  isCurrent: boolean;
}

/** One color of the palette; it renders again only when one of its props changes. */
const PaletteItem = memo(function PaletteItem(props: PaletteItemProps): JSX.Element {
  const { state, color, regionIds, step, book, isCurrent } = props;
  return (
    <li class="palette-item">
      <button
        type="button"
        class="palette-item__paint"
        title={colorTitle(color, book)}
        disabled={regionIds.length === 0}
        aria-current={isCurrent}
        onClick={() => {
          // A recipe replaces the whole region, so tones from an earlier Base don't linger.
          if (step === 'base' && props.useRecipes && color.recipe !== undefined) {
            state.setRegionsPaint(regionIds, book(color));
          } else {
            state.setRegionsStep(regionIds, step, stepPaintFromPalette(color));
          }
        }}
      >
        <span {...swatchProps(color)} aria-hidden="true" />
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
});

/** A color's tooltip: its value (with alpha for washes), then the tones of its recipe. */
function colorTitle(color: PaletteColor, book: RecipeBook): string {
  const value = color.opacity === undefined ? color.color : rgbaText(color.color, color.opacity);
  const paint = color.recipe === undefined ? {} : book(color);
  const tones = TONE_STEPS.flatMap((tone) => {
    const name = paint[tone]?.name;
    return name === undefined ? [] : [`${PAINT_STEP_LABELS[tone]}: ${name}`];
  });
  return [value, ...tones].join('\n');
}
