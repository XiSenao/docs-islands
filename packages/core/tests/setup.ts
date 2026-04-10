import { afterEach, vi } from 'vitest';

globalThis.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

Object.defineProperty(globalThis, '__BASE__', {
  configurable: true,
  writable: true,
  value: '/',
});

Object.defineProperty(globalThis, '__CLEAN_URLS__', {
  configurable: true,
  writable: true,
  value: false,
});

afterEach(() => {
  vi.clearAllMocks();
});
