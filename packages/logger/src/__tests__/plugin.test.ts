/**
 * @vitest-environment node
 */
import {
  DEFAULT_LOGGER_MODULE_ID,
  DEFAULT_LOGGER_SCOPE_ID,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
  transformLoggerTreeShaking,
} from '@docs-islands/logger/internal';
import * as loggerPluginModule from '@docs-islands/logger/plugin';
import { loggerPlugin } from '@docs-islands/logger/plugin';
import { rolldown } from 'rolldown';
import { rollup } from 'rollup';
import { afterEach, describe, expect, it } from 'vitest';
import { LOGGER_TREE_SHAKING_PLAYGROUND_BUILDS } from '../../playground/tree-shaking/builders';
import {
  LOGGER_TREE_SHAKING_HIDDEN_INFO,
  LOGGER_TREE_SHAKING_VISIBLE_WARNING,
} from '../../playground/tree-shaking/expected';

const TEST_SCOPE_ID = 'logger-plugin-test-scope';
const TEST_MODULE_ID = '/workspace/docs/components/LoggerProbe.tsx';

type ViteHook<T extends (...args: never[]) => unknown> = T | { handler: T };
type ViteTransformHook =
  | ((this: unknown, code: string, id: string) => unknown)
  | { handler: (this: unknown, code: string, id: string) => unknown };
type ViteConfigHook = ViteHook<
  (this: unknown, config: { define?: Record<string, unknown> }) => unknown
>;
type ViteConfigResolvedHook = ViteHook<
  (this: unknown, config: { command: 'build' | 'serve' }) => unknown
>;
type LoggerRawPlugin = ReturnType<(typeof loggerPlugin)['raw']>;
type RollupOptionsHook = ViteHook<
  (this: unknown, options: { plugins?: unknown }) => unknown
>;
type RolldownOptionsHook = ViteHook<
  (this: unknown, options: { plugins?: unknown }) => unknown
>;
type FarmConfigHook = (config: {
  compilation?: {
    define?: Record<string, unknown>;
  };
}) => unknown;
type BundlerCompilerHook = (compiler: {
  options?: {
    mode?: string;
  };
  webpack?: {
    DefinePlugin?: new (definitions: Record<string, string>) => {
      apply: (compiler: unknown) => void;
    };
  };
}) => void;
const createStaticLoggerSource = (
  message: string,
  kind: 'debug' | 'info' | 'warn' = 'info',
): string => `
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.${kind}('${message}');
`;

const assertTreeShakenPlaygroundOutput = (
  code: string,
  hiddenMessage: string,
  visibleMessage: string,
) => {
  expect(code).not.toContain(hiddenMessage);
  expect(code).toContain(visibleMessage);
};

const callViteHook = <T extends (...args: never[]) => unknown>(
  hook: ViteHook<T> | undefined,
  ...args: Parameters<T>
): ReturnType<T> | undefined => {
  if (!hook) {
    return undefined;
  }

  return (
    typeof hook === 'function'
      ? hook.call({}, ...args)
      : hook.handler.call({}, ...args)
  ) as ReturnType<T>;
};

const runPluginTransform = async (
  plugin: ReturnType<(typeof loggerPlugin)['vite']>,
  code: string,
  command: 'build' | 'serve' = 'build',
): Promise<string> => {
  callViteHook(
    (plugin as { configResolved?: ViteConfigResolvedHook }).configResolved,
    { command },
  );

  const transform = (plugin as { transform?: ViteTransformHook }).transform;

  if (!transform) {
    throw new Error('Expected logger plugin transform hook.');
  }

  const result = await (typeof transform === 'function'
    ? transform.call({}, code, TEST_MODULE_ID)
    : transform.handler.call({}, code, TEST_MODULE_ID));
  const transformed = result as { code?: unknown } | null | undefined;

  return typeof transformed?.code === 'string' ? transformed.code : code;
};

const runRawPluginTransform = async (
  plugin: LoggerRawPlugin,
  code: string,
  context: object = {},
): Promise<string> => {
  const transform = plugin.transform as ViteTransformHook | undefined;

  if (!transform) {
    throw new Error('Expected logger plugin transform hook.');
  }

  const result = await (typeof transform === 'function'
    ? transform.call(context, code, TEST_MODULE_ID)
    : transform.handler.call(context, code, TEST_MODULE_ID));
  const transformed = result as string | { code?: unknown } | null | undefined;

  if (typeof transformed === 'string') {
    return transformed;
  }

  return typeof transformed?.code === 'string' ? transformed.code : code;
};

