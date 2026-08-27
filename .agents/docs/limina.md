# Limina implementation record

## Evidence boundary

This record describes Limina behavior and boundaries established by the current package source, tests, manifest, schema, root configuration, and executable command paths.

The supplied Codex memory is used only to identify prior corrections, questions, and human direction worth rechecking. It is not evidence that a behavior still exists. When memory, documentation, generated artifacts, and the current implementation disagree, inspect the current implementation first.

Internal module paths are evidence anchors. They are not public compatibility commitments unless they are exported by the package or enforced through a public command, configuration schema, diagnostic contract, or test.

This record is an unstamped AI draft. It has not been human-vouched.

## Current implementation

### Package and public surface

Limina is an independently built and published ESM CLI package. Its manifest currently declares version `0.2.3` and exposes:

- the `limina` executable through `bin/limina.js`
- the main module
- the TypeScript configuration schema
- the package manifest

The published package manifest retains resolved non-workspace `devDependencies` as package-development metadata while omitting private `workspace:` development dependencies. Development entries do not become production dependencies; bundled build inputs such as `@jridgewell/trace-mapping` remain declared only in `devDependencies`.

The main module exports `defineConfig`, validation error classes, governance issue types, issue severity, and the public Limina configuration types.

The current CLI registers these command surfaces:

- `limina init`
- `limina migration`
- `limina check [pipeline]`
- `limina graph prepare`
- `limina graph check`
- `limina graph export`
- `limina proof check`
- `limina source check`
- `limina build <config>`
- `limina checker build [config]`
- `limina checker typecheck`
- `limina package check`
- `limina release check`

This list is a current implementation fact. It must be rechecked before documenting CLI compatibility or migration guidance.

### Configuration and execution model

A Limina configuration can currently define these top-level areas:

- `config`
- `execution`
- `graph`
- `package`
- `pipelines`
- `proof`
- `regions`
- `release`
- `source`

The configuration export may be a configuration object, a promise, or a function receiving the current command and mode.

