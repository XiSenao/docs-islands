import { inferSourceLanguage } from './site-debug-shared.js';

export const inferPrettierParser = (sourcePath?: string) => {
  const normalizedPath = sourcePath?.toLowerCase() || '';

  if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.ts')) {
    return 'babel-ts';
  }

  if (normalizedPath.endsWith('.jsx')) {
    return 'babel';
  }

  if (
    normalizedPath.endsWith('.js') ||
    normalizedPath.endsWith('.mjs') ||
    normalizedPath.endsWith('.cjs')
  ) {
    return 'babel';
  }

  if (normalizedPath.endsWith('.json')) {
    return 'json';
  }

  if (normalizedPath.endsWith('.css')) {
    return 'css';
  }

  if (normalizedPath.endsWith('.scss')) {
    return 'scss';
  }

  if (normalizedPath.endsWith('.vue')) {
    return 'vue';
  }

  if (normalizedPath.endsWith('.svg') || normalizedPath.endsWith('.html')) {
    return 'html';
  }

  if (normalizedPath.endsWith('.md')) {
    return 'markdown';
  }

  if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')) {
    return 'yaml';
  }

  return null;
};

export const escapeHtml = (value: string) =>
  value
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');

export const formatPreviewContent = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  const parser = inferPrettierParser(sourcePath);

  if (!parser || typeof window === 'undefined') {
    return sourceContent;
  }

  try {
    const prettier = await import('prettier/standalone');

    if (parser === 'babel' || parser === 'babel-ts' || parser === 'json') {
      const [{ default: babelPlugin }, { default: estreePlugin }] =
        await Promise.all([
          import('prettier/plugins/babel'),
          import('prettier/plugins/estree'),
        ]);

      return await prettier.format(sourceContent, {
        parser,
        plugins: [babelPlugin, estreePlugin],
      });
    }

    if (parser === 'css' || parser === 'scss') {
      const { default: postcssPlugin } = await import(
        'prettier/plugins/postcss'
      );

      return await prettier.format(sourceContent, {
        parser,
        plugins: [postcssPlugin],
      });
    }

    if (parser === 'markdown') {
      const { default: markdownPlugin } = await import(
        'prettier/plugins/markdown'
      );

      return await prettier.format(sourceContent, {
        parser,
        plugins: [markdownPlugin],
      });
    }

    if (parser === 'yaml') {
      const { default: yamlPlugin } = await import('prettier/plugins/yaml');

      return await prettier.format(sourceContent, {
        parser,
        plugins: [yamlPlugin],
      });
    }

    const { default: htmlPlugin } = await import('prettier/plugins/html');

    return await prettier.format(sourceContent, {
      parser,
      plugins: [htmlPlugin],
    });
  } catch {
    return sourceContent;
  }
};

export const loadRemoteTextContent = async (
  sourceCandidates: Array<string | null | undefined>,
) => {
  const normalizedCandidates = sourceCandidates.filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  let lastError: Error | null = null;

  for (const sourceUrl of normalizedCandidates) {
    try {
      const response = await fetch(sourceUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw (
    lastError || new Error('Source asset is not available for this module.')
  );
};

export const highlightCodeContent = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const { codeToHtml } = await import('shiki');

    return await codeToHtml(sourceContent, {
      lang: inferSourceLanguage(sourcePath),
      themes: {
        dark: 'vitesse-dark',
        light: 'vitesse-light',
      },
    });
  } catch {
    return `<pre class="shiki site-debug-source-viewer__fallback"><code>${escapeHtml(sourceContent)}</code></pre>`;
  }
};
