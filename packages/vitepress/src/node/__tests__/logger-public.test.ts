import {
  DEFAULT_LOGGER_SCOPE_ID,
  getLoggerConfigForScope,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/utils/logger';
import * as vitepressPublicModule from '@docs-islands/vitepress';
import * as publicLoggerModule from '@docs-islands/vitepress/logger';
import {
  createLogger,
  formatDebugMessage,
  setLoggerConfig,
} from '@docs-islands/vitepress/logger';
import presets, { hmr, runtime } from '@docs-islands/vitepress/logger/presets';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLoggerScopeTakeoverPlugin,
  LOGGER_SCOPE_UNCONTROLLED_QUERY,
} from '../core/vite-plugin-logger-scope';

const TEST_CONTROLLED_LOGGER_SCOPE_ID = 'logger-public-controlled-scope';

const normalizeConsoleCalls = (calls: readonly unknown[][]): string[] =>
  calls.map((args) => args.map(String).join(' '));

const resolveWithPlugin = async (
  plugin: Plugin,
  context: object,
  id: string,
): Promise<unknown> => {
  const resolveId = plugin.resolveId;

  expect(resolveId).toBeDefined();

  const resolveHandler =
    typeof resolveId === 'function' ? resolveId : resolveId!.handler;

  return resolveHandler.call(context as never, id);
};

const loadControlledLoggerWrapper = async (
  loggerScopeId: string,
): Promise<{
  cleanup: () => Promise<void>;
  module: {
    createLogger: typeof createLogger;
    formatDebugMessage: typeof formatDebugMessage;
    setLoggerConfig: typeof setLoggerConfig;
  };
}> => {
  const plugin = createLoggerScopeTakeoverPlugin(loggerScopeId);
  const resolvedId = await resolveWithPlugin(
    plugin,
    {} as never,
    '@docs-islands/vitepress/logger',
  );

  expect(typeof resolvedId).toBe('string');

  const source = plugin.load!.call({} as never, resolvedId as string);

  expect(typeof source).toBe('string');

  const wrapperDir = await mkdtemp(path.join(tmpdir(), 'logger-wrapper-test-'));
  const wrapperPath = path.join(wrapperDir, 'vitepress-logger-wrapper.mjs');

  await writeFile(wrapperPath, source as string, 'utf8');

  return {
    cleanup: async () => {
      await rm(wrapperDir, { force: true, recursive: true });
    },
    module: (await import(
      `${pathToFileURL(wrapperPath).href}?scope=${loggerScopeId}`
    )) as {
      createLogger: typeof createLogger;
      formatDebugMessage: typeof formatDebugMessage;
      setLoggerConfig: typeof setLoggerConfig;
    },
  };
};

