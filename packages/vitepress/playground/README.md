# VitePress Rendering Strategies E2E Tests

## Test Categories

### Script Content Changes (`script-content-changes/`)

Tests for scenarios involving changes to `<script lang="react">` content:

- Basic component rendering
- Import path errors
- Component name changes
- Multiple component imports
- State preservation

### Container Changes (`container-changes/`)

Tests for render container directive changes:

- `client:only` containers
- `ssr:only` containers
- Mixed render directives
- No directive (default behavior)
- Directive transitions

### Markdown Changes (`markdown-changes/`)

Tests for markdown content changes not related to React features:

- Basic markdown rendering
- Content without components
- Complex layouts with components
- State preservation during content changes

### Error Handling (`error-handling/`)

Tests for error scenarios and edge cases:

- Missing components
- Invalid syntax
- Component name mismatches
- Invalid render directives
- Performance under error conditions

### Basic Functionality (`basic-functionality/`)

Tests for core VitePress functionality:

- Page navigation
- Layout rendering
- 404 handling
- Plugin integration debugging

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test category
pnpm -F=tests-e2e test script-content-changes
pnpm -F=tests-e2e test container-changes
pnpm -F=tests-e2e test markdown-changes
pnpm -F=tests-e2e test error-handling
pnpm -F=tests-e2e test basic-functionality

# Run with debug output
DEBUG=1 pnpm -F=tests-e2e test

# Watch mode
pnpm test:e2e-dev:watch
```
