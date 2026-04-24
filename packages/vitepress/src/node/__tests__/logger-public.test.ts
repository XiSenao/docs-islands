import {
  getLoggerConfigForScope,
  type LoggerConfig,
  resetLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import * as vitepressPublicModule from '@docs-islands/vitepress';
import * as publicLoggerModule from '@docs-islands/vitepress/logger';
import {
  createLogger,
  formatDebugMessage,
} from '@docs-islands/vitepress/logger';
import presets, { hmr, runtime } from '@docs-islands/vitepress/logger/presets';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_RUNTIME_LOGGER_SCOPE_ID = 'logger-public-runtime-scope';

const normalizeConsoleCalls = (calls: readonly unknown[][]): string[] =>
  calls.map((args) => args.map(String).join(' '));

afterEach(() => {
  resetLoggerConfigForScope(TEST_RUNTIME_LOGGER_SCOPE_ID);
  globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = undefined;
  globalThis.__DOCS_ISLANDS_LOGGER_SCOPE_ID__ = undefined;
  vi.restoreAllMocks();
});

describe('public vitepress logger api', () => {
  it('exposes only the public runtime logger surface', () => {
    expect(publicLoggerModule).toHaveProperty('createLogger');
    expect(publicLoggerModule.createLogger).toBe(createLogger);
    expect(publicLoggerModule).toHaveProperty('formatDebugMessage');
    expect(publicLoggerModule.formatDebugMessage).toBe(formatDebugMessage);
    expect(publicLoggerModule).not.toHaveProperty('setLoggerConfig');
    expect(publicLoggerModule).not.toHaveProperty('emitRuntimeLog');
    expect(publicLoggerModule).not.toHaveProperty('LightGeneralLogger');
    expect(publicLoggerModule).not.toHaveProperty('ScopedLogger');
    expect(publicLoggerModule).not.toHaveProperty('default');
    expect(publicLoggerModule).not.toHaveProperty('getLoggerInstance');
    expect(publicLoggerModule).not.toHaveProperty('getVitePressLogger');
    expect(publicLoggerModule).not.toHaveProperty('loggerTreeShaking');
    expect(publicLoggerModule).not.toHaveProperty('resetLoggerConfig');
    expect(vitepressPublicModule).not.toHaveProperty('getLoggerInstance');
    expect(vitepressPublicModule).not.toHaveProperty('getVitePressLogger');
  });

  it('binds the public logger facade to the runtime-defined docs-islands scope', () => {
    const loggingConfig = {
      rules: [
        {
          group: 'runtime.allowed',
          label: 'RuntimeAllowed',
          levels: ['info'],
          main: '@docs-islands/vitepress',
        },
      ],
    } satisfies LoggerConfig;

    globalThis.__DOCS_ISLANDS_LOGGER_SCOPE_ID__ = TEST_RUNTIME_LOGGER_SCOPE_ID;
    globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = loggingConfig;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger({
      main: '@docs-islands/vitepress',
    });

    logger
      .getLoggerByGroup('runtime.allowed')
      .info('visible runtime info', { elapsedTimeMs: 2.34 });
    logger
      .getLoggerByGroup('runtime.hidden')
      .info('hidden runtime info', { elapsedTimeMs: 3.45 });

    expect(getLoggerConfigForScope(TEST_RUNTIME_LOGGER_SCOPE_ID)).toEqual(
      loggingConfig,
    );
    expect(
      normalizeConsoleCalls(logSpy.mock.calls).some((message) =>
        message.includes('visible runtime info'),
      ),
    ).toBe(true);
    expect(
      normalizeConsoleCalls(logSpy.mock.calls).some((message) =>
        message.includes('hidden runtime info'),
      ),
    ).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('throws when the public logger facade runs without a createDocsIslands scope', () => {
    expect(() =>
      createLogger({
        main: '@docs-islands/vitepress-docs',
      }),
    ).toThrowError(
      '@docs-islands/vitepress/logger is running without a logger scope injected by createDocsIslands().',
    );
  });

  it('re-exports formatDebugMessage for emitted runtime helpers', () => {
    expect(
      formatDebugMessage({
        context: 'logger public api',
        decision: 'verify emitted runtime compatibility',
        timingMs: 7.89,
      }),
    ).toContain('timing=7.89ms');
  });

  it('exposes the public logging preset plugins through the logger presets subpath', () => {
    expect(presets.hmr).toBe(hmr);
    expect(hmr.rules.viteAfterUpdate).toEqual({
      group: 'hmr.vite.after-update',
      main: '@docs-islands/vitepress',
    });
    expect(runtime.rules.renderValidation).toEqual({
      group: 'runtime.render.validation',
      main: '@docs-islands/core',
    });
  });
});
