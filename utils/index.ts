/**
 * @fileoverview Public API surface for the `utils` package.
 *
 * ## Guidelines
 *
 * 1. **Root entry requirement** — Any API that should be reachable from the
 *    root `@docs-islands/utils` entry MUST be re-exported here.
 *
 * 2. **All modules must use `@docs-islands/logger` for logging** —
 *    Modules in this package are generic utilities, so they should use the
 *    shared logger package's non-controlled root API instead of raw
 *    `console.*` or managed/scoped logger runtime APIs.
 *
 * 3. **`console` and `process.env` APIs are restricted to this package** — The
 *    shared ESLint config enforces `no-console: error` and `no-restricted-syntax`
 *    (for `process.env`) globally. `@docs-islands/utils` keeps local exemptions
 *    for environment helpers and CLI wrappers. Other packages should use
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
  findMonorepoRoot,
  findNearestPackageRoot,
  getProjectRoot,
  isSubpath,
  slash,
} from './path';
