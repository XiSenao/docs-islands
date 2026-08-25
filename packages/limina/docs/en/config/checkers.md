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

`vue-tsc`, `svelte-check`, and `@typescript/native-preview` are optional external-checker peers. Their peer ranges state which checker versions Limina supports, and each checker resolves from the scope where its target actually executes. `svelte2tsx` is a separate optional checker-toolchain peer: install it in each Svelte leaf alongside `svelte-check`; Limina does not ship it as a production dependency. `typescript` remains Limina's required runtime peer and resolves from the workspace installation running Limina.

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

`useTsgo` changes only the fallback for build components that remain uncolored after framework analysis. Before generated checker paths exist, Limina joins build-capable leaves that must share declarations: leaves of one solution and configs connected by accepted source imports or `liminaOptions.implicitRefs`. One existing `tsc`, `tsgo`, or `vue-tsc` identity colors the complete component; an uncolored component uses the configured fallback; two different identities fail graph preparation.

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

A named checker is authoritative for its complete terminal-leaf closure. Config hints, effective root files, dependency requirements, and Vue promotion do not recolor that domain. Overlapping named scopes with the same checker merge their evidence; different checker identities on the same terminal leaf fail graph preparation.

A reference may go directly from a default solution to a named terminal config, such as `tsconfig.json -> tsconfig.node.json`. A nested solution must itself use the default name, for example `tsconfig.json -> packages/lib/tsconfig.json -> packages/lib/tsconfig.lib.json`. A named config that declares references is not a supported intermediate solution.

Non-entry configs such as `tsconfig.lib.json` or `tsconfig.test.json` enter the managed graph only when selected `tsconfig.json` entries reference them. Generated files stay under Limina's `.limina` namespace; source config paths remain the paths used in user configuration and diagnostics.

## Framework ownership and dependency boundaries

Limina records two project identities that answer different questions:

- **Semantic authority** selects the checker-compatible module semantics used to interpret project dependencies.
- **Final owner** selects the checker that executes the build or typecheck target.

Explicit checker selection, checker-specific config evidence, effective root-file evidence, and a confirmed pending framework dependency are the only inputs that can lock semantic authority. After pending dependency requirements have been collected, Limina freezes that authority. Vue promotion, solution constraints, declaration-component coloring, the TypeScript fallback, and `finalOwner` can select or propagate a build owner, but cannot reinterpret the project's dependencies. A TypeScript-semantic project may therefore finish with `vue-tsc` as its build owner while retaining TypeScript module semantics.

For a still-pending automatic scope, TypeScript is the neutral semantic baseline. Limina enumerates dependencies from the parsed TypeScript project and its TypeScript AST, then applies the checker type-evidence gate to every source-authored dependency. `ambient`, `concrete-declaration`, and `checker-source` evidence stop at the TypeScript boundary; unsupported semantic evidence fails closed. Only `missing` evidence may invoke Oxc, and then only to identify a physical framework-source candidate for ownership inference. The candidate must be an effective member of exactly one governed config and one framework semantic domain. Ordinary TypeScript files, resources, excluded files, and ambiguous targets cannot color the checker. Limina collects the complete requirement set before resolving the pending owner, so conflicting Astro/Svelte/Vue requirements are deterministic and independent of import order.

Once semantic authority is locked, all project-aware consumers use the corresponding TypeScript, Vue, Astro, or Svelte semantic provider. A checker-semantic miss remains missing; toolchain, materialization, source-map, ambiguity, and resolution-host failures fail closed. Locked project dependency resolution never uses Oxc or a lightweight collector as a fallback.

`SourceEvidence` remains a source-only view for syntax, diagnostics, and source coordinates. It is not graph or checker authority. Architecture consumers accept only source-authored `ProjectDependency` values with `direct-source` or strict `mapped-source` provenance. Generated dependencies that cannot be mapped to one source dependency are observations only and never create source-derived edges; an ambiguous reverse mapping is an error.

An explicit Astro owner observes TypeScript files plus `.astro`; an explicit Svelte owner observes TypeScript files plus `.svelte`; an explicit `vue-tsc` owner observes TypeScript and its checker-resolved Vue extensions. A framework name does not implicitly add the other framework extensions. Files inside the configured proof source boundary that the final owner cannot observe do not block graph preparation merely because they exist; `proof check` reports them with `LIMINA_PROOF_UNCOVERED_SOURCE_FILE`.

