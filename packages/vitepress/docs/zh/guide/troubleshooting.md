# 排障

接入出现问题时，先按症状定位，再决定去看 `logging` 还是 `Site DevTools`。这一页只覆盖第一次接入时最常见的几类问题。

## Markdown 标签没有生效

这通常是识别链路没有打通。先确认组件确实在当前页的 `<script lang="react">` 里导入，Markdown 里的标签名与导出名完全一致，并且 `.vitepress/config.ts` 已经调用 `createDocsIslands(...).apply(...)`，主题里也执行了 `reactClient()`。如果这些都没问题，再重启一次 dev server，排除旧的编译结果或卡住的 `HMR` 状态。

## 出现 hydration mismatch

这种情况通常意味着服务端输出和浏览器首次执行的结果不一致。常见原因是首屏依赖了时间、随机数、窗口尺寸或浏览器专属 API，也可能是组件本来就更适合 `client:only`，却先经过了 SSR 和 hydration。排查时先退回 `ssr:only`，确认静态输出本身稳定，再把浏览器专属逻辑移到副作用里；如果组件天生只属于浏览器，就直接改成 `client:only`。

## `SPA` 切页时组件闪烁

闪烁通常出现在新页面已经显示，而组件对应的 HTML、`CSS` 或 hydration 资源还没到齐的时候。先判断这个组件是否真的需要交互；如果只是静态展示，改回 `ssr:only` 往往最稳。如果它确实需要 hydration，可以给 `client:load` 或 `client:visible` 组件加上 `spa:sync-render`，再用 `Site DevTools` 查看浮层里的 `Status`、`Visible Wait` 和 `Bundle`。

## 组件里用了 Node-only API

典型现象是组件在 `ssr:only` 下看起来正常，一改成客户端策略就报错，浏览器里还能看到 `fs`、`path`、`process.cwd()` 之类的 Node-only API 不可用。处理时要把这类逻辑留在服务端路径里，不要让需要交互的组件直接依赖 Node-only API；必要时把服务端数据准备和客户端组件渲染拆成两层。

## `HMR` 日志太吵，或者看不清更新发生在哪里

这通常要同时配合两类工具。[logging](../options/logging.md) 用来控制包内日志的可见性，先把噪音压下去；[Site DevTools](../options/site-devtools/index.md) 用来查看页面浮层、`Debug Logs` 和 `HMR Metrics`，判断更新到底卡在触发、应用还是运行时 ready。如果只是临时隔离一类高频日志，可以在 `logging.rules` 里针对 `group` 写静音规则。

## 先看哪个工具

| 你想确认什么                              | 先看哪里                                           |
| ----------------------------------------- | -------------------------------------------------- |
| 终端和浏览器里到底打印什么                | [logging](../options/logging.md)                   |
| 页面当前的渲染状态、资源组成和 `HMR` 阶段 | [Site DevTools](../options/site-devtools/index.md) |
