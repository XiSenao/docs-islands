import colors from 'picocolors';
import type { PrintOptions } from '../src/types/utils';
import { ConsoleTheme, ConsoleThemeMap } from './console';

export const print = (text: string, options?: PrintOptions): void => {
  const { theme = ConsoleTheme.SUCCESS, bold = false } = options || {};
  const consoleThemeColor =
    ConsoleThemeMap[theme] || ConsoleThemeMap[ConsoleTheme.SUCCESS];
  const colorFunction = colors[consoleThemeColor];
  const renderContent =
    typeof colorFunction === 'function' ? colorFunction(text) : text;
  const boldContent = bold ? colors.bold(renderContent) : renderContent;
  console.log(boldContent);
};
