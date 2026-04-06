# 工作原理

`@docs-islands/vitepress` 并不是把 `React` 硬塞进 `VitePress`，而是在 Markdown 编译、构建期预渲染和运行时接管之间增加了一条跨框架渲染链路。

## 渲染流水线

一次典型渲染大致会经历下面几步：

1. Markdown 中的 `<script lang="react">` 导入会被识别出来。
2. 符合约定的组件标签会被转换成带渲染元信息的容器节点。
3. 构建阶段根据声明的渲染策略决定是否预渲染 HTML、是否产出客户端接管代码。
4. 运行时再按指令接管对应容器，完成 hydration、纯客户端渲染，或保持纯静态输出。

这意味着你仍然在使用 `VitePress` 的页面模型，只是非 `Vue` 组件有了可控的渲染生命周期。

## 谁在什么阶段负责什么

把整条链路拆开看，会更容易理解问题该去哪一层排查：

| 阶段       | 主要负责方              | 你需要关心什么                                                |
| ---------- | ----------------------- | ------------------------------------------------------------- |
| Markdown   | `VitePress` + 插件转换  | 导入是否被识别、组件标签是否符合约定。                        |
| 构建期     | `docs-islands`          | 是否预渲染 HTML、是否产出 hydration/runtime 代码。            |
| 首次访问   | 浏览器运行时            | 容器是否被发现、是否按策略接管、是否发生 hydration mismatch。 |
| SPA 切页   | `VitePress` + 运行时    | 是否有闪烁、是否要用 `spa:sr`、切页成本是否过高。             |
| 开发态 HMR | `vite` + `docs-islands` | 组件更新是否及时、状态是否保留、是否命中正确的更新链路。      |

## 渲染策略速查

| 指令             | 是否预渲染 HTML | 客户端行为        | 典型场景               | `spa:sr` 默认 |
| ---------------- | --------------- | ----------------- | ---------------------- | ------------- |
| `ssr:only`       | 是              | 不接管            | 静态内容、SEO 关键区域 | 开启          |
| `client:load`    | 是              | 立即 hydration    | 首屏关键交互           | 关闭          |
| `client:visible` | 是              | 可见时 hydration  | 非首屏交互组件         | 关闭          |
| `client:only`    | 否              | 纯客户端渲染      | 强宿主依赖、轻量挂件   | 不支持        |
| 无指令           | 是              | 等价于 `ssr:only` | 默认静态输出           | 开启          |

## 每种策略分别意味着什么

### `ssr:only`

- 构建期完成预渲染，只输出静态 HTML。
- 没有客户端 hydration 成本，适合静态说明块、SEO 关键内容、品牌展示区。
- 如果某个组件在当前页面里只以 `ssr:only` 形式出现，它还可以安全依赖 Node API。

### `client:load`

- 先预渲染 HTML，再在客户端加载完成后立即接管交互。
- 适合首屏内必须立即可操作的组件。
- 交互启动更快，但也更容易把 hydration 成本带到首屏。

### `client:visible`

- 先有预渲染 HTML，等进入视口后再 hydration。
- 适合评论、图表、埋点面板等非首屏交互区。
- 默认会预加载脚本，它不是“什么都不做的纯懒加载”。

### `client:only`

- 不做 SSR/SSG 预渲染，只在客户端渲染。
- 适合依赖 `window`、`document` 或浏览器宿主 API 的组件。
- 对 SEO 和首屏静态可见内容最不友好，但心智负担最低。

## 如何选择策略

如果你不想一开始就陷入“每个组件该选哪种策略”的复杂判断，可以用这套简单规则：

- 内容展示型、品牌展示型、代码示例型：先用 `ssr:only`。
- 首屏内必须立刻点击、输入或展开的组件：优先 `client:load`。
- 首屏之外的评论区、图表、统计卡片：优先 `client:visible`。
- 明确依赖浏览器环境，或根本不值得预渲染的轻量挂件：再考虑 `client:only`。

先把“页面能稳定输出”作为第一目标，再把“交互什么时候接管”作为第二层优化，通常会更稳。

## 为什么有 `spa:sync-render`

`VitePress` 在 `SPA` 切页时，`Vue` 侧内容会同步更新，但非 `Vue` 组件的预渲染 HTML 与样式、脚本注入通常是异步完成的。这个时间差会让用户在切页时看到短暂空白或闪烁。

`spa:sync-render`（简写 `spa:sr`）的目标，就是把被标记组件的预渲染结果更早地并入页面切换流程，让关键组件尽量与主体内容同步出现。

**下述演示环境在 `CPU: 20x slowdown`、`0.75` 倍速播放：**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

在未启用 `spa:sr` 的情况下，主要问题通常来自两部分：

1. 主体文本已经更新，但非 `Vue` 组件内容还没补上。
2. 组件样式和依赖资源仍在异步加载，产生额外位移。

启用 `spa:sr` 后，可以明显减轻切页阶段的视觉割裂：

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

