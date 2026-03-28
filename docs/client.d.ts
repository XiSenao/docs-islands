declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '@docs-islands/vitepress/debug-console' {
  const SiteDebugConsole: any;

  export default SiteDebugConsole;
}
