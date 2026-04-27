/**
 * @vitest-environment jsdom
 */
import {
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/utils/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../constants/log-groups/runtime';
import cssLoadingRuntime from '../runtime/css-loading';

const TEST_LOGGER_SCOPE_ID = 'css-loading-runtime-test-scope';

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();
  const loggerScopeId = 'css-loading-runtime-test-scope';

  return {
    ...actual,
    createLogger: (options: Parameters<typeof actual.createLogger>[0]) =>
      actual.createLoggerWithScopeId(options, loggerScopeId),
    shouldSuppressLog: (
      kind: Parameters<typeof actual.shouldSuppressLog>[0],
      options: Parameters<typeof actual.shouldSuppressLog>[1],
    ) => actual.shouldSuppressLogWithScopeId(kind, options, loggerScopeId),
  };
});

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

afterEach(() => {
  document.head.innerHTML = '';
  resetLoggerConfigForScope(TEST_LOGGER_SCOPE_ID);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cssLoadingRuntime', () => {
  it('logs duplicate CSS loading diagnostics through the scoped vitepress logger', async () => {
    vi.stubGlobal('__DEBUG__', true);
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {
      rules: [
        {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading,
          label: 'CssLoading',
          levels: ['info', 'success'],
          main: '@docs-islands/vitepress',
        },
      ],
    });
    const output = captureConsoleOutput();
    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = '/style.css';
    document.head.append(link);

    const result = await cssLoadingRuntime(['/style.css']);

    expect(result).toMatchObject({
      failedCount: 0,
      loadedCount: 1,
      success: true,
      timedOut: false,
      totalCount: 1,
    });
    expect(
      output.some(
        (message) =>
          message.includes('@docs-islands/vitepress') &&
          message.includes(VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading) &&
          message.includes('Success rate: 1/1'),
      ),
    ).toBe(true);
    expect(
      output.some(
        (message) =>
          message.includes('@docs-islands/vitepress') &&
          message.includes(VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading) &&
          message.includes('Detected and skipped 1 duplicate CSS files'),
      ),
    ).toBe(true);
  });
});
