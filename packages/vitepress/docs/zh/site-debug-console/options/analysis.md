# `analysis`

`siteDebug.analysis` 是构建期 AI 报告的根配置对象。它把“用哪个 provider 执行分析”和“哪些页面要生成什么报告”这两件事放到同一个命名空间下。

## 它负责什么

- 声明可用的分析 provider，例如 `providers.doubao`。
- 声明 build-time AI report 规则，例如 `buildReports`。
- 为 `Site Debug Console` 提供运行时可读取的 page-level report 资产。

## 它不负责什么

- 它不会改变组件的渲染策略，也不会影响 `ssr:only` / `client:*` 的运行时行为。
- 它不会替代页面浮层、`Debug Logs`、`Render Metrics` 这些运行时证据。
- 它也不是一个通用模型调用入口；这里只服务于文档站构建期的 page-level 诊断。

## 最小示例

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

## 没有 `analysis` 会怎样

- `Site Debug Console` 的运行时面板仍然可以工作。
- 但不会生成 build-time AI reports。
- 控制台里也就不会出现这些构建期分析产物。

## 与下一级配置的关系

- `providers` 决定“有哪些 provider instance 可以被引用”。
- `buildReports` 决定“哪些 eligible page 要不要生成报告、使用哪个模型、如何缓存、是否展开 chunk/module 细节”。

## 启用前建议准备

- 至少准备一个可用的 provider instance。
- 至少准备一个可执行的 `buildReports.models` 条目。
- 优先配合 `resolvePage` 从少量页面开始，而不是一开始就对整站开启。
- 如果你打算把缓存结果提交到仓库，提前约定 `cache.dir` 和缓存策略。

## 推荐的接入节奏

比较稳妥的方式通常是：

1. 先让运行时控制台独立可用。
2. 再打开 `analysis`，但只保留一个 provider 和一个 model。
3. 用 `resolvePage` 限制在少量页面上试跑。
4. 确认报告质量与缓存策略都符合预期后，再逐步扩大范围。
