import type { JSX } from 'preact';
import type { AppState } from '../state/appState';
import { PAINT_STEP_LABELS, PAINT_STEPS, TONE_STEPS } from '../utils/paint/regionPaint';
import type { PaintStep, RegionPaint, StepPaint } from '../utils/paint/regionPaint';
import type { ParsedSvg, SvgRegion } from '../utils/svg/types';
import { swatchProps } from './swatchProps';
import { useSignalValue } from './useSignalValue';

interface PaintStepPickerProps {
  state: AppState;
  /** The selected region, or `null`. */
  region: SvgRegion | null;
}

/** What the color input shows for a step that has no paint yet. */
export const UNPAINTED_INPUT_COLOR = '#808080';

/** Shown instead of a paint name for steps the drawing has no layer for. */
export const UNAVAILABLE_STEP_TEXT = 'not in this drawing';

export const RECIPE_TOGGLE_LABEL = "Fill Layer, Shade and Highlight from the paint's recipe";

/**
 * The selected region's four paint steps and a color picker for the step
 * being painted. Choosing a step also decides what a palette pick paints.
 * Drawings without tone layers (plain SVGs) only show the color picker,
 * which then paints the Base.
 */
export function PaintStepPicker({ state, region }: PaintStepPickerProps): JSX.Element {
  const svg = useSignalValue(state.svg);
  const paints = useSignalValue(state.regionPaints);
  const activeStep = useSignalValue(state.activeStep);
  const paint = region === null ? undefined : paints.get(region.id);
  const step = isAvailable(svg, activeStep) ? activeStep : 'base';
  const showSteps = region !== null && TONE_STEPS.some((tone) => isAvailable(svg, tone));
  const palette = useSignalValue(state.activePalette);
  const hasRecipes = palette?.colors.some((color) => color.recipe !== undefined) ?? false;

  return (
    <div class="paint-steps">
      {showSteps && (
        <div class="paint-steps__list" role="group" aria-label={`Paint steps of ${region.name}`}>
          {PAINT_STEPS.map((candidate) => (
            <StepRow
              key={candidate}
              state={state}
              region={region}
              step={candidate}
              paint={paint}
              isActive={candidate === step}
              isAvailable={isAvailable(svg, candidate)}
            />
          ))}
        </div>
      )}
      {showSteps && hasRecipes && <RecipeToggle state={state} />}
      <ColorField state={state} region={region} step={step} paint={paint} />
    </div>
  );
}

/** Whether Base picks and Randomize also paint the tones each paint's recipe names. */
function RecipeToggle({ state }: { state: AppState }): JSX.Element {
  const useRecipes = useSignalValue(state.useRecipes);
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
  region: SvgRegion;
  step: PaintStep;
  paint: RegionPaint | undefined;
  isActive: boolean;
  isAvailable: boolean;
}

function StepRow({ state, region, step, paint, isActive, isAvailable }: StepRowProps): JSX.Element {
  const label = PAINT_STEP_LABELS[step];
  const stepPaint = paint?.[step];
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
        <span class="paint-step__paint">{stepText(stepPaint, isAvailable)}</span>
      </button>
      {stepPaint !== undefined && (
        <button
          type="button"
          class="paint-step__clear"
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
          onClick={() => {
            state.setRegionStep(region.id, step, null);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** A step's paint name, else its color, else a dash; or why the step can't be painted. */
function stepText(paint: StepPaint | undefined, isAvailable: boolean): string {
  if (!isAvailable) {
    return UNAVAILABLE_STEP_TEXT;
  }
  return paint?.name ?? paint?.color ?? '—';
}

interface ColorFieldProps {
  state: AppState;
  region: SvgRegion | null;
  step: PaintStep;
  paint: RegionPaint | undefined;
}

function ColorField({ state, region, step, paint }: ColorFieldProps): JSX.Element {
  const original = step === 'base' ? region?.fill : null;
  const color = paint?.[step]?.color ?? original ?? UNPAINTED_INPUT_COLOR;
  const label = PAINT_STEP_LABELS[step];
  return (
    <label class="color-field">
      <span>
        {region === null ? 'Select a region to paint it' : `${label} color of ${region.name}`}
      </span>
      <input
        type="color"
        class="color-field__input"
        value={color}
        disabled={region === null}
        // While the picker is open, colors only preview; closing it records one undo step.
        onInput={(event) => {
          if (region !== null) {
            state.previewRegionStep(region.id, step, { color: event.currentTarget.value });
          }
        }}
        onChange={(event) => {
          if (region !== null) {
            state.setRegionStep(region.id, step, { color: event.currentTarget.value });
          }
        }}
      />
    </label>
  );
}
