# @docs-islands/lattice

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/lattice"><img src="https://img.shields.io/npm/v/@docs-islands/lattice.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/lattice.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/lattice.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

`@docs-islands/lattice` 是面向 TypeScript project references monorepo 的可配置架构治理 CLI。它把分散且冗长的根脚本收束为一个显式规则文件和一个 `lattice` 命令，用来检查生成的路径别名、项目图架构、局部 typecheck 覆盖证明、发布产物包边界，以及自定义 pipeline。

## 特性

- **单一治理入口**：用 `lattice check <pipeline>` 替代冗长的根 `package.json` 脚本。
- **显式配置**：所有架构规则都写在 `lattice.config.mjs` 中，不依赖隐藏 preset。
- **生成 TypeScript paths**：根据 pnpm workspace link、package `exports` / `imports` 生成 `tsconfig.graph.paths.generated.json`。
- **项目图校验**：约束 project reference 边、包导入边界、推断项目归属和 Node builtin 导入规则。
- **Typecheck 覆盖证明**：确认 package 级 typecheck 脚本都被根图、配置的 sidecar 或带理由的 allowlist 覆盖。
- **发布产物包边界审计**：扫描构建后的 `.js` 文件，确认 runtime import 与 dependencies、自身 exports、browser/node 环境匹配。
- **Pipeline 组合**：在 `typecheck`、`package`、`publish` 等命名 pipeline 中组合内置检查和 shell 命令。
- **统一日志输出**：通过 `@docs-islands/logger` 输出稳定的 `@docs-islands/lattice[task.*]` 日志分组。
- **TypeScript 优先**：提供 ESM、类型声明、CLI bin 和 `defineConfig(...)`。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- 由接入仓库安装 TypeScript
- pnpm workspace，并包含 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`
- 支持 ESM 配置文件

Lattice 专门为 pnpm 设计。它固定读取 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`，这些文件名不作为用户配置项暴露。

## 安装

```sh
pnpm add -D @docs-islands/lattice typescript
```

如果某个 workspace package 自己的脚本中也要调用 `lattice`，请把它作为 workspace 依赖接入：

```json
{
  "devDependencies": {
    "@docs-islands/lattice": "workspace:*"
  }
}
```

## 快速开始

在仓库根目录创建 `lattice.config.mjs`：

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  workspace: {
    internalScopes: ['@acme/'],
  },
  paths: {
    generatedFileName: 'tsconfig.graph.paths.generated.json',
  },
  graph: {
    rootConfig: 'tsconfig.graph.json',
    productionKinds: ['lib', 'runtime-client', 'runtime-node'],
    projectKinds: [
      { kind: 'solution', paths: ['tsconfig.graph.json'] },
      { kind: 'lib', suffixes: ['/tsconfig.lib.build.json'] },
      { kind: 'test', suffixes: ['/tsconfig.test.build.json'] },
    ],
    forbiddenEdges: [
      {
        fromKinds: ['lib', 'runtime-client', 'runtime-node'],
        toKinds: ['test'],
        reason: 'production graph must not depend on tests',
      },
    ],
  },
  proof: {
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
    ],
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Declaration-only runtime shim checked by a sidecar target.',
      },
    ],
  },
  packageBoundary: {
    targets: [
      {
        name: '@acme/core',
        distDir: 'packages/core/dist',
      },
    ],
  },
  pipelines: {
    typecheck: [
      'paths:check',
      'graph:check',
      'proof:check',
      {
        type: 'command',
        command: 'tsc',
        args: ['-b', 'tsconfig.graph.json', '--pretty', 'false'],
      },
    ],
    package: ['package-boundary:check'],
  },
});
```

配置根脚本：

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck",
    "typecheck:paths": "lattice paths apply"
  }
}
```

运行检查：

```sh
pnpm typecheck
pnpm exec lattice paths apply
pnpm exec lattice package-boundary check --package @acme/core
```

## CLI

```sh
lattice [--config lattice.config.mjs] <command>
```

| 命令                                              | 说明                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `lattice check <pipeline>`                        | 运行 `pipelines` 中的命名 pipeline。                                            |
| `lattice paths check`                             | 只读检查生成的 TypeScript graph paths 配置。                                    |
| `lattice paths apply`                             | 写入生成的 TypeScript graph paths 配置，并维护 build config 的 `extends` 列表。 |
| `lattice graph check`                             | 校验 project references 和架构导入规则。                                        |
| `lattice proof check`                             | 证明 workspace typecheck 目标被根图、sidecar 或 allowlist 覆盖。                |
| `lattice package-boundary check`                  | 审计所有配置的发布产物包边界目标。                                              |
| `lattice package-boundary check --package <name>` | 按配置的 `name` 审计单个包边界目标。                                            |

`check` 命令都是只读的。会写文件的行为必须放在显式 apply 类命令中，目前是 `lattice paths apply`。

## 配置

`lattice.config.mjs` 必须 default export 一个配置对象。推荐使用 `defineConfig(...)` 获得编辑器提示和类型导出。

### `workspace`

| 字段              | 说明                                                       |
| ----------------- | ---------------------------------------------------------- |
| `rootDir`         | 相对配置文件的仓库根目录，默认 `.`。                       |
| `internalScopes`  | 视为内部 workspace package 的包名前缀，例如 `['@acme/']`。 |
| `packagePatterns` | 额外 workspace package glob。                              |
| `ignore`          | workspace package 发现时的额外忽略 glob。                  |

