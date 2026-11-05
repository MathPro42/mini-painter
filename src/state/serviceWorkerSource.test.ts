import { describe, expect, it, vi } from 'vitest';
import { SKIP_WAITING, createServiceWorkerSource } from './serviceWorkerSource';
import type { ContainerLike, RegistrationLike, WorkerLike } from './serviceWorkerSource';

class FakeWorker extends EventTarget implements WorkerLike {
  state = 'installing';
  postMessage = vi.fn();
  install(): void {
    this.state = 'installed';
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget implements RegistrationLike {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn(() => Promise.resolve());
  /** The browser found a new worker; it installs when the test says so. */
  find(): FakeWorker {
    const worker = new FakeWorker();
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
    return worker;
  }
}

class FakeContainer extends EventTarget implements ContainerLike {
  registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));
  controller: unknown;
  constructor(controller: unknown) {
    super();
    this.controller = controller;
  }
}

function setup(controlled = true) {
  const container = new FakeContainer(controlled ? {} : null);
  const reload = vi.fn();
  const source = createServiceWorkerSource({
    container,
    scriptUrl: '/app/sw.js',
    scope: '/app/',
    reload,
  });
  return { container, registration: container.registration, reload, source };
}

describe('createServiceWorkerSource', () => {
  it('registers the worker for the app scope', () => {
    const { container, source } = setup();
    expect(container.register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/' });
    expect(source.applies).toBe('reload');
  });

  it('asks the browser to check, then reports a waiting worker', async () => {
    const { registration, source } = setup();
    await expect(source.check()).resolves.toBe(false);
    registration.waiting = new FakeWorker();
    await expect(source.check()).resolves.toBe(true);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('reports no update on a first visit, when no worker serves the page yet', async () => {
    const { registration, source } = setup(false);
    registration.waiting = new FakeWorker();
    await expect(source.check()).resolves.toBe(false);
  });

  it('announces a worker already waiting at start', async () => {
    const { registration, source } = setup();
    registration.waiting = new FakeWorker();
    const onAvailable = vi.fn();
    source.subscribe(onAvailable);
    await vi.waitFor(() => {
      expect(onAvailable).toHaveBeenCalledOnce();
    });
  });

  it('announces a worker found later once it has installed', async () => {
    const { registration, source } = setup();
    const onAvailable = vi.fn();
    source.subscribe(onAvailable);
    await Promise.resolve();
    const worker = registration.find();
    expect(onAvailable).not.toHaveBeenCalled();
    worker.install();
    expect(onAvailable).toHaveBeenCalledOnce();
  });

  it('stays quiet after unsubscribing', async () => {
    const { registration, source } = setup();
    const onAvailable = vi.fn();
    const unsubscribe = source.subscribe(onAvailable);
    await Promise.resolve();
    const worker = registration.find();
    unsubscribe();
    worker.install();
    expect(onAvailable).not.toHaveBeenCalled();
  });

  it('warns when the worker cannot be registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const container = new FakeContainer({});
    container.register.mockRejectedValue(new Error('blocked'));
    const source = createServiceWorkerSource({
      container,
      scriptUrl: 'sw.js',
      scope: './',
      reload: vi.fn(),
    });
    source.subscribe(vi.fn());
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    warn.mockRestore();
  });

  it('tells the waiting worker to take over, and reloads once it does', async () => {
    const { container, registration, reload, source } = setup();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    await source.apply();
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING);
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('just reloads when no worker is waiting', async () => {
    const { reload, source } = setup();
    await source.apply();
    expect(reload).toHaveBeenCalledOnce();
  });
});
