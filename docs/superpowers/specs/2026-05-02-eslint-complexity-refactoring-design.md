# ESLint Complexity Refactoring Design

## Overview

Refactor 8 files in the VitePress package that violate ESLint complexity rules (max-lines, max-lines-per-function, complexity, max-depth). The refactoring will decompose large, complex functions into smaller, focused modules while maintaining all public APIs and ensuring backward compatibility.

## Problem Statement

Current ESLint violations:

1. **File size violations (max-lines: 800)**

   - `bundleUIComponentsForBrowser.ts`: 1486 lines
   - `ai-build-reports.ts`: 1142 lines
   - `mcp.ts`: 983 lines

2. **Function size violations (max-lines-per-function: 300)**

   - `react-hmr-after-update.ts:255`: 469 lines
   - `bundleUIComponentsForBrowser.ts:998`: 437 lines
   - `react-render-controller.ts:40`: 414 lines
   - `build-hooks.ts:364`: 384 lines
   - `ai-build-reports.ts:760`: 348 lines

3. **Complexity violations (complexity: 25)**

   - `build-hooks.ts:411`: complexity 38
   - `bundleUIComponentsForBrowser.ts:998`: complexity 35
   - `react-hmr-after-update.ts:258`: complexity 36
   - `config.ts:39`: complexity 28

4. **Nesting depth violations (max-depth: 6)**
   - `bundleUIComponentsForSSR.ts:150`: depth 7
   - `bundleUIComponentsForSSR.ts:152`: depth 8

## Design Principles

1. **Single Responsibility** - Each new module handles one clear concern
2. **Function Size** - Target < 100 lines per function, complexity < 15
3. **File Size** - Target < 400 lines per file
4. **Testability** - Extracted functions should be easily unit testable
5. **Backward Compatibility** - All public APIs remain unchanged
6. **Orchestrator Pattern** - Use orchestrator functions to coordinate complex workflows

## Refactoring Strategy

Files are grouped by dependency layers and refactored in order:

### Group 1: Configuration Layer (No dependencies)

#### `config.ts`

**Current issues:**

- Line 39: arrow function complexity 28

**Solution:**
Create `config-merge-helpers.ts` (~80 lines):

- `mergeProviderConfig()` - Merge providers configuration
- `mergeBuildReportsConfig()` - Merge buildReports configuration
- `mergeAnalysisConfig()` - Merge analysis configuration

Refactored `config.ts` (~150 lines):

- Import helper functions
- Simplify `mergeSiteDevToolsAnalysisConfig` to function composition
- Maintain all export interfaces

**Improvement:** Complexity 28 → ~8

**Note:** This module uses function composition rather than the orchestrator pattern used in other modules. This is intentional - the config merging logic is simpler and doesn't require the coordination overhead of an orchestrator.

---

### Group 2: Build Core Layer (Depends on Group 1)

#### `bundleUIComponentsForSSR.ts`

**Current issues:**

- Line 150: nesting depth 7
- Line 152: nesting depth 8

**Solution:**
Create `ssr-bundle/` directory:

**`ssr-bundle-config.ts`** (~100 lines):

- `createSSRViteConfig()` - Build Vite SSR configuration

**`ssr-render-executor.ts`** (~150 lines):

- `executeSSRRender()` - Execute SSR rendering
- `processSSRRenderResult()` - Process render results (reduces nesting)

**`ssr-bundle-orchestrator.ts`** (~120 lines):

- `orchestrateSSRBundle()` - Orchestrate entire SSR workflow

Refactored `bundleUIComponentsForSSR.ts` (~80 lines):

- Main entry function `bundleUIComponentsForSSR()` only
- Delegates to orchestrator
- Maintains export signature

**Improvement:** Nesting depth 8 → 4

---

#### `bundleUIComponentsForBrowser.ts`

**Current issues:**

- File: 1486 lines (limit 800)
- Line 998 function: 437 lines (limit 300)
- Line 998 function: complexity 35 (limit 25)

**Solution:**
Create `browser-bundle/` directory:

**`browser-bundle-config.ts`** (~150 lines):

- `createBrowserViteConfig()` - Build Vite browser configuration
- `createRollupOptions()` - Create Rollup options

**`browser-bundle-metrics.ts`** (~200 lines):

- `collectBundleMetrics()` - Collect bundle metrics
- `analyzeBundleAssets()` - Analyze assets
- `createComponentMetrics()` - Create component metrics

