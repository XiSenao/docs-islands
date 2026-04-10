# 最佳实践

这一页面向日常写作和接入决策：怎样正确写组件标签、怎样保守地选择渲染策略，以及在规模化使用前最需要注意哪些边界条件。

如果你需要安装和首次接入步骤，请看 [快速上手](./getting-started.md)。如果你需要了解运行原理，请看 [工作原理](./how-it-works.md)。

## 先把文档边界分清楚

这三页分别回答不同问题：

- [快速上手](./getting-started.md)："我怎么把它装好并跑通第一个孤岛组件？"
- [工作原理](./how-it-works.md)："编译器和运行时到底做了什么？"
- 这一页："在真实文档站里，我应该怎样写、怎样选策略、怎样避坑？"

## 先保守，再升级

最稳妥的接入顺序是：

1. 先让组件以 `ssr:only` 跑通。
2. 确认页面能构建，静态输出正确。
3. 只有当组件真的需要交互时，再加客户端接管。
4. 只有当切页时机真的影响阅读体验时，再考虑 `spa:sr`。

这样第一阶段关注的是“正确性”，而不是一上来就进入 hydration 复杂度。

## Markdown 编写规则

这些是最重要的写法约束：

- 一个页面里只能有一个 `<script lang="react">`。
- 组件标签必须以大写字母开头。
- 标签名必须和同页里的本地导入名完全一致。
- Markdown 里使用的组件标签必须是自闭合写法，比如 `<Landing ... />`。
- 组件必须在当前 `.md` 文件里导入，否则会被跳过。
- 写在 `Vue` 插槽和模板里的组件仍然可以被识别。
- 支持重导出链，但运行时最终会指向真正的导出源。

正确示例：

```md
<script lang="react">
  import { Landing as HomeLanding } from '../rendering-strategy-comps/react/Landing';
</script>

<HomeLanding client:load />
```

会被跳过的示例：

```md
<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<landing client:load />
<Landing></Landing>
```

## 用最低必要的客户端成本来选策略

默认思路应该是："能保持静态，就不要急着引入客户端接管。"

### 默认先用 `ssr:only`

优先从这些场景开始：

- 文档正文
- 提示块、说明块
- 示例组件
- 不需要立即交互的品牌展示和英雄区

它适合作为默认值，因为：

- 最贴近 `VitePress` 的静态优先模型
- 没有 hydration 成本
- 在增加运行时复杂度前，最容易先把基线跑正确

### 只有在必须立即交互时才升级到 `client:load`

当组件一进入视口就必须可交互，否则用户会觉得坏掉了，再考虑 `client:load`。

典型例子：

- tabs
- search
- filter
- 首屏可见的 demo

### 首屏外的交互优先考虑 `client:visible`

当组件不是第一时间必须交互，而是稍后才重要时，更适合 `client:visible`。

典型例子：

- 评论区
- 页面下方的图表
- playground 和次级工具面板

### `client:only` 只留给明确的浏览器依赖

只有在预渲染不安全或意义不大时，再使用 `client:only`。

典型例子：

- 直接依赖 `window` 或 `document` 的组件
- 必须等浏览器 API 可用后才有价值的小挂件

它的取舍是：

- 心智负担最低
- 静态输出最弱
- 没有预渲染 HTML

## 把 Vue 到孤岛组件的 Props 当成初始化

`Vue` 传给孤岛组件的值，本质上是一次性的容器快照，不是持续同步的跨框架状态桥。

这意味着：

- 用这些值来初始化孤岛组件即可
- 持续演化的交互状态尽量收敛在同一个框架边界里
- 不要通过属性传函数或事件处理器

如果你发现自己想让多个框架像一棵共享响应式树那样协同，通常就已经越过了孤岛组件模型的设计边界。

## 谨慎使用 `spa:sr`

`spa:sync-render` 很有用，但它不是“无脑全开”的优化项，而是一种有代价的权衡。

更适合开启的情况：

- 组件本身是页面阅读体验的一部分
- 切页时延后出现会明显让页面看起来坏掉
- 调试后确认问题主要来自注入时机

更适合关闭的情况：

- 组件只是辅助内容，不是关键内容
- 页面里已经有很多 `spa:sr` 组件
- 你更在意切页阶段更小的 bundle，而不是更强的一致出现效果

还要记住默认规则：

- `client:only` 不支持 `spa:sr`
- `client:load` 和 `client:visible` 需要显式开启
- `ssr:only` 默认启用 `spa:sr`，除非显式关闭

## Node API 与本地文件的注意事项

像 `node:fs` 这样的 Node API，只有在组件于当前页面中“纯 `ssr:only` 使用”时才是安全的。

如果同一个组件在一个页面里同时以 `ssr:only` 和任意 `client:*` 策略出现，它就不能依赖服务端专属 API。

读取本地文件时，请用 `import.meta.dirname` 解析路径：

```ts
import { readFileSync } from 'node:fs';
import { join } from 'pathe';

const targetPath = join(import.meta.dirname, 'local-data.json');
const data = JSON.parse(readFileSync(targetPath, 'utf8')) as {
  data: unknown;
};
```

如果你希望本地文件改动也参与 HMR，需要自己通过 `vite` 的 `handleHotUpdate` 做桥接。

## 在大规模使用前先检查这些点

在文档站里铺开更多孤岛组件前，建议至少确认：

- 组件作为 `ssr:only` 时能稳定构建和渲染
- 切换到交互策略前，没有 hydration mismatch
- 开发态 HMR 仍符合预期
- 依赖 Node API 的组件只在当前页面以内纯 `ssr:only` 使用
- 在大规模启用 `spa:sr` 前，先实际观察切页表现

## 常见误区

- 太早默认使用 `client:only`，直接放弃静态输出。
- 把它当成让某个框架接管整页的方案。
- 遇到第一次闪烁就把所有组件都打开 `spa:sr`。
- 把关键副作用藏在 barrel 模块里。
- 误以为初始化后的 `Vue` props 还会持续流进孤岛组件。

## 快速排错

- 标签被忽略：确认标签以大写字母开头，并与同一 `<script lang="react">` 中的本地导入名完全一致。
- 组件没有渲染：确认组件在同一 `.md` 文件中导入，且不在围栏代码块中。
- 切页闪烁：先判断这个组件是否真的关键到值得启用 `spa:sr`。
- hydration 报错：确认服务端输出和客户端输出一致，并避免通过属性传函数。
- Node API 报错：确认该组件在当前页面只以 `ssr:only` 渲染。

## 继续阅读

- [快速上手](./getting-started.md)：完成接入并跑通第一个孤岛组件。
- [工作原理](./how-it-works.md)：理解编译和运行时链路。
- [站点调试](../site-debug-console/)：查看 bundle 组成、运行时状态和 HMR 行为。
