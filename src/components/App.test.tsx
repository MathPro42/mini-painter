import { render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import { App } from './App';

vi.mock('../rendering/createRenderer', () => ({
  createRenderer: vi.fn(() => ({ pickRegion: vi.fn(() => null), dispose: vi.fn() })),
}));

describe('App', () => {
  it('renders the title, the upload control and the 3D viewport', () => {
    render(<App state={createAppState()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mini Painter' })).toBeInTheDocument();
    expect(screen.getByLabelText('Open SVG…')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3D model preview' })).toBeInTheDocument();
  });

  it('shows the region panel once a drawing is loaded', async () => {
    const state = createAppState();
    render(<App state={state} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await act(() => {
      state.loadSvg('<svg viewBox="0 0 4 4"><rect id="block" width="4" height="4"/></svg>');
    });
    expect(screen.getByRole('complementary', { name: /Regions/ })).toBeInTheDocument();
  });
});
