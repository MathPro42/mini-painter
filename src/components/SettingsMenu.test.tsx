import { signal } from '@preact/signals-core';
import { fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import type { AppUpdater, UpdateStatus } from '../state/appUpdater';
import type { InstallPrompt } from '../state/installPrompt';
import { SettingsMenu } from './SettingsMenu';
import type { SettingsMenuProps } from './SettingsMenu';

function fakeUpdater(status: UpdateStatus, applies: AppUpdater['applies'] = 'reload') {
  return {
    status: signal<UpdateStatus>(status),
    applies,
    check: vi.fn(() => Promise.resolve()),
    apply: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(),
  };
}

function fakeInstall(canInstall: boolean, installed = false) {
  return {
    canInstall: signal(canInstall),
    installed: signal(installed),
    install: vi.fn(() => Promise.resolve(true)),
    dispose: vi.fn(),
  } satisfies InstallPrompt;
}

function renderMenu(props: Partial<SettingsMenuProps> = {}) {
  const state = props.state ?? createAppState();
  render(
    <SettingsMenu state={state} distribution="site" updater={null} install={null} {...props} />,
  );
  return state;
}

const toggle = () => screen.getByRole('button', { name: 'Mini Painter' });
const openMenu = () => {
  fireEvent.click(toggle());
  return screen.getByRole('dialog', { name: 'Settings' });
};

describe('SettingsMenu', () => {
  it('opens the settings from the title and closes them again', () => {
    renderMenu();
    expect(screen.getByRole('heading', { level: 1, name: 'Mini Painter' })).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    openMenu();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click outside, not on a click inside', () => {
    renderMenu();
    const panel = openMenu();
    fireEvent.pointerDown(panel);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the version', () => {
    renderMenu();
    expect(openMenu()).toHaveTextContent(`Version ${__APP_VERSION__}`);
  });

  it('marks the title while an update waits', async () => {
    const updater = fakeUpdater('up-to-date');
    renderMenu({ updater });
    expect(document.querySelector('.settings__badge')).toBeNull();
    await act(() => {
      updater.status.value = 'available';
    });
    expect(document.querySelector('.settings__badge')).not.toBeNull();
  });
});

describe('SettingsMenu offline options', () => {
  it('offers both the app install and the zip download', () => {
    const install = fakeInstall(true);
    renderMenu({ install });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(install.install).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Download zip' })).toHaveAttribute(
      'href',
      expect.stringMatching(/mini-painter-offline\.zip$/),
    );
  });

  it("points at the browser's menu when it makes no install offer", () => {
    renderMenu({ install: fakeInstall(false) });
    expect(openMenu()).toHaveTextContent('installs from its own menu');
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('points at the browser menu when there is no install prompt at all', () => {
    renderMenu({ install: null });
    expect(openMenu()).toHaveTextContent('installs from its own menu');
  });

  it('says when the app is installed', () => {
    renderMenu({ install: fakeInstall(false, true) });
    expect(openMenu()).toHaveTextContent('Installed.');
  });

  it('offers neither in the offline copy', () => {
    renderMenu({ distribution: 'offline', install: fakeInstall(true) });
    expect(openMenu()).toHaveTextContent('This is the offline copy');
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download zip' })).not.toBeInTheDocument();
  });
});

describe('SettingsMenu updates', () => {
  it('updates automatically by default and saves a switch to manual', () => {
    const state = renderMenu();
    openMenu();
    expect(screen.getByRole('radio', { name: 'Automatically' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'When I choose' }));
    expect(state.updateMode.value).toBe('manual');
    expect(screen.getByRole('radio', { name: 'When I choose' })).toBeChecked();
  });

  it('says when this build cannot update', () => {
    renderMenu({ updater: null });
    expect(openMenu()).toHaveTextContent('does not update itself');
  });

  it('checks on demand and shows what it found', () => {
    const updater = fakeUpdater('up-to-date');
    renderMenu({ updater });
    openMenu();
    expect(screen.getByRole('status')).toHaveTextContent('up to date');
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(updater.check).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument();
  });

  it('disables the check while one runs', () => {
    renderMenu({ updater: fakeUpdater('checking') });
    openMenu();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
  });

  it('applies an available update', () => {
    const updater = fakeUpdater('available');
    renderMenu({ updater });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(updater.apply).toHaveBeenCalledOnce();
  });

  it('downloads an available update for the offline copy', () => {
    const updater = fakeUpdater('available', 'download');
    renderMenu({ distribution: 'offline', updater });
    expect(openMenu()).toHaveTextContent('unzip it over');
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    expect(updater.apply).toHaveBeenCalledOnce();
  });

  it('shows a failed check', () => {
    renderMenu({ updater: fakeUpdater('error') });
    openMenu();
    expect(screen.getByRole('status')).toHaveTextContent('Could not check');
  });
});
