import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import {
  PAINT_STEP_LABELS,
  PAINT_STEPS,
  regionStepPaint,
  sharedStepPaint,
  TONE_STEPS,
} from '../utils/paint/regionPaint';
import type { PaintStep, SharedStepPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg, SvgRegion } from '../utils/svg/types';
import { selectionName } from './selection';
import { swatchProps } from './swatchProps';
import { useSignalValue } from './useSignalValue';

interface PaintStepPickerProps {
  state: AppState;
  /** The selected regions, in drawing order; empty when none is selected. */
  regions: readonly SvgRegion[];
}

/** What the color input shows for a step that has no paint yet. */
export const UNPAINTED_INPUT_COLOR = '#808080';

/** Shown, with a hatched swatch, for a step the selected regions have different paints on. */
export const MIXED_STEP_TEXT = 'mixed';

/** Shown instead of a paint name for steps the drawing has no layer for. */
export const UNAVAILABLE_STEP_TEXT = 'not in this drawing';

export const RECIPE_TOGGLE_LABEL = "Fill Layer, Shade and Highlight from the paint's recipe";

/**
 * The paint steps of the selected regions and a color picker for the step
 * being painted, which paints every selected region. A step the regions
 * differ on reads "mixed". Choosing a step also decides what a palette pick
 * paints. Drawings without tone layers (plain SVGs) only show the color
 * picker, which then paints the Base.
 */
export function PaintStepPicker({ state, regions }: PaintStepPickerProps): JSX.Element {
  const svg = useSignalValue(state.svg);
  const paints = useSignalValue(state.regionPaints);
  const activeStep = useSignalValue(state.activeStep);
  const step = isAvailable(svg, activeStep) ? activeStep : 'base';
  const showSteps = regions.length > 0 && TONE_STEPS.some((tone) => isAvailable(svg, tone));
  const ids = regions.map((region) => region.id);
  const name = selectionName(regions);
  // Rows show the paints the user applied; the color picker also shows an unpainted Base's fill.
  const applied = (candidate: PaintStep): SharedStepPaint =>
    sharedStepPaint(ids.map((id) => paints.get(id)?.[candidate]));

  return (
    <div class="paint-steps">
      {showSteps && (
        <div class="paint-steps__list" role="group" aria-label={`Paint steps of ${name}`}>
          {PAINT_STEPS.map((candidate) => (
            <StepRow
              key={candidate}
              state={state}
              regionIds={ids}
              step={candidate}
              shared={applied(candidate)}
              isActive={candidate === step}
              isAvailable={isAvailable(svg, candidate)}
            />
          ))}
        </div>
      )}
      {showSteps && <RecipeToggle state={state} />}
      <ColorField state={state} regions={regions} step={step} />
    </div>
  );
}

/**
 * Whether Base picks and Randomize also paint the tones each paint's recipe
 * names. Shown once the palette in use has a recipe.
 */
function RecipeToggle({ state }: { state: AppState }): JSX.Element | null {
  const useRecipes = useSignalValue(state.useRecipes);
  const palette = useSignalValue(state.activePalette);
  if (palette?.colors.some((color) => color.recipe !== undefined) !== true) {
    return null;
  }
  return (
    <label class="paint-steps__recipes">
      <input
        type="checkbox"
        checked={useRecipes}
        onChange={(event) => {
          state.setUseRecipes(event.currentTarget.checked);
        }}
      />{' '}
      {RECIPE_TOGGLE_LABEL}
    </label>
  );
}

function isAvailable(svg: ParsedSvg | null, step: PaintStep): boolean {
  return step === 'base' || (svg?.toneMasks[step] ?? null) !== null;
}

interface StepRowProps {
  state: AppState;
  regionIds: readonly string[];
  step: PaintStep;
  /** The selected regions' paint on this step, or that they differ. */
  shared: SharedStepPaint;
  isActive: boolean;
  isAvailable: boolean;
}

function StepRow(props: StepRowProps): JSX.Element {
  const { state, regionIds, step, shared, isActive, isAvailable } = props;
  const label = PAINT_STEP_LABELS[step];
  // A mixed step shows the hatched "none" swatch.
  const stepPaint = shared.mixed ? undefined : shared.paint;
  return (
    <div class="paint-step">
      <button
        type="button"
        class="paint-step__select"
        aria-pressed={isActive}
        disabled={!isAvailable}
        onClick={() => {
          state.setActiveStep(step);
        }}
      >
        <span class="paint-step__label">{label}</span>{' '}
        <span {...swatchProps(stepPaint)} aria-hidden="true" />
        <span class="paint-step__paint">{stepText(shared, isAvailable)}</span>
      </button>
      {(shared.mixed || stepPaint !== undefined) && (
        <button
          type="button"
          class="paint-step__clear"
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
          onClick={() => {
            state.setRegionsStep(regionIds, step, null);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * A step's paint name, else its color, else a dash; "mixed" when the
 * selected regions differ; or why the step can't be painted.
 */
function stepText(shared: SharedStepPaint, isAvailable: boolean): string {
  if (!isAvailable) {
    return UNAVAILABLE_STEP_TEXT;
  }
  if (shared.mixed) {
    return MIXED_STEP_TEXT;
  }
  return shared.paint?.name ?? shared.paint?.color ?? '—';
}

interface ColorFieldProps {
  state: AppState;
  /** The regions the picker paints; empty disables it. */
  regions: readonly SvgRegion[];
  step: PaintStep;
}

/**
 * A color picker for one step of every selected region. It starts from their
 * shared color, or a neutral grey when they differ.
 */
function ColorField({ state, regions, step }: ColorFieldProps): JSX.Element {
  const paints = useSignalValue(state.regionPaints);
  const regionIds = regions.map((region) => region.id);
  const shown = sharedStepPaint(
    regions.map((region) => regionStepPaint(region, paints.get(region.id), step)),
  );
  const color = (shown.mixed ? undefined : shown.paint?.color) ?? UNPAINTED_INPUT_COLOR;
  return (
    <label class="color-field">
      <span>
        {regions.length === 0
          ? 'Select a region to paint it'
          : `${PAINT_STEP_LABELS[step]} color of ${selectionName(regions)}`}
      </span>
      <input
        type="color"
        class="color-field__input"
        value={color}
        disabled={regionIds.length === 0}
        // While the picker is open, colors only preview; closing it records one undo step.
        onInput={(event) => {
          state.previewRegionsStep(regionIds, step, { color: event.currentTarget.value });
        }}
        onChange={(event) => {
          state.setRegionsStep(regionIds, step, { color: event.currentTarget.value });
        }}
      />
    </label>
  );
}
