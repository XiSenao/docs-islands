/**
 * Integration Tests: Default Behavior
 *
 * Tests Cases 24-25 from test-spec.md
 * - Behavior when no rules are configured
 * - Debug mode vs non-debug mode
 *
 * @vitest-environment node
 */
import {
  createLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Integration: Default Behavior', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    resetLoggerConfig();
  });

  describe('No Rules Configured', () => {
    it('Case 24: No rules with debug=false outputs default levels', () => {
      setLoggerConfig({
        debug: false,
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.default');
      logger.debug('message A_d');
      logger.info('message A_i');
      logger.success('message A_s');
      logger.warn('message A_w');
      logger.error('message A_e');

      // Should output: info, success, warn, error (not debug)
      expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // info + success
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.default]: message A_i',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.default]: message A_s',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.default]: message A_w',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.default]: message A_e',
        ),
      );
    });

    it('Case 25: No rules with debug=true outputs all levels with elapsed time', () => {
      setLoggerConfig({
        debug: true,
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.default');
      logger.debug('message A_d');
      logger.info('message A_i', { elapsedTimeMs: 1.23 });
      logger.success('message A_s', { elapsedTimeMs: 2.34 });
      logger.warn('message A_w', { elapsedTimeMs: 3.45 });
      logger.error('message A_e', { elapsedTimeMs: 4.56 });

      // Should output all 5 levels
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // info + success
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      // debug level should not have elapsed time (per spec: not required)
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.default]: message A_d',
        ),
      );

      // info, success, warn, error should have elapsed time
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /@docs-islands\/test\[test\.case\.default\]: message A_i.*\d\.\d+ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /@docs-islands\/test\[test\.case\.default\]: message A_s.*\d\.\d+ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /@docs-islands\/test\[test\.case\.default\]: message A_w.*\d\.\d+ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /@docs-islands\/test\[test\.case\.default\]: message A_e.*\d\.\d+ms$/,
        ),
      );
    });
  });
});
