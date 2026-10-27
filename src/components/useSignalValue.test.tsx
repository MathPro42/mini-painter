import { signal } from '@preact/signals-core';
import { render, screen } from '@testing-library/preact';
import type { JSX } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { useSignalValue } from './useSignalValue';

describe('useSignalValue', () => {
  it('renders the current value and re-renders on change', async () => {
    const count = signal(1);
    function Counter(): JSX.Element {
      return <output>{useSignalValue(count)}</output>;
    }
    render(<Counter />);
    expect(screen.getByRole('status')).toHaveTextContent('1');

    await act(() => {
      count.value = 2;
    });
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('stops listening after unmount', async () => {
    const count = signal(1);
    let renders = 0;
    function Counter(): JSX.Element {
      renders++;
      return <output>{useSignalValue(count)}</output>;
    }
    const { unmount } = render(<Counter />);
    await act(() => {
      unmount();
    });
    const before = renders;
    await act(() => {
      count.value = 5;
    });
    expect(renders).toBe(before);
  });
});
