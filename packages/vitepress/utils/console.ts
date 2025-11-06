import type { Colors } from 'picocolors/types';

export const ConsoleTheme = {
  ERROR: 'red',
  SUCCESS: 'green',
  WARNING: 'yellow',
  INFO: 'blue',
  ERROR_LIGHT: 'redBright',
} as const;

export type ConsoleThemeValue =
  (typeof ConsoleTheme)[keyof typeof ConsoleTheme];

type ColorsKeys = keyof Colors;

export const ConsoleThemeMap: Record<ConsoleThemeValue, ColorsKeys> = {
  [ConsoleTheme.ERROR]: 'red',
  [ConsoleTheme.SUCCESS]: 'greenBright',
  [ConsoleTheme.WARNING]: 'yellow',
  [ConsoleTheme.INFO]: 'blue',
  [ConsoleTheme.ERROR_LIGHT]: 'redBright',
};

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}
