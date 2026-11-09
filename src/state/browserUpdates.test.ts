import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateMode } from '../utils/app/updateMode';
import { SITE_OFFLINE_ZIP_URL, SITE_VERSION_URL } from '../utils/app/distribution';
import type { BrowserEnv, BrowserUpdaterOptions } from './browserUpdates';
import { getBrowserInstallPrompt, getBrowserUpdater, startBrowserUpdates } from './browserUpdates';
import { createAppState } from './appState';
import type { ContainerLike } from './serviceWorkerSource';

function fakeEnv(serviceWorker?: ContainerLike) {
  const target = new EventTarget();
  const env = {
    navigator: serviceWorker === undefined ? {} : { serviceWorker },
    location: { reload: vi.fn(), assign: vi.fn() },
    fetch: vi.fn(() => Promise.resolve(new Response('{"version":"newer"}'))),
    matchMedia: vi.fn(() => ({ matches: false })),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  } satisfies BrowserEnv;
  return env;
}

function options(distribution: BrowserUpdaterOptions['distribution']): BrowserUpdaterOptions {
  return {
    distribution,
    baseUrl: '/app/',
    currentVersion: 'abc',
    updateMode: signal<UpdateMode>('manual'),
    beforeReload: () => Promise.resolve(),
    drawingOpen: signal(false),
  };
}

function fakeContainer(): FakeContainer {
  const registration = {
    installing: null,
    waiting: null,
    update: () => Promise.resolve(),
    addEventListener: () => undefined,
  };
  const target = new EventTarget();
  return {
    controller: {},
    register: vi.fn(() => Promise.resolve(registration)),
    addEventListener: target.addEventListener.bind(target),
    changeController: () => target.dispatchEvent(new Event('controllerchange')),
  };
}

/** Lets every pending promise callback run. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

type FakeContainer = ContainerLike & {
  register: ReturnType<typeof vi.fn>;
  changeController: () => void;
};

describe('getBrowserUpdater', () => {
  it('updates the site through its service worker', () => {
    const container = fakeContainer();
    const updater = getBrowserUpdater(options('site'), fakeEnv(container));
    expect(updater?.applies).toBe('reload');
    expect(container.register).toHaveBeenCalledWith(
      '/app/sw.js',
      expect.objectContaining({ scope: '/app/' }),
    );
  });

  it('saves pending work before a new version reloads the tab', async () => {
    const order: string[] = [];
    const container = fakeContainer();
    const env = fakeEnv(container);
    env.location.reload.mockImplementation(() => order.push('reload'));
    getBrowserUpdater(
      {
        ...options('site'),
        beforeReload: () => {
          order.push('flush');
          return Promise.resolve();
        },
      },
      env,
    );
    container.changeController();
    await vi.waitFor(() => {
      expect(order).toEqual(['flush', 'reload']);
    });
  });

  it('reloads even when saving fails, since the old files may be gone', async () => {
    const container = fakeContainer();
    const env = fakeEnv(container);
    getBrowserUpdater(
      { ...options('site'), beforeReload: () => Promise.reject(new Error('x')) },
      env,
    );
    container.changeController();
    await vi.waitFor(() => {
      expect(env.location.reload).toHaveBeenCalledOnce();
    });
  });

  it("keeps an open drawing on another tab's update until it is applied here", async () => {
    const container = fakeContainer();
    const env = fakeEnv(container);
    const updater = getBrowserUpdater({ ...options('site'), drawingOpen: signal(true) }, env);
    container.changeController();
    await settle();
    expect(env.location.reload).not.toHaveBeenCalled();
    await updater?.apply();
    await vi.waitFor(() => {
      expect(env.location.reload).toHaveBeenCalledOnce();
    });
  });

  it('cannot update the site without service workers', () => {
    expect(getBrowserUpdater(options('site'), fakeEnv())).toBeNull();
  });

  it("updates the offline copy from the site's version.json and zip", async () => {
    const env = fakeEnv();
    const updater = getBrowserUpdater(options('offline'), env);
    expect(updater?.applies).toBe('download');
    await updater?.check();
    expect(env.fetch).toHaveBeenCalledWith(SITE_VERSION_URL, { cache: 'no-store' });
    expect(updater?.status.value).toBe('available');
    await updater?.apply();
    expect(env.location.assign).toHaveBeenCalledWith(SITE_OFFLINE_ZIP_URL);
  });
});

describe('getBrowserInstallPrompt', () => {
  it('follows install offers on the site', () => {
    const env = fakeEnv();
    env.matchMedia.mockReturnValue({ matches: true });
    const prompt = getBrowserInstallPrompt('site', env);
    expect(prompt?.installed.value).toBe(true);
    expect(env.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it('has none in the offline copy', () => {
    expect(getBrowserInstallPrompt('offline', fakeEnv())).toBeNull();
  });
});

describe('startBrowserUpdates', () => {
  const appState = () => createAppState();
  function fakeAutosave(workSaved: boolean) {
    return {
      workSaved: signal(workSaved),
      restored: Promise.resolve(),
      flush: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
    };
  }
  const build = (isProduction: boolean, distribution: 'site' | 'offline' = 'offline') => ({
    distribution,
    baseUrl: '/app/',
    version: 'abc',
    isProduction,
  });

  it('starts no updates on the dev server, but still the install offer', () => {
    const started = startBrowserUpdates(
      appState(),
      fakeAutosave(true),
      build(false, 'site'),
      fakeEnv(),
    );
    expect(started.updater).toBeNull();
    expect(started.install).not.toBeNull();
  });

  it('flushes autosave before an update reloads the tab', async () => {
    const autosave = fakeAutosave(true);
    const container = fakeContainer();
    const env = fakeEnv(container);
    startBrowserUpdates(appState(), autosave, build(true, 'site'), env);
    container.changeController();
    await vi.waitFor(() => {
      expect(env.location.reload).toHaveBeenCalledOnce();
    });
    expect(autosave.flush).toHaveBeenCalledOnce();
  });

  it('warns before an automatic update, and waits while a drawing is open', async () => {
    const container = fakeContainer();
    const waiting = { state: 'installed', postMessage: vi.fn(), addEventListener: vi.fn() };
    container.register.mockResolvedValue({
      installing: null,
      waiting,
      update: () => Promise.resolve(),
      addEventListener: () => undefined,
    });
    const state = appState();
    state.loadSvg('<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
    const { notice } = startBrowserUpdates(
      state,
      fakeAutosave(false),
      build(true, 'site'),
      fakeEnv(container),
    );
    await vi.waitFor(() => {
      expect(notice?.notice.value).toEqual({ kind: 'on-close', workAtRisk: true });
    });
    expect(waiting.postMessage).not.toHaveBeenCalled();
    state.closeDrawing();
    expect(notice?.notice.value.kind).toBe('countdown');
    notice?.dispose();
  });

  it("does not reload the open drawing for another tab's update", async () => {
    const container = fakeContainer();
    const env = fakeEnv(container);
    const state = appState();
    state.loadSvg('<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
    startBrowserUpdates(state, fakeAutosave(true), build(true, 'site'), env);
    container.changeController();
    await settle();
    expect(env.location.reload).not.toHaveBeenCalled();
  });

  it('has no notice where nothing updates', () => {
    expect(
      startBrowserUpdates(appState(), fakeAutosave(true), build(false), fakeEnv()).notice,
    ).toBeNull();
  });
});