`limina check` runs a built-in default plan when no named pipeline is selected. The current default task set is:

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:build`
5. `checker:typecheck`

Configured pipelines can compose built-in tasks and command steps. Pipeline execution does not make the exported dependency graph a task scheduler.

A check run creates one preflight context, an execution plan, structured issue collection, and run-summary metadata. The implementation can reuse preflight results within the run and disposes the preflight context when execution completes.

### Checker model

`config.checkers` uses one flat namespace: optional `auto` fallback policy plus named `tsc`, `tsgo`, `vue-tsc`, `astro`, and `svelte-check` entry scopes. Auto discovery is always enabled. Named scopes select only default source `tsconfig.json` entries; named `tsconfig.*.json` files enter only through managed references. `auto.exclude` filters automatic root discovery and never cuts an established references closure. The legacy `{ mode: 'auto' }` shape is rejected.

The normalized tsconfig path is the only checker ownership unit. Every managed type config finishes with exactly one owner. Solution configs organize references but do not execute framework checkers directly; Limina recursively expands their terminal leaf closure and deduplicates shared leaves.

Named scopes create authoritative ownership domains. A direct named type entry is locked immediately; a named solution locks its complete recursively expanded terminal-leaf closure. The same explicit identity may merge evidence from overlapping domains, while different identities on one leaf fail graph preparation. Config hints, effective root files, dependency requirements, and Vue promotion process only non-authoritative pending configs.

Checker execution ownership and project semantic authority are separate state. Semantic authority starts as a pending TypeScript baseline and can be locked only by explicit selection, checker-specific config evidence, effective root-file/config parsing, or a confirmed pending framework dependency. Dependency-derived ownership locks the matching semantic family only after all pending requirements have been collected. The authority and ownership dependency facts are then frozen before Vue promotion, solution constraints, declaration-component coloring, fallback, and final ownership. Those later phases can change or propagate build identity but cannot change semantic authority. A project whose semantic authority is TypeScript may therefore finish with `vue-tsc` as its build owner without acquiring Vue module semantics.

Pending ownership discovery uses the parsed TypeScript project, TypeScript Program/AST dependency enumeration, and TypeScript type evidence in one baseline context. Ambient and concrete declarations terminate at their typed boundary; checker source uses the checker-resolved target; unsupported semantic evidence fails closed. Only a missing result may invoke Oxc, whose result is qualified solely as a physical framework candidate. Admission requires a known framework extension, governed effective membership, one owning config, and one framework semantic domain. Ordinary TypeScript and resource targets never color ownership. Limina collects the complete requirement set before applying any dependency-derived lock, so import order cannot hide a cross-framework conflict.

Explicit scopes are parsed with the selected checker's actual observation capability: Astro adds only `.astro` to TypeScript, Svelte adds only `.svelte`, and `vue-tsc` uses its resolved Vue extensions. Explicit configs still contribute dependency facts, but those facts never recolor them. Unsupported neighboring source extensions do not fail graph preparation merely by existing; proof reports files inside its source boundary that are absent from the final owner's `ownedFileNames`.

After framework ownership converges, Limina builds one canonical equality relation over build-capable or pending configs. It combines solution-leaf equality with accepted source-import and `liminaOptions.implicitRefs` declaration relations, excluding denied references, resource imports, framework scheduling, and ambient or concrete declarations. A component with one known build identity propagates that identity with `build-closure` evidence; an uncolored component falls back to `tsgo` only when `auto.useTsgo` is true, otherwise to `tsc`; multiple identities fail graph preparation.

The generated graph uses typed dependency edges. `declaration-provider` edges represent compiler declaration relationships and become generated TypeScript references only after coloring; every successful edge has identical checker identities at both ends and `cacheReuse: "reusable"`. `framework-schedule` edges order framework checks or dependencies whose consumer has no declaration project, may cross checker identities, and never become generated `tsconfig` references. Pure scheduling cycles form executable SCCs; a cycle containing declaration edges fails. A final invariant rejects any cross-identity or non-reusable declaration-provider edge.

`checker:build` runs `tsc`, `tsgo`, and `vue-tsc` generated declaration targets. Astro/Svelte owners never generate declaration projects, wrappers, or transparent solutions. `checker:typecheck` runs their complete type configs once per leaf: Astro uses `astro check --noSync --root <leaf> --tsconfig <config>` and Svelte uses `svelte-check --workspace <leaf> --tsconfig <config>`. When no framework-owned leaf exists, the task is disabled.

Generated manifest schema version 5 stores config roles and final owners, solution leaf closures, stable typed `dependencyEdges`, and build/framework targets. Versions 1 through 4 are accepted only as owned-artifact ledgers for safe cleanup.

The repository's `limina:typecheck` Nx target preserves this global checker-build meaning. Its task graph declares build dependencies for the workspace projects whose published artifacts are consumed by that global checker graph, so a fresh invocation does not depend on ignored `dist` state.

### Source configs and generated graph

Source-owned TypeScript configuration and Limina-generated configuration have different roles.

A source `tsconfig` is a TypeScript solution when the checker-resolved file list is empty and the config directly declares `references`; the resolved list includes `extends` and checker-supported extensions. Limina expands that role only at a path whose basename is exactly `tsconfig.json`. A default solution may reference a named terminal config directly, or another default `tsconfig.json` that eventually references a named terminal config. An ordinary named source leaf with a `references` field is rejected as an unsupported intermediate solution, and migration reports every reachable named solution before writes. A supported solution cannot declare `liminaOptions.outputs`.

Ordinary source leaves provide the compiler scope from which Limina creates generated declaration and build projects under the `.limina` artifact namespace. Generated files are outputs, not user-authored configuration authority. Generated declaration configs explicitly set both `compilerOptions.outDir` and `compilerOptions.declarationDir` to the same managed `.limina/dts` root, so inherited source declaration output settings cannot redirect checker declarations. They override `rewriteRelativeImportExtensions` only when the effective source config enables it; omitting the otherwise redundant option keeps generated configs parseable by supported TypeScript 5.4 toolchains that do not recognize that later compiler option.

Project dependency analysis has a stage-neutral `ProjectSemanticContext` whose required identity is a frozen `LockedSemanticAuthority`, never `finalOwner`. Its compiler options, effective files, references, resolver config, generation, package roots, and framework semantic project identities can be built from both ownership-stage and finalized project models. A pending authority cannot enter the production `ProjectDependencyProvider` at the type boundary.

Standalone `SourceEvidence` exists only for native JavaScript and TypeScript files; `.vue`, `.astro`, and `.svelte` require project/checker context. Framework preparation directly produces `PreparedDependencyFact` values containing the source-located `ImportRecord`, generated `semanticSpecifier`, resolution mode, checker target, and existing `TypeEvidence`. `ProjectDependencyProvider` classifies those facts without calling framework resolution again. A generated dependency without source provenance becomes an `unmapped-generated` observation even if it could resolve to governed source; mapping damage, ambiguity, or semantic disagreement fails closed.

Locked Vue, Astro, and Svelte dependency authority comes only from the official generated TypeScript representation. Limina no longer has framework lightweight dependency collectors. Astro resolves the compiler owned by `@astrojs/check`'s Language Server and has no direct `@astrojs/compiler` development, peer, or runtime contract. Vue resolves Language Core, Volar TypeScript, and TypeScript from `vue-tsc`. Svelte resolves the public `svelte/compiler`, `svelte2tsx`, and TypeScript from the owning leaf. Adapter-local profiles and the minimal Svelte explicit-script-language detector select generation inputs but do not scan dependencies or enter semantic identity.

Astro graph semantics use a bounded service-script-first pipeline. A locked provider materializes the primary and extra service scripts from the Astro/Volar Language and decorated TypeScript host, enumerates dependencies with that toolchain's TypeScript instance, and uses strict ordered full-token then inner-content reverse mapping with `fallbackToAnyMatch=false`. It resolves the generated literal before producing one prepared fact. The seed contains config/project identity, analysis generation, overlay generation, and owning package root; lazy materialization adds config closure, compiler options, files, references, and toolchain provenance. One provider retains at most one active Astro context and disposes it before switching identity.

The first Astro semantic adapter accepts Astro `>=7.0.0 <8.0.0`, `@astrojs/check` 0.9.10, Language Server 2.16.13, LS-owned compiler 2.13.1, and Volar Language Core, Kit, and TypeScript 2.4.28. Limina publishes `@astrojs/check` as an optional peer while retaining it as a development dependency; users install the supported version explicitly in every Astro-owning leaf. Leaf-visible and check-visible TypeScript are each checked against Limina's declared `>=5.4.0 <5.10.0 || >=6.0.0 <6.1.0` range; they need not have equal versions or real paths. Internal exports and callable shapes remain part of compatibility. Resolution follows declared ownership scopes from leaf to check to Language Server to Kit, with no workspace-root retry. Resolved paths are provenance and materialized module-instance identity only: pnpm store, symlink, and hoist layouts are never compatibility predicates and never enter stable issue identity.

The exact Astro compatibility fixtures retain Astro's optional `sharp` dependency at the workspace-pinned patched version even when an older fixture declares a narrower range. Limina does not execute Astro image services, so this override is security maintenance for a development-only dependency rather than an image-service compatibility claim. The repository-wide Dependency Review license policy admits `LGPL-3.0-or-later`, including sharp's libvips and Windows platform packages, and the permissive `0BSD` license used by `tslib`. Astro's transitive `vscode-css-languageservice` and `vscode-html-languageservice` are excluded from license enforcement by package PURL because their distributed artifacts contain MDN/W3C-derived Creative Commons material; this remains a package-scoped exception rather than admitting those Creative Commons licenses repository-wide.

Astro mapping starts from the complete primary/extra service-script dependency set. Synthetic virtual dependencies without projection remain observations and never create edges. One strict attempt producing multiple ranges is `source-map-ambiguity`; the same source occurrence producing different semantic target or canonical type evidence across service scripts is `source-map-mismatch`. Resolution uses the generated semantic literal and Astro decorated host. Oxc and workspace TypeScript export fallback do not participate. `.astro` imports to framework or build-owned TypeScript targets remain scheduling relationships because the Astro consumer has no declaration project.

Vue graph semantics are produced lazily through one context containing Language Core, the Volar language service host, toolchain TypeScript Program, source maps, and host module-resolution cache. Generated enumeration, AST predicates, scanners, CommonJS/JSDoc analysis, resolution mode, and TypeChecker evidence all use that same TypeScript module. Semantic identity contains the generated `semanticSpecifier`, resolution mode, normalized checker target, `resolvedBy`, kind, and canonical `TypeEvidence`; source spelling is not retained as a second authority. Thus `<script src="./entry.ts">` may expose `./entry.js` in `ImportRecord.specifier` and reported `importedSpecifier` while retaining source file coordinates. Synthetic dependencies remain observations and invalid mappings fail closed without Oxc or workspace rescue.

A prepared target resolving to governed source can create a project dependency; a concrete declaration remains a declaration boundary. With a null target, ambient `TypeEvidence` produces a typed non-source resource/virtual observation and missing evidence produces a genuine missing observation. Physical file existence, resource extensions, known virtual-module lists, workspace resolution, and Oxc cannot rescue a checker miss. Only canonical relations between build-capable configs participate in declaration-component coloring and generated declaration references.

The Vue semantic adapter accepts only the explicitly tested families: `vue-tsc`/Language Core 2.2.0–2.2.12 with Volar TypeScript 2.4.11–2.4.28, or 3.2.0–3.2.4 with Volar TypeScript 2.4.27; both accept TypeScript 5.4.x–5.9.x or 6.0.x. The published manifest declares only `vue-tsc` as the optional Vue checker peer while Language Core and Volar TypeScript remain checker-owned. Missing or unsupported external checkers are diagnosed separately from incompatible internal tuples. Unsupported tuples fail project-aware preparation; no standalone lightweight fallback remains. Limina no longer exposes `config.imports.vue` or `VueImportParser`, and no longer directly declares, loads, or validates `@vue/compiler-sfc`.

Svelte graph semantics use a bounded public adapter: owning-leaf `svelte2tsx`, `svelte/compiler`, and TypeScript. Limina keeps `svelte2tsx` as development metadata plus an optional peer and bundles only its dev-only `@jridgewell/trace-mapping` implementation, not the framework adapter. Decoded Source Map v3 segments must explicitly cover every UTF-16 offset of a generated dependency and map to the current source monotonically and continuously; sparse, partial, cross-source, backward, or jumping mappings fail closed. The adapter does not load `svelte.config.js`, execute preprocess/defaultLanguages, import checker private subpaths, or recreate the checker lifecycle. A minimal explicit `lang="ts"`/`lang="typescript"` detector supplies `isTsFile` but never enumerates dependencies. The bounded Program overlay queries ambient evidence only and is not a second Svelte resolver.

Generated declaration references currently come from two explicit evidence paths:

- `liminaOptions.implicitRefs`, which must resolve to an ordinary source config owned by the same checker scope
- source import analysis resolved through the checker-aware TypeScript declaration provider

`oxc-resolver` remains available for source-only runtime inspection and the narrowly bounded missing-only pending-ownership bootstrap. It can produce only a qualified physical framework candidate and cannot produce a locked `ProjectDependency`, checker target, graph evidence, declaration provider, or source-check semantic result. Once authority is locked, a checker miss stays unresolved; classification may consume the already-prepared `TypeEvidence`, but Oxc, workspace resolution, and filesystem resource lookup cannot add a target. Limina does not declare or load `oxc-parser`; native and generated dependency enumeration use TypeScript ASTs and scanners.

An import that resolves to an existing concrete declaration, including a declaration under a managed output root, stops at that artifact boundary. Managed-output reverse attribution may still support type evidence or diagnostics, but it does not create a `declaration-provider` edge, generated declaration reference, or output-build reference. Only a checker-resolved source implementation participates in declaration-component coloring and scheduling.

Cross-checker declaration-provider edges are not materialized. Canonical declaration relations first unify each build component under one exact checker identity; conflicting `tsc`, `tsgo`, or `vue-tsc` colors fail graph preparation. Manifest schema remains version 5 and retains `cacheReuse`, but successful declaration-provider edges are always reusable.

Migration plans JSONC changes as parser-derived local text edits. It reads each target's effective TypeScript config, including `extends`, before planning writes. It scans the complete reachable closure from the selected default entries, recursively expands every TypeScript solution, and aggregates all reachable named solutions with unsupported basenames before checking the worktree or writing a plan.

Every target must resolve to a Git worktree. Migration completes target transformation planning, then checks every involved root with `git status --porcelain=v1 --untracked-files=all`; when any result is non-empty, it summarizes all dirty roots and asks once before filesystem preflight or transaction preparation. The interactive prompt defaults to refusal, and live Flow rendering yields terminal ownership while the confirmation is pending before resuming from the latest snapshot. Approval permits only the planned `tsconfig*.json` transaction; refusal, cancellation, or unavailable interaction stops before filesystem work with zero writes and clean-worktree guidance. The confirmation does not alter the existing Git changes, selected targets, or transaction allowlist.

A direct `compilerOptions.declarationDir` is removed only when it is equivalent to the planned single managed artifact root; a declarationDir-only leaf moves its relative path to `liminaOptions.outputs.outDir`, while split output, effective `outFile`, invalid direct values, and an internal solution-role invariant fail closed. Inherited declarationDir remains in its base config. Migration updates only Limina-governed schema, compiler, output, and source-reference fields while leaving unrelated comments, trailing commas, compact structures, and whitespace outside those fields intact.

The migration transaction preflight inspects only modified plan items and captures canonical path, content, device, inode, link count, mode, ownership, and timestamps before creating transaction artifacts. Logical symlinks or junctions, canonical-root escapes, non-regular or non-writable targets, and duplicate physical targets remain invalid. A single-link target uses atomic replacement. A multi-link target requires one command-level decision before transaction preparation: rewrite in place, skip, or cancel; unavailable interaction is zero-write. The prompt presents the choices in that order with rewrite in place initially selected, and live Flow rendering yields terminal ownership while the decision is pending before resuming from the latest snapshot. Skip remains distinct from transform no-op. Rewrite prepares complete next content and an immutable backup as private `0600` transaction artifacts; unlike atomic replacement artifacts, they do not clone target ownership, mode, or timestamps. It then performs complete positional writes and exact truncation through the existing inode, so it preserves hard-link topology and live inode metadata but is explicitly non-atomic. Migration acquires no cross-process write lease and does not coordinate concurrent writers. Atomic commits run before in-place commits, and rollback follows actual mutation order in reverse. When the current in-place mutation fails, Limina validates the logical path, physical identity, stable metadata, and original content. If they still match, it performs no recovery write and marks the item as leaving no content mutation. Any uncertain or changed content is preserved with the immutable backup instead of being overwritten. Drift detected by post-write verification is preserved in the same way. Previously committed in-place items still have a committed identity and remain eligible for reverse-order rollback only after strict drift validation; that rollback restores content and the original timestamp without resetting ownership or mode.

Graph-rule labels are read from source configuration and projected onto generated declaration projects. Configured graph rules can constrain dependency names and project references for labeled projects.

### Workspace authority and regions

Limina locates the nearest ancestor `pnpm-workspace.yaml` and reads its package patterns. Workspace package discovery currently includes the workspace root manifest and manifests selected by those patterns.

The workspace model distinguishes two package collections:

- raw packages, which preserve the discovered pnpm workspace evidence
- authority packages, which remain after workspace-package exclusions, package-island validation, overlap checks, and region-boundary processing

Source ownership, package lookup, importer lookup, generated-graph selection, and workspace dependency authority use the validated authority model rather than treating every raw package as governed by the current run.

The validated workspace context records package identities, source config paths, descriptor candidates, output roots, region boundaries, and output mutation authorities.

Current region boundaries include package-scope boundaries and nested pnpm-workspace boundaries. A nested pnpm-workspace boundary stops the current governance region. Package-scope exclusions and optional package-scope extension are represented separately.

Workspace package names are optional during path-based discovery and source ownership. Name-dependent operations require a named package. For example, dependency graph nodes are keyed by package name, so an unnamed package can own source but cannot become a dependency graph node.

### Validation domains

Limina separates validation into distinct domains rather than treating every failure as one graph error.

`graph:check` validates generated project architecture, references, import-derived provider relationships, configured graph rules, condition domains, and relevant workspace export/type-entry relationships.

`source:check` validates source ownership and source-owner boundaries, package import authority, workspace dependency declarations, ambient declaration policy, resource declaration availability, and Knip-backed unused module and dependency findings when Knip analysis is enabled.

`proof:check` compares the configured source boundary with checker and graph coverage. Every source file in the proof boundary must be covered by a checker entry or an explicit allowlist entry. Allowlist entries require a reason and are themselves validated against existing coverage and source-boundary membership. Ownership proof additionally verifies unique config ownership, solution consistency, framework leaf target coverage and executability, declaration projection consistency, and typed dependency-edge integrity.

`checker:build` and `checker:typecheck` execute the active checker adapters according to their execution class.

`package:check` operates on configured built package outputs. Its current tool model includes Publint, Are the Types Wrong, and Limina package-boundary checks. Package entries, rather than every workspace package, define the checked output set.

`release:check` evaluates configured release readiness. The current configuration surface includes content-hash comparison and npm package-manifest lint configuration. The command checks release state; it does not publish a package.

A failure means that a configured detector, rule, checker, or execution step did not pass. The implementation does not classify every failure as a product defect.

### Dependency graph export

`limina graph export` emits a JSON document containing package nodes, dependency edges, and per-edge evidence. The current schema version is `1`, and the current views are:

- `all`
- `source`
- `artifact`

Each edge records the importing file, module specifier, and resolved path used as evidence.

The exported document describes dependency facts observed by Limina. Its schema does not encode task definitions, task cache policy, execution resources, or a build schedule.

### Issue reporting and persisted state

Limina maintains canonical issue codes and rule metadata. Issue codes are associated with owning task domains, and rule metadata distinguishes active, planned, and retired states.

A completed check writes structured run and issue state under the `.limina` artifact namespace. The current check snapshot version is `7`; the source-issue snapshot remains a separate version-`1` format. Standalone issue-producing commands write addressable invocation records.

Check execution publishes metadata only after config loading, semantic validation, preflight/profile setup, and execution-plan validation succeed. Each published attempt has a monotonically increasing sequence plus started and terminal metadata. `last-run.json` remains the only completed version-`7` inventory; `latest-completed.json` authenticates its attempt identity, sequence, timestamp, and content hash. Attempt directories do not contain copies of the inventory.

`limina check --issues` reads persisted state. It does not execute a fresh check. It can query the latest freshness-authenticated completed check or a selected standalone invocation and filter by rule, file, scope, task, checker, or package. A published latest attempt that is running, incomplete, interrupted, aborted, persistence-failed, or inconsistent prevents fallback to older issues. A corrupt `latest-attempt.json` also prevents both query and sequence allocation. A torn `last-run.json`/`latest-completed.json` pair fails closed until a later higher-sequence successful check overwrites the pair.

Current output formats are human-readable text, JSON, and NDJSON. Human output can be bounded for terminal use. Machine-readable issue output remains separate from terminal presentation.

Source finding producers retain typed semantic facts. Canonical issue identity incorporates those facts internally without adding them to the public issue schema, so distinct same-location findings remain distinct while repeated observations of the same finding deduplicate to a stable issue ID. Canonical issue collection uses code-unit ordering rather than the process locale.

Snapshot and profile writes use the repository's atomic writer. Profiling output is enabled only when `LIMINA_PROFILE=1`.

### Artifact and mutation boundaries

The workspace's `.limina` directory is represented as an authenticated artifact namespace with a logical root, canonical root, generation identity, and generation token. Artifact paths are checked for lexical and canonical containment. A `.limina` segment above the active workspace root does not classify that nested workspace's source configs as generated artifacts.

Generated artifact materialization uses a canonical-root cross-process reader/writer lease with a 30-second bounded wait. A writer validates the plan's base revision after taking the lease and may rebuild the complete plan once if it drifted. Before its first mutation it atomically publishes an in-progress marker containing the base and desired revisions plus the complete owned-path universe. The manifest is written last. Readers fail closed while recovery is required; the next writer force-writes one fresh complete plan, removes non-target owned paths, verifies the desired tree, and only then removes the marker. This recovery model intentionally does not add a journal, backup tree, roll-forward state machine, completed-commit marker, or consumer-side second revision handshake.

The generated-graph manifest uses schema version `5` and stores stable sorted typed dependency edges; live governed-source and framework-capability descriptors are not serialized into it. Versions 1 through 4 are accepted only as artifact-ownership ledgers so stale owned paths can be deleted before the current plan writes a fresh version-`5` manifest. Future, zero, negative, non-integer, or malformed versions remain invalid. Artifact and descriptor ordering uses code-unit comparison rather than locale-sensitive ordering.

Checker project-config parsing caches belong to an `AnalysisProviderSet` and therefore to one repository generation. Graph, source, proof, owner, and checker projections share that generation's cache; advancing creates a new provider set and cache. Direct parser calls without a cache remain uncached, and virtual-file identities remain separate from physical-file identities.

Runtime-like import collection uses one TypeScript syntax-AST pass for ESM, import types, and CommonJS lexical binding analysis. Shadowed `require` names are not treated as the global loader. Only direct immutable `createRequire(import.meta.url)` bindings are recognized; mutable, transitive, destructured, computed, optional, and indirect aliases are excluded.

Programmatic custom analysis providers are generation-zero only. An attempted generation advance fails before disposing the current providers, incrementing generation, or replacing them with defaults.

Configured output roots are collected while validating the workspace context. Limina creates mutation authorities that distinguish:

- the trusted logical and canonical base
- the logical and canonical mutation root
- file or directory scope
- the generation in which the authority is valid

Managed checker output validates projected files against the authenticated authority instead of relying on lexical path containment alone. The implementation also records filesystem identity for mutation snapshots and reports authority or binding drift.

The public `--raw` build path is distinct from managed checker execution. The source establishes the separate path; it does not establish whether `--raw` is a permanent product commitment.

## Derived implementation consequences

The generated graph is shared evidence for graph validation, proof coverage, checker planning, source analysis, and package-boundary reasoning. Changing graph generation can therefore affect multiple validation domains even when the public change appears local.

The distinction between raw workspace evidence and validated authority packages means that a package can remain diagnostic evidence without receiving source ownership, named lookup, generated-graph, or workspace-dependency authority in the current run.

The TypeScript declaration provider and Oxc physical resolver answer different questions. A runtime-resolvable module is not automatically a valid type provider.

The package can refactor internal modules without changing users when the public CLI, configuration schema, generated artifacts, issue contracts, and observable validation semantics remain unchanged. The source does not establish that the current internal directory structure is permanent.

Limina can execute commands and configured pipelines, but its exported dependency graph is not sufficient to act as a general task graph or build-order authority.

CLI process tests must keep commands that mutate the same `.limina` artifact namespace sequential. Once an invocation record or completed check snapshot exists, independent `check --issues` queries are read-only and can run concurrently; this avoids making fixed per-test budgets depend on repeated development-entry cold starts on slower CI platforms.

Cross-platform tests must represent Limina-owned absolute paths in their canonical portable form even when Node filesystem calls use platform-native paths. Inline ESM child processes must import local modules through `file:` URLs rather than raw filesystem paths so Windows drive letters are not interpreted as URL schemes.

Cross-process materialization tests must release deliberately paused children through an already-open process channel rather than polling a filesystem sentinel. This keeps the lease contention under test while removing filesystem polling and scheduler timing from the synchronization barrier; child-result assertions should include captured process output when an exit is unsuccessful.

Isolated package fixtures that project pnpm dependencies into a temporary `node_modules` tree must keep scoped namespace directories physical and junction each package below them individually. Junctioning the namespace directory itself adds a nested reparse-point boundary that can make scoped ESM packages unreachable on Windows before the fixture reaches its intended dependency-resolution boundary.

## Human direction requiring confirmation

The supplied Codex memory contains repeated user instructions that are not implementation proof. They are recorded here as unvouched direction requiring human review:

- Limina behavior documentation should treat the current source, tests, schema, and executable configuration as the factual authority.
- Limina reference text should describe current accepted and rejected forms in the present tense instead of carrying historical compatibility or migration narratives into the current contract.
- Dependency graph export should remain scoped architecture evidence for review and diagnostics, not an authoritative task graph or build-order source.
- Performance-oriented internal changes should demonstrate semantic equivalence for observable issues, generated manifests, and resolution results before they are accepted.

The current implementation does not answer these longer-term questions:

- Which CLI commands, configuration fields, issue codes, snapshot formats, and generated paths are compatibility commitments?
- Is automatic checker selection intended to remain the default onboarding contract?
- Are workspace regions permanently governance boundaries only, or could they become orchestration units?
- Is `limina build --raw` intended to remain a supported escape path?
- Will Limina expose a general third-party checker, rule, or plugin contract beyond the current fixed checker identities and configuration surfaces?
- Is the current domain/application/internal module separation a durable architecture boundary or an implementation detail?

## Evidence anchors

Recheck these repository areas before updating this record:

- `packages/limina/package.json`
- `packages/limina/src/index.ts`
- `packages/limina/src/cli.ts`
- `packages/limina/src/config/`
- `packages/limina/src/pipeline/runner.ts`
- `packages/limina/src/checker/registry.ts`
- `packages/limina/src/core/build-graph/checker-semantic-authority.ts`
- `packages/limina/src/core/build-graph/checker-ownership-dependency-facts.ts`
- `packages/limina/src/core/project-dependencies/`
- `packages/limina/src/core/framework-semantic/`
- `packages/limina/src/core/vue-semantic/`
- `packages/limina/src/core/astro-semantic/`
- `packages/limina/src/core/svelte-semantic/`
- `packages/limina/src/core/workspace/`
- `packages/limina/src/core/build-graph/runner.ts`
- `packages/limina/src/dependency-graph/`
- `packages/limina/src/graph-check/`
- `packages/limina/src/source-check/`
- `packages/limina/src/proof/`
- `packages/limina/src/package-check/`
- `packages/limina/src/check-reporting/`
- `packages/limina/src/domain/artifacts/`
- `packages/limina/src/utils/mutation-boundary.ts`
- `packages/limina/src/utils/mutation/`
- `packages/limina/src/typecheck/managed-mutation.ts`
- `packages/limina/src/typecheck/managed/`
- `limina.config.mts`