Astro and Svelte owners do not generate declaration projects, wrappers, or transparent build solutions. Their complete type config is checked once per leaf by `checker:typecheck`. TypeScript that must emit declarations must live in a separate `tsc`, `tsgo`, or `vue-tsc` config.

When `checker:typecheck` has no framework-owned leaf, it is recorded as `disabled`, exits successfully, and does not run peer preflight or materialize generated checker artifacts.

### Framework prerequisites

Framework checker commands and their execution runtimes resolve from the leaf package that owns the source config:

- Astro requires `astro`, `@astrojs/check`, and `typescript`, plus the leaf's generated `.astro/types.d.ts`. Limina runs `astro check --noSync --root <leaf> --tsconfig <source-config>` and never runs `astro sync`.
- Svelte requires `svelte-check`, `svelte2tsx`, `svelte`, and `typescript`. Limina runs `svelte-check --workspace <leaf> --tsconfig <source-config>` without SvelteKit sync, incremental mode, a `.svelte-check` cache, or an output-format override.

Source-coordinate collection is different from checker execution: `@astrojs/compiler` is a Limina runtime and resolves from the workspace installation that runs Limina, so one installation serves the workspace and a conflicting leaf copy cannot shadow it. Limina preflights this runtime only when Astro source inspection is needed and reports one environment issue for a shared failure, regardless of the number of `.astro` files. Svelte semantic analysis resolves both `svelte/compiler` and the supported `svelte2tsx` peer from the owning leaf. Missing framework checker dependencies still fail preflight before checker processes start.

`checker typecheck` is a full rerun, not framework watch mode. Stable target IDs preserve target identity between runs but do not provide incremental invalidation.

## Astro semantic import resolution

For a locked Astro project, source inspection first records source-authored imports and their coordinates. The project dependency provider then materializes the primary and extra TypeScript service scripts from a bounded Astro/Volar context, enumerates their dependencies with that toolchain's TypeScript AST, and reverse-maps each generated dependency to one source record. The lightweight record is coordinate evidence only; it does not decide the project dependency.

Only a strict source mapping can produce a `mapped-source` dependency. Generated synthetic imports remain `unmapped-generated` observations even when they resolve to governed workspace source, and never create graph edges. A missing or ambiguous reverse mapping, incompatible toolchain, service-script failure, or resolution-host failure fails closed. After mapping, Astro's decorated TypeScript host resolves the semantic literal. Oxc is not consulted for eligibility, resolution, or fallback in this locked path.

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

The semantic provider confirms the source-authored dependency and target. Limina still owns source ownership, provider selection, scheduling, and graph policy:

| Astro source target | Graph policy                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| `.astro`            | framework scheduling                                                                   |
| `.svelte`           | framework scheduling                                                                   |
| `.vue`              | Astro confirms the physical target, then records framework scheduling to the Vue owner |
| `.ts` / `.tsx`      | framework scheduling to the target's build owner                                       |

For `A.astro -> B.vue -> C.ts`, Astro remains the authority for `A -> B`. Vue semantic resolution is used only when `B.vue` is analyzed as its own source, so it cannot reinterpret the import written in `A.astro`. `.astro` and `.svelte` files remain outside generated declaration `files`; their real cross-owner imports can still produce framework scheduling, while declaration-provider edges remain inside one build-checker identity.

## Vue source and semantic import analysis

Vue import collection has no configuration field. Limina collects source-only records and coordinates from inline `<script>` and `<script setup>` content, a `<script src>` attribute, and `import()` expressions in a `generic` attribute. For the `vitepress-markdown` source profile, inline backtick code and fenced backtick code blocks are excluded from this evidence while source offsets and line endings remain unchanged; tilde fences are not excluded. This file-oriented view does not initialize `vue-tsc` and remains available to standalone source inspection, but it is not project dependency authority.

