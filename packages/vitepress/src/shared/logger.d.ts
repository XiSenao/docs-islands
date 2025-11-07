/**
 * @internal **Internal runtime helper - Do not import directly**
 * @fileoverview Type declarations for internal logger utility
 *
 * ⚠️ INTENTIONALLY EMPTY - DO NOT ADD EXPORTS
 *
 * This module is automatically injected by the plugin at build time.
 * It is not part of the public API and may change without warning.
 *
 * Why this file exists:
 * - Prevents TypeScript resolution errors when the module is referenced
 * - Clearly communicates that this module has no public API surface
 * - Ensures build tools handle the module correctly
 *
 * @example
 * // ❌ DON'T: Direct import from package users
 * import logger from '@docs-islands/vitepress/internal/logger'
 * import { lightGeneralLogger } from '@docs-islands/vitepress/internal/logger'
 *
 * // ✅ DO: Let the build plugin inject it automatically
 * // The logger will be available in the runtime context
 *
 * // ✅ For package contributors only (development)
 * import { lightGeneralLogger } from '#shared/logger'  // Works inside the package
 */
export {};
