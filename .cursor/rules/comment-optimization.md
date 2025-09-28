# Comment Optimization Rules (Scoped)

Apply when explicitly performing comment/documentation optimization. Do not change code behavior.

- Objectives

  - Improve English comments (grammar, style, consistency) without changing meaning.
  - Explain purpose/constraints over restating code behavior.
  - Unify terminology and capitalization.

- Canonical Terms

  - React, Vue, VitePress, Vite, Rollup, Esbuild, Rspack
  - Node.js, TypeScript, JavaScript, CommonJS
  - SPA, SSR, SSG, HMR
  - Markdown (not “markdown”), source maps

- Style & Tone

  - End sentences with periods; present/imperative mood.
  - Hyphenate compound modifiers (client-side, server-side, lazy-loading, build-time, run-time).
  - “Set up/ Clean up” (verbs) vs “setup/ cleanup” (nouns).

- JSDoc

  - Prefer for exported APIs/complex functions. Describe non-type contracts (timing/env/limits).
  - Avoid duplicating TypeScript types.

- Tests

  - Keep comments short; align with assertions (Arrange/Act/Assert style when helpful).

- Prohibited

  - No logic or string changes. No speculative claims. No redundant comments.

- Process

  1. Unify terms and capitalization.
  2. Fix grammar/punctuation; add periods; apply hyphenation.
  3. Clarify intent/constraints; avoid restating code.
  4. Minimal edits; preserve indentation/line width.
  5. Re-run lints; ensure zero functional changes.

- Output
  - Edit only comment lines (//, /\* \*/ , JSDoc). Preserve surrounding formatting.
