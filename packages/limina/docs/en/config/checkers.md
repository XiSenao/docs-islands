# Checker Configuration

`config.checkers` selects active default `tsconfig.json` entries. Limina then assigns exactly one checker owner to every managed type config in the complete references closure. Checker names are fixed identities:

| Key            | Execution                             | Emits declarations |
| -------------- | ------------------------------------- | ------------------ |
| `tsc`          | generated TypeScript build target     | yes                |
| `tsgo`         | generated native TypeScript target    | yes                |
| `vue-tsc`      | generated Vue/TypeScript build target | yes                |
| `svelte-check` | per-leaf framework typecheck target   | no                 |
| `astro`        | per-leaf framework typecheck target   | no                 |

The key is the checker identity. There is no `preset` field and no custom checker alias. This keeps ownership, generated paths, execution, and cache behavior under one name.

`vue-tsc`, `svelte-check`, and `@typescript/native-preview` are optional external-checker peers. Their peer ranges state which checker versions Limina supports, and each checker resolves from the scope where its target actually executes. `typescript` remains Limina's required runtime peer and resolves from the workspace installation running Limina.

Auto discovery is always enabled. Named scopes claim selected entries first; entries not claimed by a named scope are still analyzed automatically.

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

Every named `include` must be a non-empty array; `exclude` is optional. Framework-only named configurations are valid. The same entry cannot match two named checker scopes.

## Auto mode

- **Type:** `{ exclude?: string[]; useTsgo?: boolean }`
- **Default:** enabled whether or not named scopes are present

By default, auto mode falls back to `tsc` for ordinary TypeScript. Framework evidence resolves the corresponding framework owner before fallback:

```text
ordinary TypeScript -> tsc
Vue                 -> vue-tsc
Astro               -> astro
Svelte              -> svelte-check
```

Set `useTsgo: true` to route only the ordinary TypeScript fallback to `tsgo` instead. Framework ownership is unchanged.

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

`useTsgo` changes only the final fallback for configs that remain ordinary TypeScript after framework analysis. Vue promotion propagates only from a Vue provider to a pending consumer along `consumer -> provider` dependency edges; it does not traverse an undirected component or overwrite an already resolved owner.

Vue capability is confirmed from the checker-resolved file set, not from `vueCompilerOptions` alone. Limina first traverses entries, solutions, referenced leaves, and effective `extends`, then asks the Vue parser for its actual extensions and files. A custom Vue extension is routed to `vue-tsc` only when a matching file exists. A configuration hint without a matching module does not change ownership.

Auto `exclude` filters entry selection inside activated [regions](./regions.md). It does not prune valid project references reached from a selected entry and is separate from `config.source.exclude`.

The legacy `{ mode: 'auto' }` shape is rejected. Move `exclude` and `useTsgo` under `auto`.

## Named entry constraints and solution closures

All named checker scopes use the same shape:

```ts
interface CheckerScope {
  include: string[];
  exclude?: string[];
}
```

`include` selects only direct default `tsconfig.json` entries relative to `config.rootDir`. It never directly selects `tsconfig.lib.json`, `tsconfig.test.json`, or another named config; those configs enter only through a managed references closure. Selectors can use `../` for external activated packages, but cannot pull an unactivated path or a path behind a workspace boundary into the graph. `exclude` removes direct entries after inclusion. It does not cut the normal project-reference closure.

Limina distinguishes solution configs from terminal type configs. A solution organizes references and is not itself an Astro, Svelte, or Vue execution target. Limina recursively expands nested solutions, deduplicates terminal type configs by normalized path, and runs the selected checker once for each leaf.

A named checker on a solution is a declared constraint, not an early rewrite of each pending leaf's local owner. Constraints propagate to a fixed point across the solution/leaf bipartite graph, including overlapping solutions connected by a shared pending leaf. Pending leaves continue through root-file and dependency analysis. If local evidence later requires another checker, preparation reports a checker ownership conflict instead of hiding the evidence.

