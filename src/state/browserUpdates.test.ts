import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateMode } from '../utils/app/updateMode';
import { SITE_OFFLINE_ZIP_URL, SITE_VERSION_URL } from '../utils/app/distribution';
import type { BrowserEnv, BrowserUpdaterOptions } from './browserUpdates';
import { getBrowserInstallPrompt, getBrowserUpdater } from './browserUpdates';
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
  };
}

function fakeContainer(): ContainerLike & { register: ReturnType<typeof vi.fn> } {
  const registration = {
    installing: null,
    waiting: null,
    update: () => Promise.resolve(),
    addEventListener: () => undefined,
  };
  return {
    controller: {},
    register: vi.fn(() => Promise.resolve(registration)),
    addEventListener: () => undefined,
  };
}

describe('getBrowserUpdater', () => {
  it('updates the site through its service worker', () => {
    const container = fakeContainer();
    const updater = getBrowserUpdater(options('site'), fakeEnv(container));
    expect(updater?.applies).toBe('reload');
    expect(container.register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/' });
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
