/**
 * @vitest-environment node
 */
import {
  resetLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/utils/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockWarn = vi.fn();

vi.mock('#shared/logger', () => ({
  default: () => ({
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

  it('applies the normalized logger config and injects it into vite define', async () => {
    const { applyDocsIslandsUserConfig, applyDocsIslandsViteBaseConfig } =
      await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};

    const resolved = applyDocsIslandsUserConfig(vitepressConfig as any, {
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
    });

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'suppressed ready',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'visible ready',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('success', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/core',
        message: 'visible success',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('debug', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'still hidden',
      }),
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

    expect(vitepressConfig.vite.define.__DOCS_ISLANDS_LOGGER_CONFIG__).toBe(
      JSON.stringify(resolved.logging ?? null),
    );
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
            group: 'plugin.hmr.markdown-update',
            label: 'duplicate-label',
            main: '@docs-islands/vitepress',
          },
        ],
      }),
    ).toThrow(
      'Logger rule label "duplicate-label" must be unique within logging.rules.',
    );
  });
});
