/**
 * @vitest-environment node
 */
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
import {
  getLoggerConfigForScope,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_SCOPE_ID = 'logger-runtime-test-scope';

const captureConsoleLog = (): string[] => {
  const output: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((message) => {
    output.push(String(message));
  });

  return output;
};

afterEach(() => {
  resetLoggerConfig();
  resetLoggerConfigForScope(TEST_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('runtime logger', () => {
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

    const scopedLogger = createLogger(
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
});
