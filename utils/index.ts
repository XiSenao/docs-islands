/**
 * @fileoverview Public API surface for the `utils` package.
 *
 * ## Guidelines
 *
 * 1. **Re-export requirement** — Every public function, class, or type exposed
 *    by this package MUST be re-exported here. Modules that are not listed in
 *    this file will NOT be accessible to external consumers (the Rolldown build
 *    uses `index.ts` as its sole entry point).
 *
 * 2. **`load-env.ts` must NOT import `logger.ts`** — `rolldown.config.ts` runs
 *    `loadEnv()` **before** the build starts, to obtain the values that feed
 *    `transform.define` (e.g. `__SILENCE_LOG__`, `__DEBUG__`). If `load-env`
 *    imported `logger`, those global constants would be evaluated before Rolldown
 *    has a chance to replace them, causing unresolvable references at build time.
 *    Use plain `console.*` for any log output within `load-env.ts`.
 *
 * 3. **All other modules must use `logger.ts` for logging** — Apart from
 *    `load-env.ts`, all modules in this package should import `Logger` from
 *    `./logger` for log output. Do NOT use raw `console.*` in those modules;
 *    keep logging behaviour consistent and centrally controlled.
 */

export { isNodeLikeBuiltin } from './builtin';
export { scanFiles } from './fs-utils';
export { loadEnv } from './load-env';
export {
  default as Logger,
  formatErrorMessage,
  lightGeneralLogger,
  type LogKind,
  type LogLevel,
} from './logger';
export { findMonorepoRoot, getProjectRoot, isSubpath, slash } from './path';
