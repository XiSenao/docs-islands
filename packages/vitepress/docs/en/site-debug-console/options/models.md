# `providers / models`

This page focuses on how two layers work together:

- `providers.doubao`: declares which Doubao provider instances exist
- `buildReports.models`: declares which model configurations actually execute on top of those provider instances

Today `providers.doubao` uses an **array of provider instances**, not a single object.

## Minimal Example

```ts
const analysis = {
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
    models: [
      {
        default: true,
        id: 'doubao-pro',
        label: 'Doubao Pro',
        model: 'doubao-seed-2-0-pro-260215',
        providerRef: {
          provider: 'doubao',
        },
        thinking: true,
        maxTokens: 4096,
        temperature: 0.2,
      },
    ],
  },
};
```

## Default Instance Rules

Each `providers.doubao` group may declare at most one `default: true`. If you do not mark one explicitly, the first item in the array becomes the default instance.

`buildReports.models[].providerRef.id` points back to the `id` defined here.

## Provider Options

| Option      | Meaning                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`        | Stable provider instance id. `buildReports.models[].providerRef.id` points at this value.                                    |
| `label`     | Optional UI-facing label.                                                                                                    |
| `default`   | Marks the provider instance as the default for the `doubao` group.                                                           |
| `apiKey`    | Volcengine Ark API key. This is required to execute Doubao requests, but it is intentionally not part of the cache identity. |
| `baseUrl`   | Ark API base URL. Changing it affects the effective request snapshot and therefore invalidates `exact` cache.                |
| `timeoutMs` | Local timeout for a single analysis request.                                                                                 |

## How `providerRef.id` Connects

If `providerRef` only declares:

```ts
const providerRef = {
  provider: 'doubao',
};
```

then the provider group's default instance is used.

If you have more than one instance, bind explicitly:

```ts
const providerRef = {
  provider: 'doubao',
  id: 'cn',
};
```

## Common `buildReports.models` Fields

The model config that actually participates in report generation usually looks like this:

```ts
const modelConfig = {
  id: 'doubao-pro',
  default: true,
  label: 'Doubao Pro',
  model: 'doubao-seed-2-0-pro-260215',
  providerRef: {
    provider: 'doubao',
    id: 'cn',
  },
  thinking: true,
  maxTokens: 4096,
  temperature: 0.2,
};
```

Common field responsibilities:

| Field         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `id`          | Stable model config identifier. `resolvePage` can reference it via `modelId`. |
| `label`       | Optional display name used in logs or debugging surfaces.                     |
| `default`     | Whether this model acts as the default execution target.                      |
| `providerRef` | Points to a provider group and optionally a concrete provider instance.       |
| `model`       | The actual provider model name.                                               |
| `thinking`    | Whether reasoning-style capabilities should be enabled.                       |
| `maxTokens`   | Maximum output token budget for a request.                                    |
| `temperature` | Generation randomness. Lower values are usually more stable.                  |

## Recommended Practices

- Use stable, readable `id` values for both provider instances and model configs, such as `cn`, `intl`, `doubao-pro`, or `perf-review`.
- Treat `apiKey` as a secret and keep it out of the repository.
- If you have multiple regions, accounts, or gateway paths, model them as multiple provider instances instead of constantly mutating one instance's `baseUrl`.
- Keep the provider layer simple first, then expand the number of model configs. That makes cache behavior and report provenance easier to reason about.
