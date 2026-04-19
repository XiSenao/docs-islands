/**
 * @vitest-environment jsdom
 */
import {
  createLogger,
  lightGeneralLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/utils/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGGER_SPEC_CASE_COUNT,
  LOGGER_SPEC_ELAPSED,
  type LoggerSpecCase,
  loggerSpecCases,
} from './logger-test-cases';

const normalizeConsoleMessage = (value: unknown): string =>
  String(value).replaceAll('%c', '');

const captureConsoleOutput = (): string[] => {
  const output: string[] = [];
  const capture = (firstArg: unknown) => {
    output.push(normalizeConsoleMessage(firstArg));
  };

  vi.spyOn(console, 'debug').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);

  return output;
};

const setStableElapsedClock = () => {
  const now = vi.spyOn(globalThis.performance, 'now');

  now.mockReturnValue(0);

  return now;
};

const runLoggerSpecCase = (
  specCase: LoggerSpecCase,
  debugOverride?: boolean,
): string[] => {
  const output = captureConsoleOutput();
  const now = setStableElapsedClock();

  setLoggerConfig({
    ...specCase.config,
    ...(debugOverride === undefined ? {} : { debug: debugOverride }),
  });
  now.mockReturnValue(Number.parseFloat(LOGGER_SPEC_ELAPSED));

  const loggers = Object.fromEntries(
    Object.entries(specCase.loggers).map(([name, fixture]) => [
      name,
      createLogger({
        main: fixture.main,
      }).getLoggerByGroup(fixture.group),
    ]),
  );

  for (const operation of specCase.operations) {
    loggers[operation.logger]![operation.kind](operation.message);
  }

  return output;
};

afterEach(() => {
  resetLoggerConfig();
  vi.restoreAllMocks();
});

describe('logger browser behavior', () => {
  it('keeps the markdown logger spec as the complete visibility baseline', () => {
    expect(loggerSpecCases).toHaveLength(LOGGER_SPEC_CASE_COUNT);
  });

  it.each(loggerSpecCases)('$name', (specCase) => {
    expect(runLoggerSpecCase(specCase)).toEqual(specCase.expected);
  });

  it.each(
    loggerSpecCases.filter((specCase) => specCase.expectedDebug !== undefined),
  )('$name with debug labels and elapsed time', (specCase) => {
    expect(runLoggerSpecCase(specCase, true)).toEqual(specCase.expectedDebug);
  });

  it('keeps lightGeneralLogger output on the plain message body', () => {
    const output = captureConsoleOutput();

    lightGeneralLogger(
      '@docs-islands/vitepress',
      'warn',
      'runtime warning',
      'runtime.react.component-manager',
    ).log();

    expect(output).toEqual([
      '@docs-islands/vitepress[runtime.react.component-manager]: runtime warning',
    ]);
  });
});
