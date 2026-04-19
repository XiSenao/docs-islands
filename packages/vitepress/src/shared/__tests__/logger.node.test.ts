/**
 * @vitest-environment node
 */
import {
  createLogger,
  formatDebugMessage,
  resetLoggerConfig,
  sanitizeDebugSummary,
  setLoggerConfig,
} from '@docs-islands/utils/logger';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGGER_SPEC_CASE_COUNT,
  LOGGER_SPEC_ELAPSED,
  type LoggerSpecCase,
  loggerSpecCases,
} from './logger-test-cases';

const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCodePoint(27)}\\[[\\d;]*m`,
  'g',
);
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const vitePressGeneratedConfigModuleRe =
  /(?:^|[/\\])\.vitepress[/\\]config\.ts\.timestamp-\d+-[\da-f]+\.mjs$/i;

const stripAnsi = (value: string) => value.replaceAll(ANSI_ESCAPE_RE, '');
const isTransientSourceArtifact = (filePath: string) =>
  vitePressGeneratedConfigModuleRe.test(filePath);

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

    if (
      /\.(?:cjs|js|mjs|ts|tsx)$/.test(entry.name) &&
      !isTransientSourceArtifact(nextPath)
    ) {
      files.push(nextPath);
    }
  }

  return files;
};

const normalizeConsoleMessage = (value: unknown): string =>
  stripAnsi(String(value)).replaceAll('%c', '');

const captureConsoleOutput = (): string[] => {
  const output: string[] = [];
  const capture = (firstArg: unknown) => {
    output.push(normalizeConsoleMessage(firstArg));
  };

  vi.spyOn(console, 'debug').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);

  return output;
};

const setStableElapsedClock = () => {
  const now = vi.spyOn(globalThis.performance, 'now');

  now.mockReturnValue(0);

  return now;
};

const runLoggerSpecCase = (
  specCase: LoggerSpecCase,
  debugOverride?: boolean,
): string[] => {
  const output = captureConsoleOutput();
  const now = setStableElapsedClock();

  setLoggerConfig({
    ...specCase.config,
    ...(debugOverride === undefined ? {} : { debug: debugOverride }),
  });
  now.mockReturnValue(Number.parseFloat(LOGGER_SPEC_ELAPSED));

  const loggers = Object.fromEntries(
    Object.entries(specCase.loggers).map(([name, fixture]) => [
      name,
      createLogger({
        main: fixture.main,
      }).getLoggerByGroup(fixture.group),
    ]),
  );

  for (const operation of specCase.operations) {
    loggers[operation.logger]![operation.kind](operation.message);
  }

  return output;
};

afterEach(() => {
  resetLoggerConfig();
  vi.restoreAllMocks();
});

describe('logger node behavior', () => {
  it('keeps the markdown logger spec as the complete visibility baseline', () => {
    expect(loggerSpecCases).toHaveLength(LOGGER_SPEC_CASE_COUNT);
  });

  it.each(loggerSpecCases)('$name', (specCase) => {
    expect(runLoggerSpecCase(specCase)).toEqual(specCase.expected);
  });

  it.each(
    loggerSpecCases.filter((specCase) => specCase.expectedDebug !== undefined),
  )('$name with debug labels and elapsed time', (specCase) => {
    expect(runLoggerSpecCase(specCase, true)).toEqual(specCase.expectedDebug);
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