Lattice 固定从 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 读取 pnpm workspace 元数据。

### `paths`

paths 命令会根据以下信息生成每个 importer 的 `tsconfig.graph.paths.generated.json`：

- package `imports`
- 依赖 package 的 `exports`
- pnpm lockfile importer link
- 配置的内部 scope

| 字段                  | 说明                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| `generatedFileName`   | 生成的 tsconfig 文件名，默认 `tsconfig.graph.paths.generated.json`。 |
| `generatedFileMarker` | 用来识别可维护生成文件的标记。                                       |
| `conditionPriority`   | package export/import condition 优先级。                             |
| `sourceExtensions`    | 从 dist target 映射回 source 时尝试的源码扩展名。                    |
| `ignore`              | 额外忽略 glob。                                                      |

### `graph`

graph 检查会解析从 `rootConfig` 可达的 TypeScript project references，并检查每个项目中的 import。

| 字段               | 说明                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| `rootConfig`       | 根 solution config，默认 `tsconfig.graph.json`。                                 |
| `projectKinds`     | 按顺序把 config path 分类为 `lib`、`test`、`runtime-client` 等 kind 的 matcher。 |
| `productionKinds`  | 视为生产图叶子的 kind，会启用更严格的导入检查。                                  |
| `forbiddenEdges`   | 禁止的 project-reference 或推断 import 边，并附带人类可读 reason。               |
| `nodeBuiltinRules` | 禁止导入 Node builtin 的项目 kind。                                              |
| `inferredProjects` | 当直接文件归属不足时，用 source path prefix 推断所属 project config。            |

### `proof`

proof 检查会把 package 级 typecheck 脚本与根图覆盖范围对齐。它还会把
root graph 可达的每个 `tsconfig*.build.json` 与严格同名的本地配置做最终
语义对比：

- `tsconfig.build.json` 对比 `tsconfig.json`
- `tsconfig.lib.build.json` 对比 `tsconfig.lib.json`
- `tsconfig.test.build.json` 对比 `tsconfig.test.json`
- `tools`、`source` 等其他后缀遵循同一规则

build config 必须与本地配置保持相同的最终文件集合和类型检查
`compilerOptions`。`composite`、`noEmit`、`declaration`、`outDir`、
`rootDir`、`tsBuildInfoFile` 等 build-only 选项允许不同。`paths` 和
`baseUrl` 由 generated paths 命令负责检查，不在 proof 中比较。

| 字段                    | 说明                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `typecheckScriptPrefix` | 扫描 package scripts 时使用的脚本名前缀，默认 `typecheck`。      |
| `sidecarTargets`        | 根 typecheck 在 `tsc -b` 外额外覆盖的配置，例如 `vue-tsc` 项目。 |
| `rootSidecarScript`     | 可选；从根脚本中解析 sidecar target。                            |
| `allowlist`             | 显式允许在 graph/sidecar 覆盖外的文件，每项都必须写 reason。     |
| `sourceFilePattern`     | 计入覆盖统计的文件 pattern。                                     |

### `packageBoundary`

package boundary 检查会扫描配置 dist 目录下的构建后 JavaScript 模块。

| 字段                                | 说明                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `targets[].name`                    | `--package` 使用的目标名，通常是 package name。                        |
| `targets[].distDir`                 | 包含构建产物和 `package.json` 的目录。                                 |
| `targets[].environment`             | 固定环境，或将文件分类为 `browser`、`node` 或其他字符串的函数。        |
| `targets[].ignoredExternalPackages` | 即使没有列在构建后 manifest dependencies 中也允许的额外 package root。 |

默认情况下，`node/` 或 `plugin/` 下的文件被视为 Node 产物，其他文件被视为 browser/runtime 产物。

### `pipelines`

Pipeline 可以组合内置任务和命令步骤：

```js
pipelines: {
  typecheck: [
    'paths:check',
    'graph:check',
    'proof:check',
    {
      type: 'command',
      command: 'tsc',
      args: ['-b', 'tsconfig.graph.json', '--pretty', 'false'],
    },
  ],
}
```

内置任务字符串：

- `paths:check`
- `graph:check`
- `proof:check`
- `package-boundary:check`

命令步骤默认在 `workspace.rootDir` 下运行，并继承 `process.env`。可以用 `cwd` 和 `env` 覆盖。

## 生成文件

生成的 path config 适合加入 `.gitignore`：

```gitignore
**/tsconfig.graph.paths.generated.json
```

安装后、或 package exports/imports 变化后运行 `lattice paths apply`。CI 中运行 `lattice paths check`，在不写文件的前提下让过期生成状态失败。

## CI 示例

```yaml
name: Typecheck

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec lattice check typecheck
```

## API

```ts
import { defineConfig, loadConfig } from '@docs-islands/lattice';

export default defineConfig({
  pipelines: {
    typecheck: ['paths:check'],
  },
});

const config = await loadConfig();
```

大多数用户只需要 `defineConfig(...)`。`loadConfig(...)` 主要面向自定义 wrapper 和测试。

## 设计说明

- Lattice 是治理工具，不替代 `tsc`、`vue-tsc`、测试运行器或发布工具。
- Lattice 不发布包。发布自动化应放在项目自己的脚本里，并把 `lattice check publish` 作为 gate。
- Lattice 强调显式策略。优先把规则写进 `lattice.config.mjs`，而不是依赖隐式约定。
- 只读检查和会写文件的命令有意分离。

## License

MIT
