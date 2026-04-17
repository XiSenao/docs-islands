/**
 * @vitest-environment jsdom
 */
import {
  createLogger,
  lightGeneralLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/utils/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

const stripBrowserFormatTokens = (value: string) => value.replaceAll('%c', '');

afterEach(() => {
  resetLoggerConfig();
  vi.restoreAllMocks();
});

describe('logger browser behavior', () => {
  it('formats browser logs as main[group]: message', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup('runtime.react.component-manager')
      .info('ready');

    expect(
      stripBrowserFormatTokens(String(consoleLog.mock.calls[0]?.[0])),
    ).toBe('@docs-islands/vitepress[runtime.react.component-manager]: ready');
  });

  it('keeps lightGeneralLogger output on the plain message body', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    lightGeneralLogger(
      '@docs-islands/vitepress',
      'warn',
      'runtime warning',
      'runtime.react.component-manager',
    ).log();

    expect(
      stripBrowserFormatTokens(String(consoleWarn.mock.calls[0]?.[0])),
    ).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: runtime warning',
    );
  });

  it('shows rule labels in browser output when debug is enabled', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    setLoggerConfig({
      debug: true,
      levels: ['info', 'success', 'warn', 'error'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'runtime-react-rule',
          main: '@docs-islands/vitepress',
        },
      ],
    });

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup('runtime.react.component-manager')
      .info('ready');

    expect(
      stripBrowserFormatTokens(String(consoleLog.mock.calls[0]?.[0])),
    ).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: [rule:runtime-react-rule] ready',
    );
  });
});
