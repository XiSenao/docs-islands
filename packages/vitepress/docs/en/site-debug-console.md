# Site Debug Console

<script lang="react">
  import {
    SiteDebugConsoleOverview,
    SiteDebugConsolePanels,
  } from '../components/react/SiteDebugConsoleDocs';
</script>

`Site Debug Console` is a runtime debugging surface for `@docs-islands/vitepress`. It brings page state, build output, runtime globals, and `HMR` timing into one place, so cross-framework rendering issues are easier to inspect without jumping between multiple tools.

## When to reach for it

- A component flickers during navigation and you do not know whether it is waiting for `HTML`, `CSS`, or hydration.
- A render container looks wrong, but you do not know which render mode it actually resolved to or which stage it is stuck in.
- Page weight grows, but you do not know whether the cost comes from `JS`, `CSS`, or static assets.
- `HMR` is slow or fails, but you do not know whether the delay happened during trigger, `SSR Apply`, client apply, or runtime ready.
- You need to hand the current runtime state to a teammate or attach it to an issue, but all you have are scattered logs.

## Why a single surface matters

Cross-framework rendering problems rarely live in one layer only. They usually involve DOM state, build output, runtime injection, and hot-update timing at the same time. Without a shared inspection surface, developers end up switching between the page, DevTools, the build directory, and console logs. `Site Debug Console` exists to turn that into one inspection workflow.

## Start with Quick Start

For setup, activation, and the first diagnostic workflow, start with [Quick Start](./quick-start.md). This page focuses on what each panel exposes and how to interpret the runtime data.

## Build-time AI report configuration

`Site Debug Console` can attach build-time AI analysis to page, chunk, and module views. The current design generates one canonical page-level report per eligible page and reuses that page report from related chunk and module entries. `includeChunks` and `includeModules` therefore expand the evidence embedded into the page prompt instead of creating separate chunk-only or module-only AI runs.

### Minimal configuration

```ts
vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      providers: {
        doubao: {
          apiKey: 'your-doubao-api-key',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          model: 'doubao-seed-2-0-pro-260215',
          thinking: true,
          maxTokens: 4096,
          temperature: 0.2,
          timeoutMs: 300_000,
        },
      },
      buildReports: {
        cache: true,
        includeChunks: false,
        includeModules: false,
        models: [
          {
            label: 'Doubao Pro',
            model: 'doubao-seed-2-0-pro-260215',
            provider: 'doubao',
            thinking: true,
          },
        ],
      },
    },
  },
});
```

### `buildReports` options

| Option              | Meaning                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache`             | Controls whether persisted AI report cache is used. `false` always regenerates. `true` enables cache with default settings. An object lets you configure `dir` and `strategy`.              |
| `models`            | Explicit build-time analysis models. When omitted or empty, the build skips AI report generation and logs the skip reason.                                                                  |
| `includeChunks`     | Adds page-level chunk resource detail to the prompt. Default: `false`.                                                                                                                      |
| `includeModules`    | Adds page-level and component-level module detail to the prompt. Default: `false`.                                                                                                          |
| `resolvePage(page)` | Optional page-level gate and override hook. Return `false` to skip a page. Return an object to keep the page and override `cache`, `includeChunks`, or `includeModules` for that page only. |

### `providers.doubao` options

| Option        | Meaning                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`      | Volcengine Ark API key. This is required to execute Doubao requests, but it is intentionally not part of the cache identity.  |
| `baseUrl`     | Ark API base URL. Changing it affects the effective provider config snapshot and therefore invalidates `exact` cache.         |
| `model`       | Model identifier used for Doubao requests. Build-time AI reports still require explicit `buildReports.models` entries to run. |
| `thinking`    | Enables reasoning mode for Doubao requests.                                                                                   |
| `maxTokens`   | Upper bound for generated output tokens.                                                                                      |
| `temperature` | Sampling temperature for generated analysis.                                                                                  |
| `timeoutMs`   | Local timeout for a single analysis request.                                                                                  |

### `resolvePage(page)` behavior

`resolvePage` is the most direct way to control analysis scope. It runs only for eligible pages that already contain docs-islands page-build analysis signals. Pages with no docs-islands rendering/build data never enter this hook.

The hook receives:

```ts
interface SiteDebugAnalysisBuildReportsPageContext {
  routePath: string;
  filePath: string;
}
```

The return value controls both inclusion and page-local overrides:

- Return `false`: skip build report generation for this eligible page.
- Return `{}`: keep the page and inherit the global `buildReports` defaults.
- Return an override object: keep the page and override `cache`, `includeChunks`, and/or `includeModules` for that page only.

Example:

