/**
 * @internal **Internal client runtime - Do not import directly**
 * @fileoverview Type declarations for internal runtime module
 *
 * ⚠️ INTENTIONALLY EMPTY - DO NOT ADD EXPORTS
 *
 * This file intentionally exports nothing. The corresponding JavaScript module
 * contains runtime code that is injected directly into user applications by
 * the build plugin. It is not meant to be imported or referenced in TypeScript.
 *
 * Why this file exists:
 * - Prevents TypeScript resolution errors when the module is referenced
 * - Clearly communicates that this module has no public API surface
 * - Ensures build tools handle the module correctly
 *
 * Runtime injection pattern:
 * 1. Build plugin reads the compiled JS from dist/shared/client-runtime.js
 * 2. Plugin injects the code directly into the user's bundle
 * 3. No import statements are used - the code is inlined
 *
 * @example
 * // ❌ DON'T: Direct import from package users
 * import runtime from '@docs-islands/vitepress/internal/runtime'
 * import { __CSS_LOADING_RUNTIME__ } from '@docs-islands/vitepress/internal/runtime'
 *
 * // ✅ DO: Let the build plugin inject it automatically
 * // The runtime will be available globally after build injection
 *
 * // ✅ For package contributors only (development)
 * import runtime from '#shared/client-runtime'  // Works inside the package
 */
export {};
