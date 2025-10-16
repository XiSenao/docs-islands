import { afterEach, expect, vi } from 'vitest';

if (process.env.NODE_ENV === 'test') {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  global.console = {
    ...console,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  (global as any).__originalConsole = originalConsole;
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
  };
});

vi.mock('vite', async () => {
  const actual = await vi.importActual('vite');
  return {
    ...actual,
  };
});

expect.extend({
  toBeValidComponent(received: any) {
    const isValid =
      received &&
      typeof received === 'object' &&
      typeof received.componentName === 'string' &&
      typeof received.content === 'string';

    return {
      pass: isValid,
      message: () => `expected ${received} to be a valid component`,
    };
  },

  toHaveValidRenderStrategy(received: any) {
    const validStrategies = [
      'client:only',
      'ssr:only',
      'client:load',
      'client:visible',
    ];
    const isValid =
      received &&
      typeof received.directive === 'string' &&
      validStrategies.includes(received.directive);

    return {
      pass: isValid,
      message: () => `expected ${received} to have a valid render strategy`,
    };
  },
});

vi.setConfig({
  testTimeout: 50_000,
  hookTimeout: 30_000,
});

// Setup global variables that are expected in the code.
(global as any).__BASE__ = '/';

// Mock import.meta.
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        DEV: false,
        PROD: true,
        MPA: false,
      },
    },
  },
  writable: true,
});

// Helper to set import.meta.env values in tests.
(global as any).__setImportMetaEnv = (env: Record<string, boolean>) => {
  Object.defineProperty(global, 'import', {
    value: {
      meta: { env },
    },
    writable: true,
  });
};

afterEach(() => {
  vi.clearAllMocks();
});