```ts
const buildReports = {
  cache: false,
  includeChunks: false,
  includeModules: false,
  resolvePage(page) {
    if (page.routePath === '/guide/performance') {
      return {
        cache: {
          dir: '.vitepress/cache/site-debug-reports/perf',
          strategy: 'exact',
        },
        includeChunks: true,
        includeModules: true,
      };
    }

    return false;
  },
};
```

This setup means:

- eligible pages are skipped by default
- `/guide/performance` is the only page that gets a build report
- that page stores cache in its own directory
- that page also upgrades prompt detail to include chunks and modules

## Cache design and recommended strategy

### Two different outputs exist

There are two different report artifacts, and they solve different problems:

- The persisted cache directory stores reusable AI report JSON used to avoid re-running the model. By default this lives under `.vitepress/cache/site-debug-reports`.
- The emitted build output writes page report assets into the generated VitePress build so the debug console can open them at runtime.

These are related, but they are not the same thing. The cache is an execution optimization layer. The emitted build assets are the runtime-facing output.

In this repo, `cache.dir` is intentionally pointed at `.vitepress/site-debug-reports`, which is git-tracked. That makes the persisted cache files themselves the canonical reusable report source for normal docs builds and deployments.

### Default cache behavior

When `buildReports` is present and `cache` is omitted, cache is enabled with the default configuration:

- `dir`: `.vitepress/cache/site-debug-reports`
- `strategy`: `exact`

You can also express that explicitly:

```ts
const buildReports = {
  cache: true,
};
```

### What `exact` means

`exact` reuses cache only when the cache identity still matches. The current cache key is based on:

- the fully rendered analysis prompt
- the selected provider
- a non-secret provider config snapshot

For Doubao, that provider snapshot includes values such as:

- `baseUrl`
- `model`
- `thinking`
- `maxTokens`
- `temperature`

It intentionally does not include:

- secret material such as `apiKey`
- display-only metadata such as `label`
- local execution controls such as `timeoutMs`

That means:

- changing `label` does not invalidate `exact` cache
- rotating `apiKey` does not invalidate `exact` cache
- changing prompt content or effective provider behavior does invalidate `exact` cache

When `exact` cache misses and an older cache entry already exists, the build logs also explain why the previous cache stopped matching. Typical reasons include:

- `analysis prompt changed`
- `provider changed`
- `provider snapshot changed (temperature: 0.2 -> 0.7)`

Use `exact` when you want build analysis to track the current prompt and current execution semantics closely.

### What `fallback` means

`fallback` reuses any cached report for the same page target when one exists, even if the current cache key no longer matches. In practice this is a stale-allowed mode.

Use `fallback` when:

- you want deterministic builds even if the AI provider is unavailable
- your CI environment should avoid re-running expensive analyses
- prompt instability from asset hashes or environment-specific paths would make `exact` miss too often

Do not use `fallback` when you need the analysis text to reflect the latest prompt or the latest provider settings with high confidence.

If a `fallback` entry is reused even though the current exact cache key no longer matches, the build logs will say which part changed and that the stale cache is being reused because `strategy=fallback`.

### Why prompt instability matters

The page-build prompt includes the current page snapshot. That snapshot can contain emitted asset paths, page client chunk paths, and hashed build file names. Small build changes can therefore alter the prompt even when the high-level page diagnosis is still similar.

This has two practical consequences:

- `exact` is stricter and may miss more often than a content-author expects, especially after fresh builds or asset hash changes.
- `fallback` is more tolerant and often a better fit for CI or for committed docs reports that should keep building when the prompt shape shifts slightly.

### Recommended cache strategies

Use these defaults unless you have a stronger reason to do something else:

- Local prompt development or analysis tuning: `exact`
- Local debugging on a narrow page set with `resolvePage`: `exact`
- CI and docs publishing where stale-but-available reports are acceptable: `fallback`
- One-off correctness checks where no reuse is desired: `cache: false`

### A practical hybrid setup

```ts
const buildReports = {
  cache: {
    dir: '.vitepress/site-debug-reports',
    strategy: isInCi ? 'fallback' : 'exact',
  },
  includeChunks: true,
  includeModules: true,
  resolvePage(page) {
    if (page.routePath.startsWith('/guide/')) {
      return {};
    }

    return false;
  },
};
```

This pattern works well because:

- local runs stay strict and refresh when the prompt or provider behavior really changes
- CI can keep using previously generated reports when strict cache identity would miss
- `resolvePage` keeps report generation focused on the pages that actually need build diagnostics

<SiteDebugConsoleOverview ssr:only locale="en" />

## Core features

### Page Overlay

The page overlay is for diagnosing one component at a time. If one component looks wrong, start there.

