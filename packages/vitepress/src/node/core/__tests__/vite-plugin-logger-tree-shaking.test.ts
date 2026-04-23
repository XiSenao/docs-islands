/**
 * @vitest-environment node
 */
import {
  type LoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLoggerTreeShakingPlugin,
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  transformLoggerTreeShaking,
} from '../vite-plugin-logger-tree-shaking';

const TEST_LOGGER_SCOPE_ID = 'logger-tree-shaking-test-scope';
const TEST_MODULE_ID = '/workspace/docs/components/LoggerProbe.tsx';

const transformCode = async (
  code: string,
  config?: LoggerConfig,
): Promise<string> => {
  resetLoggerConfigForScope(TEST_LOGGER_SCOPE_ID);

  if (config !== undefined) {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, config);
  }

  const result = await transformLoggerTreeShaking(
    code,
    TEST_MODULE_ID,
    TEST_LOGGER_SCOPE_ID,
  );

  return result?.code ?? code;
};

afterEach(() => {
  resetLoggerConfigForScope(TEST_LOGGER_SCOPE_ID);
});

describe('createLoggerTreeShakingPlugin', () => {
  it('is a production build post plugin', () => {
    const plugin = createLoggerTreeShakingPlugin(TEST_LOGGER_SCOPE_ID);

    expect(plugin).toMatchObject({
      apply: 'build',
      enforce: 'post',
      name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
    });
  });

  it('skips modules without the public createLogger import', async () => {
    const source = `const message = 'hidden static info';`;

    await expect(
      transformLoggerTreeShaking(source, TEST_MODULE_ID, TEST_LOGGER_SCOPE_ID),
    ).resolves.toBeNull();
  });

  it('removes suppressed static literal logs and keeps visible logs', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('hidden static info');
logger.warn('visible static warning');
      `,
      {
        levels: ['warn', 'error'],
      },
    );

    expect(code).not.toContain('hidden static info');
    expect(code).toContain("logger.warn('visible static warning')");
  });

  it('removes debug logs with the default production visibility', async () => {
    const code = await transformCode(`
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.debug('hidden debug details');
logger.info('visible default info');
    `);

    expect(code).not.toContain('hidden debug details');
    expect(code).toContain("logger.info('visible default info')");
  });

  it('honors rule mode with main group message and level matching', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('visible exact metric');
logger.info('hidden different metric');
logger.warn('hidden warning metric');
      `,
      {
        rules: [
          {
            group: 'userland.metrics',
            label: 'metrics-info',
            levels: ['info'],
            main: '@acme/docs',
            message: 'visible exact metric',
          },
        ],
      },
    );

    expect(code).toContain("logger.info('visible exact metric')");
    expect(code).not.toContain('hidden different metric');
    expect(code).not.toContain('hidden warning metric');
  });

  it('keeps aliased createLogger imports unchanged', async () => {
    const code = await transformCode(
      `
import { createLogger as makeLogger } from '@docs-islands/vitepress/logger';

const logger = makeLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('aliased static info');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('aliased static info');
  });

  it('keeps dynamic messages and non-statement calls unchanged', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');
const message = 'runtime message';

logger.info(message);
logger.info(\`runtime \${message}\`);
logger.info('runtime ' + message);
const result = logger.info('literal non statement');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('logger.info(message)');
    expect(code).toContain('logger.info(`runtime ${message}`)');
    expect(code).toContain("logger.info('runtime ' + message)");
    expect(code).toContain(
      "const result = logger.info('literal non statement')",
    );
  });

  it('keeps logs when main or group cannot be resolved as literals', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const main = '@acme/docs';
const group = 'userland.metrics';
const logger = createLogger({ main }).getLoggerByGroup(group);

logger.info('literal with dynamic logger binding');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('literal with dynamic logger binding');
  });
});
