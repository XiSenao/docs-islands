import { resetLoggerConfig, setLoggerConfig } from '@docs-islands/utils/logger';
import * as vitepressPublicModule from '@docs-islands/vitepress';
import * as publicLoggerModule from '@docs-islands/vitepress/logger';
import {
  createLogger,
  formatDebugMessage,
} from '@docs-islands/vitepress/logger';
import presets, { hmr, runtime } from '@docs-islands/vitepress/logger/presets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('public vitepress logger api', () => {
  beforeEach(() => {
    resetLoggerConfig();
  });

  afterEach(() => {
    resetLoggerConfig();
  });

  it('exposes the minimal public logger surface without accessor exports', () => {
    expect(publicLoggerModule).toHaveProperty('createLogger');
    expect(publicLoggerModule.createLogger).toBe(createLogger);
    expect(publicLoggerModule).toHaveProperty('formatDebugMessage');
    expect(publicLoggerModule.formatDebugMessage).toBe(formatDebugMessage);
    expect(publicLoggerModule).not.toHaveProperty('emitRuntimeLog');
    expect(publicLoggerModule).not.toHaveProperty('LightGeneralLogger');
    expect(publicLoggerModule).not.toHaveProperty('ScopedLogger');
    expect(publicLoggerModule).not.toHaveProperty('default');
    expect(publicLoggerModule).not.toHaveProperty('getLoggerInstance');
    expect(publicLoggerModule).not.toHaveProperty('getVitePressLogger');
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
