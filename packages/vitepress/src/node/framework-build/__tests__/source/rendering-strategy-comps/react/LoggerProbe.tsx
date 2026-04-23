import { createLogger } from '@docs-islands/vitepress/logger';
import type { CompProps } from '../type';

const logger = createLogger({ main: '@acme/logger-probe' }).getLoggerByGroup(
  'userland.logger-probe',
);

logger.info('tree-shaking hidden browser info');
logger.warn('tree-shaking visible browser warning');

export default function LoggerProbe(props: CompProps) {
  return (
    <div className="logger-probe">
      <strong>{props['component-name']}</strong>
    </div>
  );
}
