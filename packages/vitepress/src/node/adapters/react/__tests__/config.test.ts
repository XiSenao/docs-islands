/**
 * @vitest-environment node
 */
import { resetLoggerConfig } from '@docs-islands/logger';
import {
  resetScopedLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/logger/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VITEPRESS_HMR_LOG_GROUPS } from '../../../../shared/constants/log-groups/hmr';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../../../../shared/constants/log-groups/runtime';
import { hmr } from '../../../../shared/logger/presets';
import { LOGGER_FACADE_PLUGIN_NAME } from '../../../constants/core/plugin-names';

const mockWarn = vi.fn();
const TEST_LOGGER_SCOPE_ID = 'test-logger-scope';

vi.mock('#shared/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: mockWarn,
    }),
  }),
}));

afterEach(() => {
  resetLoggerConfig();
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('react logging config', () => {
  it('normalizes labeled main/group/message rules', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(
      resolveLoggingConfig({
        debug: true,
        levels: ['info', 'success', 'warn', 'success'],
        rules: [
          {
            group: 'runtime.react.*',
            label: 'runtime-react-rule',
            levels: ['warn', 'success', 'warn'],
            main: '@docs-islands/vitepress',
            message: '*ready*',
          },
        ],
      }),
    ).toEqual({
      debug: true,
      levels: ['info', 'success', 'warn'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'runtime-react-rule',
          levels: ['warn', 'success'],
          main: '@docs-islands/vitepress',
          message: '*ready*',
        },
      ],
    });
  });

  it('preserves explicit empty levels arrays', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(
      resolveLoggingConfig({
        levels: [],
        rules: [
          {
            group: 'runtime.react.*',
            label: 'hide-runtime-react',
            levels: [],
            main: '@docs-islands/vitepress',
          },
        ],
      }),
    ).toEqual({
      levels: [],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'hide-runtime-react',
          levels: [],
          main: '@docs-islands/vitepress',
        },
      ],
    });
  });

  it('expands plugin-backed logging rules with inherited matchers', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(
      resolveLoggingConfig({
        levels: ['warn', 'error'],
        plugins: {
          hmr,
        },
        rules: {
          'hmr/markdownUpdate': {
            levels: ['error'],
            message: '*re-parsed*',
          },
          'hmr/reactRuntimePrepare': 'off',
          'hmr/reactSsrOnlyRender': false,
          'hmr/viteAfterUpdate': {
            enabled: false,
          },
          'hmr/viteAfterUpdateRender': {},
        },
      }),
    ).toEqual({
      levels: ['warn', 'error'],
      rules: [
        {
          group: VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
          label: 'hmr/markdownUpdate',
          levels: ['error'],
          main: '@docs-islands/vitepress',
          message: '*re-parsed*',
        },
        {
          enabled: false,
          group: VITEPRESS_HMR_LOG_GROUPS.reactRuntimePrepare,
          label: 'hmr/reactRuntimePrepare',
          main: '@docs-islands/vitepress',
        },
        {
          enabled: false,
          group: VITEPRESS_HMR_LOG_GROUPS.reactSsrOnlyRender,
          label: 'hmr/reactSsrOnlyRender',
          main: '@docs-islands/vitepress',
        },
        {
          enabled: false,
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          label: 'hmr/viteAfterUpdate',
          main: '@docs-islands/vitepress',
        },
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdateRender,
          label: 'hmr/viteAfterUpdateRender',
          main: '@docs-islands/vitepress',
        },
      ],
    });
  });

  it('keeps preset rule mode active when the only preset rule is disabled', async () => {
    const { applyDocsIslandsUserConfig } = await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};

    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
      {
        logging: {
          levels: ['warn'],
          plugins: {
            hmr,
          },
          rules: {
            'hmr/viteAfterUpdate': 'off',
          },
        },
      },
    );

    expect(resolved.logging).toEqual({
      levels: ['warn'],
      rules: [
        {
          enabled: false,
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          label: 'hmr/viteAfterUpdate',
          main: '@docs-islands/vitepress',
        },
      ],
    });

    expect(
      shouldSuppressLog(
        'warn',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          main: '@docs-islands/vitepress',
          message: 'ready to update',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);
  });

  it('applies plugin-backed logging rules before injecting runtime config', async () => {
    const { applyDocsIslandsUserConfig, applyDocsIslandsViteBaseConfig } =
      await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};

    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
      {
        logging: {
          debug: true,
          levels: ['warn'],
          plugins: {
            hmr,
          },
          rules: {
            'hmr/markdownUpdate': 'off',
            'hmr/viteAfterUpdate': {},
          },
        },
      },
    );

    expect(
      shouldSuppressLog(
        'warn',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          main: '@docs-islands/vitepress',
          message: 'ready to update',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(false);
    expect(
      shouldSuppressLog(
        'info',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          main: '@docs-islands/vitepress',
          message: 'ready to update',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);
    expect(
      shouldSuppressLog(
        'warn',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
          main: '@docs-islands/vitepress',
          message:
            'container script content changed, container script content will be re-parsed...',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);

    applyDocsIslandsViteBaseConfig(
      vitepressConfig as any,
      {
        base: '/',
        cleanUrls: false,
      } as any,
      {
        ...resolved,
        siteDevtoolsEnabled: false,
      },
    );

    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_CONFIG__',
    );
    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_SCOPE_ID__',
    );
    expect(
      vitepressConfig.vite.plugins.some(
        (plugin: { name?: string }) =>
          plugin.name === LOGGER_FACADE_PLUGIN_NAME,
      ),
    ).toBe(true);
  });

  it('applies the normalized logger config and registers the virtual facade', async () => {
    const { applyDocsIslandsUserConfig, applyDocsIslandsViteBaseConfig } =
      await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};

    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
      {
        logging: {
          debug: false,
          levels: ['info', 'success', 'warn'],
          rules: [
            {
              enabled: false,
              group: 'runtime.react.*',
              label: 'suppress-runtime-react',
              main: '@docs-islands/vitepress',
              message: '*suppressed*',
            },
          ],
        },
      },
    );

    expect(
      shouldSuppressLog(
        'info',
        {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          main: '@docs-islands/vitepress',
          message: 'suppressed ready',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);

    expect(
      shouldSuppressLog(
        'info',
        {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          main: '@docs-islands/vitepress',
          message: 'visible ready',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);

    expect(
      shouldSuppressLog(
        'success',
        {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          main: '@docs-islands/core',
          message: 'visible success',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);

    expect(
      shouldSuppressLog(
        'debug',
        {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          main: '@docs-islands/vitepress',
          message: 'still hidden',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);

    applyDocsIslandsViteBaseConfig(
      vitepressConfig as any,
      {
        base: '/',
        cleanUrls: false,
      } as any,
      {
        ...resolved,
        siteDevtoolsEnabled: false,
      },
    );

    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_CONFIG__',
    );
    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_SCOPE_ID__',
    );
    expect(
      vitepressConfig.vite.plugins.some(
        (plugin: { name?: string }) =>
          plugin.name === LOGGER_FACADE_PLUGIN_NAME,
      ),
    ).toBe(true);
  });

  it('rejects missing logger rule labels', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(() =>
      resolveLoggingConfig({
        rules: [
          {
            group: 'runtime.react.*',
            main: '@docs-islands/vitepress',
          } as never,
        ],
      }),
    ).toThrow('Every logger rule must provide a non-empty label.');
  });

  it('rejects duplicate logger rule labels', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(() =>
      resolveLoggingConfig({
        rules: [
          {
            group: 'runtime.react.*',
            label: 'duplicate-label',
            main: '@docs-islands/vitepress',
          },
          {
            group: VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
            label: 'duplicate-label',
            main: '@docs-islands/vitepress',
          },
        ],
      }),
    ).toThrow(
      'Logger rule label "duplicate-label" must be unique within logging.rules.',
    );
  });

  it('rejects plugin-backed rules that reference an unknown plugin', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(() =>
      resolveLoggingConfig({
        rules: {
          'hmr/viteAfterUpdate': {},
        },
      }),
    ).toThrow(
      'logging.rules key "hmr/viteAfterUpdate" references unknown logging plugin "hmr".',
    );
  });

  it('rejects preset overrides that try to replace inherited matchers', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(() =>
      resolveLoggingConfig({
        plugins: {
          hmr,
        },
        rules: {
          'hmr/viteAfterUpdate': {
            group: 'custom.group',
            main: '@docs-islands/custom',
          } as never,
        },
      }),
    ).toThrow(
      'logging.rules["hmr/viteAfterUpdate"] preset overrides only support "enabled", "message", and "levels".',
    );
  });

  it('rejects mixing logging.plugins with array-style logging.rules', async () => {
    const { resolveLoggingConfig } = await import('../../../core/config');

    expect(() =>
      resolveLoggingConfig({
        plugins: {
          hmr,
        },
        rules: [
          {
            group: 'hmr.vite.after-update',
            label: 'manual-hmr',
          },
        ],
      }),
    ).toThrow(
      'logging.plugins can only be used with object-style logging.rules entries such as "hmr/viteAfterUpdate".',
    );
  });
});
