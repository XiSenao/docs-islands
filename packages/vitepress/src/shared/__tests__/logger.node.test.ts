/**
 * @vitest-environment node
 */
import {
  createLogger,
  formatDebugMessage,
  resetLoggerConfig,
  sanitizeDebugSummary,
  setLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/utils/logger';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCodePoint(27)}\\[[\\d;]*m`,
  'g',
);
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

const stripAnsi = (value: string) => value.replaceAll(ANSI_ESCAPE_RE, '');

const collectSourceFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    if (
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'node_modules'
    ) {
      continue;
    }

    const nextPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(nextPath));
      continue;
    }

    if (/\.(?:cjs|js|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(nextPath);
    }
  }

  return files;
};

afterEach(() => {
  resetLoggerConfig();
  vi.restoreAllMocks();
});

describe('logger node behavior', () => {
  it('defaults to info or above while keeping debug disabled', () => {
    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'visible by default',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('success', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'success visible by default',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('debug', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'hidden by default',
      }),
    ).toBe(true);
  });

  it('formats node logs as main[group]: message', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup('runtime.react.component-manager')
      .info('ready');

    expect(stripAnsi(String(consoleLog.mock.calls[0]?.[0]))).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: ready',
    );
  });

  it('routes success logs through the public success level', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup('runtime.react.component-manager')
      .success('done');

    expect(stripAnsi(String(consoleLog.mock.calls[0]?.[0]))).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: done',
    );
  });

  it('keeps grouped logger cache main-aware', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const coreLogger = createLogger({
      main: '@docs-islands/core',
    }).getLoggerByGroup('runtime.react.component-manager');
    const vitepressLogger = createLogger({
      main: '@docs-islands/vitepress',
    }).getLoggerByGroup('runtime.react.component-manager');

    expect(coreLogger).not.toBe(vitepressLogger);

    coreLogger.info('from core');
    vitepressLogger.info('from vitepress');

    expect(stripAnsi(String(consoleLog.mock.calls[0]?.[0]))).toBe(
      '@docs-islands/core[runtime.react.component-manager]: from core',
    );
    expect(stripAnsi(String(consoleLog.mock.calls[1]?.[0]))).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: from vitepress',
    );
  });

  it('matches main exact, group exact-or-glob, and message picomatch rules', () => {
    setLoggerConfig({
      debug: false,
      levels: ['info', 'success', 'warn', 'error'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'vitepress-runtime-react',
          levels: ['warn'],
          main: '@docs-islands/vitepress',
          message: '*secret*',
        },
        {
          group: 'runtime.react.component-manager',
          label: 'core-runtime-react',
          levels: ['error'],
          main: '@docs-islands/core',
          message: 'special-*',
        },
      ],
    });

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'secret payload',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('warn', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'secret payload',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.vue.component-manager',
        main: '@docs-islands/vitepress',
        message: 'secret payload',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('warn', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/core',
        message: 'special-case',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('error', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/core',
        message: 'special-case',
      }),
    ).toBe(false);
  });

  it('treats success as its own allowlisted API in logging levels', () => {
    setLoggerConfig({
      debug: false,
      levels: ['info', 'success', 'warn', 'error'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'success-only-runtime-react',
          levels: ['success'],
          main: '@docs-islands/vitepress',
        },
      ],
    });

    expect(
      shouldSuppressLog('success', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'successful hydration',
      }),
    ).toBe(false);

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'successful hydration',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('warn', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'successful hydration',
      }),
    ).toBe(true);
  });

  it('suppresses success when the matched levels omit success explicitly', () => {
    setLoggerConfig({
      debug: false,
      levels: ['info', 'warn', 'error'],
    });

    expect(
      shouldSuppressLog('success', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'success hidden by explicit omission',
      }),
    ).toBe(true);
  });

  it('treats empty levels as an explicit no-output rule', () => {
    setLoggerConfig({
      debug: false,
      levels: ['info', 'success', 'warn', 'error'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'hide-vitepress-runtime-react',
          levels: [],
          main: '@docs-islands/vitepress',
        },
      ],
    });

    expect(
      shouldSuppressLog('info', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'hidden info',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('warn', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'hidden warn',
      }),
    ).toBe(true);

    expect(
      shouldSuppressLog('error', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'hidden error',
      }),
    ).toBe(true);
  });

  it('keeps debug as an independent global gate', () => {
    setLoggerConfig({
      debug: false,
      levels: [],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'vitepress-debug-runtime-react',
          main: '@docs-islands/vitepress',
        },
      ],
    });

    expect(
      shouldSuppressLog('debug', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'hidden debug',
      }),
    ).toBe(true);

    setLoggerConfig({
      debug: true,
      levels: [],
    });

    expect(
      shouldSuppressLog('debug', {
        group: 'runtime.react.component-manager',
        main: '@docs-islands/vitepress',
        message: 'visible debug',
      }),
    ).toBe(false);
  });

  it('formats debug messages with context decision sanitized summary and timing', () => {
    expect(
      formatDebugMessage({
        context: 'react runtime\n  initialization',
        decision: 'cache the shared runtime after it becomes ready',
        summary: {
          error: new Error('secret\nstack'),
          pageId: '/guide/getting-started',
          steps: [1, 2, 3, 4, 5, 6, 7],
        },
        timingMs: 12.3456,
      }),
    ).toBe(
      'context=react runtime initialization | decision=cache the shared runtime after it becomes ready | summary={"error":"secret stack","pageId":"/guide/getting-started","steps":[1,2,3,4,5,6,"[+1 more]"]} | timing=12.35ms',
    );

    const sanitizedSummary = sanitizeDebugSummary({
      nested: {
        token: 'x'.repeat(180),
      },
    });

    expect(sanitizedSummary).toContain('"token":"');
    expect(sanitizedSummary.endsWith('...')).toBe(true);
    expect(sanitizedSummary).not.toContain('x'.repeat(180));
  });

  it('shows the matched rule label before every emitted log when debug is enabled', () => {
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

    expect(stripAnsi(String(consoleLog.mock.calls[0]?.[0]))).toBe(
      '@docs-islands/vitepress[runtime.react.component-manager]: [rule:runtime-react-rule] ready',
    );
  });

  it('shows the root label when debug is enabled and no rule matches', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setLoggerConfig({
      debug: true,
      levels: ['warn'],
      rules: [
        {
          group: 'runtime.react.*',
          label: 'runtime-react-rule',
          main: '@docs-islands/vitepress',
        },
      ],
    });

    createLogger({
      main: '@docs-islands/core',
    })
      .getLoggerByGroup('runtime.react.component-manager')
      .warn('fallback');

    expect(stripAnsi(String(consoleWarn.mock.calls[0]?.[0]))).toBe(
      '@docs-islands/core[runtime.react.component-manager]: [rule:<root>] fallback',
    );
  });

  it('keeps non-test debug call sites on the structured debug helper', () => {
    const targetRoot = path.join(repoRoot, 'packages');
    const offenders = collectSourceFiles(targetRoot)
      .filter(
        (filePath) =>
          !filePath.includes(`${path.sep}__tests__${path.sep}`) &&
          !/\.test\.[cm]?[jt]sx?$/.test(filePath) &&
          !filePath.includes(`${path.sep}playground${path.sep}`),
      )
      .flatMap((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        const matches = [...source.matchAll(/\.debug\(/g)];

        return matches
          .filter(({ index }) => typeof index === 'number')
          .map(({ index }) => {
            const occurrenceIndex = index ?? 0;
            const snippet = source.slice(
              occurrenceIndex,
              occurrenceIndex + 260,
            );
            return {
              filePath,
              snippet,
            };
          })
          .filter(
            ({ snippet }) =>
              !snippet.includes('formatDebugMessage(') &&
              !snippet.includes('__docs_islands_format_debug__('),
          )
          .map(({ filePath }) => path.relative(repoRoot, filePath));
      });

    expect(offenders).toEqual([]);
  });

  it('forbids raw new Logger construction outside the logger implementation', () => {
    const targetRoots = ['packages', 'scripts', 'utils'].map((segment) =>
      path.join(repoRoot, segment),
    );
    const offenders = targetRoots
      .flatMap((targetRoot) => collectSourceFiles(targetRoot))
      .filter(
        (filePath) =>
          filePath !== path.join(repoRoot, 'utils', 'logger.ts') &&
          /new Logger\(/.test(fs.readFileSync(filePath, 'utf8')),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });
});
