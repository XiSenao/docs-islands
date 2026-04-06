# Getting Started

This page helps you connect `Site Debug Console` with the shortest path possible and establish a first-pass debugging workflow. If you also plan to enable build-time AI reports, it also explains where the `siteDebug` configuration entry lives.

## 1. Mount the Console in Your Theme

The smallest integration is to mount the client console component inside your theme layout:

```vue
<!-- .vitepress/theme/components/EnhanceLayout.vue -->
<script setup lang="ts">
import SiteDebugConsole from '@docs-islands/vitepress/debug-console/client';
import '@docs-islands/vitepress/debug-console/client/style.css';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDebugConsole />
</template>
```

Once mounted, the page overlay and `Debug Logs` surface are available at runtime even if you have not configured AI analysis yet.

## 2. Turn Debug Mode On

You can enable it in three ways:

- Use `?site-debug=1` to force it on, or `?site-debug=0` to force it off.
- The choice is persisted and reused on later visits.
- On this docs site, a triple-click on the top-left `logo` also toggles it.

## 3. Establish a First Diagnosis Flow

A reliable first-pass workflow is:

1. Start with the overlay badge on the suspicious component.
2. If the problem looks related to `JS`, `CSS`, static assets, or chunk composition, continue into `Bundle Composition`.
3. If the problem has become page-wide, or if you need to preserve evidence, switch to `Debug Logs`.
4. When you need to share the current state, capture `snapshotRuntime()` or copy the relevant debug log entries.

That flow keeps you anchored in the concrete symptom first, then expands into page-level evidence only when needed.

## 4. Browser Console Helper

You can access the helper object directly from the browser console:

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getRenderMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getHmrMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.snapshotRuntime();
```

This is the fastest way to confirm what the current page has already recorded.

## 5. Where `siteDebug` Is Configured

`siteDebug` is the documented configuration entry point for `vitepressReactRenderingStrategies()`. It does not render components by itself. Instead, it hangs configuration for `Site Debug Console` and its build-time AI report capabilities onto the VitePress config.

You can pass it as the second argument:

```ts
import { defineConfig } from 'vitepress';
import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

const vitepressConfig = defineConfig({});

vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      // ...
    },
  },
});
```

Or declare it on `vitepressConfig.siteDebug` first:

```ts
const vitepressConfig = defineConfig({
  siteDebug: {
    analysis: {
      // ...
    },
  },
});

vitepressReactRenderingStrategies(vitepressConfig);
```

## 6. Relationship with `vitepressConfig.siteDebug`

The plugin reads `vitepressConfig.siteDebug` first, then merges the second argument's `siteDebug` on top. That means:

- you can keep defaults in `vitepressConfig.siteDebug`
- you can override or extend them in the second argument
- the `analysis` branch keeps merging at the object level
- when you explicitly provide `providers.doubao` or `buildReports`, that branch uses the new value you supplied

## 7. When You Need to Configure It Further

- Runtime console only: you do not necessarily need `siteDebug`; mounting the client console is enough.
- Build-time AI reports: you need `siteDebug.analysis`.
- Provider, model, cache, and page-scope control: keep going into `analysis.providers` and `analysis.buildReports`.

## 8. Recommended Rollout Path

- Step 1: mount the runtime console only and confirm the overlay plus `Debug Logs` work.
- Step 2: enable `analysis` with one provider and one model.
- Step 3: use `buildReports.resolvePage` to limit the scope to a small set of important pages.
- Step 4: after report quality and cache behavior feel stable, expand the page range or increase `includeChunks` / `includeModules`.

That rollout keeps model calls, cache behavior, and page scope under control instead of turning everything on at once.

## Next Steps

- [Introduction](./index.md): understand the overall value and evidence chain.
- [Analysis](./options/analysis.md): see the responsibility boundary of `siteDebug.analysis`.
- [Models](./options/models.md): configure provider instances and model selection.
- [Build Reports](./options/build-reports.md): configure cache, `resolvePage`, and generation scope.