After all evidence and fallback resolution, every solution leaf must have the same final owner. Different owners on different standalone configs remain valid; typed dependency edges preserve their execution ordering.

Non-entry configs such as `tsconfig.lib.json` or `tsconfig.test.json` enter the managed graph only when selected `tsconfig.json` entries reference them. Generated files stay under Limina's `.limina` namespace; source config paths remain the paths used in user configuration and diagnostics.

## Framework ownership and dependency boundaries

Config selectors, checker-aware effective root files, missing-type dependency evidence, and directed Vue promotion contribute local ownership evidence. A type config may contain TS/JS plus one framework family. Two framework root families, two explicit owners, or a resolved owner plus an incompatible requirement fail closed.

Dependency analysis scans every managed type config, including configs whose local owner is already resolved. It collects every import requirement before reducing them. For a pending config it uses a neutral TypeScript semantic context, even when a solution constraint exists. Astro- and Svelte-owned configs also use neutral TypeScript evidence for TS/JS imports because those external checkers are not TypeEvidence providers.

`ambient`, `concrete-declaration`, and `checker-source` evidence establish a TypeScript domain boundary. Only `missing` evidence continues to physical resolution; `unsupported-checker` fails closed. A physical target can propagate a framework requirement only when it is an actual member of one uniquely owning managed file set. Directory proximity, the nearest package, and excluded files do not establish ownership. Side-effect imports follow the same rule as imports that consume exports.

Astro and Svelte owners do not generate declaration projects, wrappers, or transparent build solutions. Their complete type config is checked once per leaf by `checker:typecheck`. TypeScript that must emit declarations must live in a separate `tsc`, `tsgo`, or `vue-tsc` config.

When `checker:typecheck` has no framework-owned leaf, it is recorded as `disabled`, exits successfully, and does not run peer preflight or materialize generated checker artifacts.

### Framework prerequisites

Framework checker commands and their execution runtimes resolve from the leaf package that owns the source config:

- Astro requires `astro`, `@astrojs/check`, and `typescript`, plus the leaf's generated `.astro/types.d.ts`. Limina runs `astro check --noSync --root <leaf> --tsconfig <source-config>` and never runs `astro sync`.
- Svelte requires `svelte-check`, `svelte`, and `typescript`. Limina runs `svelte-check --workspace <leaf> --tsconfig <source-config>` without SvelteKit sync, incremental mode, a `.svelte-check` cache, or an output-format override.

Lightweight Astro import collection is different from checker execution: `@astrojs/compiler` is a Limina runtime and resolves from the workspace installation that runs Limina, so one installation serves the workspace and a conflicting leaf copy cannot shadow it. Limina preflights this runtime only when Astro source collection is needed and reports one environment issue for a shared failure, regardless of the number of `.astro` files. Svelte import analysis continues to resolve `svelte/compiler` from the owning leaf. Missing framework checker dependencies still fail preflight before checker processes start.

`checker typecheck` is a full rerun, not framework watch mode. Stable target IDs preserve target identity between runs but do not provide incremental invalidation.

## Astro semantic import resolution

When an actual `.astro` source import may affect the generated graph, Limina can enrich its lightweight import record with a bounded Astro semantic resolution. This path has no user configuration and does not run a Language Service, create a TypeScript Program, or perform a complete Astro typecheck. It lazily creates a Volar Language plus its decorated TypeScript host, reuses that bounded context within the analysis provider, and uses it to map the real source import to a semantic module literal and ask the host for the physical target.

The pipeline deliberately keeps two decisions separate:

1. The real source import record, original specifier, and cheap Oxc/filesystem evidence decide whether semantic resolution is applicable.
2. Eligible records use the Astro semantic host. The resulting Oxc and TypeScript evidence then enters the normal final runtime classification.