| Item                     | Meaning                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Status`                 | The current render state. It tells you whether the container was just detected, is waiting to become visible, is loading/subscribing, is rendering, completed, failed, or was skipped. |
| `Total`                  | `totalDurationMs`. The total render duration, usually measured from container detection until completion, failure, or skip.                                                            |
| `Subscribe`              | `subscribeDurationMs`. Only shown for the production runtime. It represents the time spent subscribing to or taking over the container.                                                |
| `Invoke`                 | `invokeDurationMs`. The time spent running the actual render work.                                                                                                                     |
| `Visible Wait`           | `waitForVisibilityMs`. Most common with `client:visible`. It shows how long the component waited before it became visible.                                                             |
| `Bundle`                 | The estimated total size of build output associated with the current component, from `estimatedTotalBytes`.                                                                            |
| `Vitals`                 | The current render-window performance score from `performanceScore`, on a `0-100` scale. Higher is better.                                                                             |
| `renderDirective · mode` | The left side is the declared directive such as `ssr:only` or `client:load`. The right side is the resolved runtime mode such as `ssr-only`, `hydrate`, or `render`.                   |
| `renderId`               | The unique ID of the render container. It links the DOM container, build metadata, and runtime metrics together.                                                                       |
| `Latest React HMR`       | The latest hot-update mechanism, stage timings, and events associated with the current component.                                                                                      |

Common `Status` values:

| Status      | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `Detected`  | The container was found, but later stages have not started yet. |
| `Waiting`   | The component is waiting to become visible.                     |
| `Loading`   | The runtime is subscribing or loading what it needs.            |
| `Rendering` | Render work is in progress.                                     |
| `Completed` | Render work finished successfully.                              |
| `Failed`    | Render work failed.                                             |
| `Skipped`   | The current render flow was skipped.                            |

### Bundle Composition

`Bundle Composition` answers a simple question: what kind of resources is this component actually costing?

| Item              | Meaning                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Total`           | `estimatedTotalBytes`, the full estimated size associated with the component.                                       |
| `JS`              | `estimatedJsBytes`, the JavaScript cost.                                                                            |
| `CSS`             | `estimatedCssBytes`, the stylesheet cost.                                                                           |
| `Asset`           | `estimatedAssetBytes`, the static asset cost such as images and fonts.                                              |
| `Chunk Resources` | The emitted output files. Each row shows file size, share of total size, and how many modules belong to that chunk. |
| `Module Source`   | The modules inside a chunk. You can keep drilling into module source, module size, and original source path.        |

This is the fastest way to tell whether a component is expensive because of `JS`, `CSS`, or emitted assets.

### Global Debug Console

`Debug Logs` is for page-level runtime inspection. When the problem is not limited to one component, or when you need a shareable runtime snapshot, this is the view you want.

<SiteDebugConsolePanels ssr:only locale="en" />

The `Injected Globals` shortcuts mean:

| Object              | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `Component Manager` | Runtime component management state, including page metafile state held by the manager. |
| `Page Metafile`     | The resolved build metadata for the current page, including component build metrics.   |
| `Inject Component`  | The page-keyed injected component registry.                                            |
| `Render Metrics`    | The collected React render metrics on the current page.                                |
| `HMR Metrics`       | The collected React hot-update metrics on the current page.                            |
| `Site Data`         | VitePress runtime site data. It is hidden in `dev` and `MPA` mode.                     |

## Console helper API

