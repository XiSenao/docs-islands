const HTML_ESCAPE_PATTERN = /["&'<>]/g;
const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

const escapeHtml = (value: string) =>
  value.replaceAll(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_REPLACEMENTS[character] || character,
  );

export const __DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__ = true;

export const codeToHtml = async (sourceContent: string) =>
  `<pre class="shiki site-devtools-source-viewer__fallback"><code>${escapeHtml(sourceContent)}</code></pre>`;

export const codeToTokens = async (sourceContent: string) => ({
  bg: 'transparent',
  fg: 'currentColor',
  grammarState: undefined,
  tokens: sourceContent.split('\n').map((line) => [
    {
      content: line,
      htmlStyle: 'color:inherit',
    },
  ]),
});
