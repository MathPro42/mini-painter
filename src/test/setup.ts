import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// Tests don't use Vitest globals, so Testing Library can't register this itself.
afterEach(() => {
  cleanup();
});
