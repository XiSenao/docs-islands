<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-02-07

### Bug Fixes

- fix(vitepress): preserve query string in module ID to avoid processing Vue SFC sub-modules as Markdown ([f1b43bd](https://github.com/XiSenao/docs-islands/commit/f1b43bd))

### Maintenance

- refactor(tsconfig): streamline include patterns and centralize exclude rules ([4673f47](https://github.com/XiSenao/docs-islands/commit/4673f47))
- refactor(vitepress): consolidate utils to monorepo and reorganize shared modules ([4a327af](https://github.com/XiSenao/docs-islands/commit/4a327af))
- refactor(tsconfig): modularize typescript configuration by module ([0bdff19](https://github.com/XiSenao/docs-islands/commit/0bdff19))

### Other Changes

- build(vitepress): enforce type check for package dist with skipLibCheck best practice ([7369a70](https://github.com/XiSenao/docs-islands/commit/7369a70))

## [0.1.2] - 2025-11-03

### ⚠️ BREAKING CHANGES

- **refactor(core)!: align internal api paths to `internal/*` namespace** ([f44616b](https://github.com/XiSenao/docs-islands/commit/f44616b))
  - `client-utils/logger` → `internal/logger`
  - `client-shared/runtime` → `internal/runtime`
  - Note: These paths were internal implementation details and not part of the public API

### Bug Fixes

- fix(deps): downgrade @swc/core version to v1.13.5 ([7ce0985](https://github.com/XiSenao/docs-islands/commit/7ce0985)) - Resolves known compatibility issues
- fix(scripts): target path parsing exception ([f10084f](https://github.com/XiSenao/docs-islands/commit/f10084f))
- fix(typescript): comments contain nbsp, causing tsconfck parsing to fail ([31b3345](https://github.com/XiSenao/docs-islands/commit/31b3345))

### Documentation

- docs: refine project introduction and key features ([9355f61](https://github.com/XiSenao/docs-islands/commit/9355f61))
- docs: improve stackblitz codeflow integration links ([6c453b9](https://github.com/XiSenao/docs-islands/commit/6c453b9))

### Maintenance

- chore(vitepress): handle internal runtime modules with empty type declarations ([0cb15e6](https://github.com/XiSenao/docs-islands/commit/0cb15e6))
- refactor(build): use pnpm exec and remove output filtering ([9550a05](https://github.com/XiSenao/docs-islands/commit/9550a05))
- chore(deps): bump actions and dev dependencies ([5b15f84](https://github.com/XiSenao/docs-islands/commit/5b15f84))
- chore(config): add npmrc and refactor client export paths ([c56ad4f](https://github.com/XiSenao/docs-islands/commit/c56ad4f))
- chore: enhance pnpm lint constraints and optimize toolchain ([f070dac](https://github.com/XiSenao/docs-islands/commit/f070dac))
- chore(deps): upgrade dependencies and migrate pnpm config to workspace ([6b6250b](https://github.com/XiSenao/docs-islands/commit/6b6250b))
- chore: refactor scripts and upgrade del-cli to v7 ([ccdcfba](https://github.com/XiSenao/docs-islands/commit/ccdcfba))
- chore(typescript): remove support for subpaths in tsconfig.json ([565a011](https://github.com/XiSenao/docs-islands/commit/565a011))
- refactor: restructure project architecture and rename e2e to playground (#26) ([b1af90f](https://github.com/XiSenao/docs-islands/commit/b1af90f)) - Major structural improvements for better code organization
- chore(npm): @docs-islands/vitepress uses self-generated license ([11225ae](https://github.com/XiSenao/docs-islands/commit/11225ae))
- refactor: standardize code formatting with prettier (#12) ([0bc714e](https://github.com/XiSenao/docs-islands/commit/0bc714e)) - Unified code style across the entire codebase
- chore(test): reset the residual artifacts during e2e execution ([b7d1821](https://github.com/XiSenao/docs-islands/commit/b7d1821))

### Build & CI

- build(vitepress): separate dts generation and optimize plugins ([d258b8c](https://github.com/XiSenao/docs-islands/commit/d258b8c)) - Improved build performance
- build(eslint-config): migrate to typescript and fix file operations ([21d6f57](https://github.com/XiSenao/docs-islands/commit/21d6f57))
- ci(workflow): fix paths-filter exclusion patterns and improve filter accuracy ([16c93e5](https://github.com/XiSenao/docs-islands/commit/16c93e5))
- ci: pkg.pr.new preview with label and comment ([a672df2](https://github.com/XiSenao/docs-islands/commit/a672df2)) - Enable PR preview deployments
- ci: optimize playwright ci configuration ([56902ca](https://github.com/XiSenao/docs-islands/commit/56902ca))
- ci: migrate to semantic-pull-request action ([42b43c9](https://github.com/XiSenao/docs-islands/commit/42b43c9))

## [0.1.1] - 2025-10-16

### Maintenance

- feat(deploy): integrate netlify deployment ([a0c6b69](https://github.com/XiSenao/docs-islands/commit/a0c6b69))
- feat(ci): improve github workflow (#6) ([315121c](https://github.com/XiSenao/docs-islands/commit/315121c))
- fix(scripts): monorepo scripts not passing parameters ([8f69466](https://github.com/XiSenao/docs-islands/commit/8f69466))
- fix(ci): playwright command not found in ci by adding root dependency ([9ad930f](https://github.com/XiSenao/docs-islands/commit/9ad930f))
- fix(serve): docs site startup script change ([7fd07dc](https://github.com/XiSenao/docs-islands/commit/7fd07dc))
- fix(ci): move matrix.skip-pr condition from job to step level ([c551010](https://github.com/XiSenao/docs-islands/commit/c551010))
- chore(ci): enhance quality checks and package publishing ([8d68e5c](https://github.com/XiSenao/docs-islands/commit/8d68e5c))
- chore(config): standardize linting and tooling setup ([2b0a7f9](https://github.com/XiSenao/docs-islands/commit/2b0a7f9))
- chore(config): add editorconfig and unify line endings ([e92c9fc](https://github.com/XiSenao/docs-islands/commit/e92c9fc))
- refactor(build): extract license plugin to standalone package ([0efddfe](https://github.com/XiSenao/docs-islands/commit/0efddfe))
- refactor(deps): optimize dependency management with pnpm catalogs and build improvements (#11) ([7b10f27](https://github.com/XiSenao/docs-islands/commit/7b10f27))
- refactor(eslint-config): restructure config by directory convention (#10) ([f51dfc6](https://github.com/XiSenao/docs-islands/commit/f51dfc6))
- chore: restore format from auto-generated license and remove useless instructions for subpackage ([d60bbb5](https://github.com/XiSenao/docs-islands/commit/d60bbb5))
- chore(project): improve compliance and ci workflows (#9) ([22a66bf](https://github.com/XiSenao/docs-islands/commit/22a66bf))
- chore(repo): update issue/pr templates and readme, and sync lock files ([71037fb](https://github.com/XiSenao/docs-islands/commit/71037fb))
- ci(workflow): add lock threads and close stale issues and prs ([6191bef](https://github.com/XiSenao/docs-islands/commit/6191bef))
- ci(workflow): optimize build artifacts caching and path detection ([6259e30](https://github.com/XiSenao/docs-islands/commit/6259e30))

## [0.1.0] - 2025-10-04

### Maintenance

- chore: readme document update and adjustment debugging optimization instructions ([7ec84ef](https://github.com/XiSenao/docs-islands/commit/7ec84ef))
- refactor(eslint): standardize code quality with comprehensive eslint and prettier integration ([8f58330](https://github.com/XiSenao/docs-islands/commit/8f58330))
- refactor: migrate from vitepress-rendering-strategies to @docs-islands/vitepress ([bb25f62](https://github.com/XiSenao/docs-islands/commit/bb25f62))

## Previous Changelogs

### [0.0.x] (2025-09-05 - 2025-09-25)

See [0.0.15 changelog](https://github.com/XiSenao/docs-islands/blob/main/packages/vitepress/CHANGELOG-LEGACY.md)