describe('public vitepress logger api', () => {
  beforeEach(() => {
    resetLoggerConfig();
  });

  afterEach(() => {
    resetLoggerConfig();
    resetLoggerConfigForScope(TEST_CONTROLLED_LOGGER_SCOPE_ID);
    vi.restoreAllMocks();
  });

  it('exposes the public logger surface without accessor exports', () => {
    expect(publicLoggerModule).toHaveProperty('createLogger');
    expect(publicLoggerModule.createLogger).toBe(createLogger);
    expect(publicLoggerModule).toHaveProperty('formatDebugMessage');
    expect(publicLoggerModule.formatDebugMessage).toBe(formatDebugMessage);
    expect(publicLoggerModule).toHaveProperty('setLoggerConfig');
    expect(publicLoggerModule.setLoggerConfig).toBe(setLoggerConfig);
    expect(publicLoggerModule).not.toHaveProperty('emitRuntimeLog');
    expect(publicLoggerModule).not.toHaveProperty('LightGeneralLogger');
    expect(publicLoggerModule).not.toHaveProperty('ScopedLogger');
    expect(publicLoggerModule).not.toHaveProperty('default');
    expect(publicLoggerModule).not.toHaveProperty('getLoggerInstance');
    expect(publicLoggerModule).not.toHaveProperty('getVitePressLogger');
    expect(publicLoggerModule).not.toHaveProperty('resetLoggerConfig');
    expect(vitepressPublicModule).not.toHaveProperty('getLoggerInstance');
    expect(vitepressPublicModule).not.toHaveProperty('getVitePressLogger');
  });

  it('applies injected logger config when the public createLogger factory is used', () => {
    globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = {
      debug: true,
      rules: [
        {
          group: 'consumer.injected',
          label: 'InjectedConfig',
          levels: ['info'],
        },
      ],
    };

    const logger = createLogger({
      main: '@docs-islands/vitepress',
    });

    delete globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__;

    logger
      .getLoggerByGroup('consumer.injected')
      .info('visible injected info', { elapsedTimeMs: 6.78 });
    logger
      .getLoggerByGroup('consumer.hidden')
      .info('hidden injected info', { elapsedTimeMs: 1.23 });

    const logCalls = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.map(String).join(' '));

    expect(
      logCalls.some(
        (message) =>
          message.includes('[InjectedConfig]') &&
          message.includes('visible injected info') &&
          message.includes('6.78ms'),
      ),
    ).toBe(true);
    expect(
      logCalls.some((message) => message.includes('hidden injected info')),
    ).toBe(false);
  });

  it('keeps consumer logs constrained by the resolved logging config', () => {
    setLoggerConfig({
      debug: true,
      rules: [
        {
          group: 'consumer.allowed',
          label: 'ConsumerAllowed',
          levels: ['info'],
        },
      ],
    });

    const logger = createLogger({
      main: '@docs-islands/vitepress',
    });

    logger
      .getLoggerByGroup('consumer.allowed')
      .info('visible consumer info', { elapsedTimeMs: 12.34 });
    logger
      .getLoggerByGroup('consumer.blocked')
      .info('hidden consumer info', { elapsedTimeMs: 56.78 });

    const logCalls = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.map(String).join(' '));

    expect(
      logCalls.some(
        (message) =>
          message.includes('[ConsumerAllowed]') &&
          message.includes('visible consumer info') &&
          message.includes('12.34ms'),
      ),
    ).toBe(true);
    expect(
      logCalls.some((message) => message.includes('hidden consumer info')),
    ).toBe(false);
  });

  it('keeps custom-main logger instances constrained by global logging rules', () => {
    setLoggerConfig({
      debug: true,
      rules: [
        {
          group: 'consumer.main-specific',
          label: 'CustomMainOnly',
          levels: ['info'],
          main: '@acme/docs',
        },
        {
          group: 'consumer.any-main',
          label: 'AnyMain',
          levels: ['info'],
        },
      ],
    });

    createLogger({
      main: '@acme/docs',
    })
      .getLoggerByGroup('consumer.main-specific')
      .info('visible custom main info', { elapsedTimeMs: 2.34 });
    createLogger({
      main: '@acme/other',
    })
      .getLoggerByGroup('consumer.main-specific')
      .info('hidden mismatched main info', { elapsedTimeMs: 3.45 });
    createLogger({
      main: '@acme/other',
    })
      .getLoggerByGroup('consumer.any-main')
      .info('visible any-main info', { elapsedTimeMs: 4.56 });

    const logCalls = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.map(String).join(' '));

    expect(
      logCalls.some(
        (message) =>
          message.includes('[CustomMainOnly]') &&
          message.includes('visible custom main info') &&
          message.includes('2.34ms'),
      ),
    ).toBe(true);
    expect(
      logCalls.some((message) =>
        message.includes('hidden mismatched main info'),
      ),
    ).toBe(false);
    expect(
      logCalls.some(
        (message) =>
          message.includes('[AnyMain]') &&
          message.includes('visible any-main info') &&
          message.includes('4.56ms'),
      ),
    ).toBe(true);
  });

  it('clears fallback config when public setLoggerConfig receives null', () => {
    setLoggerConfig({
      rules: [
        {
          group: 'consumer.only-visible-before-clear',
          label: 'ConsumerOnlyVisibleBeforeClear',
          levels: ['info'],
        },
      ],
    });
    setLoggerConfig(null);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup('consumer.visible-after-clear')
      .info('visible after clear', { elapsedTimeMs: 1.23 });

    expect(getLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID)).toBeUndefined();
    expect(
      normalizeConsoleCalls(logSpy.mock.calls).some((message) =>
        message.includes('visible after clear'),
      ),
    ).toBe(true);
  });

  it('ignores public setLoggerConfig in controlled logger wrappers and warns once', async () => {
    setLoggerConfigForScope(TEST_CONTROLLED_LOGGER_SCOPE_ID, {
      rules: [
        {
          group: 'controlled.allowed',
          label: 'ControlledAllowed',
          levels: ['info'],
          main: '@docs-islands/vitepress',
        },
      ],
    });

    const controlledLogger = await loadControlledLoggerWrapper(
      TEST_CONTROLLED_LOGGER_SCOPE_ID,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      controlledLogger.module.setLoggerConfig({
        rules: [
          {
            group: 'controlled.override',
            label: 'ControlledOverride',
            levels: ['info'],
            main: '@docs-islands/vitepress',
          },
        ],
      });
      controlledLogger.module.setLoggerConfig({
        rules: [
          {
            group: 'controlled.override',
            label: 'ControlledOverride',
            levels: ['info'],
            main: '@docs-islands/vitepress',
          },
        ],
      });

      const logger = controlledLogger.module.createLogger({
        main: '@docs-islands/vitepress',
      });

      logger
        .getLoggerByGroup('controlled.allowed')
        .info('visible controlled info', { elapsedTimeMs: 2.34 });
      logger
        .getLoggerByGroup('controlled.override')
        .info('hidden controlled override info', { elapsedTimeMs: 3.45 });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('controlled logger');
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'docs-islands logger scope',
      );
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'default compatibility scope',
      );
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'ignored in the current controlled context',
      );
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'createDocsIslands({ logging: ... })',
      );
      expect(getLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID)).toBeUndefined();
      expect(getLoggerConfigForScope(TEST_CONTROLLED_LOGGER_SCOPE_ID)).toEqual({
        rules: [
          {
            group: 'controlled.allowed',
            label: 'ControlledAllowed',
            levels: ['info'],
            main: '@docs-islands/vitepress',
          },
        ],
      });
      expect(
        normalizeConsoleCalls(logSpy.mock.calls).some((message) =>
          message.includes('visible controlled info'),
        ),
      ).toBe(true);
      expect(
        normalizeConsoleCalls(logSpy.mock.calls).some((message) =>
          message.includes('hidden controlled override info'),
        ),
      ).toBe(false);
    } finally {
      await controlledLogger.cleanup();
    }
  });

  it('skips scope takeover for docs-only uncontrolled public logger probes', async () => {
    const plugin = createLoggerScopeTakeoverPlugin(
      TEST_CONTROLLED_LOGGER_SCOPE_ID,
    );
    const uncontrolledImportId = `@docs-islands/vitepress/logger?${LOGGER_SCOPE_UNCONTROLLED_QUERY}`;
    const unresolvedResult = await resolveWithPlugin(
      plugin,
      {
        resolve: vi.fn(),
      } as never,
      uncontrolledImportId,
    );

    expect(unresolvedResult).toBeNull();

    const passthroughId = `/virtual/logger.ts?${LOGGER_SCOPE_UNCONTROLLED_QUERY}`;
    const resolvedResult = await resolveWithPlugin(
      plugin,
      {
        resolve: vi.fn(async () => ({
          id: passthroughId,
        })),
      } as never,
      'virtual:docs-logger-probe',
    );

    expect(resolvedResult).toBe(passthroughId);
  });

  it('runs scope takeover resolution before other pre-order dev resolvers', () => {
    const plugin = createLoggerScopeTakeoverPlugin(
      TEST_CONTROLLED_LOGGER_SCOPE_ID,
    );

    expect(typeof plugin.resolveId).toBe('object');
    expect(plugin.resolveId).toMatchObject({
      order: 'pre',
    });
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