**`browser-bundle-assets.ts`** (~180 lines):

- `processOutputAssets()` - Process output assets
- `generateAssetManifest()` - Generate asset manifest
- `copyStaticAssets()` - Copy static assets

**`browser-bundle-loader.ts`** (~150 lines):

- `generateLoaderEntries()` - Generate loader entries
- `createClientLoaderCode()` - Create client loader code

**`browser-bundle-orchestrator.ts`** (~200 lines):

- `orchestrateBrowserBundle()` - Orchestrate browser bundle workflow
- `validateBundleOutput()` - Validate bundle output

Refactored `bundleUIComponentsForBrowser.ts` (~120 lines):

- Main entry function `bundleUIComponentsForBrowser()` only
- Imports and calls orchestrator
- Maintains export signature

**Improvements:**

- File size: 1486 → 120 lines
- Function size: 437 → ~80 lines
- Complexity: 35 → ~12

---

#### `build-hooks.ts`

**Current issues:**

- Line 364 function: 384 lines (limit 300)
- Line 411 function: complexity 38 (limit 25)

**Solution:**
Create `build-hooks/` directory:

**`hooks-registration.ts`** (~150 lines):

- `registerBuildStartHooks()` - Register build start hooks
- `registerBuildEndHooks()` - Register build end hooks
- `registerTransformHooks()` - Register transform hooks

**`hooks-handlers.ts`** (~180 lines):

- `handlePageBuild()` - Handle page build
- `handleComponentBundle()` - Handle component bundle
- `handleMetricsCollection()` - Handle metrics collection

**`hooks-orchestrator.ts`** (~120 lines):

- `orchestrateFrameworkBuildHooks()` - Orchestrate all hooks

Refactored `build-hooks.ts` (~100 lines):

- Main entry function `registerUIFrameworkBuildHooks()` only
- Calls orchestrator to register all hooks
- Maintains export signature

**Improvements:**

- Function size: 384 → ~80 lines
- Complexity: 38 → ~15

---

### Group 3: React Adapter Layer (Depends on Group 2)

#### `react-render-controller.ts`

**Current issues:**

- Line 40 method `generateClientRuntimeInDEV()`: 414 lines (limit 300)

**Solution:**
Create `react-render/` directory:

**`react-runtime-prelude.ts`** (~80 lines):

- `generateSiteDevToolsPrelude()` - Generate dev tools prelude code
- `generateRuntimeImports()` - Generate runtime imports

**`react-runtime-compiler.ts`** (~150 lines):

- `compileReactComponents()` - Compile React components
- `generateComponentImports()` - Generate component imports
- `generateRenderCode()` - Generate render code

**`react-runtime-generator.ts`** (~120 lines):

- `generateClientRuntime()` - Generate complete client runtime

Refactored `react-render-controller.ts` (~100 lines):

- `generateClientRuntimeInDEV()` calls `generateClientRuntime()`
- Maintains class structure and public method signatures
- Private method `getSiteDevToolsRuntimePrelude()` moved to `react-runtime-prelude.ts`

**Improvement:** Method size 414 → ~60 lines

---

#### `react-hmr-after-update.ts`

**Current issues:**

- Line 255 async arrow function: 469 lines (limit 300)
- Line 258 async arrow function: complexity 36 (limit 25)

**Solution:**
Create `react-hmr/` directory:

**`hmr-update-validator.ts`** (~100 lines):

- `validateUpdateData()` - Validate update data
- `validateRenderElements()` - Validate render elements

**`hmr-component-updater.ts`** (~180 lines):

- `updateReactComponent()` - Update React component
- `handleComponentRemount()` - Handle component remount
- `preserveComponentState()` - Preserve component state

**`hmr-render-executor.ts`** (~150 lines):

- `executeHMRRender()` - Execute HMR render
- `applyRenderStrategy()` - Apply render strategy
- `collectRenderMetrics()` - Collect render metrics

**`hmr-update-orchestrator.ts`** (~120 lines):

- `orchestrateHMRUpdate()` - Orchestrate HMR update workflow

Refactored `react-hmr-after-update.ts` (~100 lines):

- Main update function calls orchestrator
- Maintains exported event handler signatures
- Removes inline large arrow functions

**Improvements:**

- Function size: 469 → ~80 lines
- Complexity: 36 → ~12

---

### Group 4: Development Tools Layer (Depends on Group 2)

#### `ai-build-reports.ts`

