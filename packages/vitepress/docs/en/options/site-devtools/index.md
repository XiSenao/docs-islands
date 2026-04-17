# Site DevTools Overview

<script lang="react">
  import {
    SiteDevToolsConsoleOverview,
    SiteDevToolsConsolePanels,
  } from '../../../components/react/SiteDevToolsConsoleDocs';
</script>

`Site DevTools` is the runtime diagnostics surface for `@docs-islands/vitepress`. Use it after the base integration is already working and you need page-level render state, bundle composition, `HMR` timing, or optional build reports.

## When to Open It

Open it when a component flickers during navigation, when page cost suddenly grows, when `HMR` becomes slow, or when you need a runtime snapshot you can share in an issue, PR, or teammate handoff.

## Entry and Surfaces

<SiteDevToolsConsoleOverview ssr:only locale="en" />

Start with the entry card, then move to the surface that matches the question you need to answer. In practice that usually means component state in the overlay, runtime truth in `Debug Logs`, or build evidence in reports.

## Core Capabilities

<SiteDevToolsConsolePanels ssr:only locale="en" />

These three views cover most of the day-to-day work in `Site DevTools`. They are meant to reduce the "where should I look first?" guesswork rather than mirror every panel one by one in prose.

## Browser Console Helper

The browser console also exposes a helper object when you need to inspect or export runtime state directly:

```js
globalThis.__DOCS_ISLANDS_SITE_DEVTOOLS__;
```

Common methods:

| Method                | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `getEntries()`        | Read the current debug log list.                                               |
| `getGlobal(path?)`    | Read a runtime global object. The default is `__COMPONENT_MANAGER__`.          |
| `getRenderMetrics()`  | Read the page's collected render metrics.                                      |
| `getHmrMetrics()`     | Read the page's collected `HMR` metrics.                                       |
| `logRuntime(reason?)` | Write the current runtime snapshot into the debug logs.                        |
| `snapshotRuntime()`   | Return the current runtime snapshot object directly for copy/paste or sharing. |

## Optional UI Dependencies

These packages only improve presentation. The core diagnostics workflow still works without them.

| Dependency        | Enhancement                                                     | Fallback when missing                    |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `vue-json-pretty` | Tree-view browsing for `Injected Globals` and runtime snapshots | Falls back to readable plain JSON.       |
| `prettier`        | Formatting before source preview                                | Shows the original source text directly. |
| `shiki`           | Syntax highlighting and better source preview                   | Keeps a plain-text preview.              |
