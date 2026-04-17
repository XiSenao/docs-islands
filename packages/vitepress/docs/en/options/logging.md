# `logging`

`logging` controls the package-owned logs emitted by `createDocsIslands()`. It does not change render behavior; it only decides which `@docs-islands/*` logs stay visible in Node and in the browser.

## When to Use It

Early integration usually only needs `warn` and `error`, so `logging` is often the first place to reduce noise. Later, you can temporarily enable `debug` to confirm which rule matched a visible log, or silence one especially noisy `HMR` or runtime log stream without touching page code.

## Minimal Example

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    rules: [
      {
        label: 'runtime-react-warn-only',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: ['warn', 'error'],
      },
    ],
  },
});

islands.apply(vitepressConfig);
```

This keeps only `warn` and `error` output from `runtime.react.*`. When `debug` is enabled, visible logs also include the matched rule label, for example `[rule:runtime-react-warn-only]`.

## Root Options

| Option   | Meaning                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`  | Controls `debug` output. Disabled by default. When enabled, visible logs include the matched rule label.                                         |
| `levels` | Root visibility allowlist. If omitted, `error`, `warn`, `info`, and `success` stay visible. Use `[]` to silence all non-`debug` logs explicitly. |
| `rules`  | Ordered rule array for focused overrides.                                                                                                        |

## `rules` Fields

| Field     | Meaning                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------- |
| `label`   | Required, stable, globally unique rule identifier.                                                 |
| `enabled` | Optional hard switch. When a matched rule sets `enabled: false`, matching logs are fully silenced. |
| `main`    | Optional exact package match, for example `@docs-islands/vitepress`.                               |
| `group`   | Optional logger-group matcher. Supports exact values and globs such as `runtime.react.*`.          |
| `message` | Optional log-message matcher using glob semantics, for example `*hydration*`.                      |
| `levels`  | Optional allowlist that can only narrow the root `logging.levels`.                                 |

## Matching Order

::: tip Order matters
`logging.rules` are checked in declaration order, and the last matching rule wins. Put the more specific rules later.
:::

If a rule declares `main`, `group`, and `message`, all declared conditions must match. `enabled: false` silences everything matched by the rule, including `debug`; `levels: []` means that rule produces no non-`debug` output at all, and `debug` itself is still controlled only by `logging.debug`.

## Common Patterns

### Keep Only Warnings and Errors for React Runtime Logs

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'react-runtime-warn-error-only',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: ['warn', 'error'],
      },
    ],
  },
});
```

### Temporarily Mute One Noisy Log Stream

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'mute-markdown-hmr-noise',
        main: '@docs-islands/vitepress',
        group: 'plugin.hmr.markdown-update',
        enabled: false,
      },
    ],
  },
});
```
