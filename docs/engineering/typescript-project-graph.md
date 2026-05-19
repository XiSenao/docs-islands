# TypeScript Project Graph

This guide records the ownership rules for the `tsc -b` graph. The graph is
layered so editor entrypoints, graph aggregators, and build leaves do not drift
into each other.

## Commands

- `pnpm typecheck` runs the full graph check, then runs the Vue SFC checks.
- `pnpm typecheck:paths` regenerates the local graph path map from workspace
  package exports/imports.
- `pnpm typecheck:graph` checks graph path freshness, verifies graph references
  and architecture rules, then runs `tsc -b tsconfig.graph.json --pretty false`.
- `pnpm typecheck:lib` checks only the production library/runtime declaration
  graph through `tsconfig.lib.graph.json`.
- `pnpm typecheck:vue` runs `vue-tsc` for docs, VitePress docs, and the
  VitePress theme.

Pass one-off build-mode flags directly to `typecheck:graph` when needed, for
example `pnpm typecheck:graph -- --force` or
`pnpm typecheck:graph -- --verbose`.

Do not add dist artifact checks to normal `pnpm typecheck` unless the command
also builds the corresponding dist output first.

## Graph Layers

```text
tsconfig.json
  editor solution entry

packages/*/tsconfig.json
  package-local source/editor check entry

tsconfig.graph.json
  default full TypeScript graph: production graph + tools + tests + fixtures

tsconfig.lib.graph.json
  production library/runtime declaration graph

tsconfig.graph.base.json
  shared build-mode overlay for build leaves

tsconfig.graph.paths.generated.json
  generated relative paths only

packages/*/tsconfig.graph.json
  package/domain-level graph aggregator

tsconfig.*.build.json
  build leaf; owns output/cache paths, references, and any intentional source-boundary overrides
```

Root graph entries should only know first-class domains. Package graph
aggregators own package internals. Build leaf configs usually inherit source
semantics from their adjacent source/test config, then add build-mode output
paths, direct references, and any intentional source-boundary overrides.

## Permanent Rules

- Every graph-owned cross-project import must be backed by a direct project
  reference to the owning graph project.
- `tsconfig.lib.build.json` projects include production source only. They must not
  include tooling, tests, docs, playground, or smoke files.
- `tsconfig.tools.build.json` projects may depend on libraries/runtime projects, but
  must not depend on tests.
- `tsconfig.test.build.json`, playground, and smoke build projects are leaves.
- Production lib/runtime/type projects must not depend on tools or tests.
- VitePress `src/client` must not depend on `src/node` or import `node:*`.
- VitePress `src/shared` must not depend on `src/node`, `src/client`, or import
  `node:*`.
- Vue SFC projects remain under `vue-tsc`; native `tsc -b` does not parse
  `.vue` templates.
- `.tsbuild/` is transient graph cache only. Root tools use the root cache;
  workspace/package build leaves use owner-local `.tsbuild/` directories.
  These caches must stay ignored and must not be published or committed.
- `tsconfig.graph.paths.generated.json` is a local generated artifact.
  `postinstall` regenerates it after dependency installs; run
  `pnpm typecheck:paths` after changing package exports, package imports, or
  workspace package layout. Typecheck commands only verify freshness and do not
  write it.

The `scripts/check-ts-project-graph.ts` checker enforces missing references,
forbidden project references, forbidden graph imports, and forbidden Node
builtin imports for client/shared runtime graph leaves.

## Naming Policy

- root `tsconfig.graph.json` is the default full-check graph aggregator.
- `tsconfig.lib.graph.json` is an optional production lib graph aggregator.
- package/domain `tsconfig.graph.json` files are package graph aggregators.
- package-local `tsconfig.json` files are source/editor checks and package
  script entrypoints, not native build graph leaves.
- `tsconfig.lib.build.json` is the canonical production library/runtime build
  leaf.
- `src/<runtime>/tsconfig.build.json` is the canonical VitePress
  runtime-specific declaration build leaf.
- `tsconfig.tools.build.json` is the canonical tooling/build-config build leaf.
- `tsconfig.test.build.json` is the canonical test build leaf.
- `tsconfig.source.build.json` is for fixture/app source build leaves such as
  playground and smoke projects.

Legacy library/tool wrapper configs are removed. Build-leaf references should
point at canonical `tsconfig.*.build.json` names.

