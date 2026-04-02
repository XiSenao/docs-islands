import babelPlugin from 'prettier/plugins/babel';
import estreePlugin from 'prettier/plugins/estree';
import htmlPlugin from 'prettier/plugins/html';
import markdownPlugin from 'prettier/plugins/markdown';
import postcssPlugin from 'prettier/plugins/postcss';
import yamlPlugin from 'prettier/plugins/yaml';
import prettier from 'prettier/standalone';
import { codeToHtml } from 'shiki';
import { inferSourceLanguage } from './site-debug-shared';
import type {
  BackgroundCodePreviewRenderInput,
  BackgroundCodePreviewWorkerResponse,
} from './site-debug-source-preview';

interface BackgroundCodePreviewWorkerRequest
  extends BackgroundCodePreviewRenderInput {
  requestId: number;
}

const HTML_ESCAPE_PATTERN = /["&'<>]/g;
const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

const inferPrettierParser = (sourcePath?: string) => {
  const normalizedPath = sourcePath?.toLowerCase() || '';

  if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.ts')) {
    return 'babel-ts';
  }

  if (
    normalizedPath.endsWith('.jsx') ||
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

const escapeHtml = (value: string) =>
  value.replaceAll(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_REPLACEMENTS[character] || character,
  );

const formatPreviewContentInWorker = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  const parser = inferPrettierParser(sourcePath);

  if (!parser) {
    return sourceContent;
  }

  try {
    if (parser === 'babel' || parser === 'babel-ts' || parser === 'json') {
      return await prettier.format(sourceContent, {
        parser,
        plugins: [babelPlugin, estreePlugin],
      });
    }

    if (parser === 'css' || parser === 'scss') {
      return await prettier.format(sourceContent, {
        parser,
        plugins: [postcssPlugin],
      });
    }

    if (parser === 'markdown') {
      return await prettier.format(sourceContent, {
        parser,
        plugins: [markdownPlugin],
      });
    }

    if (parser === 'yaml') {
      return await prettier.format(sourceContent, {
        parser,
        plugins: [yamlPlugin],
      });
    }

    return await prettier.format(sourceContent, {
      parser,
      plugins: [htmlPlugin],
    });
  } catch {
    return sourceContent;
  }
};

const highlightCodeContentInWorker = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  try {
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

globalThis.addEventListener(
  'message',
  async (event: MessageEvent<BackgroundCodePreviewWorkerRequest>) => {
    const { requestId, sourceContent, sourcePath } = event.data;

    try {
      const formattedContent = await formatPreviewContentInWorker(
        sourceContent,
        sourcePath,
      );
      const previewHtml = await highlightCodeContentInWorker(
        formattedContent,
        sourcePath,
      );

      (
        globalThis as typeof globalThis & {
          postMessage: (message: BackgroundCodePreviewWorkerResponse) => void;
        }
      ).postMessage({
        formattedContent,
        previewHtml,
        requestId,
        success: true,
      });
    } catch (error) {
      (
        globalThis as typeof globalThis & {
          postMessage: (message: BackgroundCodePreviewWorkerResponse) => void;
        }
      ).postMessage({
        error: error instanceof Error ? error.message : String(error),
        requestId,
        success: false,
      });
    }
  },
);
