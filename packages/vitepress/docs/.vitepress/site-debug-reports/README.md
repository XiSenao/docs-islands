# Site Debug AI Reports

This directory stores git-tracked build-time AI reports for the VitePress docs
debug console.

- `pages/` contains the canonical page-level reports consumed during normal
  `docs:build` runs and Vercel deployments.
- Regular builds run in read-only mode and will reuse only the committed
  reports in this directory.
- To refresh the reports locally, run `pnpm docs:build:site-debug-reports` from
  `packages/vitepress/docs`, or `pnpm docs:build:site-debug-reports` from the
  repo root.

Do not edit these JSON report files by hand. Regenerate them through the build
script when the prompt, provider config, or relevant page data changes.
