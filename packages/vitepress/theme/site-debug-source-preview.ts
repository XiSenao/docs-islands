import { inferSourceLanguage } from './site-debug-shared';

export interface RemoteTextContentProgress {
  loadedBytes: number;
  totalBytes?: number;
  url: string;
}

export interface LoadRemoteTextContentOptions {
  onProgress?: (progress: RemoteTextContentProgress) => void;
}

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

  if (!parser || globalThis.window === undefined) {
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
  sourceCandidates: (string | null | undefined)[],
  options: LoadRemoteTextContentOptions = {},
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

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader
        ? Number.parseInt(totalBytesHeader, 10)
        : Number.NaN;
      const resolvedTotalBytes =
        Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined;

      if (!response.body) {
        const content = await response.text();

        options.onProgress?.({
          loadedBytes: new TextEncoder().encode(content).byteLength,
          totalBytes: resolvedTotalBytes,
          url: sourceUrl,
        });

        return content;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value) {
          loadedBytes += value.byteLength;
          chunks.push(decoder.decode(value, { stream: true }));
          options.onProgress?.({
            loadedBytes,
            totalBytes: resolvedTotalBytes,
            url: sourceUrl,
          });
        }
      }

      const tail = decoder.decode();

      if (tail) {
        chunks.push(tail);
      }

      options.onProgress?.({
        loadedBytes,
        totalBytes: resolvedTotalBytes ?? loadedBytes,
        url: sourceUrl,
      });

      return chunks.join('');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw (
    lastError || new Error('Source asset is not available for this module.')
  );
};

export const loadRemoteTextContentByteSize = async (
  sourceCandidates: (string | null | undefined)[],
  options: LoadRemoteTextContentOptions = {},
) => {
  const normalizedCandidates = sourceCandidates.filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const sourceUrl of normalizedCandidates) {
    try {
      const response = await fetch(sourceUrl, { method: 'HEAD' });

      if (!response.ok) {
        continue;
      }

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader
        ? Number.parseInt(totalBytesHeader, 10)
        : Number.NaN;

      if (Number.isFinite(totalBytes) && totalBytes >= 0) {
        options.onProgress?.({
          loadedBytes: totalBytes,
          totalBytes,
          url: sourceUrl,
        });

        return totalBytes;
      }
    } catch {
      // Fall back to streaming the full content when HEAD is unavailable.
    }
  }

  const content = await loadRemoteTextContent(sourceCandidates, options);
  return new TextEncoder().encode(content).byteLength;
};

export const highlightCodeContent = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  if (globalThis.window === undefined) {
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
