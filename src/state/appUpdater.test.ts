import { signal } from '@preact/signals-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateMode } from '../utils/app/updateMode';
import { createAppUpdater } from './appUpdater';
import type { AppUpdaterOptions, UpdateSource } from './appUpdater';

interface FakeSource extends UpdateSource {
  hasUpdate: boolean;
  announce: () => void;
  check: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  apply: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function fakeSource(applies: UpdateSource['applies'] = 'reload'): FakeSource {
  let listener: (() => void) | null = null;
  const fake: FakeSource = {
    applies,
    hasUpdate: false,
    announce: () => listener?.(),
    check: vi.fn(() => Promise.resolve(fake.hasUpdate)),
    apply: vi.fn(() => Promise.resolve()),
    subscribe: (onAvailable) => {
      listener = onAvailable;
      return () => {
        listener = null;
      };
    },
  };
  return fake;
}

function setup(mode: UpdateMode, source = fakeSource(), extra: Partial<AppUpdaterOptions> = {}) {
  const updateMode = signal<UpdateMode>(mode);
  const updater = createAppUpdater({ source, updateMode, checkEveryMs: 1000, ...extra });
  return { updateMode, updater, source };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createAppUpdater in auto mode', () => {
  it('checks on start and reports no update', async () => {
    const { updater, source } = setup('auto');
    await vi.waitFor(() => {
      expect(updater.status.value).toBe('up-to-date');
    });
    expect(source.check).toHaveBeenCalledOnce();
  });

  it('checks again every interval', async () => {
    const { source } = setup('auto');
    await vi.advanceTimersByTimeAsync(2500);
    expect(source.check).toHaveBeenCalledTimes(3);
  });

  it('flushes work, then applies an update it finds', async () => {
    const order: string[] = [];
    const source = fakeSource();
    source.hasUpdate = true;
    source.apply.mockImplementation(() => {
      order.push('apply');
      return Promise.resolve();
    });
    const beforeApply = vi.fn(() => {
      order.push('flush');
      return Promise.resolve();
    });
    const { updater } = setup('auto', source, { beforeApply });
    await vi.waitFor(() => {
      expect(order).toEqual(['flush', 'apply']);
    });
    expect(updater.status.value).toBe('applying');
  });

  it('waits for the user when the drawing cannot be kept', async () => {
    const source = fakeSource();
    source.hasUpdate = true;
    const { updater } = setup('auto', source, { canApplyNow: () => false });
    await vi.waitFor(() => {
      expect(updater.status.value).toBe('available');
    });
    expect(source.apply).not.toHaveBeenCalled();
    await updater.apply();
    expect(source.apply).toHaveBeenCalledOnce();
  });

  it('applies an update the source announces', async () => {
    const { source } = setup('auto');
    await vi.advanceTimersByTimeAsync(0);
    source.announce();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.apply).toHaveBeenCalledOnce();
  });

  it('only shows an update that must be downloaded', async () => {
    const source = fakeSource('download');
    source.hasUpdate = true;
    const { updater } = setup('auto', source);
    await vi.waitFor(() => {
      expect(updater.status.value).toBe('available');
    });
    expect(source.apply).not.toHaveBeenCalled();
  });

  it('shows a failed check as an error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source = fakeSource();
    source.check.mockRejectedValue(new Error('offline'));
    const { updater } = setup('auto', source);
    await vi.waitFor(() => {
      expect(updater.status.value).toBe('error');
    });
  });

  it('stops checking once disposed', async () => {
    const { updater, source } = setup('auto');
    updater.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(source.check).toHaveBeenCalledOnce();
  });
});

describe('createAppUpdater in manual mode', () => {
  it('waits for the user to check', async () => {
    const { updater, source } = setup('manual');
    await vi.advanceTimersByTimeAsync(5000);
    expect(source.check).not.toHaveBeenCalled();
    expect(updater.status.value).toBe('idle');
  });

  it('shows an update found by a check without applying it', async () => {
    const { updater, source } = setup('manual');
    source.hasUpdate = true;
    await updater.check();
    expect(updater.status.value).toBe('available');
    expect(source.apply).not.toHaveBeenCalled();
  });

  it('shows an announced update without applying it', () => {
    const { updater, source } = setup('manual');
    source.announce();
    expect(updater.status.value).toBe('available');
    expect(source.apply).not.toHaveBeenCalled();
  });

  it('applies when the user says so', async () => {
    const { updater, source } = setup('manual');
    source.announce();
    await updater.apply();
    expect(source.apply).toHaveBeenCalledOnce();
  });

  it('applies a waiting update when switched to auto', async () => {
    const { updateMode, source } = setup('manual');
    source.announce();
    updateMode.value = 'auto';
    await vi.advanceTimersByTimeAsync(0);
    expect(source.apply).toHaveBeenCalledOnce();
  });

  it('keeps a downloaded update available, since this copy is still old', async () => {
    const source = fakeSource('download');
    const { updater } = setup('manual', source);
    source.announce();
    await updater.apply();
    expect(source.apply).toHaveBeenCalledOnce();
    expect(updater.status.value).toBe('available');
  });

  it('shows a failed update as an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = fakeSource();
    source.apply.mockRejectedValue(new Error('gone'));
    const { updater } = setup('manual', source);
    await updater.apply();
    expect(updater.status.value).toBe('error');
  });

  it('ignores checks and announcements while applying', async () => {
    const source = fakeSource();
    source.apply.mockReturnValue(new Promise(() => undefined));
    const { updater } = setup('manual', source);
    void updater.apply();
    await updater.check();
    source.announce();
    await updater.apply();
    expect(source.check).not.toHaveBeenCalled();
    expect(source.apply).toHaveBeenCalledOnce();
    expect(updater.status.value).toBe('applying');
  });

  it('runs one check at a time', async () => {
    const { updater, source } = setup('manual');
    await Promise.all([updater.check(), updater.check()]);
    expect(source.check).toHaveBeenCalledOnce();
  });
});
