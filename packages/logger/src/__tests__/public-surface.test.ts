import * as loggerRoot from '@docs-islands/logger';
import { describe, expect, it } from 'vitest';

describe('public logger root surface', () => {
  it('only exposes createLogger and setLoggerConfig', () => {
    expect(Object.keys(loggerRoot).toSorted()).toEqual([
      'createLogger',
      'setLoggerConfig',
    ]);
  });
});
