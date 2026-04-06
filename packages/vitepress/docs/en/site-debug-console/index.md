# Site Debug Console

<script lang="react">
  import {
    SiteDebugConsoleOverview,
    SiteDebugConsolePanels,
  } from '../../components/react/SiteDebugConsoleDocs';
</script>

`Site Debug Console` is the runtime debugging surface provided by `@docs-islands/vitepress`. It centralizes the evidence that is usually scattered across the page, build output, runtime globals, and `HMR` timing, so cross-framework rendering problems can be inspected in one place.

## When You Reach for It

- A component flickers during navigation and you do not know whether it is waiting for `HTML`, `CSS`, or hydration.
- A render container looks wrong, but you do not know which render mode it actually resolved to or which stage it is stuck in.
- Page weight grows, but you do not know whether the cost comes from `JS`, `CSS`, or emitted assets.
- `HMR` feels slow or unstable, but you do not know whether the delay happened during trigger, `SSR Apply`, client apply, or runtime ready.
- You want to hand the current runtime state to a teammate or include it in an issue, but all you have are scattered logs.

## Why a Unified View Matters

Cross-framework rendering issues rarely come from one layer alone. They usually involve DOM state, emitted assets, runtime injection, and hot-update timing at the same time. Without a unified surface, you end up bouncing between the page, DevTools, the build directory, and console logs. `Site Debug Console` turns that into one inspection workflow.

## Start with Getting Started

If you want the setup steps, activation methods, and the first-pass diagnosis flow, read [Getting Started](./getting-started.md) first.

## Related Options

If you also want build-time AI reports to appear in the console, continue with:

- [Analysis](./options/analysis.md)
- [Models](./options/models.md)
- [Build Reports](./options/build-reports.md)

<SiteDebugConsoleOverview ssr:only locale="en" />

## Core Features

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

## Recommended Debugging Path

If you want a repeatable workflow rather than “open random panels and guess”, use this order:

1. Start in the page overlay and isolate the component that looks wrong.
2. Use `Bundle Composition` to decide whether the issue is mostly about `JS`, `CSS`, emitted assets, or chunk composition.
3. If the problem expands to the whole page, switch to `Debug Logs` and inspect the page-level runtime state.
4. When you need to share evidence, capture `snapshotRuntime()` or copy relevant debug log entries.

This keeps the process anchored in “which component is failing in which way?” before it expands into “what is the entire page runtime doing?”

## Console Helper API

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

## `snapshotRuntime()` Reference

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

## `getRenderMetrics()` Reference

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

## `getHmrMetrics()` Reference

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

## What Makes This Feature Valuable

The real value is not just “one more panel”. It is that one component's state, page-level runtime state, build cost, and hot-update timing all become part of the same evidence chain. That makes it much easier to decide which layer is actually responsible and to share the current state accurately with someone else.

For teams that maintain documentation sites over time, it also creates a shared language. Instead of “it felt a little slow here”, people can discuss `renderId`, `Bundle Composition`, `Page Metafile`, and `HMR Metrics` as concrete evidence objects.