For a locked Vue-semantic project, Limina first resolves `vue-tsc` from the checker's execution scope, then resolves Vue Language Core, Volar TypeScript, and the toolchain's TypeScript from that installed `vue-tsc` dependency environment. It materializes the Vue service script, enumerates generated TypeScript dependencies with the toolchain AST, and accepts only a strict reverse mapping to one source record. A dependency retains both `sourceSpecifier` and `semanticSpecifier`; for example, a source `<script src="./entry.ts">` may map to the semantic literal `./entry.js`. Synthetic service-script imports remain observations and never become graph edges. Vue/TypeScript resolution uses the mapped semantic literal, with no Oxc fallback. TypeScript files inside the same project continue to use direct TypeScript sub-semantics.

The supported adapter matrix is deliberately bounded:

| `vue-tsc` family | Matching `@vue/language-core` | `@volar/typescript` | TypeScript           |
| ---------------- | ----------------------------- | ------------------- | -------------------- |
| 2.2.0–2.2.12     | same version as `vue-tsc`     | 2.4.11–2.4.28       | 5.4.x–5.9.x or 6.0.x |
| 3.2.0–3.2.4      | same version as `vue-tsc`     | 2.4.27              | 5.4.x–5.9.x or 6.0.x |

The published package declares only `vue-tsc` as the optional Vue checker peer. `@vue/language-core` and `@volar/typescript` are checker-internal toolchain packages: applications do not install them for Limina, and Limina does not publish them as peers. The `vue-tsc` peer range describes the supported external-checker versions; Limina still validates the complete installed tuple against the table above. A missing or unsupported top-level checker is reported as `Missing external checker` or `Unsupported external checker`. An incomplete or incompatible internal tuple is reported as `Unsupported vue-tsc toolchain`, and the fix is to upgrade, downgrade, or reinstall `vue-tsc` in its checker scope rather than installing internal packages directly.

The TypeScript used by this Vue tuple follows the checker-toolchain role and resolves through `vue-tsc`. It does not need to be the same physical installation as Limina's own required TypeScript runtime.

An unsupported tuple does not disable lightweight source collection. Operations that require checker-parity semantic dependency or reference resolution fail closed instead of falling back to an approximate Vue extension resolver.

## Svelte semantic dependency analysis

For a locked Svelte project, Limina resolves the public `svelte/compiler` entry from the owning leaf to identify instance- and module-script source ranges. It resolves the supported public `svelte2tsx` peer from the same leaf and uses that adapter to convert the original component to generated TSX plus a source map. Limina does not bundle or install this Svelte-only adapter for non-Svelte consumers. Dependencies are enumerated from the generated TSX with the TypeScript AST and reverse-mapped to exactly one source-authored record with trace mapping before TypeScript-compatible module resolution runs.

This bounded path does not run user preprocessors and does not import private `svelte-check` bundles. A generated synthetic dependency is observation-only; missing or ambiguous provenance and adapter/toolchain failures fail closed. Locked Svelte resolution never falls back to Oxc. Ordinary TypeScript files in the Svelte config retain direct TypeScript sub-semantics.

### Breaking migration from `config.imports.vue`

Delete `config.imports.vue`; there is no replacement field. Loading a configuration that still contains `config.imports` reports this migration directly. The public `VueImportParser` type and Limina's direct/optional `@vue/compiler-sfc` dependency have also been removed.

Limina no longer provides compiler-sfc-specific structural diagnostics for duplicate script blocks or `<script setup src>`. Vue checkers and editor tooling remain responsible for SFC validity. Limina reports only source-provenance, resolution, and graph failures within its own analysis boundary.

## Declaration dependencies and checker identity

Limina distinguishes declaration dependencies from framework scheduling dependencies:

- `declaration-provider` means a real compiler declaration relationship and can become a generated TypeScript project reference.
- `framework-schedule` orders framework checks or builds but never becomes a generated `tsconfig` reference.

Providers run before consumers. Pure framework-scheduling cycles run as one scheduling component; declaration cycles still fail.

Every successful `declaration-provider` edge has the same `tsc`, `tsgo`, or `vue-tsc` identity on both ends and records `cacheReuse: "reusable"` in manifest version 5. A canonical declaration relation therefore colors its whole build component before generated configs and targets are materialized. If the component already contains different build identities, graph preparation fails instead of preserving a cross-checker reference or issuing a cache-churn warning. `framework-schedule` may still cross checker identities because it is not a compiler project reference.

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