Known virtual modules, query/resource imports, and explicit non-source extensions skip semantic context creation and retain the existing non-semantic path. Once an eligible record starts Astro semantic resolution, a toolchain or source-map failure fails closed instead of falling back to ordinary TypeScript resolution. Normal Astro/Volar virtual code may contain synthetic imports; those imports are ignored for candidate discovery and never create graph edges. A `source-map-mismatch` is reported only when the real source record has no strict source mapping, has ambiguous mappings, or its strict candidates do not all prove the same source specifier, resolution mode, and canonical target.

The first adapter family is intentionally bounded:

| Component                                 | Supported contract                      |
| ----------------------------------------- | --------------------------------------- |
| Astro                                     | `>=7.0.0 <8.0.0`                        |
| `@astrojs/check`                          | `0.9.10`                                |
| `@astrojs/language-server`                | `2.16.13`                               |
| LS-owned `@astrojs/compiler`              | `2.13.1`                                |
| `@volar/language-core`                    | `2.4.28`                                |
| `@volar/kit`                              | `2.4.28`                                |
| `@volar/typescript`                       | `2.4.28`                                |
| leaf-visible and check-visible TypeScript | Limina's declared TypeScript peer range |

The TypeScript peer range is `>=5.4.0 <5.10.0 || >=6.0.0 <6.1.0`. Astro `7.0.0` is the supported floor, not the only accepted Astro version. The adapter also checks the internal API shape, so matching version strings with incompatible exports still fail closed.

Dependency resolution follows package ownership. Limina creates resolution scopes from the owning leaf, then `@astrojs/check`, then the Language Server, and finally `@volar/kit`. A package must be declared by the scope that owns that dependency; Limina does not retry from the workspace root after an owner-scoped failure. The resolved files may physically live in a pnpm store, a hoisted directory, or another symlink layout. Their paths are recorded as provenance and keep different module instances isolated, but physical-path equality is never a compatibility condition. Two supported TypeScript instances may therefore have different real paths, or even different supported versions.

The semantic resolver confirms only the target. Limina still owns runtime classification, source ownership, provider selection, scheduling, and graph policy:

