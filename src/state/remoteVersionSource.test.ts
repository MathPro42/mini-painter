import { describe, expect, it, vi } from 'vitest';
import { createRemoteVersionSource } from './remoteVersionSource';

function source(response: Response) {
  const fetch = vi.fn(() => Promise.resolve(response));
  const download = vi.fn();
  return {
    fetch,
    download,
    source: createRemoteVersionSource({
      currentVersion: 'abc',
      versionUrl: 'https://example.com/version.json',
      downloadUrl: 'https://example.com/app.zip',
      fetch,
      download,
    }),
  };
}

describe('createRemoteVersionSource', () => {
  it('finds an update when the site has another version', async () => {
    const { source: remote, fetch } = source(new Response('{"version":"def"}'));
    await expect(remote.check()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://example.com/version.json', { cache: 'no-store' });
  });

  it('finds none when the site has this version', async () => {
    await expect(source(new Response('{"version":"abc"}')).source.check()).resolves.toBe(false);
  });

  it('fails on an HTTP error', async () => {
    await expect(source(new Response('', { status: 404 })).source.check()).rejects.toThrow('404');
  });

  it('fails on a malformed version.json', async () => {
    await expect(source(new Response('oops')).source.check()).rejects.toThrow(RangeError);
  });

  it('downloads the new copy to apply it', async () => {
    const { source: remote, download } = source(new Response(''));
    expect(remote.applies).toBe('download');
    await remote.apply();
    expect(download).toHaveBeenCalledWith('https://example.com/app.zip');
  });

  it('never reports updates on its own', () => {
    const onAvailable = vi.fn();
    source(new Response('')).source.subscribe(onAvailable)();
    expect(onAvailable).not.toHaveBeenCalled();
  });
});
