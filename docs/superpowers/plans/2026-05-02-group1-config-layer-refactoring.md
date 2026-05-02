# Group 1: Configuration Layer Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `config.ts` to reduce complexity from 28 to ~8 by extracting config merging logic into helper functions.

**Architecture:** Extract the complex nested merging logic in `mergeSiteDevToolsAnalysisConfig` into three focused helper functions in a new `config-merge-helpers.ts` file. The main config file will use function composition to achieve the same result with lower complexity.

**Tech Stack:** TypeScript, VitePress configuration types

**Spec Reference:** `docs/superpowers/specs/2026-05-02-eslint-complexity-refactoring-design.md` (Group 1)

---

## File Structure

**New files:**

- `packages/vitepress/src/node/core/config-merge-helpers.ts` (~80 lines)

**Modified files:**

- `packages/vitepress/src/node/core/config.ts` (refactor lines 36-79)

---

## Task 1: Create config-merge-helpers module

**Files:**

- Create: `packages/vitepress/src/node/core/config-merge-helpers.ts`

- [ ] **Step 1: Create the helper module with type imports**

```typescript
import type {
  SiteDevToolsAnalysisBuildReportsConfig,
  SiteDevToolsAnalysisUserConfig,
} from '#dep-types/utils';

/**
 * Merge provider configurations from base and override.
 * Override takes precedence for all providers including doubao.
 */
export function mergeProviderConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig['providers'] | undefined {
  if (!base?.providers && !override?.providers) {
    return undefined;
  }

  const mergedProviders = {
    ...base?.providers,
    ...override?.providers,
  };

  // Handle doubao provider specifically
  if (base?.providers?.doubao || override?.providers?.doubao) {
    mergedProviders.doubao = override?.providers?.doubao ?? base?.providers?.doubao;
  }

  return mergedProviders;
}

/**
 * Merge buildReports configurations from base and override.
 * Override takes precedence.
 */
export function mergeBuildReportsConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisBuildReportsConfig | undefined {
  if (!base?.buildReports && !override?.buildReports) {
    return undefined;
  }

  return {
    ...base?.buildReports,
    ...override?.buildReports,
  };
}

/**
 * Merge analysis configurations from base and override.
 * Uses helper functions to merge nested providers and buildReports.
 */
export function mergeAnalysisConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const mergedProviders = mergeProviderConfig(base, override);
  const mergedBuildReports = mergeBuildReportsConfig(base, override);

  return {
    ...base,
    ...override,
    ...(mergedProviders ? { providers: mergedProviders } : {}),
    ...(mergedBuildReports ? { buildReports: mergedBuildReports } : {}),
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm typecheck`
Expected: No errors in config-merge-helpers.ts

- [ ] **Step 3: Commit the new helper module**

```bash
git add packages/vitepress/src/node/core/config-merge-helpers.ts
git commit -m "refactor(vitepress): extract config merge helpers

Extract provider, buildReports, and analysis config merging logic
into focused helper functions to reduce complexity.

Part of Group 1 config layer refactoring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Refactor config.ts to use helpers

**Files:**

- Modify: `packages/vitepress/src/node/core/config.ts:36-79`

- [ ] **Step 1: Import the helper functions**

Add import at top of file after existing imports:

```typescript
import { mergeAnalysisConfig } from './config-merge-helpers';
```

- [ ] **Step 2: Replace mergeSiteDevToolsAnalysisConfig implementation**

Replace lines 36-79 with:

```typescript
const mergeSiteDevToolsAnalysisConfig = (
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig | undefined => {
  return mergeAnalysisConfig(base, override);
};
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Run linter to verify complexity reduction**

Run: `pnpm lint`
Expected: No complexity warning for config.ts line 39

- [ ] **Step 5: Run unit tests**

Run: `pnpm test:unit`
Expected: All tests pass

- [ ] **Step 6: Run e2e tests**

Run: `pnpm test:e2e`
Expected: All tests pass

- [ ] **Step 7: Commit the refactored config.ts**

```bash
git add packages/vitepress/src/node/core/config.ts
git commit -m "refactor(vitepress): simplify config merge using helpers

Replace complex nested merging logic with function composition
using extracted helpers. Reduces complexity from 28 to ~8.

Part of Group 1 config layer refactoring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Final validation for Group 1

**Files:**

- Verify: All files in Group 1

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: No ESLint warnings for config.ts complexity

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Build the project**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Verify no breaking changes**

Check that:

- All exports from `config.ts` remain unchanged
- `mergeSiteDevToolsConfig` function signature unchanged
- `DocsIslandsSharedOptions` interface unchanged
- `DocsIslandsResolvedUserConfig` interface unchanged

- [ ] **Step 6: Document completion**

Create completion marker:

```bash
echo "✅ Group 1 (Configuration Layer) refactoring complete" >> docs/superpowers/plans/refactoring-progress.md
git add docs/superpowers/plans/refactoring-progress.md
git commit -m "docs: mark Group 1 config layer refactoring complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Success Criteria

- ✅ `config.ts` complexity reduced from 28 to ~8
- ✅ All tests passing
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Build succeeds
- ✅ All public APIs unchanged
- ✅ Ready to proceed to Group 2

## Next Steps

After Group 1 validation passes, proceed to:

- **Group 2 Plan:** `docs/superpowers/plans/2026-05-02-group2-build-core-refactoring.md`