**Current issues:**

- File: 1142 lines (limit 800)
- Line 760 function `generateSiteDevToolsAiBuildReports()`: 348 lines (limit 300)

**Solution:**
Create `ai-build-reports/` directory:

**`report-plan-builder.ts`** (~150 lines):

- `buildReportExecutionPlan()` - Build report execution plan
- `resolveReportProviders()` - Resolve report providers
- `validateReportConfig()` - Validate report configuration

**`report-cache-manager.ts`** (~180 lines):

- `checkReportCache()` - Check report cache
- `loadCachedReport()` - Load cached report
- `saveReportCache()` - Save report cache

**`report-executor.ts`** (~200 lines):

- `executeReportGeneration()` - Execute report generation
- `analyzePageMetrics()` - Analyze page metrics
- `formatReportOutput()` - Format report output

**`report-collector.ts`** (~150 lines):

- `collectPageReports()` - Collect page reports
- `aggregateReportData()` - Aggregate report data
- `createReportReferences()` - Create report references

**`report-orchestrator.ts`** (~180 lines):

- `orchestrateAiBuildReports()` - Orchestrate AI build reports workflow

Refactored `ai-build-reports.ts` (~120 lines):

- Main entry function `generateSiteDevToolsAiBuildReports()` only
- Imports and calls orchestrator
- Maintains export interface `GenerateSiteDevToolsAiBuildReportsResult`

**Improvements:**

- File size: 1142 → 120 lines
- Function size: 348 → ~80 lines

---

#### `mcp.ts`

**Current issues:**

- File: 983 lines (limit 800)
- Contains MCP server implementation, tool definitions, JSON-RPC handling

**Solution:**
Create `mcp/` directory:

**`mcp-protocol.ts`** (~120 lines):

- `JsonRpcRequest` / `JsonRpcResponse` interfaces
- `parseJsonRpcRequest()` - Parse JSON-RPC request
- `formatJsonRpcResponse()` - Format JSON-RPC response
- `JsonRpcRequestError` class

**`mcp-tools-definition.ts`** (~180 lines):

- MCP tool interface definitions
- `createToolDefinitions()` - Create tool definitions
- `validateToolArguments()` - Validate tool arguments

**`mcp-tools-handlers.ts`** (~200 lines):

- `handleGetBuildOverview()` - Handle get build overview
- `handleGetPage()` - Handle get page
- `handleGetComponent()` - Handle get component
- `handleGetArtifact()` - Handle get artifact
- `handleListPages()` - Handle list pages

**`mcp-resources.ts`** (~120 lines):

- `createMcpResources()` - Create MCP resources
- `formatResourceContent()` - Format resource content

**`mcp-server.ts`** (~180 lines):

- `SiteDevToolsBuildMcpServer` class - MCP server main class

Refactored `mcp.ts` (~100 lines):

- Only exports `SiteDevToolsBuildMcpServer` class
- Class methods delegate to split modules
- Maintains all public APIs

**Improvement:** File size 983 → 100 lines

---

## Final File Structure