VitePress runtime local configs under `packages/vitepress/src/*/tsconfig.json`
stay next to their runtime build leaves. Package scripts and
`rolldown-plugin-dts` still consume the local `tsconfig.json` files, while the
native graph references the adjacent `tsconfig.build.json` files.

## Config Inventory

| Config                                                                                                  | Class           | Owner and consumers                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| `tsconfig.json`                                                                                         | solution        | Editor-facing solution that points at `tsconfig.graph.json`.                             |
| `tsconfig.graph.json`                                                                                   | solution        | Default full graph check entry for root scripts, packages, tests, playground, and smoke. |
| `tsconfig.lib.graph.json`                                                                               | solution        | Production library/runtime declaration graph entry.                                      |
| `tsconfig.graph.base.json`                                                                              | build base      | Shared generated paths and build-mode overlay for build leaves.                          |
| `tsconfig.graph.paths.generated.json`                                                                   | generated paths | Generated relative `paths` only.                                                         |
| `scripts/tsconfig.build.json`                                                                           | tools leaf      | Root scripts tooling build leaf.                                                         |
| `utils/tsconfig.json`                                                                                   | local source    | Utils package-local source/editor check.                                                 |
| `utils/tsconfig.graph.json`                                                                             | aggregator      | Utils package graph.                                                                     |
| `utils/tsconfig.lib.build.json`                                                                         | lib leaf        | Utils production source graph.                                                           |
| `utils/tsconfig.tools.build.json`                                                                       | tools leaf      | Utils package tooling graph.                                                             |
| `packages/*/tsconfig.json`                                                                              | local source    | Package-local source/editor check and package script entrypoint.                         |
| `packages/*/tsconfig.graph.json`                                                                        | aggregator      | Package/domain graph entry.                                                              |
| `packages/*/tsconfig.lib.build.json`                                                                    | lib leaf        | Package production source graph.                                                         |
| `packages/*/tsconfig.tools.build.json`                                                                  | tools leaf      | Package tooling/build-config graph.                                                      |
| `packages/*/tsconfig.test.build.json`                                                                   | test leaf       | Package test graph.                                                                      |
| `packages/vitepress/tsconfig.lib.graph.json`                                                            | lib aggregator  | VitePress production runtime/type graph.                                                 |
| `packages/vitepress/tsconfig.test.build.json`                                                           | test leaf       | VitePress package test graph.                                                            |
| `packages/vitepress/src/shared/tsconfig.build.json`                                                     | runtime leaf    | Universal shared runtime graph; no Node ambient types.                                   |
| `packages/vitepress/src/node/tsconfig.build.json`                                                       | runtime leaf    | Node runtime graph.                                                                      |
| `packages/vitepress/src/client/tsconfig.build.json`                                                     | runtime leaf    | Client runtime graph; no Node ambient types.                                             |
| `packages/vitepress/playground/*.build.json`                                                            | fixture leaves  | Playground source and test graph checks.                                                 |
| `packages/vitepress/smoke/*.build.json`                                                                 | fixture leaves  | Smoke source and test graph checks.                                                      |
| `docs/tsconfig.json`, `packages/vitepress/docs/tsconfig.json`, `packages/vitepress/theme/tsconfig.json` | vue-tsc         | Vue SFC/template checks outside native `tsc -b`.                                         |
| `tsconfig.check.json`, `packages/vitepress/tsconfig.check.json`                                         | dist checks     | Post-build artifact validation only.                                                     |

## Dist Checks

Dist checks validate package artifacts after build output exists. They should
stay explicit post-build commands, such as `packages/vitepress` running
`tsc -p tsconfig.check.json` after `dist/**/*` is present. The source graph
should resolve workspace imports to source graph projects instead of stale
dist files.

## Follow-Ups

The graph base intentionally only defines generated paths plus build-mode
options such as `composite`, `incremental`, declaration emit, and
`noEmit: false`. It does not define source-checking semantics such as `strict`,
`lib`, `types`, or `include`/`exclude`; build leaves inherit those from their
adjacent source/test config where possible. It also does not define `rootDir`,
`outDir`, or `tsBuildInfoFile`; every build leaf owns those paths. The legacy
`tsconfig.base.json` still defines `rootDir: "."` because existing local checks
and package scripts extend it. Removing that root directory from the legacy base
should be a separate compatibility task after the graph and legacy checks have
proven stable.
