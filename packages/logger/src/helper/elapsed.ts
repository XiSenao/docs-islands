import type { LoggerElapsedLogOptions } from '../types';

const readLoggerClockMs = (): number => {
  if (
    globalThis.performance &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }

  return Date.now();
};

export const createElapsedLogOptions = (
  startTimeMs: number,
  endTimeMs: number = readLoggerClockMs(),
): LoggerElapsedLogOptions => {
  const rawElapsedMs =
    Number.isFinite(startTimeMs) && Number.isFinite(endTimeMs)
      ? endTimeMs - startTimeMs
      : 0;

  return { elapsedTimeMs: Math.max(0, rawElapsedMs) };
};

export const formatElapsedTime = (elapsedTimeMs: number): string => {
  const elapsedMs =
    typeof elapsedTimeMs === 'number' && Number.isFinite(elapsedTimeMs)
      ? Math.max(0, elapsedTimeMs)
      : 0;

  return `${elapsedMs.toFixed(2)}ms`;
};
