# `buildReports`

`buildReports` controls the build-time AI report generation flow for `Site Debug Console`. The current design generates one canonical page-level report for each eligible page, then reuses that same page report on related chunk and module entries.

That means `includeChunks` and `includeModules` expand the evidence embedded in the page prompt. They do not start independent chunk-only or module-only AI runs.

## What Counts as an Eligible Page

Not every page enters `buildReports`. Only pages that already contain docs-islands page-build analysis signals are treated as eligible pages.

In practice that means:

- purely static Markdown pages with no docs-islands build signal do not enter the analysis flow
- `resolvePage` only runs for eligible pages, not for every page in the entire site

## Minimal Configuration

```ts
vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      providers: {
        doubao: [
          {
            apiKey: 'your-doubao-api-key',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            default: true,
            id: 'cn',
            label: 'Doubao CN',
            timeoutMs: 300_000,
          },
        ],
      },
      buildReports: {
        cache: true,
        includeChunks: false,
        includeModules: false,
        models: [
          {
            default: true,
            id: 'doubao-pro',
            label: 'Doubao Pro',
            maxTokens: 4096,
            model: 'doubao-seed-2-0-pro-260215',
            providerRef: {
              provider: 'doubao',
            },
            temperature: 0.2,
            thinking: true,
          },
        ],
      },
    },
  },
});
```

## Options