The browser console gets a helper object:

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__;
```

Its fields mean:

| Field                 | Meaning                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `getEntries()`        | Returns the current debug log entries collected by the console.                                                |
| `getGlobal(path?)`    | Reads a runtime global object. It defaults to `__COMPONENT_MANAGER__`.                                         |
| `getRenderMetrics()`  | Returns the current `Render Metrics` array.                                                                    |
| `getHmrMetrics()`     | Returns the current `HMR Metrics` array.                                                                       |
| `logGlobal(path?)`    | Writes a snapshot of a chosen global into the debug logs.                                                      |
| `logRuntime(reason?)` | Writes a full runtime snapshot into the debug logs.                                                            |
| `snapshotRuntime()`   | Returns the current runtime snapshot object directly, which is useful for copy/paste, persistence, or sharing. |

## `snapshotRuntime()` reference

`snapshotRuntime()` returns a page-level snapshot object. Its top-level fields mean:

| Field                  | Meaning                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `componentManager`     | A serializable snapshot of `__COMPONENT_MANAGER__`.                                  |
| `currentInjectedPage`  | The currently matched injected-component page ID.                                    |
| `currentInjectedValue` | The injected component data for `currentInjectedPage`.                               |
| `currentMetafilePage`  | The currently matched page metafile page ID.                                         |
| `currentMetafileValue` | The metafile data for `currentMetafilePage`.                                         |
| `href`                 | The current page URL.                                                                |
| `hmrMetrics`           | The current `HMR Metrics` snapshot array.                                            |
| `injectComponentPages` | All page IDs present in the injected component registry.                             |
| `pageMetafilePages`    | All page IDs present in the page metafile registry.                                  |
| `react`                | A serializable snapshot of the page `React` global.                                  |
| `reactDom`             | A serializable snapshot of the page `ReactDOM` global.                               |
| `renderMetrics`        | The current `Render Metrics` snapshot array.                                         |
| `scripts`              | A snapshot of module scripts and stylesheet resources currently present on the page. |
| `siteData`             | A snapshot of `__VP_SITE_DATA__`. It is only included outside `dev` and `MPA` mode.  |
| `theme`                | A snapshot of the current theme appearance state.                                    |

`scripts` fields:

| Field            | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `cssBundles`     | Stylesheet links on the page that carry `data-vrite-css-bundle`. |
| `modulePreloads` | The `href` list of current `modulepreload` links.                |
| `moduleScripts`  | The `src` list of current `type="module"` scripts.               |

`theme` fields:

| Field                 | Meaning                                                        |
| --------------------- | -------------------------------------------------------------- |
| `bodyDatasetTheme`    | The current `body.dataset.theme` value.                        |
| `computedColorScheme` | The computed `color-scheme` value.                             |
| `prefersDark`         | Whether the system prefers a dark color scheme.                |
| `rootClassName`       | The current className on the root element.                     |
| `rootDatasetTheme`    | The current `html.dataset.theme` value.                        |
| `storedPreference`    | The stored VitePress appearance preference from local storage. |

## `getRenderMetrics()` reference

`getRenderMetrics()` returns `SiteDebugRenderMetric[]`. Each item describes one render container.

| Field                 | Meaning                                                         |
| --------------------- | --------------------------------------------------------------- |
| `componentName`       | The component name.                                             |
| `renderId`            | The unique render container ID.                                 |
| `pageId`              | The page ID associated with this metric.                        |
| `renderDirective`     | The declared directive such as `ssr:only` or `client:load`.     |
| `renderMode`          | The resolved runtime mode: `hydrate`, `render`, or `ssr-only`.  |
| `renderWithSpaSync`   | Whether `spa:sync-render` is enabled for this render.           |
| `status`              | The current render status.                                      |
| `detectedAt`          | The runtime timestamp when the container was detected.          |
| `visibleAt`           | The runtime timestamp when the container became visible.        |
| `updatedAt`           | The latest runtime timestamp for this metric.                   |
| `waitForVisibilityMs` | The delay spent waiting for visibility.                         |
| `subscribeDurationMs` | The time spent subscribing to or taking over the container.     |
| `invokeDurationMs`    | The time spent executing render logic.                          |
| `totalDurationMs`     | The total render duration.                                      |
| `hasSsrContent`       | Whether the container started with SSR content already present. |
| `source`              | Which runtime recorded this metric.                             |
| `errorMessage`        | The error message when render work fails.                       |

## `getHmrMetrics()` reference

`getHmrMetrics()` returns `SiteDebugHmrMetric[]`. Each item describes one React hot-update cycle.

| Field                    | Meaning                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `hmrId`                  | The unique ID for this hot update.                                                               |
| `componentName`          | The component affected by the update.                                                            |
| `pageId`                 | The page ID associated with the update.                                                          |
| `renderIds`              | The list of render container IDs affected by the update.                                         |
| `mechanismType`          | The HMR mechanism, such as `markdown-react-hmr`, `react-fast-refresh`, or `ssr-only-direct-hmr`. |
| `updateType`             | The update type, such as markdown update, `ssr:only` component update, or React refresh update.  |
| `triggerEvent`           | The event that triggered the update.                                                             |
| `applyEvent`             | The event that applied the update.                                                               |
| `status`                 | The HMR status: `running`, `completed`, or `failed`.                                             |
| `startedAt`              | The runtime timestamp when the update started.                                                   |
| `updatedAt`              | The latest runtime timestamp for the update.                                                     |
| `runtimeReadyDurationMs` | The duration of the runtime-ready stage.                                                         |
| `ssrApplyDurationMs`     | The duration of the server-side patch or SSR apply stage.                                        |
| `clientApplyDurationMs`  | The duration of the client-side apply stage.                                                     |
| `totalDurationMs`        | The full HMR duration.                                                                           |
| `sourcePath`             | The related source file path.                                                                    |
| `sourceLine`             | The related source line number.                                                                  |
| `sourceColumn`           | The related source column number.                                                                |
| `importedName`           | The related imported/exported name.                                                              |
| `source`                 | The subsystem that recorded this HMR metric.                                                     |
| `errorMessage`           | The error message when the update fails.                                                         |

## What makes this feature valuable

The main value is not just “another panel”. It is that one component’s state, page-level runtime state, build cost, and hot-update timing all become part of the same evidence chain. That makes it much easier to decide which layer is actually responsible and to share the current state accurately with someone else.