const runRolldownOptionsHook = async (
  plugin: LoggerRawPlugin,
  options: { plugins?: unknown },
): Promise<{ plugins?: unknown }> => {
  const optionsHook = plugin.rolldown?.options as
    | RolldownOptionsHook
    | undefined;

  if (!optionsHook) {
    throw new Error('Expected logger plugin rolldown options hook.');
  }

  const result = (await callViteHook(optionsHook, options)) as
    | { plugins?: unknown }
    | null
    | undefined;

  return result ?? options;
};

const runRollupOptionsHook = async (
  plugin: LoggerRawPlugin,
  options: { plugins?: unknown },
): Promise<{ plugins?: unknown }> => {
  const optionsHook = plugin.rollup?.options as RollupOptionsHook | undefined;

  if (!optionsHook) {
    throw new Error('Expected logger plugin rollup options hook.');
  }

  const result = (await callViteHook(optionsHook, options)) as
    | { plugins?: unknown }
    | null
    | undefined;

  return result ?? options;
};

const createRawPlugin = (
  framework: Parameters<(typeof loggerPlugin)['raw']>[1]['framework'],
  options?: Parameters<(typeof loggerPlugin)['raw']>[0],
): LoggerRawPlugin =>
  loggerPlugin.raw(options, {
    framework,
  } as Parameters<(typeof loggerPlugin)['raw']>[1]);

afterEach(() => {
  resetLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID);
  resetLoggerConfigForScope(TEST_SCOPE_ID);
});