## `spa:sr` 的默认规则与取舍

- `client:only` 不支持 `spa:sr`。
- `client:*` 默认不开启 `spa:sr`，除非你显式写上 `spa:sr` / `spa:sync-render`。
- `ssr:only` 和无指令组件默认开启 `spa:sr`，除非显式关闭。

这背后的取舍是：

- 好处：切页更平滑，关键组件更像原生 `Vue` 内容一样同步出现。
- 成本：切页时的客户端脚本体积会增加，关键样式还可能变成阻塞渲染的前置条件。

## 什么时候值得启用 `spa:sr`

更适合启用的场景：

- 组件是页面主体的一部分，切页时短暂空白会明显破坏阅读连续性。
- 组件本身不是高交互应用壳，但视觉上必须尽量和正文同步出现。
- 你已经通过调试确认问题主要来自异步注入时差，而不是组件本身渲染过慢。

更适合关闭的场景：

- 组件本身不是关键内容，只是补充说明或辅助信息。
- 页面已经有很多 `spa:sr` 组件，再继续开启会抬高切页成本。
- 你更在意切页阶段的脚本体积，而不是局部组件的同步出现体验。

::: warning 关键样式阻塞渲染说明

如果页面里存在启用了 `spa:sr` 的组件，运行时需要先确保这些组件依赖的关键样式加载完成，再去渲染主要内容。这样做能减少闪烁，但也会带来额外的阻塞成本。

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

:::

::: warning 开发阶段不生效

`spa:sr` 在开发阶段不会真正按生产模式生效。原因是开发态 `VitePress` 的 `spa` 模块采用动态求值执行，运行时拿不到和生产构建完全一致的完整初始 `props` 上下文，因此不能安全地提前同步注入所有预渲染结果。

换句话说，开发态会尽量模拟生产策略，但 `spa:sr` 的真实收益需要在构建产物里观察。

:::

## Markdown 编写约束

### 组件标签与导入

- 组件标签必须以大写字母开头。
- 标签名必须和同一页面 `<script lang="react">` 中的本地导入名完全一致。
- 只支持自闭合标签，例如 `<Comp ... />`。
- 组件必须在当前页面内导入；未导入的标签会被忽略。

### Props 传递

- 所有非策略属性都会作为字符串 props 传给 `React` 组件。
- `Vue` 绑定会先由 `Vue` 求值，再作为初始化快照写入容器属性。
- 这是一次性数据传递，不是跨框架响应式双向绑定。
- 不要通过属性传递函数或事件处理器。

这意味着，如果 `Vue` 父级状态后续发生变化，`React` 组件不会自动像 Vue 子组件那样同步收到响应式更新。需要时，应当把状态收敛在同一框架内处理，或通过重新渲染页面片段来更新初始快照。

### 重导出与插槽

- 支持通过 `export * from '...'`、`export { Foo } from '...'` 这类重导出链导入组件。
- 组件可以写在 `Vue` 插槽里，仍然会被识别。
- 如果 barrel 模块本身包含副作用，请不要把它当成副作用注入点；运行时会直接指向最终导出模块。

### Node API 约束

当某个组件在同一页面上既以 `ssr:only` 使用、又以任意 `client:*` 使用时，它就不能依赖 `node:fs` 这类 Node API。只有“当前页面内纯 `ssr:only` 使用”的组件，才能安全读取本地文件等服务端能力。

## 常见误区

- 把它当成“让 React 接管整页”的方案：它更适合组件级岛屿，而不是整页 SPA。
- 一开始就大量使用 `client:only`：这样虽然简单，但会损失静态输出和首屏质量。
- 在 barrel 模块里塞副作用逻辑：最终运行时会指向真正的导出源，而不是中间重导出模块。
- 看到切页闪烁就默认打开所有组件的 `spa:sr`：这通常会把问题从“闪烁”换成“切页更重”。

## 代表性代码片段

### 最小使用示例

```md
<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sr title="Home" />
```

### Vue 向 React 传一次性 props

```md
<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import ReactVueSharedComp from '../rendering-strategy-comps/react/ReactVueSharedComp';
</script>

<VueComp1 :page-title="page.title">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp client:only :vue-info="vueInfo" />
  </template>
</VueComp1>
```

### 纯 `ssr:only` 场景读取本地文件

```ts
import { readFileSync } from 'node:fs';
import { join } from 'pathe';

const targetPath = join(import.meta.dirname, 'local-data.json');
const data = JSON.parse(readFileSync(targetPath, 'utf8')) as {
  data: unknown;
};
```

如果你希望这类本地文件改动也参与热更新，需要自行通过 `vite` 的 `handleHotUpdate` 做桥接。

## 继续阅读

- [快速上手](./getting-started.md)：按最短路径接入项目。
- [站点调试](../site-debug-console/)：查看运行时排障能力。
- [产物分析](../site-debug-console/options/build-reports.md)：查看 `cache`、`resolvePage` 和模型配置。
