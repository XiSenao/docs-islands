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
 * 2. **`env.ts` must NOT import `logger.ts`** — `rolldown.config.ts` runs
 *    `loadEnv()` **before** the build starts, so `env.ts` must stay free of
 *    logger/runtime dependencies that rely on the package build output.
 *    Use plain `console.*` for any log output within `env.ts`.
 *
 * 3. **All other modules must use `logger.ts` or package-local wrappers for
 *    logging** — Apart from `env.ts`, modules in this package should use
 *    `createLogger({ main })` or the package-local wrapper in `./log` instead
 *    of raw `console.*`, keeping logging behaviour consistent and centrally
 *    controlled.
 *
 * 4. **`console` and `process.env` APIs are restricted to this package** — The
 *    shared ESLint config enforces `no-console: error` and `no-restricted-syntax`
 *    (for `process.env`) globally. Only `@docs-islands/utils` is exempted (via
 *    its local ESLint overrides) because it houses the `Logger` and `env`
 *    implementations. All other packages must use `Logger` for logging and
 *    `loadEnv`/`injectEnv` for environment access instead of calling
 *    `console.*` or `process.env` directly.
 */

export { isNodeLikeBuiltin } from './builtin';
export { querySelectorAllToArray } from './dom-iterable';
export {
  injectEnv,
  injectEnvs,
  loadEnv,
  type EnvConfig,
  type InjectableKey,
} from './env';
export { scanFiles } from './fs-utils';
export { importWithError, pkgExists } from './general';
export {
  createLogger,
  emitRuntimeLog,
  formatDebugMessage,
  formatErrorMessage,
  lightGeneralLogger,
  normalizeLoggerConfig,
  resetLoggerConfig,
  sanitizeDebugSummary,
  setLoggerConfig,
  shouldSuppressLog,
  type CreateLoggerOptions,
  type DebugMessageOptions,
  type LogKind,
  type LogLevel,
  type LoggerConfig,
  type LoggerRule,
  type LoggerVisibilityLevel,
} from './logger';
export {
  findMonorepoRoot,
  findNearestPackageRoot,
  getProjectRoot,
  isSubpath,
  slash,
} from './path';