describe('logger plugin', () => {
  it('exposes a Vite plugin through unplugin', () => {
    const plugin = loggerPlugin.vite();

    expect(plugin).toMatchObject({
      enforce: 'post',
      name: 'docs-islands:logger',
    });
  });

  it('only exposes the public loggerPlugin entrypoint', () => {
    expect(Object.keys(loggerPluginModule).toSorted()).toEqual([
      'loggerPlugin',
    ]);
  });

  it('injects controlled runtime config into Vite define', () => {
    const plugin = loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    });
    const config: { define?: Record<string, unknown> } = {};

    callViteHook((plugin as { config?: ViteConfigHook }).config, config);

    expect(config.define).toMatchObject({
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({
        levels: ['warn', 'error'],
      }),
    });
  });

  it('injects controlled runtime config into esbuild define', () => {
    const plugin = createRawPlugin('esbuild', {
      config: {
        levels: ['warn', 'error'],
      },
    });
    const config: { define?: Record<string, string> } = {};

    plugin.esbuild?.config?.(config);

    expect(config.define).toMatchObject({
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({
        levels: ['warn', 'error'],
      }),
    });
  });

  it('injects controlled runtime config into Farm compilation define', () => {
    const plugin = createRawPlugin('farm', {
      config: {
        levels: ['warn', 'error'],
      },
    });
    const config: {
      compilation?: {
        define?: Record<string, unknown>;
      };
    } = {};
    const farmConfig = plugin.farm?.config as FarmConfigHook | undefined;

    const returnedConfig = farmConfig?.(config);

    expect(config.compilation?.define).toMatchObject({
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({
        levels: ['warn', 'error'],
      }),
    });
    expect(returnedConfig).toBe(config);
  });

  it.each(['webpack', 'rspack'] as const)(
    'injects controlled runtime config through %s DefinePlugin',
    (framework) => {
      let receivedDefinitions: Record<string, string> | undefined;
      let applyTarget: unknown;

      class DefinePlugin {
        constructor(definitions: Record<string, string>) {
          receivedDefinitions = definitions;
        }

        apply(compiler: unknown): void {
          applyTarget = compiler;
        }
      }

      const plugin = createRawPlugin(framework, {
        config: {
          debug: true,
        },
      });
      const compiler = {
        webpack: {
          DefinePlugin,
        },
      };

      (plugin[framework] as BundlerCompilerHook | undefined)?.(compiler);

      expect(receivedDefinitions).toMatchObject({
        __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
        __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({
          debug: true,
        }),
      });
      expect(applyTarget).toBe(compiler);
    },
  );

  it('injects controlled runtime config through Rollup replace plugin', async () => {
    const existingPlugin = {
      name: 'user-plugin',
    };
    const plugin = createRawPlugin('rollup', {
      config: {
        levels: ['error'],
      },
    });
    const config = await runRollupOptionsHook(plugin, {
      plugins: [existingPlugin],
    });
    const plugins = config.plugins as unknown[];
    const replace = plugins[0] as {
      name?: string;
    };

    expect(Array.isArray(plugins)).toBe(true);
    expect(replace).toMatchObject({
      name: 'replace',
    });
    expect(plugins[1]).toEqual([existingPlugin]);
  });

  it('leaves Rollup runtime config constants for replace plugin', async () => {
    const plugin = createRawPlugin('rollup', {
      config: {
        levels: ['error'],
      },
      treeshake: false,
    });
    const code = await runRawPluginTransform(
      plugin,
      `
const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__;
const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
      `,
    );

    expect(code).toContain('__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__');
    expect(code).toContain('__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__');
  });

  it('replaces controlled runtime config constants in Rollup builds', async () => {
    const bundle = await rollup({
      input: 'virtual-entry.ts',
      plugins: [
        {
          load(id) {
            if (id !== 'virtual-entry.ts') {
              return null;
            }

            return `
const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__;
const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
console.log(controlled, config);
            `;
          },
          name: 'virtual-entry',
          resolveId(id) {
            return id === 'virtual-entry.ts' ? id : null;
          },
        },
        loggerPlugin.rollup({
          config: {
            levels: ['error'],
          },
          treeshake: false,
        }),
      ],
    });

    try {
      const { output } = await bundle.generate({
        format: 'esm',
      });
      const chunk = output.find((item) => item.type === 'chunk');

      expect(chunk?.code).toContain('const controlled = true;');
      expect(chunk?.code).toContain('const config = {"levels":["error"]};');
      expect(chunk?.code).toContain('"levels":["error"]');
      expect(chunk?.code).not.toContain(
        '__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__',
      );
      expect(chunk?.code).not.toContain(
        '__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__',
      );
    } finally {
      await bundle.close();
    }
  });

  it('leaves runtime config constants to bundler define hooks during transform', async () => {
    const plugin = createRawPlugin('esbuild', {
      config: {
        levels: ['error'],
      },
      treeshake: false,
    });
    const code = await runRawPluginTransform(
      plugin,
      `
const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === true;
      `,
    );

    expect(code).toContain(
      'const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;',
    );
    expect(code).toContain(
      'const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === true;',
    );
  });

  it('injects controlled runtime config through Rolldown replacePlugin', async () => {
    const existingPlugin = {
      name: 'user-plugin',
    };
    const plugin = createRawPlugin('rolldown', {
      config: {
        levels: ['error'],
      },
    });
    const config = await runRolldownOptionsHook(plugin, {
      plugins: [existingPlugin],
    });
    const plugins = config.plugins as unknown[];
    const replace = plugins[0] as {
      _options?: {
        preventAssignment?: boolean;
        values?: Record<string, string>;
      };
      name?: string;
    };

    expect(Array.isArray(plugins)).toBe(true);
    expect(replace).toMatchObject({
      _options: {
        preventAssignment: true,
        values: {
          __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
          __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({
            levels: ['error'],
          }),
        },
      },
      name: 'builtin:replace',
    });
    expect(plugins[1]).toEqual([existingPlugin]);
  });

  it('leaves Rolldown runtime config constants for replacePlugin', async () => {
    const plugin = createRawPlugin('rolldown', {
      config: {
        levels: ['error'],
      },
      treeshake: false,
    });
    const code = await runRawPluginTransform(
      plugin,
      `
const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__;
const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
      `,
    );

    expect(code).toContain('__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__');
    expect(code).toContain('__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__');
  });

  it('replaces controlled runtime config constants in Rolldown builds', async () => {
    const bundle = await rolldown({
      input: 'virtual-entry.ts',
      plugins: [
        {
          load(id) {
            if (id !== 'virtual-entry.ts') {
              return null;
            }

            return `
const controlled = __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__;
const config = __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
console.log(controlled, config);
            `;
          },
          name: 'virtual-entry',
          resolveId(id) {
            return id === 'virtual-entry.ts' ? id : null;
          },
        },
        loggerPlugin.rolldown({
          config: {
            levels: ['error'],
          },
          treeshake: false,
        }),
      ],
    });

    try {
      const { output } = await bundle.generate({
        format: 'esm',
      });
      const chunk = output.find((item) => item.type === 'chunk');

      expect(chunk?.code).toContain('console.log(true');
      expect(chunk?.code).toContain('"levels": ["error"]');
      expect(chunk?.code).not.toContain(
        '__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__',
      );
      expect(chunk?.code).not.toContain(
        '__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__',
      );
    } finally {
      await bundle.close();
    }
  });

  it('uses null runtime config when plugin config is omitted', () => {
    const plugin = loggerPlugin.vite();
    const config: { define?: Record<string, unknown> } = {};

    callViteHook((plugin as { config?: ViteConfigHook }).config, config);

    expect(config.define).toMatchObject({
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
      __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: 'null',
    });
  });

  it.each(LOGGER_TREE_SHAKING_PLAYGROUND_BUILDS)(
    'tree-shakes suppressed static logs in $bundler playground build output',
    async ({ build }) => {
      const code = await build();

      assertTreeShakenPlaygroundOutput(
        code,
        LOGGER_TREE_SHAKING_HIDDEN_INFO,
        LOGGER_TREE_SHAKING_VISIBLE_WARNING,
      );
    },
  );

  it('tree-shakes debug logs with the default visibility when config is omitted', async () => {
    const code = await runPluginTransform(
      loggerPlugin.vite(),
      createStaticLoggerSource('hidden default debug', 'debug'),
    );

    expect(code).not.toContain('hidden default debug');
  });

  it('keeps static logs when treeshake is disabled', async () => {
    const code = await runPluginTransform(
      loggerPlugin.vite({
        config: {
          levels: ['error'],
        },
        treeshake: false,
      }),
      createStaticLoggerSource('kept disabled-treeshake info'),
    );

    expect(code).toContain('kept disabled-treeshake info');
  });

  it('does not tree-shake during Vite dev server usage', async () => {
    const code = await runPluginTransform(
      loggerPlugin.vite({
        config: {
          levels: ['error'],
        },
      }),
      createStaticLoggerSource('kept dev-server info'),
      'serve',
    );

    expect(code).toContain('kept dev-server info');
  });

  it('requires an explicit logger module id for direct transforms', async () => {
    await expect(
      transformLoggerTreeShaking('const message = "noop";', TEST_MODULE_ID, {
        loggerScopeId: TEST_SCOPE_ID,
      } as Parameters<typeof transformLoggerTreeShaking>[2]),
    ).rejects.toThrow('logger tree-shaking requires explicit loggerModuleId.');

    await expect(
      transformLoggerTreeShaking('const message = "noop";', TEST_MODULE_ID, {
        loggerModuleId: '',
        loggerScopeId: TEST_SCOPE_ID,
      }),
    ).rejects.toThrow(
      'logger tree-shaking requires a non-empty loggerModuleId.',
    );
  });

  it('removes suppressed static literal logs from @docs-islands/logger imports', async () => {
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['warn', 'error'],
    });

    const result = await transformLoggerTreeShaking(
      `
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('hidden static info');
logger.warn('visible static warning');
      `,
      TEST_MODULE_ID,
      {
        loggerModuleId: DEFAULT_LOGGER_MODULE_ID,
        loggerScopeId: TEST_SCOPE_ID,
      },
    );

    expect(result?.code).not.toContain('hidden static info');
    expect(result?.code).toContain("logger.warn('visible static warning')");
  });

  it('removes suppressed static literal logs from @docs-islands/logger/internal imports', async () => {
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['warn', 'error'],
    });

    const result = await transformLoggerTreeShaking(
      `
import { createLogger } from '@docs-islands/logger/internal';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('hidden internal static info');
logger.warn('visible internal static warning');
      `,
      TEST_MODULE_ID,
      {
        loggerModuleId: '@docs-islands/logger/internal',
        loggerScopeId: TEST_SCOPE_ID,
      },
    );

    expect(result?.code).not.toContain('hidden internal static info');
    expect(result?.code).toContain(
      "logger.warn('visible internal static warning')",
    );
  });

  it('keeps unsupported static shapes unchanged', async () => {
    setLoggerConfigForScope(TEST_SCOPE_ID, {
      levels: ['error'],
    });

    const source = `
import { createLogger as makeLogger } from '@docs-islands/logger';

const group = 'userland.metrics';
const logger = makeLogger({ main: '@acme/docs' }).getLoggerByGroup(group);

logger.info('kept aliased dynamic info');
`;
    const result = await transformLoggerTreeShaking(source, TEST_MODULE_ID, {
      loggerModuleId: DEFAULT_LOGGER_MODULE_ID,
      loggerScopeId: TEST_SCOPE_ID,
    });

    expect(result).toBeNull();
  });
});
