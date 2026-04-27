import { formatElapsedTime } from '@docs-islands/logger/internal';
import type {
  CreateLoggerOptions,
  LoggerLogOptions,
} from '@docs-islands/logger/runtime';

export interface LightGeneralLoggerReturn {
  log: () => void;
  formatText: string;
}

const LIGHT_LOGGER_STYLES = {
  success: {
    icon: '✓',
    iconColor: 'color: #13ef3e',
    messageColor: 'color: #2ba245',
  },
  error: {
    icon: '✗',
    iconColor: 'color: rgb(233, 63, 80)',
    messageColor: 'color: #dc3545',
  },
  info: {
    icon: 'info',
    iconColor: 'color: rgb(149, 155, 160)',
    messageColor: 'color: #6c757d',
  },
  warn: {
    icon: '⚠',
    iconColor: 'color: rgb(255, 248, 32)',
    messageColor: 'color: #ffc107',
  },
  debug: {
    icon: 'debug',
    iconColor: 'color: rgb(149, 155, 160)',
    messageColor: 'color: #6c757d',
  },
} as const;

interface LoggerType {
  getLoggerByGroup: (group: string) => ScopeLogger;
}

interface ScopeLogger {
  info: (message: string, options?: LoggerLogOptions) => void;
  success: (message: string, options?: LoggerLogOptions) => void;
  warn: (message: string, options?: LoggerLogOptions) => void;
  error: (message: string, options?: LoggerLogOptions) => void;
  debug: (message: string, options?: LoggerLogOptions) => void;
}

const getFormatElapsedTime = (options?: LoggerLogOptions): string => {
  if (typeof options?.elapsedTimeMs === 'number') {
    return formatElapsedTime(options.elapsedTimeMs);
  }
  return '';
};

export function createLogger(options: CreateLoggerOptions): LoggerType {
  const logMain = options.main;
  return {
    getLoggerByGroup(group: string): ScopeLogger {
      return {
        info: (message: string, options?: LoggerLogOptions) => {
          const type = 'info';
          const config = LIGHT_LOGGER_STYLES[type];
          const groupText = group ? `[${group}]` : '';
          // eslint-disable-next-line no-console
          console.log(
            `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message} ${getFormatElapsedTime(options)}`,
            'color: #2579d9; font-weight: bold;',
            'color: #e28a00; font-weight: bold;',
            'color: gray;',
            config.iconColor,
            config.messageColor,
          );
        },
        success: (message: string, options?: LoggerLogOptions) => {
          const type = 'success';
          const config = LIGHT_LOGGER_STYLES[type];
          const groupText = group ? `[${group}]` : '';
          // eslint-disable-next-line no-console
          console.log(
            `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message} ${getFormatElapsedTime(options)}`,
            'color: #2579d9; font-weight: bold;',
            'color: #e28a00; font-weight: bold;',
            'color: gray;',
            config.iconColor,
            config.messageColor,
          );
        },
        warn: (message: string, options?: LoggerLogOptions) => {
          const type = 'warn';
          const config = LIGHT_LOGGER_STYLES[type];
          const groupText = group ? `[${group}]` : '';
          // eslint-disable-next-line no-console
          console.log(
            `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message} ${getFormatElapsedTime(options)}`,
            'color: #2579d9; font-weight: bold;',
            'color: #e28a00; font-weight: bold;',
            'color: gray;',
            config.iconColor,
            config.messageColor,
          );
        },
        error: (message: string, options?: LoggerLogOptions) => {
          const type = 'error';
          const config = LIGHT_LOGGER_STYLES[type];
          const groupText = group ? `[${group}]` : '';
          // eslint-disable-next-line no-console
          console.log(
            `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message} ${getFormatElapsedTime(options)}`,
            'color: #2579d9; font-weight: bold;',
            'color: #e28a00; font-weight: bold;',
            'color: gray;',
            config.iconColor,
            config.messageColor,
          );
        },
        debug: (message: string, options?: LoggerLogOptions) => {
          const type = 'debug';
          const config = LIGHT_LOGGER_STYLES[type];
          const groupText = group ? `[${group}]` : '';
          // eslint-disable-next-line no-console
          console.log(
            `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message} ${getFormatElapsedTime(options)}`,
            'color: #2579d9; font-weight: bold;',
            'color: #e28a00; font-weight: bold;',
            'color: gray;',
            config.iconColor,
            config.messageColor,
          );
        },
      };
    },
  };
}
