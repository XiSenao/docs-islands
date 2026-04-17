# Providers and Models

`providers.doubao` defines provider instances, and `buildReports.models` defines the model configs that actually execute on top of them. Together they answer “which endpoint do we call?” and “which model do we ask for this report?”

## Minimal Example

```ts [.vitepress/config.ts]
const analysis = {
  providers: {
    doubao: [
      {
        id: 'cn',
        label: 'Doubao CN',
        default: true,
        // eslint-disable-next-line no-restricted-syntax
        apiKey: process.env.DOUBAO_API_KEY!,
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        timeoutMs: 300_000,
      },
    ],
  },
  buildReports: {
    models: [
      {
        id: 'doubao-pro',
        label: 'Doubao Pro',
        default: true,
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

## Provider Instance Fields

| Field       | Meaning                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| `id`        | Stable provider instance identifier. `providerRef.id` points here.                |
| `label`     | Optional display label.                                                           |
| `default`   | Marks the default instance for the provider group. Only one is allowed per group. |
| `apiKey`    | Secret required to call the provider. Keep it out of the repository.              |
| `baseUrl`   | Provider endpoint. Changing it changes the effective request semantics.           |
| `timeoutMs` | Local timeout for one request.                                                    |

## Model Config Fields

| Field         | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `id`          | Stable model config identifier. `resolvePage` can reference it through `modelId`. |
| `label`       | Optional display label.                                                           |
| `default`     | Default execution model.                                                          |
| `providerRef` | Points to a provider group and, when needed, a concrete instance.                 |
| `model`       | The actual provider model name.                                                   |
| `thinking`    | Whether reasoning-style behavior should be enabled.                               |
| `maxTokens`   | Maximum output token budget.                                                      |
| `temperature` | Generation randomness. Lower values are more stable.                              |

## Defaults and `providerRef`

If `providerRef` only declares `provider: 'doubao'`, the provider group's default instance is used. When you have more than one instance, declaring `providerRef.id` explicitly is safer. If no instance is marked with `default: true`, the first item in the array becomes the default.

## When You Need More Than One Instance

Multiple instances become useful when regions, accounts, or gateway paths need to stay separate. They also help you keep a stable default provider alongside an experimental one, and they avoid repeated `baseUrl` changes on a single instance, which makes cache behavior and debugging harder to reason about.
