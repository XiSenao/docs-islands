import {
  getLoggerConfigForScope,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import * as vitepressPublicModule from '@docs-islands/vitepress';
import * as publicLoggerModule from '@docs-islands/vitepress/logger';
import {
  createLogger,
  formatDebugMessage,
} from '@docs-islands/vitepress/logger';
import presets, { hmr, runtime } from '@docs-islands/vitepress/logger/presets';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoggerScopeTakeoverPlugin } from '../core/vite-plugin-logger-scope';

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
  expect(source).not.toContain('setLoggerConfig');

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
    },
  };
};

afterEach(() => {
  resetLoggerConfigForScope(TEST_CONTROLLED_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('public vitepress logger api', () => {
  it('exposes only the controlled runtime logger surface', () => {
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

  it('binds controlled logger wrappers to the docs-islands scope', async () => {
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
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const logger = controlledLogger.module.createLogger({
        main: '@docs-islands/vitepress',
      });

      logger
        .getLoggerByGroup('controlled.allowed')
        .info('visible controlled info', { elapsedTimeMs: 2.34 });
      logger
        .getLoggerByGroup('controlled.hidden')
        .info('hidden controlled info', { elapsedTimeMs: 3.45 });

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
          message.includes('hidden controlled info'),
        ),
      ).toBe(false);
    } finally {
      await controlledLogger.cleanup();
    }
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
