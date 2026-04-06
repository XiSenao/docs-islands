import { describe, expect, it } from 'vitest';
import { isSiteDebugAiReportRuntimeAvailable } from '../../../theme/site-debug-runtime';

describe('isSiteDebugAiReportRuntimeAvailable', () => {
  it('disables AI reports in dev', () => {
    expect(isSiteDebugAiReportRuntimeAvailable(true)).toBe(false);
  });

  it('keeps AI reports available outside dev', () => {
    expect(isSiteDebugAiReportRuntimeAvailable(false)).toBe(true);
  });
});
