import picocolors from 'picocolors';

const isColorSupported = Boolean(picocolors.isColorSupported);
const MAIN_NAME = '@docs-islands/vitepress';

let colors: typeof picocolors | null = null;
if (isColorSupported) {
  colors = picocolors;
}

const isBrowserRuntime =
  typeof window !== 'undefined' && typeof document !== 'undefined';
const isNodeRuntime =
  typeof process !== 'undefined' &&
  Boolean(process.versions && process.versions.node);
const isProductionEnv =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ===
      true) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production');

const BROWSER_STYLES = {
  main: 'color: #007bff; font-weight: bold;',
  group: 'color: #ff8c00;',
  dim: 'color: gray;',
  success: 'color: #28a745;',
  warn: 'color: #ffc107;',
  error: 'color: #dc3545; font-weight: bold;',
  debug: 'color: #6c757d;',
  default: '',
} as const;

class Logger {
  readonly #main: string;
  static readonly #groupMap = new Map<string, Logger>();
  #group = '';

  constructor(main: string) {
    this.#main = main;
  }

  static getLoggerByGroup(group: string): Logger {
    if (Logger.#groupMap.has(group)) {
      return Logger.#groupMap.get(group)!;
    }
    const logger = new Logger(MAIN_NAME);
    logger.setGroup(group);
    Logger.#groupMap.set(group, logger);
    return logger;
  }

  setGroup(group: string): this {
    this.#group = group;
    return this;
  }

  #log(
    level: 'log' | 'warn' | 'error' | 'debug',
    kind: 'info' | 'success' | 'warn' | 'error' | 'debug',
    ...parts: string[]
  ): void {
    // In browser production, suppress all logs.
    if (isBrowserRuntime && isProductionEnv) {
      return;
    }
    // Suppress non-critical logs in production environment.
    if (
      isProductionEnv &&
      (kind === 'info' || kind === 'success' || kind === 'debug')
    ) {
      return;
    }
    if (isNodeRuntime && isColorSupported && colors) {
      const logMain = colors.bold(colors.blueBright(this.#main));
      const group = this.#group
        ? colors.dim(`[`) + colors.yellowBright(this.#group) + colors.dim(`]`)
        : '';
      const splitter = this.#group ? colors.dim(' » ') : colors.dim(': ');

      const prefix = logMain + group + splitter;
      const message = parts.join(' ');

      console[level](`${prefix}${message}`);
    } else {
      const texts: string[] = [];
      const styles: string[] = [];

      texts.push(`%c${this.#main}`);
      styles.push(BROWSER_STYLES.main);

      if (this.#group) {
        texts.push(`%c[`);
        styles.push(BROWSER_STYLES.dim);
        texts.push(`%c${this.#group}`);
        styles.push(BROWSER_STYLES.group);
        texts.push(`%c]`);
        styles.push(BROWSER_STYLES.dim);
        texts.push(`%c » `);
        styles.push(BROWSER_STYLES.dim);
      } else {
        texts.push(`%c: `);
        styles.push(BROWSER_STYLES.dim);
      }

      texts.push(`%c${parts.join(' ')}`);
      switch (kind) {
        case 'success': {
          styles.push(BROWSER_STYLES.success);
          break;
        }
        case 'warn': {
          styles.push(BROWSER_STYLES.warn);
          break;
        }
        case 'error': {
          styles.push(BROWSER_STYLES.error);
          break;
        }
        case 'debug': {
          styles.push(BROWSER_STYLES.debug);
          break;
        }
        default: {
          styles.push(BROWSER_STYLES.default);
        }
      }

      console[level](texts.join(''), ...styles);
    }
  }

  public info(message: string): void {
    this.#log('log', 'info', message);
  }

  public success(message: string): void {
    let icon = '✓';
    let msg = message;
    if (isColorSupported && colors) {
      icon = colors.green('✓');
      msg = colors.green(message);
    }
    this.#log('log', 'success', icon, msg);
  }

  public warn(message: string): void {
    let icon = '⚠';
    let msg = message;
    if (isColorSupported && colors) {
      icon = colors.yellow('⚠');
      msg = colors.yellow(message);
    }
    this.#log('warn', 'warn', icon, msg);
  }

  public error(message: string): void {
    let icon = '✗';
    let msg = message;
    if (isColorSupported && colors) {
      icon = colors.red('✗');
      msg = colors.red(message);
    }
    this.#log('error', 'error', icon, msg);
  }

  public debug(message: string): void {
    const icon = isColorSupported && colors ? colors.gray('debug') : 'debug';
    const msg = isColorSupported && colors ? colors.gray(message) : message;
    this.#log('debug', 'debug', icon, msg);
  }
}

export default Logger;

interface LightGeneralLoggerOptions {
  immediate?: boolean;
}

export const lightGeneralLogger = (
  type: 'success' | 'info' | 'error' | 'warn' | 'debug',
  message: string,
  group?: string,
  options?: LightGeneralLoggerOptions,
): string | void => {
  const { immediate = true } = options || {};

  let icon = '✓';
  let iconColor = 'color: #13ef3e';
  let messageColor = 'color: #2ba245';
  switch (type) {
    case 'success': {
      icon = '✓';
      iconColor = 'color: #13ef3e';
      messageColor = 'color: #2ba245';
      break;
    }
    case 'error': {
      icon = '✗';
      iconColor = 'color:rgb(233, 63, 80)';
      messageColor = 'color: #dc3545';
      break;
    }
    case 'info': {
      icon = 'info';
      iconColor = 'color:rgb(149, 155, 160)';
      messageColor = 'color: #6c757d';
      break;
    }
    case 'warn': {
      icon = '⚠';
      iconColor = 'color:rgb(255, 248, 32)';
      messageColor = 'color: #ffc107';
      break;
    }
    case 'debug': {
      icon = 'debug';
      iconColor = 'color:rgb(149, 155, 160)';
      messageColor = 'color: #6c757d';
      break;
    }
  }
  const groupDisplayText = group || '';
  if (immediate) {
    console.log(
      `%c${MAIN_NAME}%c${groupDisplayText ? `[${groupDisplayText}]` : ''}%c: » %c${icon}%c ${message}`,
      'color: #2579d9; font-weight: bold;',
      'color: #e28a00; font-weight: bold;',
      'color: gray;',
      iconColor,
      messageColor,
    );
  }
  return `
    console.log(
      \`%c${MAIN_NAME}%c${groupDisplayText ? `[${groupDisplayText}]` : ''}%c: » %c${icon}%c ${message}\`,
      'color: #2579d9; font-weight: bold;',
      'color: #e28a00; font-weight: bold;', 
      'color: gray;',                      
      '${iconColor};',
      '${messageColor};'
    );
  `;
};