| Option                 | Meaning                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cache`                | Controls whether persisted AI report cache is used. `false` always regenerates. `true` enables cache with default settings. An object lets you configure `dir` and `strategy`.                                                 |
| `models`               | Explicit build-time analysis models. This is where you choose what to run, including `id`, `providerRef`, and provider-specific request parameters such as `model`, `thinking`, `maxTokens`, and `temperature`.                |
| `includeChunks`        | Adds page-level chunk resource detail to the prompt. Default: `false`.                                                                                                                                                         |
| `includeModules`       | Adds page-level and component-level module detail to the prompt. Default: `false`.                                                                                                                                             |
| `resolvePage(context)` | Optional page-level gate and override hook. Return `undefined`, `null`, or `false` to skip a page. Return an object to keep the page and override `modelId`, `cache`, `includeChunks`, or `includeModules` for that page only. |

## `resolvePage(context)` Behavior

`resolvePage` is the most direct way to control analysis scope. It runs only for eligible pages that already contain docs-islands page-build analysis signals. Pages with no docs-islands rendering/build data never enter this hook.

The hook receives:

```ts
interface SiteDebugAnalysisBuildReportsResolvePageContext {
  page: {
    routePath: string;
    filePath: string;
  };
  models: SiteDebugAnalysisBuildReportModelConfig[];
}
```

The return value controls both inclusion and page-local overrides:

- Return `undefined`, `null`, or `false`: skip build report generation for this eligible page.
- Return `{}`: keep the page, inherit the global `buildReports` defaults, and use the default model.
- Return an override object: keep the page and override `modelId`, `cache`, `includeChunks`, and/or `includeModules` for that page only. When `cache` is an object, omitted fields inherit from the global `buildReports.cache` object.

Example:

```ts
const buildReports = {
  models: [
    {
      default: true,
      id: 'default-review',
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: {
        provider: 'doubao',
      },
    },
    {
      id: 'perf-review',
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: {
        id: 'cn',
        provider: 'doubao',
      },
    },
  ],
  includeChunks: false,
  includeModules: false,
  resolvePage(context) {
    if (context.page.routePath === '/guide/performance') {
      return {
        modelId: 'perf-review',
        cache: {
          dir: '.vitepress/cache/site-debug-reports/perf',
          strategy: 'exact',
        },
        includeChunks: true,
        includeModules: true,
      };
    }

    return null;
  },
};
```

This setup means:

- eligible pages are skipped by default
- `/guide/performance` is the only page that gets a build report
- that page explicitly uses the `perf-review` model
- that page stores cache in its own directory
- that page also upgrades prompt detail to include chunks and modules

## What It Does During a Build

A useful mental model is:

1. find the eligible pages
2. decide, page by page, which model to use, whether cache applies, and how much chunk/module evidence to include
3. generate a page-level prompt and send it to the provider
4. write the resulting page report into build output and reuse it from chunk/module views at runtime

That is why the primary object is always the page, not the individual chunk.

## Cache Design and Recommended Strategy

### Two Different Outputs Exist

There are two different report artifacts:

- The persisted cache directory stores reusable AI report JSON used to avoid re-running the model. By default this lives under `.vitepress/cache/site-debug-reports`.
- The emitted build output writes page report assets into the generated VitePress build so the debug console can open them at runtime.

These are related, but they are not the same thing. The cache is an execution optimization layer. The emitted build assets are the runtime-facing output.

In this repo, `cache.dir` is intentionally pointed at `.vitepress/site-debug-reports`, which is git-tracked. That makes the persisted cache files themselves the canonical reusable report source for normal docs builds and deployments.

### Default Cache Behavior

When `buildReports` is present and `cache` is omitted, cache is enabled with the default configuration:

- `dir`: `.vitepress/cache/site-debug-reports`
- `strategy`: `exact`

You can also express that explicitly:

```ts
const buildReports = {
  cache: true,
};
```

### What `exact` Means

`exact` reuses cache only when the cache identity still matches. The current cache key is based on:

- the fully rendered analysis prompt
- the selected provider
- a non-secret effective request snapshot

For Doubao, that snapshot includes values such as:

- `providerId`
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

### What `fallback` Means

`fallback` reuses any cached report for the same page target when one exists, even if the current cache key no longer matches. In practice this is a stale-allowed mode.

Use `fallback` when:

- you want deterministic builds even if the AI provider is unavailable
- your CI environment should avoid re-running expensive analyses
- prompt instability from asset hashes or environment-specific paths would make `exact` miss too often

Do not use `fallback` when you need the analysis text to reflect the latest prompt or the latest provider settings with high confidence.

## Failure and Degradation Behavior

The more important operational question is often not “what happens when it works?” but “what happens when something goes wrong?”

- If the provider is unavailable and there is no reusable cache, a page may fail to receive a fresh report.
- If the strategy is `fallback` and an older cache entry exists, the system prefers the stale report so the build can still complete predictably.
- If the strategy is `exact`, any prompt or effective request snapshot change becomes a clear cache miss, and the system regenerates or reports that reuse is no longer valid.

### Why Prompt Instability Matters

The page-build prompt includes the current page snapshot. That snapshot can contain emitted asset paths, page client chunk paths, and hashed build file names. Small build changes can therefore alter the prompt even when the high-level page diagnosis is still similar.

This has two practical consequences:

- `exact` is stricter and may miss more often after fresh builds or asset hash changes
- `fallback` is more tolerant and often a better fit for CI or committed docs reports

### Recommended Cache Strategies

- Local prompt development or analysis tuning: `exact`
- Local debugging on a narrow page set with `resolvePage`: `exact`
- CI and docs publishing where stale-but-available reports are acceptable: `fallback`
- One-off correctness checks where no reuse is desired: `cache: false`

### A Practical Hybrid Setup

```ts
const buildReports = {
  cache: {
    dir: '.vitepress/site-debug-reports',
    strategy: isInCi ? 'fallback' : 'exact',
  },
  includeChunks: true,
  includeModules: true,
  resolvePage({ page }) {
    if (page.routePath.startsWith('/guide/')) {
      return {};
    }

    return null;
  },
};
```

This pattern works well because:

- local runs stay strict and refresh when the prompt or provider behavior really changes
- CI can keep using previously generated reports when strict cache identity would miss
- `resolvePage` keeps report generation focused on the pages that actually need build diagnostics

## Recommended Rollout Strategy

- Start with one or two important pages and validate report quality first.
- Use `exact` locally so you see the current build semantics while tuning prompts.
- Evaluate `fallback` later for CI or publishing environments.
- Only enable `includeChunks` or `includeModules` when you truly need the deeper evidence chain.
