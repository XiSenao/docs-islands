# `logging`

`logging` controls the package-owned logs emitted by `createDocsIslands()`. It does not change rendering; it only decides which `@docs-islands/*` messages stay visible in Node and in the browser.

## When to Use It

Use `logging` when the integration works but the console is too noisy, or when you need focused diagnostics for one package, runtime group, or message pattern. During normal setup you may only keep `warn` and `error`; during investigation you can enable `debug` to see which rule allowed a visible log and how long the logger has been active.

## Minimal Example

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: [
      {
        label: 'runtime-react',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
    ],
  },
});

islands.apply(vitepressConfig);
```

This keeps only `warn` and `error` output from `@docs-islands/vitepress` logs whose group matches `runtime.react.*`. Other groups do not fall back to the root levels once `rules` are configured.

## Mental Model

When `logging.rules` is not configured, the logger uses the default visibility set:

- `debug: false`: `error`, `warn`, `info`, and `success` are visible.
- `debug: true`: `error`, `warn`, `info`, `success`, and `debug` are visible.

When `logging.rules` is configured, the logger switches to rule mode:

1. Rules with `enabled: false` are filtered out first. They do not match scope, do not allow levels, and do not appear in debug labels.
2. Every active rule is checked against the log's `main`, `group`, and `message`. Declared fields use AND semantics.
3. A matching rule uses `rule.levels ?? logging.levels` as its effective levels. If both are omitted, the default non-debug set is used.
4. A log is visible when at least one matching active rule allows the current level.
5. If rule mode is active but no active rule matches, nothing is printed. There is no fallback to root levels.

Multiple rules can contribute to the same log. Their allowed levels form a union, and debug labels keep the declaration order from `logging.rules`.

## Root Options

| Option   | Meaning                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`  | Enables diagnostic output. Visible `error`, `warn`, `info`, and `success` logs include matching labels and a relative elapsed-time suffix such as `12.34ms`. |
| `levels` | Root visibility set. In rule mode, it is the default effective levels for rules that do not define `rule.levels`; it is not a maximum that narrows rules.    |
| `rules`  | Focused rule array. When present and non-empty after normalization, logging is decided only by active matching rules.                                        |

## Rule Fields

| Field     | Meaning                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`   | Required stable identifier. When `debug` is enabled, visible logs show contributing labels as `[LabelA][LabelB]`.                                  |
| `enabled` | Optional pre-filter switch. `false` makes the rule completely inactive; it is not a lower-priority deny rule.                                      |
| `main`    | Optional exact package match, for example `@docs-islands/vitepress`. Glob patterns are not applied to `main`.                                      |
| `group`   | Optional logger group matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `runtime.react.*` or `test.case.?1`. |
| `message` | Optional message matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `*timeout*`, `request *`, or `task-[ab]`. |
| `levels`  | Optional effective levels for this rule. It replaces the root levels for this rule and participates in the union with other matching rules.        |

## Matching Examples

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    levels: ['warn'],
    rules: [
      {
        label: 'react-runtime-warnings',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
      {
        label: 'runtime-timeouts',
        group: 'runtime.*',
        message: '*timeout*',
        levels: ['error'],
      },
    ],
  },
});
```

A `warn` from `runtime.react.component-manager` is visible through `react-runtime-warnings`. An `error` message containing `timeout` is visible through `runtime-timeouts`. If one log matches both rules and its level is allowed by both, debug mode prints both labels in declaration order.

Debug output looks like this:

```bash
[react-runtime-warnings][runtime-timeouts] @docs-islands/vitepress[runtime.react.component-manager]: request timeout 12.34ms
```

## Common Patterns

### Keep Only Warnings and Errors for React Runtime Logs

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: [
      {
        label: 'react-runtime-warn-error',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
    ],
  },
});
```

### Combine a Broad Rule with a Specific Message Rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn'],
    rules: [
      {
        label: 'runtime-warnings',
        group: 'runtime.*',
      },
      {
        label: 'timeout-errors',
        message: '*timeout*',
        levels: ['error'],
      },
    ],
  },
});
```

This keeps runtime warnings while also allowing timeout errors anywhere. The two rules do not override each other; they contribute together.

### Temporarily Disable One Rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'runtime-react',
        group: 'runtime.react.*',
        levels: ['warn'],
      },
      {
        label: 'runtime-react-disabled',
        enabled: false,
        group: 'runtime.react.component-manager',
        levels: ['error'],
      },
    ],
  },
});
```

The disabled rule is ignored completely. It does not silence or override the active `runtime-react` rule, and it never appears in debug labels.

### Filter by Message Text

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'hydration-timeouts',
        message: '*hydration*timeout*',
        levels: ['warn', 'error'],
      },
    ],
  },
});
```

Use message rules for short investigation windows, especially when a noisy group contains only a few messages you care about.
