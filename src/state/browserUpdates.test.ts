import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateMode } from '../utils/app/updateMode';
import { SITE_OFFLINE_ZIP_URL, SITE_VERSION_URL } from '../utils/app/distribution';
import type { BrowserEnv, BrowserUpdaterOptions } from './browserUpdates';
import { getBrowserInstallPrompt, getBrowserUpdater, startBrowserUpdates } from './browserUpdates';
import { createSettingsState } from './settingsState';
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
    beforeApply: () => Promise.resolve(),
    canApplyNow: () => true,
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

type FakeContainer = ContainerLike & {
  register: ReturnType<typeof vi.fn>;
  changeController: () => void;
};

describe('getBrowserUpdater', () => {
  it('updates the site through its service worker', () => {
    const container = fakeContainer();
    const updater = getBrowserUpdater(options('site'), fakeEnv(container));
    expect(updater?.applies).toBe('reload');
    expect(container.register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/' });
  });

  it('saves pending work before a new version reloads the tab', async () => {
    const order: string[] = [];
    const container = fakeContainer();
    const env = fakeEnv(container);
    env.location.reload.mockImplementation(() => order.push('reload'));
    getBrowserUpdater(
      {
        ...options('site'),
        beforeApply: () => {
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
      { ...options('site'), beforeApply: () => Promise.reject(new Error('x')) },
      env,
    );
    container.changeController();
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
      createSettingsState(),
      fakeAutosave(true),
      build(false, 'site'),
      fakeEnv(),
    );
    expect(started.updater).toBeNull();
    expect(started.install).not.toBeNull();
  });

  it('flushes autosave before applying an update', async () => {
    const autosave = fakeAutosave(true);
    const { updater } = startBrowserUpdates(
      createSettingsState(),
      autosave,
      build(true),
      fakeEnv(),
    );
    await vi.waitFor(() => {
      expect(updater?.status.value).toBe('available');
    });
    await updater?.apply();
    expect(autosave.flush).toHaveBeenCalled();
  });

  it('lets auto mode apply only while the drawing is saved', async () => {
    const container = fakeContainer();
    const waiting = { state: 'installed', postMessage: vi.fn(), addEventListener: vi.fn() };
    container.register.mockResolvedValue({
      installing: null,
      waiting,
      update: () => Promise.resolve(),
      addEventListener: () => undefined,
    });
    const { updater } = startBrowserUpdates(
      createSettingsState(),
      fakeAutosave(false),
      build(true, 'site'),
      fakeEnv(container),
    );
    await vi.waitFor(() => {
      expect(updater?.status.value).toBe('available');
    });
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });
});
