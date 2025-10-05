# Docs Islands

<p align="center">
  <a href="https://docs.senao.me/docs-islands" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/favicon.svg" alt="Docs Islands logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/vitepress"><img src="https://img.shields.io/npm/v/@docs-islands/vitepress.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/vitepress.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://pr.new/XiSenao/docs-islands"><img src="https://developer.stackblitz.com/img/start_pr_dark_small.svg" alt="Start new PR in StackBlitz Codeflow"></a>
</p>
<br/>

English | [简体中文](./README.zh-CN.md)

> **⚡ Project Status**: Actively developed - VitePress integration production ready.

Brings cross-framework Islands Architecture to documentation frameworks with selective and lazy hydration while maintaining static-first approach. Built on adapter model design, the architecture is extensible to multiple documentation frameworks and build toolchains with no lock-in. Currently provides production-ready zero-friction integration for VitePress.

## Key Features

- **🏝️ Islands Architecture** - Static-first with selective and lazy hydration. Per-component isolation avoids global state conflicts and enables progressive enhancement.
- **🎯 Flexible Rendering Strategies** - Currently supports four rendering modes (ssr:only, client:load, client:visible, client:only) with extensible architecture for additional strategies.
- **🧩 Framework-Agnostic Design** - Built on adapter model, extensible to other documentation frameworks (e.g., Docusaurus, Nextra, Rspress, etc.) and build toolchains with no lock-in.
- **⚛️ Cross-Framework UI Support** - Production-ready React integration, extensible to Solid, Svelte, Preact, Angular and other mainstream UI frameworks.
- **🔌 Zero-Friction Integration** - Minimal configuration, works out of the box. Seamlessly integrates into existing documentation projects through adapters without disrupting workflows.
- **📦 Complete Developer Experience** - Dev HMR, dev/prod consistency, MPA compatibility. Performance optimization options available for specific scenarios.

> For more details and usage guides, visit the [documentation site](https://docs.senao.me/docs-islands/).

## Contributing

Community contributions are welcome! Please see the [Contributing Guide](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md) for details.

## License

MIT © [XiSenao](https://github.com/XiSenao)
