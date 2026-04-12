# Getting Started

## Prerequisites

- Node.js: `^20.19.0` or `>=22.12.0`
- VitePress: `^1.6.3`
- React / ReactDOM: `^18.2.0`
- `@vitejs/plugin-react-swc`: `^3.9.0`

## Install Dependencies

::: code-group

```bash [pnpm]
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

:::

## Configure VitePress

1. Integrate `vitepressReactRenderingStrategies()` in `.vitepress/config.ts`:

   ::: code-group

   ```ts [react]
   import { defineConfig } from 'vitepress';
   import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

   const vitepressConfig = defineConfig({
     // your VitePress config
   });

   vitepressReactRenderingStrategies(vitepressConfig);

   export default vitepressConfig;
   ```

   :::

2. Register the client runtime in your theme enhancement:

   ::: code-group

   ```ts [react]
   import DefaultTheme from 'vitepress/theme';
   import reactClientIntegration from '@docs-islands/vitepress/react/client';
   import type { Theme } from 'vitepress';

   const theme: Theme = {
     extends: DefaultTheme,
     async enhanceApp() {
       await reactClientIntegration();
     },
   };

   export default theme;
   ```

   :::

## Render Your First Island Component in Markdown

Create a component:

::: code-group

```tsx [components/Landing.tsx]
export default function Landing() {
  return <div>Hello Docs Islands</div>;
}
```

:::

Then import and render it inside Markdown:

::: code-group

```md [guide/getting-started.md]
<script lang="react">
  import Landing from '../components/Landing';
</script>

<Landing ssr:only title="Hello" />
```

:::

If you omit a render directive, the default behavior is `ssr:only`.

## First Verification Checklist

After the first integration, verify at least these points:

- The page builds successfully and the Markdown component tag is not ignored.
- The component renders correctly as `ssr:only` before you introduce interaction.
- Upgrading to an interactive strategy does not immediately cause hydration mismatch.
- Editing the island-component source still produces the HMR behavior you expect in development.
- If the component has special runtime constraints, review [Best Practices](./best-practices.md) before broadening its usage.

## Further Reading

- [How It Works](./how-it-works.md): injection flow, runtime stages, strategy behavior, and `spa:sync-render`.
- [Best Practices](./best-practices.md): Markdown authoring rules, strategy heuristics, caveats, and quick troubleshooting.
- [Site Debug Getting Started](../site-debug-console/getting-started.md): console setup and first diagnosis workflow.
