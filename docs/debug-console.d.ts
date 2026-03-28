import type { DefineComponent } from 'vue';

declare module '@docs-islands/vitepress/debug-console' {
  const SiteDebugConsole: DefineComponent;

  export default SiteDebugConsole;
}
