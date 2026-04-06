# `providers / models`

这一页关注两层配置的协作关系：

- `providers.doubao`：声明有哪些可用的 Doubao provider instance。
- `buildReports.models`：声明这些 provider instance 之上真正要执行的模型配置。

当前 `providers.doubao` 支持的是 **provider instance 数组**，而不是单对象配置。

## 最小示例

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

## 默认实例规则

`providers.doubao` 每个分组最多只能声明一个 `default: true`。如果你没有显式标注 default，那么数组里的第一个实例会被当作默认实例。

`buildReports.models[].providerRef.id` 会引用这里的 `id`。

## 配置项

| 配置项      | 含义                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| `id`        | provider instance 的稳定标识。`buildReports.models[].providerRef.id` 会引用它。 |
| `label`     | 可选展示名称，只影响 UI 展示。                                                  |
| `default`   | 是否把当前实例标记为 `doubao` 分组的默认实例。                                  |
| `apiKey`    | Volcengine Ark API key。执行 Doubao 请求时需要它，但它不会进入 cache identity。 |
| `baseUrl`   | Ark API 的 base URL。修改它会改变有效请求快照，因此会让 `exact` cache 失效。    |
| `timeoutMs` | 单次分析请求在本地的超时时间。                                                  |

## `providerRef.id` 如何关联

如果 `providerRef` 只写了：

```ts
const providerRef = {
  provider: 'doubao',
};
```

那么系统会使用当前 `doubao` 分组的默认实例。

如果你有多个实例，则可以显式绑定：

```ts
const providerRef = {
  provider: 'doubao',
  id: 'cn',
};
```

## `buildReports.models` 常见字段

真正会参与报告生成的模型配置，通常长这样：

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

常见字段的职责：

| 字段          | 含义                                                               |
| ------------- | ------------------------------------------------------------------ |
| `id`          | model config 的稳定标识。`resolvePage` 可以通过 `modelId` 引用它。 |
| `label`       | 可选展示名称，用于日志或调试台中区分报告来源。                     |
| `default`     | 当前模型是否作为默认执行模型。                                     |
| `providerRef` | 指向某个 provider 分组及具体 instance。                            |
| `model`       | provider 真实请求的模型名。                                        |
| `thinking`    | 是否启用推理型能力。                                               |
| `maxTokens`   | 单次请求的最大输出 token。                                         |
| `temperature` | 生成随机度，越低越稳定。                                           |

## 推荐实践

- 用稳定且可读的 `id` 区分 provider instance 与 model config，例如 `cn`、`intl`、`doubao-pro`、`perf-review`。
- 把 `apiKey` 当作 secret 管理，不要把它直接写进仓库。
- 如果你有多地域、多账户或多代理入口，优先通过多个 provider instance 管理，而不是只在一个实例上频繁改 `baseUrl`。
- 先收敛 provider instance，再扩展 model 数量，这样更容易理解 cache 命中与报告来源。
