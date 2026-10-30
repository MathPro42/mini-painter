import { render } from '@testing-library/preact';
import type { JSX } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { memo } from './memo';

describe('memo', () => {
  it('renders again only when a prop changes', () => {
    const renders = vi.fn();
    const Label = memo(({ text }: { text: string; extra?: object }): JSX.Element => {
      renders(text);
      return <span>{text}</span>;
    });
    const shared = {};
    const { container, rerender } = render(<Label text="brick red" extra={shared} />);
    rerender(<Label text="brick red" extra={shared} />);
    expect(renders).toHaveBeenCalledTimes(1);

    rerender(<Label text="sea green" extra={shared} />);
    expect(container).toHaveTextContent('sea green');
    rerender(<Label text="sea green" extra={{}} />);
    rerender(<Label text="sea green" />);
    expect(renders).toHaveBeenCalledTimes(4);
  });

  it('names the wrapper after the component', () => {
    function Swatch(): JSX.Element {
      return <span />;
    }
    expect(memo(Swatch).displayName).toBe('Memo(Swatch)');
  });
});