```
packages/vitepress/src/
├── node/
│   ├── core/
│   │   ├── config.ts (refactored, ~150 lines)
│   │   └── config-merge-helpers.ts (new, ~80 lines)
│   ├── framework-build/
│   │   ├── bundleUIComponentsForSSR.ts (refactored, ~80 lines)
│   │   ├── bundleUIComponentsForBrowser.ts (refactored, ~120 lines)
│   │   ├── build-hooks.ts (refactored, ~100 lines)
│   │   ├── ssr-bundle/
│   │   │   ├── ssr-bundle-config.ts (~100 lines)
│   │   │   ├── ssr-render-executor.ts (~150 lines)
│   │   │   └── ssr-bundle-orchestrator.ts (~120 lines)
│   │   ├── browser-bundle/
│   │   │   ├── browser-bundle-config.ts (~150 lines)
│   │   │   ├── browser-bundle-metrics.ts (~200 lines)
│   │   │   ├── browser-bundle-assets.ts (~180 lines)
│   │   │   ├── browser-bundle-loader.ts (~150 lines)
│   │   │   └── browser-bundle-orchestrator.ts (~200 lines)
│   │   └── build-hooks/
│   │       ├── hooks-registration.ts (~150 lines)
│   │       ├── hooks-handlers.ts (~180 lines)
│   │       └── hooks-orchestrator.ts (~120 lines)
│   ├── adapters/react/
│   │   ├── react-render-controller.ts (refactored, ~100 lines)
│   │   └── react-render/
│   │       ├── react-runtime-prelude.ts (~80 lines)
│   │       ├── react-runtime-compiler.ts (~150 lines)
│   │       └── react-runtime-generator.ts (~120 lines)
│   └── site-devtools/
│       ├── ai-build-reports.ts (refactored, ~120 lines)
│       ├── mcp.ts (refactored, ~100 lines)
│       ├── ai-build-reports/
│       │   ├── report-plan-builder.ts (~150 lines)
│       │   ├── report-cache-manager.ts (~180 lines)
│       │   ├── report-executor.ts (~200 lines)
│       │   ├── report-collector.ts (~150 lines)
│       │   └── report-orchestrator.ts (~180 lines)
│       └── mcp/
│           ├── mcp-protocol.ts (~120 lines)
│           ├── mcp-tools-definition.ts (~180 lines)
│           ├── mcp-tools-handlers.ts (~200 lines)
│           ├── mcp-resources.ts (~120 lines)
│           └── mcp-server.ts (~180 lines)
└── client/
    └── adapters/react/
        ├── react-hmr-after-update.ts (refactored, ~100 lines)
        └── react-hmr/
            ├── hmr-update-validator.ts (~100 lines)
            ├── hmr-component-updater.ts (~180 lines)
            ├── hmr-render-executor.ts (~150 lines)
            └── hmr-update-orchestrator.ts (~120 lines)
```

## Summary

**Files to refactor:** 8
**New modules created:** 28
**Total modules after refactoring:** 36

**Key metrics improvements:**

- All files < 400 lines (target met)
- All functions < 100 lines (target met)
- All function complexity < 15 (target met)
- All nesting depth < 5 (target met)

**Backward compatibility:**

- All public APIs unchanged
- All export signatures maintained
- No breaking changes to consumers

## Validation Strategy

**Test Coverage:**
The project has existing unit tests and e2e tests that cover the affected modules. These tests validate:

- Build pipeline correctness (SSR and browser bundling)
- React HMR functionality
- Configuration merging logic
- MCP server protocol handling
- AI build report generation

No new tests are required for the refactoring itself, as we're extracting existing logic into smaller functions while maintaining the same behavior. The existing test suite will validate correctness after refactoring.

**After each file refactoring:**

1. Run `pnpm typecheck` - Ensure no TypeScript errors
2. Run `pnpm lint` - Verify ESLint compliance
3. Run `pnpm test:unit` - Ensure unit tests pass
4. Run `pnpm test:e2e` - Ensure e2e tests pass
5. Run `pnpm build` - Verify build succeeds

**Final validation:**

1. Run full test suite: `pnpm test`
2. Run full lint: `pnpm lint`
3. Verify no ESLint warnings remain
4. Build documentation site: `pnpm docs:dev`
5. Manual smoke testing of key features

**Import Path Updates:**
While all public export signatures remain unchanged, internal imports within the refactored modules will be updated to reference the new file locations. Consumer code outside these modules will not require any import changes.

## Implementation Order

1. **Group 1: Configuration Layer**

   - `config.ts` + `config-merge-helpers.ts`

2. **Group 2: Build Core Layer**

   - `bundleUIComponentsForSSR.ts` + `ssr-bundle/`
   - `bundleUIComponentsForBrowser.ts` + `browser-bundle/`
   - `build-hooks.ts` + `build-hooks/`

3. **Group 3: React Adapter Layer**

   - `react-render-controller.ts` + `react-render/`
   - `react-hmr-after-update.ts` + `react-hmr/`

4. **Group 4: Development Tools Layer**
   - `ai-build-reports.ts` + `ai-build-reports/`
   - `mcp.ts` + `mcp/`

Each group must pass validation before proceeding to the next.

## Risk Mitigation

1. **Incremental approach** - Refactor one file at a time, validate before moving on
2. **Test coverage** - Existing tests validate correctness after refactoring
3. **Type safety** - TypeScript ensures API contracts are maintained
4. **Code review** - Each refactored module reviewed for correctness
5. **Rollback plan** - Git commits allow easy rollback if issues arise

## Success Criteria

- ✅ All ESLint warnings resolved
- ✅ All tests passing
- ✅ No breaking changes to public APIs
- ✅ Build succeeds
- ✅ Documentation site runs correctly
- ✅ Code is more maintainable and testable
