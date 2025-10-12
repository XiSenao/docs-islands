function readPackage(pkg) {
  if (!pkg.name) {
    return pkg;
  }

  /**
   * .
   * └─┬ vitepress 1.6.3
   *   └─┬ @docsearch/js 3.8.2
   *     └─┬ @docsearch/react 3.8.2
   *       ├── ✕ missing peer search-insights@">= 1 < 3"
   *       └─┬ @algolia/autocomplete-core 1.17.7
   *         └─┬ @algolia/autocomplete-plugin-algolia-insights 1.17.7
   *           └── ✕ missing peer search-insights@">= 1 < 3"
   *
   * I don't want to install the search-insights peer dependency at the root directory
   * for vitepress, installing it within vitepress's node_modules directory is sufficient.
   */
  if (pkg.name.startsWith('vitepress')) {
    pkg.dependencies = {
      ...pkg.dependencies,
      'search-insights': '>= 1 < 3',
    };
  }

  if (pkg.name === '@html-eslint/eslint-plugin') {
    pkg.dependencies = {
      ...pkg.dependencies,
      '@html-eslint/parser': '*',
    };
  }

  if (pkg.name === 'vue-eslint-parser') {
    pkg.dependencies = {
      ...pkg.dependencies,
      '@typescript-eslint/parser': '*',
    };
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
