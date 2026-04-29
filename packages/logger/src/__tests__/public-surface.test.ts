import * as loggerRoot from '@docs-islands/logger';
import * as loggerCore from '@docs-islands/logger/core';
import * as loggerCoreHelper from '@docs-islands/logger/core/helper';
import * as loggerHelper from '@docs-islands/logger/helper';
import { describe, expect, it } from 'vitest';

type PublicCreateLoggerArgs = Parameters<typeof loggerRoot.createLogger>;

const publicCreateLoggerArgs: PublicCreateLoggerArgs = [
  { main: '@acme/logger' },
];
// @ts-expect-error Public createLogger does not accept explicit scope ids.
const publicCreateLoggerArgsWithScope: PublicCreateLoggerArgs = [
  { main: '@acme/logger' },
  'explicit-scope',
];

describe('public logger root surface', () => {
  it('keeps createLogger public arguments type constrained', () => {
    expect(publicCreateLoggerArgs).toHaveLength(1);
    expect(publicCreateLoggerArgsWithScope).toHaveLength(2);
  });

  it('exposes default-scope logger controls from the root entry', () => {
    expect(Object.keys(loggerRoot).toSorted()).toEqual([
      'createLogger',
      'resetLoggerConfig',
      'setLoggerConfig',
    ]);
  });

  it('exposes common utilities from the helper entry', () => {
    expect(Object.keys(loggerHelper).toSorted()).toEqual([
      'createElapsedLogOptions',
      'formatDebugMessage',
      'formatElapsedTime',
      'formatErrorMessage',
      'sanitizeDebugSummary',
    ]);
    expect(
      loggerHelper.formatDebugMessage({
        context: 'public surface',
        decision: 'helper entry',
      }),
    ).toContain('decision=helper entry');
  });

  it('exposes scoped logger utilities from the core helper entry', () => {
    expect(Object.keys(loggerCoreHelper).toSorted()).toEqual([
      'createLoggerScopeId',
      'normalizeLoggerConfig',
    ]);
    expect(loggerCoreHelper.createLoggerScopeId()).toMatch(
      /^docs-islands-logger-scope-/,
    );
  });

  it('keeps helper utilities out of the core entry', () => {
    expect(Object.keys(loggerCore).toSorted()).toEqual([
      'createScopedLogger',
      'getScopedLoggerConfig',
      'resetScopedLoggerConfig',
      'setScopedLoggerConfig',
      'shouldSuppressLog',
    ]);
  });
});
