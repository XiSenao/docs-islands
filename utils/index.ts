/**
 * @fileoverview Public API surface for the `utils` package.
 *
 * ## Guidelines
 *
 * 1. **Root entry requirement** — Any API that should be reachable from the
 *    root `@docs-islands/utils` entry MUST be re-exported here. Intentional
 *    subpath-only modules such as `@docs-islands/utils/logger` stay off the
 *    root surface so callers opt into that contract explicitly.
 *
 * 2. **`env.ts` must NOT import `@docs-islands/logger`** —
 *    `rolldown.config.ts` runs
 *    `loadEnv()` **before** the build starts, so `env.ts` must stay free of
 *    logger/runtime dependencies that may depend on workspace build output.
 *    Use plain `console.*` for any log output within `env.ts`.
 *
 * 3. **All other modules must use `@docs-islands/utils/logger` for logging** —
 *    Apart from `env.ts`, modules in this package should use the internal
 *    logger bridge instead of raw `console.*`, keeping logging behaviour
 *    consistent and centrally controlled.
 *
 * 4. **`console` and `process.env` APIs are restricted to this package** — The
 *    shared ESLint config enforces `no-console: error` and `no-restricted-syntax`
 *    (for `process.env`) globally. `@docs-islands/utils` keeps local exemptions
 *    for environment helpers and CLI wrappers. Logger runtime behaviour for
 *    docs-islands packages is bridged through `@docs-islands/utils/logger`;
 *    all other packages should use that module for logging and
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
