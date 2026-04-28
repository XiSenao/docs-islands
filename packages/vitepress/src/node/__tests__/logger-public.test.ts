import {
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
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CORE_LOGGER_RUNTIME_MODULE_ID,
  createVitePressLoggerFacadePlugin,
  createVitePressLoggerVirtualModuleId,
  VITEPRESS_INTERNAL_LOGGER_MODULE_ID,
  VITEPRESS_LOGGER_MODULE_ID,
} from '../core/vite-plugin-logger-facade';

const TEST_RUNTIME_LOGGER_SCOPE_ID = 'logger-public-runtime-scope';

const callResolveId = async (plugin: Plugin, id: string): Promise<unknown> => {
  const hook = plugin.resolveId;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, id)
    : hook.handler.call({} as never, id);
};

const callLoad = async (plugin: Plugin, id: string): Promise<unknown> => {
  const hook = plugin.load;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, id)
    : hook.handler.call({} as never, id);
};

afterEach(() => {
  resetLoggerConfigForScope(TEST_RUNTIME_LOGGER_SCOPE_ID);
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

  it('generates a scope-bound virtual logger facade in managed builds', async () => {
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
    const plugin = createVitePressLoggerFacadePlugin(
      TEST_RUNTIME_LOGGER_SCOPE_ID,
      loggingConfig,
    );

    const resolved = await callResolveId(plugin, VITEPRESS_LOGGER_MODULE_ID);

    expect(resolved).toBe(
      createVitePressLoggerVirtualModuleId(TEST_RUNTIME_LOGGER_SCOPE_ID),
    );
    const source = await callLoad(plugin, resolved as string);

    expect(typeof source).toBe('string');
    const sourceCode = source as string;

    expect(sourceCode).toContain(
      `const loggerScopeId = ${JSON.stringify(TEST_RUNTIME_LOGGER_SCOPE_ID)};`,
    );
    expect(sourceCode).toContain('setLoggerConfigForScope(loggerScopeId');
    expect(sourceCode).toContain(
      `const loggerConfig = ${JSON.stringify(loggingConfig)};`,
    );
    expect(sourceCode).toContain(
      'createLoggerWithScopeId(options, loggerScopeId)',
    );
    expect(sourceCode).not.toContain('__DOCS_ISLANDS_LOGGER_SCOPE_ID__');
    expect(sourceCode).not.toContain('__DOCS_ISLANDS_LOGGER_CONFIG__');
  });

  it('routes internal logger imports to the same scope-bound facade', async () => {
    const plugin = createVitePressLoggerFacadePlugin(
      TEST_RUNTIME_LOGGER_SCOPE_ID,
    );

    const internalResolved = await callResolveId(
      plugin,
      VITEPRESS_INTERNAL_LOGGER_MODULE_ID,
    );
    const coreResolved = await callResolveId(
      plugin,
      CORE_LOGGER_RUNTIME_MODULE_ID,
    );

    expect(internalResolved).toBe(coreResolved);

    const source = await callLoad(plugin, internalResolved as string);

    expect(typeof source).toBe('string');
    expect(source as string).toContain(
      'createBaseLoggerWithScopeId(options, loggerScopeId)',
    );
    expect(source as string).toContain(
      'shouldSuppressBaseLog(kind, options, loggerScopeId)',
    );
  });

  it('throws when the public logger facade runs without a createDocsIslands scope', () => {
    expect(() =>
      createLogger({
        main: '@docs-islands/vitepress-docs',
      }),
    ).toThrowError(
      '@docs-islands/vitepress/logger must be resolved by createDocsIslands()',
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
