import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAutosavedHistory } from '../utils/work/autosaveFormat';
import { startAutosave } from './autosave';
import { createPaintState } from './paintState';
import type { PaintState } from './paintState';
import type { AutosavedWork, WorkStorage } from './workStorage';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10"/><rect id="right" x="5" width="5" height="10"/></svg>';
const OTHER_DRAWING = '<svg viewBox="0 0 4 4"><circle id="dot" cx="2" cy="2" r="2"/></svg>';
const RED = { color: '#c8553d' };
const GREY = { color: '#808080' };

interface FakeStorage extends WorkStorage {
  work: AutosavedWork | null;
  readonly saves: { readonly drawing?: string; readonly history: string }[];
  fail: boolean;
}

const fakeStorage = (work: AutosavedWork | null = null): FakeStorage => {
  const storage: FakeStorage = {
    work,
    saves: [],
    fail: false,
    load: () => Promise.resolve(storage.work),
    save: (next) => {
      if (storage.fail) {
        return Promise.reject(new Error('full'));
      }
      storage.saves.push(next);
      storage.work = {
        drawing: next.drawing ?? storage.work?.drawing ?? '',
        history: next.history,
      };
      return Promise.resolve();
    },
    clear: () => {
      storage.work = null;
      return Promise.resolve();
    },
  };
  return storage;
};

/** Paints `region-0` then `region-1`, and undoes the second: one step back, one forward. */
const savedWork = (): AutosavedWork => {
  const state = createPaintState();
  state.loadSvg(DRAWING);
  state.setRegionsStep(['region-0'], 'base', RED);
  state.setRegionsStep(['region-1'], 'base', GREY);
  state.undo();
  return { drawing: DRAWING, history: encodeAutosavedHistory(state.paintHistory.value) };
};

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(1000);
};

describe('startAutosave', () => {
  let state: PaintState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state = createPaintState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restores the drawing, its paints and its undo history', async () => {
    const autosave = startAutosave(state, fakeStorage(savedWork()));
    await autosave.restored;

    expect(state.svgSource.value).toBe(DRAWING);
    expect(state.regionPaints.value.get('region-0')?.base?.color).toBe('#c8553d');
    expect(state.canUndo.value).toBe(true);
    state.redo();
    expect(state.regionPaints.value.get('region-1')?.base?.color).toBe('#808080');
  });

  it('does not write back what it just restored', async () => {
    const storage = fakeStorage(savedWork());
    await startAutosave(state, storage).restored;
    await settle();
    expect(storage.saves).toEqual([]);
  });

  it('saves a new drawing with its history, then only the history', async () => {
    const storage = fakeStorage();
    await startAutosave(state, storage, { delayMs: 100 }).restored;

    state.loadSvg(DRAWING);
    await settle();
    state.setRegionsStep(['region-0'], 'base', RED);
    await settle();

    expect(storage.saves.map((save) => save.drawing)).toEqual([DRAWING, undefined]);
    expect(storage.work?.history).toBe(encodeAutosavedHistory(state.paintHistory.value));
  });

  it('folds a burst of changes into one write', async () => {
    const storage = fakeStorage();
    await startAutosave(state, storage, { delayMs: 100 }).restored;
    state.loadSvg(DRAWING);
    state.setRegionsStep(['region-0'], 'base', RED);
    await vi.advanceTimersByTimeAsync(50);
    state.setRegionsStep(['region-1'], 'base', GREY);
    await vi.advanceTimersByTimeAsync(99);
    expect(storage.saves).toHaveLength(0);
    await settle();
    expect(storage.saves).toHaveLength(1);
  });

  it('does not save previews', async () => {
    const storage = fakeStorage(savedWork());
    await startAutosave(state, storage).restored;
    state.previewRegionsStep(['region-1'], 'base', RED);
    await settle();
    expect(storage.saves).toEqual([]);
  });

  it('clears the saved work when the drawing is closed', async () => {
    const storage = fakeStorage(savedWork());
    await startAutosave(state, storage).restored;
    state.closeDrawing();
    await settle();
    expect(storage.work).toBeNull();
  });

  it('writes a pending change at once on flush', async () => {
    const storage = fakeStorage();
    const autosave = startAutosave(state, storage);
    await autosave.restored;
    state.loadSvg(DRAWING);
    await autosave.flush();
    expect(storage.saves).toHaveLength(1);
    await autosave.flush();
    expect(storage.saves).toHaveLength(1);
  });

  it('keeps a drawing opened while the restore was loading, and saves it', async () => {
    const storage = fakeStorage(savedWork());
    const autosave = startAutosave(state, storage);
    state.loadSvg(OTHER_DRAWING);
    await autosave.restored;
    expect(state.svgSource.value).toBe(OTHER_DRAWING);
    await settle();
    expect(storage.work?.drawing).toBe(OTHER_DRAWING);
  });

  it('ignores and clears damaged work', async () => {
    const storage = fakeStorage({ drawing: DRAWING, history: 'damaged' });
    await startAutosave(state, storage).restored;
    expect(state.svg.value).toBeNull();
    expect(storage.work).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('ignores work whose paints name regions the drawing lacks', async () => {
    const storage = fakeStorage({ ...savedWork(), drawing: OTHER_DRAWING });
    await startAutosave(state, storage).restored;
    expect(state.svg.value).toBeNull();
  });

  it('reports failed saves, and rewrites the drawing once saving works again', async () => {
    const storage = fakeStorage();
    const autosave = startAutosave(state, storage);
    await autosave.restored;
    expect(autosave.workSaved.value).toBe(true);

    storage.fail = true;
    state.loadSvg(DRAWING);
    await autosave.flush();
    expect(autosave.workSaved.value).toBe(false);

    storage.fail = false;
    state.setRegionsStep(['region-0'], 'base', RED);
    await autosave.flush();
    expect(autosave.workSaved.value).toBe(true);
    expect(storage.saves[0]?.drawing).toBe(DRAWING);
  });

  it('stops saving once disposed', async () => {
    const storage = fakeStorage();
    const autosave = startAutosave(state, storage);
    await autosave.restored;
    state.loadSvg(DRAWING);
    autosave.dispose();
    await settle();
    expect(storage.saves).toEqual([]);
  });

  it('never starts when disposed during the restore', async () => {
    const storage = fakeStorage();
    const autosave = startAutosave(state, storage);
    autosave.dispose();
    await autosave.restored;
    state.loadSvg(DRAWING);
    await settle();
    expect(storage.saves).toEqual([]);
  });

  it('reports that nothing is saved without storage', async () => {
    const autosave = startAutosave(state, null);
    await autosave.restored;
    await autosave.flush();
    autosave.dispose();
    expect(autosave.workSaved.value).toBe(false);
  });
});
