import { signal } from '@preact/signals-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateMode } from '../utils/app/updateMode';
import type { AppUpdater, UpdateStatus } from './appUpdater';
import { UPDATE_COUNTDOWN_SECONDS, createUpdateNotice } from './updateNotice';

function setup(
  options: {
    mode?: UpdateMode;
    drawingOpen?: boolean;
    workSaved?: boolean;
    applies?: AppUpdater['applies'];
  } = {},
) {
  const status = signal<UpdateStatus>('up-to-date');
  const updater = {
    status,
    applies: options.applies ?? 'reload',
    check: vi.fn(() => Promise.resolve()),
    apply: vi.fn(() => {
      status.value = 'applying';
      return Promise.resolve();
    }),
    dispose: vi.fn(),
  } satisfies AppUpdater;
  const updateMode = signal<UpdateMode>(options.mode ?? 'auto');
  const drawingOpen = signal(options.drawingOpen ?? false);
  const workSaved = signal(options.workSaved ?? true);
  const state = createUpdateNotice({ updater, updateMode, drawingOpen, workSaved });
  const found = () => {
    status.value = 'available';
  };
  return { state, updater, updateMode, drawingOpen, workSaved, found };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createUpdateNotice with nothing open', () => {
  it('says nothing until an update is found', () => {
    const { state } = setup();
    expect(state.notice.value).toEqual({ kind: 'none' });
  });

  it('counts down, then updates', () => {
    const { state, updater, found } = setup();
    found();
    expect(state.notice.value).toEqual({
      kind: 'countdown',
      secondsLeft: UPDATE_COUNTDOWN_SECONDS,
    });
    vi.advanceTimersByTime(1000);
    expect(state.notice.value).toEqual({ kind: 'countdown', secondsLeft: 4 });
    vi.advanceTimersByTime(3000);
    expect(updater.apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(updater.apply).toHaveBeenCalledOnce();
    expect(state.notice.value).toEqual({ kind: 'none' });
  });

  it('updates at once on "Update now"', () => {
    const { state, updater, found } = setup();
    found();
    state.applyNow();
    expect(updater.apply).toHaveBeenCalledOnce();
  });

  it('does not update after "Later"', () => {
    const { state, updater, found } = setup();
    found();
    state.postpone();
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
    expect(state.notice.value).toEqual({ kind: 'none' });
  });

  it('does not update once switched to manual during the countdown', () => {
    const { state, updater, updateMode, found } = setup();
    found();
    vi.advanceTimersByTime(3000);
    updateMode.value = 'manual';
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
    expect(state.notice.value).toEqual({ kind: 'none' });
  });

  it('never counts down in manual mode', () => {
    const { state, updater, found } = setup({ mode: 'manual' });
    found();
    vi.advanceTimersByTime(10_000);
    expect(state.notice.value).toEqual({ kind: 'none' });
    expect(updater.apply).not.toHaveBeenCalled();
  });

  it('stops counting once disposed', () => {
    const { state, updater, found } = setup();
    found();
    state.dispose();
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
  });
});

describe('createUpdateNotice with a drawing open', () => {
  it('waits for the drawing to close, then counts down from the start', () => {
    const { state, updater, drawingOpen, found } = setup({ drawingOpen: true });
    found();
    expect(state.notice.value).toEqual({ kind: 'on-close', workAtRisk: false });
    vi.advanceTimersByTime(60_000);
    expect(updater.apply).not.toHaveBeenCalled();
    drawingOpen.value = false;
    expect(state.notice.value).toEqual({
      kind: 'countdown',
      secondsLeft: UPDATE_COUNTDOWN_SECONDS,
    });
    vi.advanceTimersByTime(UPDATE_COUNTDOWN_SECONDS * 1000);
    expect(updater.apply).toHaveBeenCalledOnce();
  });

  it('stops the countdown when a drawing opens during it', () => {
    const { state, updater, drawingOpen, found } = setup();
    found();
    vi.advanceTimersByTime(3000);
    drawingOpen.value = true;
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
    expect(state.notice.value.kind).toBe('on-close');
  });

  it('says when the drawing would be lost', () => {
    const { state, workSaved, found } = setup({ drawingOpen: true, workSaved: false });
    found();
    expect(state.notice.value).toEqual({ kind: 'on-close', workAtRisk: true });
    workSaved.value = true;
    expect(state.notice.value).toEqual({ kind: 'on-close', workAtRisk: false });
  });

  it('does not update on close after "Later"', () => {
    const { state, updater, drawingOpen, found } = setup({ drawingOpen: true });
    found();
    state.postpone();
    drawingOpen.value = false;
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
  });

  it('does not update on close once switched to manual', () => {
    const { updater, updateMode, drawingOpen, found } = setup({ drawingOpen: true });
    found();
    updateMode.value = 'manual';
    drawingOpen.value = false;
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
  });
});

describe('createUpdateNotice for the offline copy', () => {
  it('offers the download without counting down', () => {
    const { state, updater, found } = setup({ applies: 'download' });
    found();
    expect(state.notice.value).toEqual({ kind: 'download' });
    vi.advanceTimersByTime(10_000);
    expect(updater.apply).not.toHaveBeenCalled();
  });
});
