import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { startAutosave } from './autosave';
import type { Autosave } from './autosave';
import { createPaintState } from './paintState';
import type { PaintState } from './paintState';
import { createIndexedDbWorkStorage } from './workStorage';

const DRAWING =
  '<svg viewBox="0 0 10 10"><rect id="left" width="5" height="10"/><rect id="right" x="5" width="5" height="10"/></svg>';
const OTHER_DRAWING = '<svg viewBox="0 0 4 4"><circle id="dot" cx="2" cy="2" r="2"/></svg>';
const RED = { color: '#c8553d' };

interface Tab {
  readonly state: PaintState;
  readonly autosave: Autosave;
}

describe('startAutosave in tabs that share one database', () => {
  const opened: Autosave[] = [];

  /** Opens the app in a new tab: its own state, saving to the database `factory` holds. */
  const openTab = async (factory: IDBFactory): Promise<Tab> => {
    const state = createPaintState();
    const autosave = startAutosave(state, createIndexedDbWorkStorage(factory));
    opened.push(autosave);
    await autosave.restored;
    return { state, autosave };
  };

  afterEach(() => {
    opened.splice(0).forEach((autosave) => {
      autosave.dispose();
    });
  });

  it('never keeps a drawing with another tab’s history', async () => {
    const factory = new IDBFactory();
    const first = await openTab(factory);
    first.state.loadSvg(DRAWING);
    await first.autosave.flush();
    const second = await openTab(factory);
    second.state.loadSvg(OTHER_DRAWING);
    await second.autosave.flush();

    first.state.setRegionsStep(['region-1'], 'base', RED);
    await first.autosave.flush();

    const next = await openTab(factory);
    expect(next.state.svgSource.value).toBe(DRAWING);
    expect(next.state.regionPaints.value.get('region-1')?.base).toEqual(RED);
  });

  it('saves the whole drawing again after another tab closed its own', async () => {
    const factory = new IDBFactory();
    const first = await openTab(factory);
    first.state.loadSvg(DRAWING);
    await first.autosave.flush();
    const second = await openTab(factory);
    second.state.closeDrawing();
    await second.autosave.flush();

    first.state.setRegionsStep(['region-0'], 'base', RED);
    await first.autosave.flush();

    const next = await openTab(factory);
    expect(next.state.svgSource.value).toBe(DRAWING);
    expect(next.state.regionPaints.value.get('region-0')?.base).toEqual(RED);
  });

  it('keeps the history saved last when tabs paint the same drawing', async () => {
    const factory = new IDBFactory();
    const first = await openTab(factory);
    first.state.loadSvg(DRAWING);
    await first.autosave.flush();
    const second = await openTab(factory);
    second.state.setRegionsStep(['region-0'], 'base', RED);
    await second.autosave.flush();

    first.state.setRegionsStep(['region-1'], 'base', RED);
    await first.autosave.flush();

    const next = await openTab(factory);
    expect(next.state.svgSource.value).toBe(DRAWING);
    expect([...next.state.regionPaints.value.keys()]).toEqual(['region-1']);
  });
});