| Astro source target | Graph policy                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.astro`            | framework scheduling                                                                                        |
| `.svelte`           | framework scheduling                                                                                        |
| `.vue`              | Astro confirms the physical target, then the existing Vue-owned declaration/checker provider policy applies |
| `.ts` / `.tsx`      | TypeScript declaration-provider policy                                                                      |

For `A.astro -> B.vue -> C.ts`, Astro remains the authority for `A -> B`. Vue semantic resolution is used only when `B.vue` is analyzed as its own source, so it cannot reinterpret the import written in `A.astro`. `.astro` and `.svelte` files remain outside generated declaration `files`; that exclusion does not prevent their real imports from producing valid scheduling or declaration-provider relationships.

## Vue source and semantic import analysis

Vue import collection has no configuration field. Limina always collects lightweight source evidence from inline `<script>` and `<script setup>` content, a `<script src>` attribute, and `import()` expressions in a `generic` attribute. For the `vitepress-markdown` source profile, inline backtick code and fenced backtick code blocks are excluded from this evidence while source offsets and line endings remain unchanged; tilde fences are not excluded. This file-oriented collection does not initialize `vue-tsc` and remains available to standalone import analysis.

For a source owned by a `vue-tsc` project, generated-reference preparation and `graph:check` can enrich that source record with checker-semantic evidence. Limina first resolves `vue-tsc` from the checker's execution scope, then resolves Vue Language Core, Volar TypeScript, and the toolchain's TypeScript from that installed `vue-tsc` dependency environment. It uses that same toolchain and any virtual config overlay for project membership and semantic analysis, and accepts only a strict source-to-virtual mapping. Synthetic service-script imports without source evidence never become graph edges. TypeScript/declaration resolution uses the mapped semantic literal; Oxc/runtime and resource evidence continues to use the original source specifier.

The supported adapter matrix is deliberately bounded:

| `vue-tsc` family | Matching `@vue/language-core` | `@volar/typescript` | TypeScript           |
| ---------------- | ----------------------------- | ------------------- | -------------------- |
| 2.2.0–2.2.12     | same version as `vue-tsc`     | 2.4.11–2.4.28       | 5.4.x–5.9.x or 6.0.x |
| 3.2.0–3.2.4      | same version as `vue-tsc`     | 2.4.27              | 5.4.x–5.9.x or 6.0.x |

The published package declares only `vue-tsc` as the optional Vue checker peer. `@vue/language-core` and `@volar/typescript` are checker-internal toolchain packages: applications do not install them for Limina, and Limina does not publish them as peers. The `vue-tsc` peer range describes the supported external-checker versions; Limina still validates the complete installed tuple against the table above. A missing or unsupported top-level checker is reported as `Missing external checker` or `Unsupported external checker`. An incomplete or incompatible internal tuple is reported as `Unsupported vue-tsc toolchain`, and the fix is to upgrade, downgrade, or reinstall `vue-tsc` in its checker scope rather than installing internal packages directly.

The TypeScript used by this Vue tuple follows the checker-toolchain role and resolves through `vue-tsc`. It does not need to be the same physical installation as Limina's own required TypeScript runtime.

An unsupported tuple does not disable lightweight source collection. Operations that require checker-parity semantic dependency or reference resolution fail closed instead of falling back to an approximate Vue extension resolver.

### Breaking migration from `config.imports.vue`

Delete `config.imports.vue`; there is no replacement field. Loading a configuration that still contains `config.imports` reports this migration directly. The public `VueImportParser` type and Limina's direct/optional `@vue/compiler-sfc` dependency have also been removed.

Limina no longer provides compiler-sfc-specific structural diagnostics for duplicate script blocks or `<script setup src>`. Vue checkers and editor tooling remain responsible for SFC validity. Limina reports only source-provenance, resolution, and graph failures within its own analysis boundary.

## Cross-checker dependencies and cache reuse

Limina distinguishes declaration dependencies from framework scheduling dependencies:

- `declaration-provider` means a real compiler declaration relationship and can become a generated TypeScript project reference.
- `framework-schedule` orders framework checks or builds but never becomes a generated `tsconfig` reference.

Providers run before consumers. Pure framework-scheduling cycles run as one scheduling component; declaration cycles still fail.

Cache reuse is directional:

| Consumer                      | Provider           | Cache reuse |
| ----------------------------- | ------------------ | ----------- |
| same checker identity         | same identity      | yes         |
| `vue-tsc`                     | `tsc`              | yes         |
| any other cross-identity pair | different identity | no          |

When the consumer can compile the provider's complete declaration closure, Limina preserves the reference. If cache reuse is unavailable, it warns before the first build target starts because the underlying tools may rebuild work or churn their caches. When the consumer cannot compile the provider closure, graph preparation fails. For example, a `tsc` or `tsgo` consumer cannot depend on a provider closure containing `.vue` or a custom Vue extension.

## Migrating from named aliases and `preset`

Move each old entry to the key named by its `preset`, then delete `preset`:

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

If multiple aliases previously used the same `preset`, merge their non-overlapping selectors into one fixed key. If their selectors overlap or their policies conflict, resolve that conflict explicitly; Limina will not guess which alias should win. Configuration files are TypeScript/MTS, so Limina reports a deterministic schema diagnostic but does not rewrite them automatically.

## Generated graph and manifest

Run `limina graph prepare` to materialize `.limina/manifest.json` and generated checker configs. Managed build/typecheck commands and pipelines materialize them when needed; read-only graph, source, and proof checks calculate the graph in memory.

The current manifest is version 5. It stores the ownership plan (config roles, final owners, and solution leaf closures), stable typed `dependencyEdges`, and build/framework execution targets. Manifest versions 1 through 4 are accepted only as old owned-artifact ledgers for safe cleanup before a fresh version 5 manifest is written. Future or malformed versions fail closed.
