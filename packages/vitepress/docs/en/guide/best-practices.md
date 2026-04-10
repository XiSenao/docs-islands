# Best Practices

This page is for day-to-day authoring decisions: how to write island-component tags correctly, how to choose a render strategy conservatively, and which caveats matter before you scale usage.

If you need installation and first-run setup, read [Getting Started](./getting-started.md). If you need the runtime model, read [How It Works](./how-it-works.md).

## Keep the Boundary Clear

Use these three guide pages for different questions:

- [Getting Started](./getting-started.md): "How do I install this and render my first island component?"
- [How It Works](./how-it-works.md): "What does the compiler and runtime actually do?"
- This page: "How should I write island components safely and choose strategies in a real docs site?"

## Start Conservatively

The safest rollout pattern is:

1. Get the component working as `ssr:only`.
2. Verify the page builds and the HTML output looks correct.
3. Add client takeover only if the component truly needs interaction.
4. Add `spa:sr` only if route-transition timing visibly hurts the reading experience.

That order keeps the first milestone about correctness, not about hydration complexity.

## Markdown Authoring Rules

These are the most important authoring constraints:

- A page may contain only one `<script lang="react">` block.
- Component tags must start with an uppercase letter.
- The tag name must exactly match the local import name from the same page.
- Components used in Markdown must be self-closing, such as `<Landing ... />`.
- The component must be imported in the current `.md` file or it will be skipped.
- Components inside `Vue` slots and templates can still be discovered.
- Re-export chains are supported, but runtime imports resolve to the final export owner.

Good:

```md
<script lang="react">
  import { Landing as HomeLanding } from '../rendering-strategy-comps/react/Landing';
</script>

<HomeLanding client:load />
```

Will be skipped:

```md
<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<landing client:load />
<Landing></Landing>
```

## Choose a Strategy With the Lowest Necessary Client Cost

The default mindset should be "keep the page static unless interaction changes the value."

### Start with `ssr:only`

Use it first for:

- documentation prose
- callouts and content blocks
- examples and showcase components
- branding and hero sections that do not need immediate interaction

Why this should be your default:

- best alignment with VitePress's static-first model
- no hydration cost
- easiest baseline to debug before adding runtime work

### Upgrade to `client:load` Only for Immediate Interaction

Use `client:load` when the component is visible immediately and would feel broken if it could not respond right away.

Typical examples:

- tabs
- search surfaces
- filters
- demos that appear above the fold

### Prefer `client:visible` for Delayed Interaction

Use `client:visible` when the component matters later, not at first paint.

Typical examples:

- comments
- charts lower on the page
- playgrounds and secondary tools

### Reserve `client:only` for Browser-Only Dependencies

Use `client:only` only when prerendering is not safe or not useful.

Typical examples:

- components that depend directly on `window` or `document`
- widgets whose value starts only after browser APIs are available

Trade-off:

- simplest mental model
- weakest static output
- no prerendered HTML

## Treat Vue to Island-Component Props as Initialization Only

Values passed from `Vue` into an island component are a one-shot container snapshot, not a live cross-framework state bridge.

That means:

- use the values to initialize the island
- keep ongoing interactive state inside one framework boundary
- do not pass functions or event handlers through attributes

If you find yourself wanting multiple frameworks to behave like one shared reactive tree, you are probably pushing past the intended island-component boundary.

## Be Selective With `spa:sr`

`spa:sync-render` is powerful, but it is a trade-off rather than a blanket optimization.

It is usually worth enabling when:

- the component is part of the main reading or product story
- delayed island output during navigation looks visibly broken
- debugging shows the issue is mostly injection timing

It is usually better to keep it off when:

- the island is supportive rather than critical content
- the page already contains many `spa:sr` components
- smaller navigation bundles matter more than perfect appearance timing

Remember the defaults:

- `client:only` does not support `spa:sr`
- `client:load` and `client:visible` require explicit opt-in
- `ssr:only` enables `spa:sr` by default unless explicitly disabled

## Node API and Local File Caveats

Node APIs such as `node:fs` are only safe when the component is rendered exclusively as `ssr:only` on the current page.

If the same component appears on one page as both `ssr:only` and any `client:*` strategy, it must not depend on server-only APIs.

Use `import.meta.dirname` when resolving local files:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'pathe';

const targetPath = join(import.meta.dirname, 'local-data.json');
const data = JSON.parse(readFileSync(targetPath, 'utf8')) as {
  data: unknown;
};
```

If local file edits should participate in HMR, bridge that yourself with `vite`'s `handleHotUpdate`.

## Before You Roll It Out Broadly

Use this checklist before adding many island components to a docs site:

- verify the component builds and renders correctly as `ssr:only`
- confirm hydration does not mismatch before switching to an interactive strategy
- confirm HMR still behaves as expected in development
- verify any Node-dependent component is used only as `ssr:only` on that page
- inspect route transitions before enabling `spa:sr` broadly

## Common Mistakes

- Defaulting to `client:only` too early and giving up static output.
- Treating this as a way for one framework runtime to own the whole page.
- Enabling `spa:sr` everywhere after the first flicker report.
- Hiding important side effects inside barrel modules.
- Assuming `Vue` prop updates will keep flowing into an island component after initialization.

## Quick Troubleshooting

- Tags are ignored: make sure the tag starts with an uppercase letter and exactly matches the local import name from the same `<script lang="react">` block.
- Nothing renders: make sure the component is imported in the same `.md` file and is not inside a fenced code block.
- Flicker on navigation: inspect whether the component is truly critical enough to opt into `spa:sr`.
- Hydration errors: make sure server output matches client output and avoid passing functions as attributes.
- Node API errors: make sure the component is rendered exclusively as `ssr:only` on that page.

## Continue Reading

- [Getting Started](./getting-started.md): set up the integration and render the first island component.
- [How It Works](./how-it-works.md): understand the compiler and runtime pipeline.
- [Site Debug](../site-debug-console/): inspect bundle composition, runtime state, and HMR behavior.
