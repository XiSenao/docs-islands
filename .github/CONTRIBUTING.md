<!-- markdownlint-disable MD014 MD034 -->

# VitePress Rendering Strategies Contributing Guide

Hi! We're really excited that you are interested in contributing to VitePress Rendering Strategies. Before submitting your contribution, please make sure to take a moment and read through the following guidelines:

- [Types of Contributions](#types-of-contributions)
- [How to Report Issues](#how-to-report-issues)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Development Setup](#development-setup)

## Types of Contributions

We welcome many different types of contributions:

### Bug Reports

Help us identify and fix bugs by reporting them with detailed reproduction steps.

### Feature Requests

Suggest new features or improvements to existing functionality.

### Documentation

Improve our documentation, fix typos, or add examples.

### Code Contributions

Fix bugs, implement new features, or improve performance.

### Translations

Help make the project accessible to more people by contributing translations.

### Testing

Write tests, improve test coverage, or help with manual testing.

## How to Report Issues

When reporting bugs or requesting features, please:

### For Bug Reports

1. **Search existing issues** to avoid duplicates
2. **Use a clear title** that describes the problem
3. **Provide detailed reproduction steps**:

   - What you did
   - What you expected to happen
   - What actually happened

4. **Include system information**:

   - Operating system and version
   - Node.js version
   - Package version

5. **Add relevant code samples** or screenshots if applicable

### For Feature Requests

1. **Search existing issues** to avoid duplicates
2. **Describe the problem** you're trying to solve
3. **Explain your proposed solution** and why it would be useful
4. **Consider alternatives** and mention any you've considered
5. **Provide examples** of how the feature would be used

## Pull Request Guidelines

- Checkout a topic branch from the `master` branch and merge back against that branch.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing a bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log (e.g. `fix: update entities encoding/decoding (fix #3899)`).
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

- If it's a chore:

  - For typos and comment changes, try to combine multiple of them into a single PR.
  - **Note that we discourage contributors from submitting code refactors that are largely stylistic.** Code refactors are only accepted if it improves performance, or objectively improves code quality (e.g. makes a related bug fix or feature implementation easier, and it is as a separate PR to improve git history).
    - The reason is that code readability is subjective. The maintainers of this project have chosen to write the code in its current style based on our preferences, and we do not want to spend time explaining our stylistic preferences. Contributors should just respect the established conventions when contributing code. Another aspect of it is that large scale stylistic changes result in massive diffs that touch multiple files, adding noise to the git history and makes tracing behavior changes across commits more cumbersome.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- Before submitting, make sure to follow the following commands:

  ```sh
  pnpm format
  pnpm typecheck
  pnpm lint
  pnpm test
  ```

- No need to worry about code style as long as you have installed the dev dependencies. Modified files are automatically formatted with Prettier on commit.

- PR title must follow the [commit message convention](https://github.com/XiSenao/docs-islands/blob/main/.github/commit-convention.md) so that changelogs can be automatically generated.

### DevDependencies Sorting Order

To enhance readability and maintainability, `devDependencies` in `package.json` follows a "group-based ordering + alphabetical order within groups" strategy.

Group ordering (top to bottom):

1. **Code Quality** - Linting, formatting, and git hooks
2. **TypeScript Tooling** - TypeScript compiler and related tools
3. **Type Definitions** - @types/\* packages for type declarations
4. **Build & Bundle** - Build tools, bundlers, and development utilities
5. **Testing** - Testing frameworks, runners, and utilities
6. **UI Framework (Dev)** - Framework-specific development dependencies
7. **Runtime Helpers** - Utility libraries supporting runtime operations
8. **Babel Tooling** - Code transformation and compatibility tools
9. **Internal Workspace** - Local workspace package links

Rules:

- Dependencies within each group are sorted alphabetically by package name.
- Avoid cross-group duplication; follow existing group semantics when adding new dependencies.
- This ordering follows the development workflow: from code quality foundations to specific framework implementations.

## Development Setup

You will need [Node.js](https://nodejs.org) v20.19.0+ or v22.12.0+ and [pnpm](https://pnpm.io).

Clone the repository:

```sh
git clone git@github.com:XiSenao/docs-islands.git
```

Enter the repository directory:

```sh
cd docs-islands
```

Install the project dependencies:

```sh
pnpm install
```

### Development with Documentation

The easiest way to test your changes is to run the documentation site locally.

This repo provides an optimized DX to develop `docs-islands` while previewing changes live in the docs, with breakpoints via a JavaScript Debug Terminal and no manual server restarts.

1. Prepare the docs to consume the local package:

   ```bash
   pnpm install
   pnpm build          # one‑time build to generate dist/* for dev runtime build
   pnpm docs:dev-prepare
   ```

2. Start the docs in a JavaScript Debug Terminal:

   - **In VS Code**: Terminal → New `JavaScript Debug Terminal`
   - Then run:

   ```bash
   pnpm docs:dev
   ```

   The command waits for `dist/node/index.js`, then launches the VitePress dev server. You can place `debugger;` in the library source (e.g. `src/node/**`, `src/node/react/**`) to pause execution in the attached debugger when those code paths run.

   After executing the above command, visit http://localhost:5173/vitepress-rendering-strategies/ and try modifying the source code. You'll get live updates as you develop.

3. Edit, save, continue:

   - For **client** and **server** source code debugging, we recommend using the `JavaScript Debug` Terminal with `debugger;` statements for debugging. Client code changes will automatically trigger a full browser refresh, while server source code changes will trigger Vite server to rebuild configuration modules and automatically restart the service.
   - For **build-time injected client runtime** source code debugging, such as all modules included in `src/shared/runtime`, these are build-time runtime artifacts optimized for the client during the build process and do not support Hot Module Replacement (HMR). For development of such source code, we recommend enabling `pnpm build:watch` mode. Set `debugger;` breakpoints and manually execute `pnpm docs:build:only` to complete the build work for runtime artifacts, then debug in the browser through the `pnpm docs:preview` environment. This process is quite cumbersome and will be further optimized for developer experience in the future. Fortunately, **build-time injected client runtime** source code typically does not change frequently.

Tip: To switch docs back to the built package(default), run:

```bash
pnpm docs:prod-prepare
```

## License

By contributing to VitePress Rendering Strategies, you agree that your contributions will be licensed under the [MIT License](https://github.com/XiSenao/vitepress-rendering-strategies/blob/master/LICENSE).

This means:

- Your contributions become part of the open source project
- They can be freely used, modified, and distributed
- You retain the copyright to your original contributions
- You grant others the right to use your contributions under the MIT License

---

Thank you for contributing to VitePress Rendering Strategies! 🚀
