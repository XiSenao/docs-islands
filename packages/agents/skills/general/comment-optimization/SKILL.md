---
name: comment-optimization
description: Optimize code comments for grammar, style, and clarity without changing code behavior. Use when the user asks to improve, clean up, optimize, or review comments or documentation in source code files. Triggers on requests like "optimize comments", "improve comments", "fix comment style", "clean up docs", "review JSDoc", or "unify comment terminology". Applies to all source files containing //, /* */, or JSDoc comments.
---

# Comment Optimization

Improve English comments (grammar, style, consistency) without changing code behavior or meaning. Explain purpose and constraints; never restate what code already expresses.

## Canonical Terms

Use exact capitalization. Correct any deviations:

- React, Vue, VitePress, Vite, Rollup, Esbuild, Rspack
- Node.js, TypeScript, JavaScript, CommonJS
- SPA, SSR, SSG, HMR
- Markdown (not "markdown"), source maps

## Style Rules

- End sentences with periods. Use present or imperative mood.
- Hyphenate compound modifiers: client-side, server-side, lazy-loading, build-time, run-time.
- "Set up" / "Clean up" as verbs; "setup" / "cleanup" as nouns.

## JSDoc

- Prefer for exported APIs and complex functions. Describe non-type contracts (timing, environment, limits).
- Do not duplicate TypeScript type information.

## Test Comments

- Keep short. Align with assertions. Use Arrange/Act/Assert labels when helpful.

## Prohibited

- No logic or string changes.
- No speculative claims.
- No redundant comments that restate code.

## Process

1. Unify terms and capitalization.
2. Fix grammar, punctuation, periods, and hyphenation.
3. Clarify intent and constraints; remove code restatements.
4. Make minimal edits; preserve indentation and line width.
5. Re-run lints; ensure zero functional changes.

Edit only comment lines (`//`, `/* */`, JSDoc). Preserve all surrounding code and formatting.
