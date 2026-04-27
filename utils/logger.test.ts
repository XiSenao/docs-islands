/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  createLoggerWithScopeId,
  DEFAULT_LOGGER_SCOPE_ID,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from './logger';

const TEST_SCOPE_ID = 'utils-logger-test-scope';

type LoggerScopeGlobal = typeof globalThis & {
  __DOCS_ISLANDS_LOGGER_SCOPE_ID__?: string | undefined;
};

const captureConsoleLog = (): string[] => {
  const output: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((message) => {
    output.push(String(message));
  });

  return output;
};

afterEach(() => {
  (globalThis as LoggerScopeGlobal).__DOCS_ISLANDS_LOGGER_SCOPE_ID__ =
    undefined;
  resetLoggerConfig();
  resetLoggerConfigForScope(TEST_SCOPE_ID);
  resetLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('@docs-islands/utils/logger', () => {
  it('binds createLogger to the injected logger scope', () => {
    (globalThis as LoggerScopeGlobal).__DOCS_ISLANDS_LOGGER_SCOPE_ID__ =
      TEST_SCOPE_ID;
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['info'],
    });
    const output = captureConsoleLog();

    createLogger({
      main: '@docs-islands/utils-test',
    })
      .getLoggerByGroup('runtime.injected')
      .info('visible injected info', { elapsedTimeMs: 1 });

    expect(
      output.some((message) => message.includes('visible injected info')),
    ).toBe(true);
  });

  it('throws when createLogger runs without an injected scope', () => {
    expect(() =>
      createLogger({
        main: '@docs-islands/utils-test',
      }),
    ).toThrowError(
      '@docs-islands/utils/logger.createLogger() requires a bundler-injected __DOCS_ISLANDS_LOGGER_SCOPE_ID__.',
    );
  });

  it('supports explicit scoped loggers for Node-side workflows', () => {
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['info'],
    });
    const output = captureConsoleLog();

    createLoggerWithScopeId(
      {
        main: '@docs-islands/utils-test',
      },
      TEST_SCOPE_ID,
    )
      .getLoggerByGroup('node.explicit')
      .info('visible explicit info', { elapsedTimeMs: 2 });

    expect(
      output.some((message) => message.includes('visible explicit info')),
    ).toBe(true);
  });

  it('supports explicit default-scope loggers for generic internal scripts', () => {
    setLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID, {
      levels: ['info'],
    });
    const output = captureConsoleLog();

    createLoggerWithScopeId(
      {
        main: '@docs-islands/utils-test',
      },
      DEFAULT_LOGGER_SCOPE_ID,
    )
      .getLoggerByGroup('node.default')
      .info('visible default info', { elapsedTimeMs: 3 });

    expect(
      output.some((message) => message.includes('visible default info')),
    ).toBe(true);
  });
});
