/**
 * @vitest-environment node
 */
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
import {
  createLoggerWithScopeId,
  getLoggerConfigForScope,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
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
  resetLoggerConfigForScope(TEST_SCOPE_ID);
  resetLoggerConfigForScope(OTHER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('runtime logger', () => {
  it('warns once when default-scope direct usage has no runtime config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createLogger({
      main: '@acme/logger',
    });
    createLogger({
      main: '@acme/logger-other',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      'loggerPlugin.vite({ config }) or setLoggerConfig',
    );
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

  it('uses injected controlled config without emitting uncontrolled warnings', () => {
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

  it('keeps internal scoped configs isolated from the default scope', () => {
    setLoggerConfig({
      levels: ['error'],
    });
    setLoggerConfigForScope(TEST_SCOPE_ID, {
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

    const scopedLogger = createLoggerWithScopeId(
      {
        main: '@acme/logger',
      },
      TEST_SCOPE_ID,
    );

    scopedLogger
      .getLoggerByGroup('scope.internal')
      .info('visible scoped info', { elapsedTimeMs: 2 });

    expect(
      defaultOutput.some((message) => message.includes('hidden default info')),
    ).toBe(false);
    expect(
      defaultOutput.some((message) => message.includes('visible scoped info')),
    ).toBe(true);
  });

  it('keeps multiple explicit scope configs isolated in the same runtime', () => {
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['info'],
    });
    setLoggerConfigForScope(OTHER_SCOPE_ID, {
      levels: ['warn'],
    });

    const output = captureConsoleLog();

    createLoggerWithScopeId(
      {
        main: '@acme/logger',
      },
      TEST_SCOPE_ID,
    )
      .getLoggerByGroup('runtime.scope-a')
      .info('visible scope-a info', { elapsedTimeMs: 1 });

    createLoggerWithScopeId(
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
});
