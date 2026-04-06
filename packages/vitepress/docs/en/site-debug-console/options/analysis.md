# `analysis`

`siteDebug.analysis` is the root configuration object for build-time AI reports. It keeps “which provider should execute the analysis” and “which pages should produce which reports” under the same namespace.

## What It Owns

- Declares analysis providers such as `providers.doubao`.
- Declares build-time AI report rules such as `buildReports`.
- Produces page-level report assets that `Site Debug Console` can read at runtime.

## What It Does Not Own

- It does not change component rendering strategies or affect the runtime behavior of `ssr:only` / `client:*`.
- It does not replace runtime evidence such as the page overlay, `Debug Logs`, or `Render Metrics`.
- It is not a general-purpose model invocation entry point. It exists specifically for page-level diagnostics during docs builds.

## Minimal Example

```ts
const doubaoApiKey = '<your-doubao-api-key>';

vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      providers: {
        doubao: [
          {
            id: 'cn',
            default: true,
            apiKey: doubaoApiKey,
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          },
        ],
      },
      buildReports: {
        models: [
          {
            id: 'doubao-pro',
            default: true,
            model: 'doubao-seed-2-0-pro-260215',
            providerRef: {
              provider: 'doubao',
            },
          },
        ],
      },
    },
  },
});
```

## What Happens Without `analysis`

- The runtime `Site Debug Console` UI still works.
- But no build-time AI reports are generated.
- The console therefore has no build-generated report payloads to display.

## Relationship to Lower-Level Config

- `providers` answers “which provider instances can models reference?”
- `buildReports` answers “which eligible pages should generate reports, which model should they use, how should they be cached, and how much chunk/module detail should be embedded?”

## What to Prepare Before Enabling It

- At least one working provider instance.
- At least one executable `buildReports.models` entry.
- A narrow first rollout, usually driven by `resolvePage`.
- If you plan to commit generated cache files, an agreed `cache.dir` and cache strategy.

## Recommended Adoption Sequence

The safest order is usually:

1. Make the runtime console usable first.
2. Enable `analysis` with one provider and one model only.
3. Restrict generation to a small page set with `resolvePage`.
4. Expand the page range only after report quality and cache behavior look trustworthy.

## Continue Reading

- [Models](./models.md)
- [Build Reports](./build-reports.md)
