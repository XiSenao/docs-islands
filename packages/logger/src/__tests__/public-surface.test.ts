import * as loggerRoot from '@docs-islands/logger';
import { describe, expect, it } from 'vitest';

type PublicCreateLoggerArgs = Parameters<typeof loggerRoot.createLogger>;

const publicCreateLoggerArgs: PublicCreateLoggerArgs = [
  { main: '@acme/logger' },
];
// @ts-expect-error Public createLogger does not accept internal scope ids.
const publicCreateLoggerArgsWithScope: PublicCreateLoggerArgs = [
  { main: '@acme/logger' },
  'internal-scope',
];

describe('public logger root surface', () => {
  it('keeps createLogger public arguments type constrained', () => {
    expect(publicCreateLoggerArgs).toHaveLength(1);
    expect(publicCreateLoggerArgsWithScope).toHaveLength(2);
  });

  it('only exposes createLogger and setLoggerConfig', () => {
    expect(Object.keys(loggerRoot).toSorted()).toEqual([
      'createLogger',
      'setLoggerConfig',
    ]);
  });
});
