import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { createAppState } from '../state/appState';
import { App } from './App';

vi.mock('../rendering/createRenderer', () => ({
  createRenderer: vi.fn(() => ({ dispose: vi.fn() })),
}));

describe('App', () => {
  it('renders the title and the 3D viewport', () => {
    render(<App state={createAppState()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mini Painter' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3D model preview' })).toBeInTheDocument();
  });
});
