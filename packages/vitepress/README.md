# @docs-islands/vitepress

<p align="center">
  <a href="https://docs.senao.me/docs-islands/vitepress/core-concepts" target="_blank" rel="noopener noreferrer">  
    <img width="180" src="https://docs.senao.me/docs-islands/vitepress/islands-vitepress.svg" alt="logo">
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

> **⚡ Project Status**: Under active development - Production-ready for VitePress projects.

Brings cross‑framework component rendering to VitePress (currently built-in React), providing fine‑grained rendering and Hydration strategies on top of VitePress’s SSG architecture, inspired by [Astro](https://docs.astro.build/)’s [Islands Architecture](https://docs.astro.build/en/concepts/islands).

- **Cross‑framework rendering**: Production-ready React integration with unified Islands Architecture, plans to support more UI frameworks in the community and share rendering primitives in the future.
- **Four client directives**: client:only, client:load, client:visible, ssr:only (default).
- **SPA sync rendering optimization**: spa:sync-render/spa:sr synchronously injects pre-rendered output for critical components during navigation, eliminating visual instability caused by asynchronous loading gaps.
- **HMR support**: Complete hot module replacement across framework boundaries, preserving state and maintaining development velocity.
- **MPA compatibility**: Works with VitePress MPA mode.

> For comprehensive design rationale and examples, see [VitePress Cross-Framework Rendering Strategy](https://docs.senao.me/docs-islands/vitepress/core-concepts).

## Quick Start

Read [Quick Start](https://docs.senao.me/docs-islands/vitepress/quick-start) for more information.

## Contributing

Welcome community contributions! For more details, see the [Contributing Guide](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md).

## License

MIT © [XiSenao](https://github.com/XiSenao)
