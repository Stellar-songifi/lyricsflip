import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context';
import { redact, redactString } from './redact';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
const LEVEL_NAMES: Record<LogLevel, string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'verbose',
};

/**
 * The application's single logger. Nest's own `Logger` instances route here
 * once it is installed with `app.useLogger`, so services keep using
 * `new Logger(MyService.name)`.
 *
 * Production (`NODE_ENV=production`) writes one JSON object per line; other
 * environments write a readable line. Every entry carries the current
 * request id when there is one, and all metadata passes through `redact`.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly json: boolean;
  private readonly maxLevel: number;

  constructor(options: { json?: boolean; level?: string } = {}) {
    this.json = options.json ?? process.env.NODE_ENV === 'production';
    const level = (options.level ?? process.env.LOG_LEVEL ?? 'log').toLowerCase();
    const index = LEVELS.indexOf((level === 'info' ? 'log' : level) as LogLevel);
    this.maxLevel = index === -1 ? LEVELS.indexOf('log') : index;
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('log', message, params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]) {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]) {
    this.write('fatal', message, params);
  }

  /** Writes a structured entry; used by the access log middleware. */
  info(message: string, fields: Record<string, unknown>, context?: string) {
    this.emit('log', message, context, undefined, fields);
  }

  private write(level: LogLevel, message: unknown, params: unknown[]) {
    // Nest calls `(message, context)` and `error(message, stack, context)`.
    const args = [...params];
    const context = typeof args[args.length - 1] === 'string' ? (args.pop() as string) : undefined;
    const stack =
      level === 'error' && typeof args[0] === 'string' && args[0].includes('\n')
        ? (args.shift() as string)
        : undefined;
    const fields = args.length ? { meta: args.length === 1 ? args[0] : args } : undefined;

    if (typeof message === 'object' && message !== null && !(message instanceof Error)) {
      this.emit(level, '', context, stack, { ...(message as object), ...fields });
    } else if (message instanceof Error) {
      this.emit(level, message.message, context, stack ?? message.stack, fields);
    } else {
      this.emit(level, String(message), context, stack, fields);
    }
  }

  private emit(
    level: LogLevel,
    message: string,
    context: string | undefined,
    stack: string | undefined,
    fields: Record<string, unknown> | undefined,
  ) {
    const rank = level === 'fatal' ? 0 : LEVELS.indexOf(level);
    if (rank > this.maxLevel) return;

    const entry = {
      time: new Date().toISOString(),
      level: LEVEL_NAMES[level],
      ...(context && { context }),
      ...(currentRequestId() && { requestId: currentRequestId() }),
      msg: redactString(message),
      ...(fields && (redact(fields) as object)),
      ...(stack && { stack }),
    };

    const stream = rank <= 1 ? process.stderr : process.stdout;
    stream.write(this.json ? `${JSON.stringify(entry)}\n` : this.pretty(entry));
  }

  private pretty(entry: Record<string, unknown>): string {
    const { time, level, context, requestId, msg, stack, ...rest } = entry;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    const ctx = context ? ` [${context}]` : '';
    const rid = requestId ? ` (${requestId})` : '';
    const trace = stack ? `\n${stack}` : '';
    return `${time} ${String(level).toUpperCase().padEnd(7)}${ctx}${rid} ${msg}${extra}${trace}\n`;
  }
}
