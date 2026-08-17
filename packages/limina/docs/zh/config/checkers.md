# 检查器配置

`config.checkers` 选择 active default `tsconfig.json` 入口。Limina 随后为完整 references closure 中的每个 managed type config 分配恰好一个 checker owner。检查器名称是固定 identity：

| key            | 执行方式                         | 生成声明 |
| -------------- | -------------------------------- | -------- |
| `tsc`          | 生成 TypeScript build target     | 是       |
| `tsgo`         | 生成 native TypeScript target    | 是       |
| `vue-tsc`      | 生成 Vue/TypeScript build target | 是       |
| `svelte-check` | 按 leaf 执行 framework typecheck | 否       |
| `astro`        | 按 leaf 执行 framework typecheck | 否       |

key 本身就是检查器 identity，不再有 `preset` 字段，也不再支持自定义检查器 alias。这样，源码归属、生成路径、执行工具和缓存行为只使用同一个名字。

`vue-tsc`、`svelte-check` 与 `@typescript/native-preview` 是 optional external-checker peer。它们的 peer range 表达 Limina 支持的 checker 版本，每个 checker 都从其 target 实际执行的 scope 解析。`typescript` 仍是 Limina 必需的 runtime peer，从运行 Limina 的 workspace 安装环境解析。

Auto discovery 始终启用。Named scope 先接管命中的入口；未被 named scope 接管的入口仍然自动分析：

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      tsc: {
        include: ['packages/shared/tsconfig.json'],
      },
      tsgo: {
        include: ['packages/native/**/tsconfig.json'],
      },
      'vue-tsc': {
        include: ['apps/web/tsconfig.json'],
      },
      'svelte-check': {
        include: ['apps/svelte/tsconfig.json'],
        exclude: ['apps/legacy/tsconfig.json'],
      },
    },
  },
});
```

每个 named `include` 都必须是非空数组，`exclude` 可省略。只配置 framework checker 也合法。同一个入口不能同时匹配两个 named checker scope。

## Auto 模式

- **类型：** `{ exclude?: string[]; useTsgo?: boolean }`
- **默认值：** 无论是否存在 named scope 都启用

默认情况下，普通 TypeScript fallback 由 `tsc` 负责；framework evidence 会在 fallback 前解析出对应 framework owner：

```text
普通 TypeScript -> tsc
Vue             -> vue-tsc
Astro           -> astro
Svelte          -> svelte-check
```

设置 `useTsgo: true` 后，只有普通 TypeScript fallback 改由 `tsgo` 负责，framework ownership 不变。

```js
export default defineConfig({
  config: {
    checkers: {
      auto: {
        useTsgo: true,
        exclude: ['packages/playground/tsconfig.json'],
      },
    },
  },
});
```

`useTsgo` 只改变完成 framework analysis 后仍属于普通 TypeScript 的 config 的最终 fallback。Vue promotion 只沿 `consumer -> provider` dependency edge，从 Vue provider 向 pending consumer 反向传播；它不会遍历无向 component，也不会覆盖已经 resolved 的 owner。

Vue 能力由检查器实际解析出的文件集合确认，不能只看 `vueCompilerOptions`。Limina 会先遍历入口、solution、被引用 leaf 和有效 `extends`，再让 Vue parser 解析真实扩展名和文件。只有确实存在匹配文件时，自定义 Vue 扩展才会切到 `vue-tsc`；只有配置提示而没有实际模块时，不会改变归属。

Auto `exclude` 只过滤已激活[治理区域](./regions.md)中的入口选择，不会裁剪从已选入口到达的有效 project reference，也不同于控制源码覆盖的 `config.source.exclude`。

旧 `{ mode: 'auto' }` 结构会被拒绝。请把 `exclude` 与 `useTsgo` 移到 `auto` 下。

## Named 入口约束与 solution closure

所有 named checker scope 使用同一个结构：

```ts
interface CheckerScope {
  include: string[];
  exclude?: string[];
}
```

`include` 只选择相对 `config.rootDir` 的直接 default `tsconfig.json` 入口，不能直接选择 `tsconfig.lib.json`、`tsconfig.test.json` 或其他 named config；这些 config 只能通过 managed references closure 进入。外部激活包可以使用 `../`，但 selector 不能把未激活路径或工作区边界后的路径拉入图中。`exclude` 在 include 之后移除直接入口，不会截断正常的 project-reference closure。

Limina 区分 solution config 与 terminal type config。Solution 只组织 references，本身不是 Astro、Svelte 或 Vue execution target。Limina 会递归展开 nested solution，用规范化路径对 terminal type config 去重，并对每个 leaf 执行一次选定 checker。

Solution 上的 named checker 是 declared constraint，不会提前改写每个 pending leaf 的 local owner。Constraint 在 solution/leaf 二部图上跨 overlapping solution 与 shared pending leaf 传播至 fixed point。Pending leaf 仍继续参加 root-file 与 dependency analysis；如果后续 local evidence 要求另一个 checker，prepare 会报告 checker ownership conflict，而不是隐藏证据。

所有 evidence 与 fallback 完成后，一个 solution 的所有 leaf 必须拥有相同 final owner。不同 standalone config 拥有不同 owner 仍然合法；typed dependency edge 会保留它们的执行顺序。

`tsconfig.lib.json`、`tsconfig.test.json` 等非入口配置，只有被已选 `tsconfig.json` 入口引用时才会进入治理图。生成配置都位于 Limina 的 `.limina` namespace；用户配置和诊断继续使用源码配置路径。

## Framework ownership 与 dependency boundary

Config selector、checker-aware effective root file、missing-type dependency evidence 与 directed Vue promotion 都可以形成 local ownership evidence。一个 type config 可以同时包含 TS/JS 与一个 framework family；两个 framework root family、两个 explicit owner，或 resolved owner 与不兼容 requirement 都会 fail closed。

Dependency analysis 会扫描所有 managed type config，包括 local owner 已经 resolved 的 config。Limina 会先完整收集一个 config 的全部 import requirement，再统一归约。Pending config 即使收到 solution constraint，也始终使用 neutral TypeScript semantic context；Astro/Svelte-owned config 中的 TS/JS import 同样使用 neutral TypeScript evidence，因为这些 external checker 目前不是 TypeEvidence provider。

`ambient`、`concrete-declaration` 与 `checker-source` evidence 会建立 TypeScript domain boundary。只有 `missing` 才继续 physical resolution；`unsupported-checker` 会 fail closed。Physical target 只有实际属于唯一 managed file set 时才能传播 framework requirement。目录接近、nearest package、nearest tsconfig 与 excluded file 都不能证明 ownership。Side-effect import 与消费 export 的 import 使用相同规则。

Astro/Svelte owner 不生成 declaration project、wrapper 或 transparent build solution。`checker:typecheck` 会对其完整 type config 按 leaf 执行一次。需要 emit declaration 的 TypeScript 必须拆到独立 `tsc`、`tsgo` 或 `vue-tsc` config。

如果 `checker:typecheck` 没有 framework-owned leaf，它会被记录为 `disabled`，正常退出，不运行 peer preflight，也不物化生成的 checker artifact。

### 框架前置条件

框架 checker 命令及其执行 runtime 都从拥有源码配置的叶子包解析：

- Astro 需要 `astro`、`@astrojs/check` 和 `typescript`，以及叶子包已生成的 `.astro/types.d.ts`。Limina 执行 `astro check --noSync --root <leaf> --tsconfig <source-config>`，不会运行 `astro sync`。
- Svelte 需要 `svelte-check`、`svelte` 和 `typescript`。Limina 执行 `svelte-check --workspace <leaf> --tsconfig <source-config>`，不会运行 SvelteKit sync、启用增量模式、写入 `.svelte-check` cache 或覆盖输出格式。

Astro 的轻量 import 收集与 checker 执行使用不同归属：`@astrojs/compiler` 是 Limina runtime，从运行 Limina 的 workspace 安装环境解析，因此整个 workspace 安装一次即可，叶子包中的冲突副本也不能 shadow 它。Limina 只在实际需要 Astro 源码收集时预检该 runtime；同一个共享环境故障无论涉及多少个 `.astro` 文件，都只报告一个 issue。Svelte import analysis 仍从所属叶子包解析 `svelte/compiler`。框架 checker 依赖缺失时，预检仍会在启动检查器进程前失败。

`checker typecheck` 是完整重跑，不是框架 watch 模式。稳定 target ID 只表示多次运行之间的 target identity 稳定，不提供增量失效能力。

## Astro 语义 import 解析

当真实 `.astro` 源码 import 可能影响生成图时，Limina 可以用有界 Astro 语义解析增强轻量 ImportRecord。这条路径没有用户配置，不运行 Language Service、不创建 TypeScript Program，也不执行完整 Astro typecheck。它按需创建 Volar Language 与 decorated TypeScript host，在同一个 analysis provider 内复用这份有界 context，用真实源码映射找到 semantic module literal，再由该 host 确认物理 target。

流水线明确区分两个判断：

1. 真实源码 ImportRecord、原始 specifier 与廉价 Oxc/filesystem evidence 只判断是否需要语义解析。
2. 只有 eligible record 才使用 Astro semantic host；随后，已经得到的 Oxc 与 TypeScript evidence 仍进入正常的最终 runtime classification。

已知 virtual module、query/resource import 与显式非源码扩展会跳过 semantic context，继续使用现有非语义路径。eligible record 一旦启动 Astro semantic resolution，toolchain 或 source-map failure 就会 fail closed，不会退回普通 TypeScript resolver。正常 Astro/Volar virtual code 可以包含 synthetic import；这些 import 不参与 candidate discovery，也永远不会形成 graph edge。只有真实源码 record 没有严格 source mapping、映射存在歧义，或严格候选无法全部证明相同的 source specifier、resolution mode 与 canonical target 时，才报告 `source-map-mismatch`。

首个 adapter family 有明确边界：

| 组件                                     | 支持契约                              |
| ---------------------------------------- | ------------------------------------- |
| Astro                                    | `>=7.0.0 <8.0.0`                      |
| `@astrojs/check`                         | `0.9.10`                              |
| `@astrojs/language-server`               | `2.16.13`                             |
| LS-owned `@astrojs/compiler`             | `2.13.1`                              |
| `@volar/language-core`                   | `2.4.28`                              |
| `@volar/kit`                             | `2.4.28`                              |
| `@volar/typescript`                      | `2.4.28`                              |
| leaf-visible 与 check-visible TypeScript | Limina 已声明的 TypeScript peer range |

TypeScript peer range 是 `>=5.4.0 <5.10.0 || >=6.0.0 <6.1.0`。Astro `7.0.0` 是受支持的 floor，不是唯一可接受版本。adapter 还会检查 internal API shape，因此版本字符串匹配但 exports 不兼容时仍然 fail closed。

依赖解析遵循 package ownership。Limina 依次从所属 leaf、`@astrojs/check`、Language Server、`@volar/kit` 创建解析 scope。依赖必须由拥有它的 scope 声明；owner-scoped 解析失败后不会改从 workspace root 重试。resolved file 可以位于 pnpm store、hoisted directory 或其他 symlink layout。路径只记录为 provenance，并用于隔离不同 module instance；物理路径相等永远不是兼容条件。因此，两份受支持的 TypeScript 可以来自不同 realpath，甚至可以是范围内不同版本。

semantic resolver 只确认 target；runtime classification、源码 ownership、provider 选择、scheduling 与 graph policy 仍由 Limina 决定：

| Astro 源码 target | 图策略                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| `.astro`          | framework scheduling                                                            |
| `.svelte`         | framework scheduling                                                            |
| `.vue`            | Astro 确认物理 target，再进入现有 Vue-owned declaration/checker provider policy |
| `.ts` / `.tsx`    | TypeScript declaration-provider policy                                          |

对于 `A.astro -> B.vue -> C.ts`，`A -> B` 始终由 Astro pipeline 负责。只有独立分析 `B.vue` 源码时才使用 Vue semantic resolution，因此 Vue 不会重新解释写在 `A.astro` 中的 import。`.astro` 与 `.svelte` 仍不会进入生成声明的 `files`；这不影响它们的真实 import 形成合法 scheduling 或 declaration-provider relationship。

## Vue 源码与语义 import 分析

Vue import 收集不再提供配置字段。Limina 始终从 inline `<script>`、`<script setup>`、`<script src>` attribute，以及 `generic` attribute 内的 `import()` 表达式收集轻量源码证据。对于 `vitepress-markdown` source profile，行内反引号代码与反引号围栏代码块不会成为这类证据，同时源码 offset 与换行保持不变；波浪号围栏不会被排除。这条面向文件的收集路径不会初始化 `vue-tsc`，standalone import analysis 仍可使用它。

当源码归属于 `vue-tsc` project 时，生成 reference 准备和 `graph:check` 可以把源码记录增强为 checker 语义证据。Limina 先从 checker execution scope 解析 `vue-tsc`，再从这份已安装 `vue-tsc` 的依赖环境解析 Vue Language Core、Volar TypeScript 和 toolchain 使用的 TypeScript。它以同一套 toolchain 和 virtual config overlay 完成 project membership 与语义分析；只有严格的 source-to-virtual mapping 才会被接受。没有源码证据的 service-script synthetic import 永远不会成为 graph edge。TypeScript/declaration resolution 使用映射后的 semantic literal；Oxc/runtime 与 resource evidence 继续使用原始 source specifier。

支持的 adapter matrix 有明确边界：

| `vue-tsc` family | 对应 `@vue/language-core` | `@volar/typescript` | TypeScript           |
| ---------------- | ------------------------- | ------------------- | -------------------- |
| 2.2.0–2.2.12     | 与 `vue-tsc` 版本相同     | 2.4.11–2.4.28       | 5.4.x–5.9.x 或 6.0.x |
| 3.2.0–3.2.4      | 与 `vue-tsc` 版本相同     | 2.4.27              | 5.4.x–5.9.x 或 6.0.x |

发布包只将 `vue-tsc` 声明为 Vue optional checker peer。`@vue/language-core` 与 `@volar/typescript` 是 checker 内部 toolchain package：应用无需为 Limina 安装它们，Limina 也不再将它们发布为 peer。`vue-tsc` peer range 表达受支持的 external checker 版本；Limina 仍按上表校验实际安装的完整 tuple。顶层 checker 缺失或版本越界时分别报告 `Missing external checker` 或 `Unsupported external checker`；内部 tuple 不完整或不兼容时报告 `Unsupported vue-tsc toolchain`，修复方式是在对应 checker scope 升级、降级或重装 `vue-tsc`，而不是直接安装内部 package。

该 Vue tuple 使用的 TypeScript 属于 checker-toolchain 角色，通过 `vue-tsc` 解析；它不要求与 Limina 自身必需的 TypeScript runtime 是同一个物理安装。

不受支持的 tuple 不会关闭轻量源码收集；需要 checker-parity semantic dependency 或 reference resolution 的操作会 fail closed，不会回退到近似的 Vue extension resolver。

### 从 `config.imports.vue` 迁移的 breaking change

删除 `config.imports.vue`，不需要添加替代字段。仍包含 `config.imports` 的配置会在加载时直接报告这项迁移。公共 `VueImportParser` 类型以及 Limina 对 `@vue/compiler-sfc` 的直接/可选依赖也已删除。

Limina 不再提供 compiler-sfc 专属的 duplicate script block 或 `<script setup src>` 结构诊断；SFC 是否有效由 Vue checker 与 editor tooling 负责。Limina 只在自身分析边界内报告源码 provenance、resolution 与 graph failure。

## 跨检查器依赖与缓存复用

Limina 会区分声明依赖和框架调度依赖：

- `declaration-provider` 表示真实的编译器声明关系，可以成为生成的 TypeScript project reference。
- `framework-schedule` 只用于排列框架检查或构建顺序，绝不会写成生成的 `tsconfig` reference。

provider 会先于 consumer 运行。纯 framework-scheduling cycle 会作为一个调度 component 执行；declaration cycle 仍然失败。

缓存复用是有方向的：

| Consumer              | Provider      | 可以复用缓存 |
| --------------------- | ------------- | ------------ |
| 相同 checker identity | 相同 identity | 是           |
| `vue-tsc`             | `tsc`         | 是           |
| 其他跨 identity 组合  | 不同 identity | 否           |

如果 consumer 能编译 provider 的完整 declaration closure，Limina 会保留 reference。无法复用缓存时，会在首个 build target 启动前警告：底层工具可能重复构建或造成 cache churn。如果 consumer 不能处理 provider closure，图准备会直接失败。例如，`tsc` 或 `tsgo` consumer 不能依赖包含 `.vue` 或自定义 Vue 扩展的 provider closure。

## 从 alias 与 `preset` 迁移

把旧 entry 移到与其 `preset` 同名的固定 key，再删除 `preset`：

```js
// before
checkers: {
  typescript: {
    preset: 'tsgo',
    include: ['packages/**/tsconfig.json'],
  },
  vue: {
    preset: 'vue-tsc',
    include: ['apps/web/tsconfig.json'],
  },
}

// after
checkers: {
  tsgo: {
    include: ['packages/**/tsconfig.json'],
  },
  'vue-tsc': {
    include: ['apps/web/tsconfig.json'],
  },
}
```

如果多个 alias 以前使用同一个 `preset`，需要把不重叠的 selector 合并到一个固定 key。selector 重叠或策略冲突时，请显式决定如何处理；Limina 不会猜测哪个 alias 优先。配置文件是 TypeScript/MTS，因此 Limina 会给出确定的 schema diagnostic，但不会自动改写。

## 生成图与 manifest

运行 `limina graph prepare` 会物化 `.limina/manifest.json` 和生成的检查器配置。managed build/typecheck 命令与流水线会按需物化；只读的 graph、source 和 proof check 只在内存中计算图。

当前 manifest 为 version 5。它同时持久化 ownership plan（config role、final owner 与 solution leaf closure）、稳定排序的 typed `dependencyEdges`，以及 build/framework execution targets。Version 1 到 4 只作为旧生成产物的归属 ledger，用于安全清理后写入 version 5。未来版本或格式错误的 manifest 会 fail closed。
