import { createScopedLogger } from '@docs-islands/logger/core';
import type { Logger, ScopedLogger } from '@docs-islands/logger/types';
import { createLogger } from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/core';

export const createCoreLogger = (scopeId?: string): Logger => {
  if (typeof scopeId === 'string') {
    return createScopedLogger(
      {
        main: MAIN_NAME,
      },
      scopeId,
    );
  }

  return createLogger({
    main: MAIN_NAME,
  });
};

export const getCoreGroupLogger = (
  group: string,
  scopeId?: string,
): ScopedLogger => createCoreLogger(scopeId).getLoggerByGroup(group);
