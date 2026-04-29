/**
 * @vitest-environment node
 */
import {
  createLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
import {
  createScopedLogger,
  getScopedLoggerConfig as getLoggerConfigForScope,
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/logger/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_SCOPE_ID = 'logger-runtime-test-scope';
const OTHER_SCOPE_ID = 'logger-runtime-other-scope';

const captureConsoleLog = (): string[] => {
  const output: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((message) => {
    output.push(String(message));
  });

  return output;
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetLoggerConfig();
  resetScopedLoggerConfig(TEST_SCOPE_ID);
  resetScopedLoggerConfig(OTHER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('runtime logger', () => {
  it('uses default visibility when direct usage has no runtime config', () => {
    const output = captureConsoleLog();

    const logger = createLogger({
      main: '@acme/logger',
    }).getLoggerByGroup('generic.default');
    createLogger({
      main: '@acme/logger-other',
    });

    logger.info('visible default info', { elapsedTimeMs: 1.23 });

    expect(
      output.some((message) => message.includes('visible default info')),
    ).toBe(true);
  });

  it('allows all default non-debug levels but suppresses debug', () => {
    const context = {
      group: 'generic.default',
      main: '@acme/logger',
      message: 'default visibility',
    };

    expect(shouldSuppressLog('error', context)).toBe(false);
    expect(shouldSuppressLog('warn', context)).toBe(false);
    expect(shouldSuppressLog('info', context)).toBe(false);
    expect(shouldSuppressLog('success', context)).toBe(false);
    expect(shouldSuppressLog('debug', context)).toBe(true);
  });

  it('uses default visibility when direct usage explicitly clears default config', () => {
    const output = captureConsoleLog();

    setLoggerConfig(undefined);

    createLogger({
      main: '@acme/logger',
    })
      .getLoggerByGroup('generic.default')
      .info('visible default info', { elapsedTimeMs: 1.23 });

    expect(
      output.some((message) => message.includes('visible default info')),
    ).toBe(true);
  });

  it('uses injected controlled config without setup warnings', () => {
    vi.stubGlobal('__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__', true);
    vi.stubGlobal('__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__', {
      levels: ['error'],
    });

    const output = captureConsoleLog();
    const errorOutput: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message) => {
      errorOutput.push(String(message));
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger({
      main: '@acme/logger',
    }).getLoggerByGroup('controlled.runtime');

    logger.info('hidden controlled info', { elapsedTimeMs: 1 });
    logger.error('visible controlled error', { elapsedTimeMs: 2 });

    expect(
      output.some((message) => message.includes('hidden controlled info')),
    ).toBe(false);
    expect(
      errorOutput.some((message) =>
        message.includes('visible controlled error'),
      ),
    ).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('applies generic root setLoggerConfig to default-scope loggers', () => {
    const output = captureConsoleLog();

    setLoggerConfig({
      rules: [
        {
          group: 'generic.visible',
          label: 'GenericVisible',
          levels: ['info'],
          main: '@acme/logger',
        },
      ],
    });

    const logger = createLogger({
      main: '@acme/logger',
    });

    logger.getLoggerByGroup('generic.visible').info('visible info', {
      elapsedTimeMs: 1.23,
    });
    logger.getLoggerByGroup('generic.hidden').info('hidden info', {
      elapsedTimeMs: 4.56,
    });

    expect(output.some((message) => message.includes('visible info'))).toBe(
      true,
    );
    expect(output.some((message) => message.includes('hidden info'))).toBe(
      false,
    );
  });

  it('lets later generic root setLoggerConfig calls override earlier config', () => {
    setLoggerConfig({
      levels: ['error'],
    });
    setLoggerConfig({
      levels: ['info'],
    });

    const output = captureConsoleLog();

    createLogger({
      main: '@acme/logger',
    })
      .getLoggerByGroup('generic.override')
      .info('visible overridden info', { elapsedTimeMs: 1.23 });

    expect(
      output.some((message) => message.includes('visible overridden info')),
    ).toBe(true);
  });

  it('rejects generic root setLoggerConfig in controlled runtimes', () => {
    vi.stubGlobal('__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__', true);

    expect(() =>
      setLoggerConfig({
        levels: ['info'],
      }),
    ).toThrow(
      '@docs-islands/logger is controlled by loggerPlugin.vite({ config }).',
    );
  });

  it('keeps explicit scoped configs isolated from the default scope', () => {
    setLoggerConfig({
      levels: ['error'],
    });
    setScopedLoggerConfig(TEST_SCOPE_ID, {
      levels: ['info'],
    });

    expect(getLoggerConfigForScope(TEST_SCOPE_ID)).toEqual({
      levels: ['info'],
    });

    const defaultOutput = captureConsoleLog();

    createLogger({
      main: '@acme/logger',
    })
      .getLoggerByGroup('scope.default')
      .info('hidden default info', { elapsedTimeMs: 1 });

    const scopedLogger = createScopedLogger(
      {
        main: '@acme/logger',
      },
      TEST_SCOPE_ID,
    );

    scopedLogger
      .getLoggerByGroup('scope.explicit')
      .info('visible scoped info', { elapsedTimeMs: 2 });

    expect(
      defaultOutput.some((message) => message.includes('hidden default info')),
    ).toBe(false);
    expect(
      defaultOutput.some((message) => message.includes('visible scoped info')),
    ).toBe(true);
  });

  it('keeps multiple explicit scope configs isolated in the same runtime', () => {
    setScopedLoggerConfig(TEST_SCOPE_ID, {
      levels: ['info'],
    });
    setScopedLoggerConfig(OTHER_SCOPE_ID, {
      levels: ['warn'],
    });

    const output = captureConsoleLog();

    createScopedLogger(
      {
        main: '@acme/logger',
      },
      TEST_SCOPE_ID,
    )
      .getLoggerByGroup('runtime.scope-a')
      .info('visible scope-a info', { elapsedTimeMs: 1 });

    createScopedLogger(
      {
        main: '@acme/logger',
      },
      OTHER_SCOPE_ID,
    )
      .getLoggerByGroup('runtime.scope-b')
      .info('hidden scope-b info', { elapsedTimeMs: 2 });

    expect(
      output.some((message) => message.includes('visible scope-a info')),
    ).toBe(true);
    expect(
      output.some((message) => message.includes('hidden scope-b info')),
    ).toBe(false);
  });

  it('rejects scoped loggers when their runtime config is not registered', () => {
    expect(() =>
      createScopedLogger(
        {
          main: '@acme/logger',
        },
        TEST_SCOPE_ID,
      ),
    ).toThrow(`Logger config for scope "${TEST_SCOPE_ID}" is not registered`);
  });

  it('rejects existing scoped loggers after their runtime config is reset', () => {
    setScopedLoggerConfig(TEST_SCOPE_ID, {
      levels: ['info'],
    });

    const scopedLogger = createScopedLogger(
      {
        main: '@acme/logger',
      },
      TEST_SCOPE_ID,
    ).getLoggerByGroup('scope.explicit');

    resetScopedLoggerConfig(TEST_SCOPE_ID);

    expect(() =>
      scopedLogger.info('hidden after reset', { elapsedTimeMs: 1 }),
    ).toThrow(`Logger config for scope "${TEST_SCOPE_ID}" is not registered`);
  });
});
