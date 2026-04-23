/**
 * @vitest-environment node
 */
import {
  resetLoggerConfigForScope,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  loggerTreeShaking,
  transformLoggerTreeShaking,
} from '@docs-islands/logger/plugin';
import { afterEach, describe, expect, it } from 'vitest';

const TEST_SCOPE_ID = 'logger-plugin-test-scope';
const TEST_MODULE_ID = '/workspace/docs/components/LoggerProbe.tsx';

afterEach(() => {
  resetLoggerConfigForScope(TEST_SCOPE_ID);
});

describe('logger tree-shaking plugin', () => {
  it('exposes a Vite build plugin through unplugin', () => {
    const plugin = loggerTreeShaking.vite({
      loggerScopeId: TEST_SCOPE_ID,
    });

    expect(plugin).toMatchObject({
      apply: 'build',
      enforce: 'post',
      name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
    });
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
        loggerScopeId: TEST_SCOPE_ID,
      },
    );

    expect(result?.code).not.toContain('hidden static info');
    expect(result?.code).toContain("logger.warn('visible static warning')");
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
      loggerScopeId: TEST_SCOPE_ID,
    });

    expect(result).toBeNull();
  });
});
