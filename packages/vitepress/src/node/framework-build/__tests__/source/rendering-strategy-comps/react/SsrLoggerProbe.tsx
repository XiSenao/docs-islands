import { createLogger } from '@docs-islands/vitepress/logger';
import type { CompProps } from '../type';

const logger = createLogger({
  main: '@acme/ssr-logger-probe',
}).getLoggerByGroup('userland.ssr-logger-probe');

logger.info('tree-shaking hidden ssr info');
logger.warn('tree-shaking visible ssr warning');

export default function SsrLoggerProbe(props: CompProps) {
  return (
    <div className="ssr-logger-probe">
      <strong>{props['component-name']}</strong>
    </div>
  );
}
