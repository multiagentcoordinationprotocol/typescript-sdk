/**
 * Structured logger for the MACP SDK.
 *
 * Parity with python-sdk's `macp_sdk._logging.logger` + `configure_logging()`:
 * production Node apps need controllable log levels (silent by default-ish,
 * opt-in verbose) and the ability to re-route to Pino / Winston / etc.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export type LogSink = (level: Exclude<LogLevel, 'silent'>, args: unknown[]) => void;

const defaultSink: LogSink = (level, args) => {
  const method = level === 'debug' || level === 'info' ? 'log' : level;
  // eslint-disable-next-line no-console
  (console[method as 'log' | 'warn' | 'error'] ?? console.log)('[macp-sdk]', ...args);
};

function envLevel(): LogLevel {
  const raw = typeof process !== 'undefined' ? process.env?.MACP_LOG_LEVEL?.toLowerCase() : undefined;
  if (raw && raw in LEVEL_ORDER) return raw as LogLevel;
  return 'warn';
}

const state = {
  level: envLevel(),
  sink: defaultSink as LogSink,
};

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVEL_ORDER[state.level] >= LEVEL_ORDER[level];
}

function emit(level: Exclude<LogLevel, 'silent'>, args: unknown[]): void {
  if (!shouldLog(level)) return;
  state.sink(level, args);
}

export const logger = {
  error: (...args: unknown[]): void => emit('error', args),
  warn: (...args: unknown[]): void => emit('warn', args),
  info: (...args: unknown[]): void => emit('info', args),
  debug: (...args: unknown[]): void => emit('debug', args),
};

export function configureLogging(options: { level?: LogLevel; sink?: LogSink }): void {
  if (options.level !== undefined) {
    if (!(options.level in LEVEL_ORDER)) {
      throw new Error(`configureLogging: unknown level "${options.level}"`);
    }
    state.level = options.level;
  }
  if (options.sink !== undefined) {
    state.sink = options.sink;
  }
}

/** Test-only: reset to env-derived level + default sink. */
export function _resetLoggingForTests(): void {
  state.level = envLevel();
  state.sink = defaultSink;
}
