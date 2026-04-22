---
name: git-commit-conventions
description: Create project-aligned Conventional Commits for the docs-islands repository. Use when the user asks to write, split, review, reword, or amend git commit messages, or when staged changes need to be grouped into commits. Applies package-centric scopes such as vitepress, logging, core, eslint-config, agents, docs, site-debug, debug-console, deps, and tsconfig, uses short bullet bodies for substantial commits, and formats BREAKING CHANGE footers cleanly.
---

# Docs Islands Git Commit Conventions

Use this skill for commit planning, message writing, commit splitting, and commit-message rewording in this repository.

## Repository Norms

- Use Conventional Commits: `type(scope): subject`
- Keep the subject imperative, concise, and without a trailing period.
- Keep the subject under roughly 72 characters when possible.
- Use a scope when one package or subsystem clearly dominates the change.
- Omit the scope only for truly cross-workspace foundational changes with no single dominant area.

## Preferred Types

- `feat`: new capability, new public surface, or materially expanded behavior
- `fix`: bug fix, regression fix, compatibility fix, or correctness repair
- `docs`: documentation-only work, or docs plus directly related generated report refreshes
- `refactor`: internal restructuring without primary feature or fix semantics
- `test`: test-only stabilization, coverage, or fixture updates
- `perf`: measurable performance improvements
- `build`: packaging, release, boundary-audit, dependency-resolution, or build-pipeline work
- `ci`: workflow-only automation changes
- `chore`: maintenance work only when no more specific type fits

## Scope Selection

- Prefer scopes already common in this repo: `vitepress`, `logging`, `core`, `eslint-config`, `agents`, `docs`, `site-debug`, `debug-console`, `deps`, `tsconfig`.
- Use `vitepress` for work centered on `packages/vitepress`, even when related tests, docs, scripts, or generated reports move with it.
- Use `logging` for shared logging behavior that spans `utils` and multiple consumers.
- Use `core` for `@docs-islands/core` runtime, transform, or constant-surface changes.
- Use `eslint-config` for lint preset/config extraction and rule-pack work.
- Use `agents` for changes centered on `packages/agents`, especially prompt assets, skills, and assistant-integration utilities.
- Use `docs` for standalone docs-site fixes when the dominant change is a docs experience issue rather than package behavior; otherwise prefer `docs(vitepress)` via `type=docs` and `scope=vitepress`.
- Use `site-debug` or `debug-console` only when the change is tightly scoped to that subsystem; otherwise prefer `vitepress`.
- For other workspace packages, prefer the package or subsystem name when it would be unsurprising to a reviewer.
- Use no scope for repo-wide structural work like introducing a new package or a genuinely cross-package foundation.

## Body Style

- Skip the body for small, obvious commits.
- For substantial commits, add 2-4 bullets after a blank line.
- Start each bullet with `- ` and an imperative verb.
- Focus on reviewer-relevant behavior, API, migration, or architecture changes, not file inventories.
- Keep bullets short and parallel in tone.

## Breaking Changes

- Use `!` in the subject when the public API, config contract, import path, or integration contract breaks.
- Add a `BREAKING CHANGE:` footer with concrete migration guidance.
- Wrap the footer across multiple lines at natural clause boundaries; do not leave it as one oversized line.

Example:

```text
BREAKING CHANGE: stop importing @docs-islands/vitepress/internal/logger or
relying on default logger accessors. Use createLogger from
@docs-islands/vitepress/logger, and migrate internal runtime imports to
@docs-islands/vitepress/internal/client-runtime when needed.
```

## Commit Splitting

- Keep one logical rollback unit per commit.
- Split unrelated refactors away from features.
- Keep tests, docs, and checked-in generated artifacts with the change that directly caused them.
- If a change spans multiple folders but one package is clearly dominant, keep one commit and scope it to that package instead of splitting mechanically by path.
- When in doubt, optimize for reviewability and safe rollback, not for the number of commits.

## Workflow

1. Inspect `git status --short`, `git diff --cached --stat`, and `git diff --cached`.
2. Group changes by review or rollback unit, not by directory alone.
3. Choose the most specific accurate `type` and the dominant scope.
4. Write the subject first; add body bullets only if they improve review clarity.
5. If the change is breaking, add `!` plus a wrapped `BREAKING CHANGE:` footer.
6. Compare the result against recent `git log` before finalizing.

## Quick Examples

- `feat(vitepress): track React HMR and dev render timing`
- `feat(vitepress)!: add public logger modules and preset-based logging`
- `refactor(core): publish granular constants and factory-based loggers`
- `feat(logging): add elapsed log helpers and modular logger internals`
- `docs(vitepress): document logging presets and refresh reports`
- `feat(agents): add git commit conventions skill`
- `fix(docs): resolve component popup exception`
