# `logging`

<script lang="react">
  import LoggingPresetCatalog from '../../components/react/LoggingPresetCatalog';
</script>

`logging` controls the package-owned logs emitted by `createDocsIslands()` and the public logger helpers exposed by this package. It does not change rendering; it only decides which `@docs-islands/*` messages stay visible in Node and in the browser.

Each `createDocsIslands()` instance owns an isolated logger scope. In controlled build paths, imports from `@docs-islands/vitepress/logger` are automatically bound to that instance, so parallel VitePress instances or test runs do not overwrite each other's logging config. Imports that bypass the controlled build graph still fall back to the default compatibility scope.

## When to Use It

Use `logging` when the integration works but the console is too noisy, or when you need focused diagnostics for one docs-islands subsystem. During normal setup you may only keep `warn` and `error`; during investigation you can enable `debug` to see which rule allowed a visible log and how long the logger has been active.

## Minimal Example

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { hmr } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { hmr },
    rules: {
      'hmr/markdownUpdate': 'off',
      'hmr/viteAfterUpdate': {},
    },
  },
});

islands.apply(vitepressConfig);
```

This keeps only `warn` and `error` output from the selected docs-islands HMR stream. `hmr/viteAfterUpdate` uses the preset default matcher, while `hmr/markdownUpdate` is disabled explicitly. `'off'` is shorthand for `{ enabled: false }`.

## Mental Model

When `logging.rules` is not configured, the logger uses the default visibility set:

- `debug: false`: `error`, `warn`, `info`, and `success` are visible.
- `debug: true`: `error`, `warn`, `info`, `success`, and `debug` are visible.

When `logging.rules` is configured, the logger switches to rule mode after any plugin rules are expanded:

1. Rules with `enabled: false` are filtered out first. They do not match scope, do not allow levels, and do not appear in debug labels.
2. Every active rule is checked against the log's `main`, `group`, and `message`. Declared fields use AND semantics.
3. A matching rule uses `rule.levels ?? logging.levels` as its effective levels. If both are omitted, the default non-debug set is used.
4. A log is visible when at least one matching active rule allows the current level.
5. If rule mode is active but no active rule matches, nothing is printed. There is no fallback to root levels.

Multiple rules can contribute to the same log. Their allowed levels form a union, and debug labels keep the declaration order from `logging.rules`.

## Root Options

| Option    | Meaning                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`   | Enables diagnostic output. Visible `error`, `warn`, `info`, and `success` logs include matching labels and a relative elapsed-time suffix such as `12.34ms`. |
| `levels`  | Root visibility set. In rule mode, it is the default effective levels for rules that do not define `rule.levels`; it is not a maximum that narrows rules.    |
| `plugins` | Optional preset-plugin registry. The object key becomes the namespace used by `logging.rules["<plugin>/<rule>"]`.                                            |
| `rules`   | Either a focused rule array or a plugin-rule object. When present and non-empty after normalization, logging is decided only by active matching rules.       |

## Plugin Rules

`logging.plugins` is the recommended entrypoint when you only want to filter docs-islands internal logs.

```ts
import { hmr, runtime } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { hmr, runtime },
  rules: {
    'hmr/viteAfterUpdate': {},
    'runtime/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'runtime/renderValidation': 'off',
  },
};
```

- `plugins` registers logging preset plugins under a namespace key such as `hmr`.
- `rules["<plugin>/<rule>"] = {}` enables the preset rule with its default matcher.
- `rules["<plugin>/<rule>"] = 'off'` disables that preset rule and is equivalent to `{ enabled: false }`.
- The override object can only override `enabled`, `message`, or `levels`. `group` and `main` always inherit from the preset rule.

### Built-in Presets and Coverage

The presets exported by `@docs-islands/vitepress/logger/presets` are predefined `main/group` matchers for built-in docs-islands log streams. The catalog below lists every preset, every rule, and the default range each one constrains.

<LoggingPresetCatalog
  client:load
  spa:sync-render
  locale="en"
/>

## Public Logger Usage

`@docs-islands/vitepress/logger` exposes `createLogger`, `formatDebugMessage`, and `setLoggerConfig`. In controlled build paths, every logger instance created through `createLogger(...)` is automatically bound to the current docs-islands logger scope, so userland logs still follow the resolved `logging` rules for that VitePress instance.

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
});

const islands = createDocsIslands({
  logging: {
    debug: true,
    rules: [
      {
        label: 'userland-metrics',
        main: '@acme/custom-docs',
        group: 'userland.metrics',
        levels: ['info'],
      },
    ],
  },
});

islands.apply(vitepressConfig);

logger.getLoggerByGroup('userland.metrics').info('visible userland info');
logger.getLoggerByGroup('userland.hidden').info('suppressed userland info');
```

With this setup, `userland.metrics` stays visible, while `userland.hidden` is suppressed. If you later change `createLogger({ main: ... })`, update your rules to match that `main` or remove the `main` filter.

### Using `createLogger` Without `createDocsIslands()`

If you import `createLogger` from `@docs-islands/vitepress/logger` but never install `createDocsIslands()`, the logger still works through the default-scope compatibility path.

- Logs are **not** automatically bound to a docs-islands instance, so they do not inherit instance-local `logging` rules.
- Multi-instance isolation does **not** apply in this fallback mode. Multiple callers share the same default scope.
- If no logger config was injected into that default scope, logging falls back to the root defaults: `error`, `warn`, `info`, and `success` stay visible, while `debug` stays suppressed.
- In this fallback mode, `setLoggerConfig(...)` updates that default compatibility scope directly.
- You can clear the fallback config again with `setLoggerConfig(null)` or `setLoggerConfig(undefined)`.

In short: direct logger usage remains compatible, but automatic scope takeover only happens inside the controlled build path established by `createDocsIslands()`. If the current import is already scope-controlled, `setLoggerConfig(...)` is ignored and warns once that the logger is controlled, and the warning tells you to update the logger config through `createDocsIslands({ logging: ... })`.

::: warning Reusing Built-in `main/group`

If your user-authored logs intentionally or accidentally reuse the same `main` / `group` values as built-in docs-islands logs, they may also match the same preset rules or direct `logging.rules` entries:

- Your user logs may become visible or suppressed together with built-in logs.
- In `debug` mode, they may show the same rule labels as built-in logs, which makes diagnosis noisier.
- Later tuning of built-in preset coverage can unintentionally affect your user logs too.

Unless you explicitly want both streams to share the same filtering space, prefer a dedicated namespace such as `@acme/custom-docs` with `userland.*`.

:::

## Direct Rule Fields

Array-form `logging.rules` is still supported when you need raw low-level matching outside preset plugins.

| Field     | Meaning                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`   | Required stable identifier. When `debug` is enabled, visible logs show contributing labels as `[LabelA][LabelB]`.                                  |
| `enabled` | Optional pre-filter switch. `false` makes the rule completely inactive; it is not a lower-priority deny rule.                                      |
| `main`    | Optional exact package match, for example `@docs-islands/vitepress`. Glob patterns are not applied to `main`.                                      |
| `group`   | Optional logger group matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `runtime.react.*` or `test.case.?1`. |
| `message` | Optional message matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `*timeout*`, `request *`, or `task-[ab]`. |
| `levels`  | Optional effective levels for this rule. It replaces the root levels for this rule and participates in the union with other matching rules.        |

## Matching Examples

Direct rule arrays remain useful when you want broad wildcards or message-text filtering that is not tied to one preset label.

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
