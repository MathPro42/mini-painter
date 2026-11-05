import { describe, expect, it, vi } from 'vitest';
import { createInstallPrompt } from './installPrompt';

function offerEvent(outcome: 'accepted' | 'dismissed'): Event & { prompt: () => Promise<void> } {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe('createInstallPrompt', () => {
  it('cannot install until the browser makes an offer', () => {
    const prompt = createInstallPrompt(new EventTarget(), false);
    expect(prompt.canInstall.value).toBe(false);
    expect(prompt.installed.value).toBe(false);
  });

  it('starts installed when running standalone', () => {
    expect(createInstallPrompt(new EventTarget(), true).installed.value).toBe(true);
  });

  it('keeps the offer and stops the browser showing its own', () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    const event = offerEvent('accepted');
    target.dispatchEvent(event);
    expect(prompt.canInstall.value).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores events that are not install offers', () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    target.dispatchEvent(new Event('beforeinstallprompt'));
    expect(prompt.canInstall.value).toBe(false);
  });

  it('shows the offer once and reports the choice', async () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    const event = offerEvent('accepted');
    target.dispatchEvent(event);
    await expect(prompt.install()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(prompt.canInstall.value).toBe(false);
    await expect(prompt.install()).resolves.toBe(false);
  });

  it('keeps the offer when the browser refuses to show it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    const event = offerEvent('accepted');
    event.prompt = vi.fn(() => Promise.reject(new Error('no user gesture')));
    target.dispatchEvent(event);
    await expect(prompt.install()).resolves.toBe(false);
    expect(prompt.canInstall.value).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports a dismissed offer', async () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    target.dispatchEvent(offerEvent('dismissed'));
    await expect(prompt.install()).resolves.toBe(false);
  });

  it('marks the app installed when the browser says so', () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    target.dispatchEvent(offerEvent('accepted'));
    target.dispatchEvent(new Event('appinstalled'));
    expect(prompt.installed.value).toBe(true);
    expect(prompt.canInstall.value).toBe(false);
  });

  it('stops listening once disposed', () => {
    const target = new EventTarget();
    const prompt = createInstallPrompt(target, false);
    prompt.dispose();
    target.dispatchEvent(offerEvent('accepted'));
    expect(prompt.canInstall.value).toBe(false);
  });
});
