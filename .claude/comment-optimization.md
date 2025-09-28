# Comment Optimization Prompt (Claude)

You are a senior frontend engineer. Optimize English comments across this repository with minimal edits and no code changes.

Constraints:

- Do not modify code logic or string literals. Edit comments only (//, /\* \*/, JSDoc).
- Preserve indentation and formatting. Keep edits minimal and professional.
- Clarify purpose/assumptions/limitations; avoid restating code.

Terminology & Style:

- Canonical terms: React, Vue, VitePress, Node.js, TypeScript, CommonJS; SPA/SSR/SSG/HMR; Markdown; source maps.
- Use periods at sentence ends; imperative/present tense.
- Hyphenate compound modifiers: client-side, server-side, lazy-loading, build-time, run-time.
- “Set up/Clean up” (verbs) vs “setup/cleanup” (nouns).

Process:

1. Unify terms/capitalization.
2. Fix grammar/punctuation; add periods; hyphenate compound modifiers.
3. Strengthen intent/constraints; avoid duplicating code logic in comments.
4. Minimal edits; preserve formatting. Re-run lints if applicable.

Tests:

- Keep comments short and aligned with assertions; use Arrange/Act/Assert phrasing when helpful.
