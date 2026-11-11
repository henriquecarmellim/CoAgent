export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  [key: string]: unknown;
}

export interface LoggerOptions {
  name: string;
  minLevel?: LogLevel;
  json?: boolean;
}

export class Logger {
  private readonly name: string;
  private readonly minLevelSeverity: number;
  private readonly json: boolean;

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.minLevelSeverity = LEVEL_SEVERITY[options.minLevel ?? 'info'];
    this.json = options.json ?? (process.env['COAGENT_LOG_JSON'] === 'true');
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_SEVERITY[level] >= this.minLevelSeverity;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    if (this.json) {
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        logger: this.name,
        message,
        ...context,
      });
    }

    const contextStr = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${contextStr}`;
  }

  public debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  public warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  public error(message: string, error?: unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errContext: LogContext = { ...context };
      if (error instanceof Error) {
        errContext['errorName'] = error.name;
        errContext['errorMessage'] = error.message;
        errContext['stack'] = error.stack;
      } else if (error !== undefined) {
        errContext['errorRaw'] = error;
      }
      console.error(this.formatMessage('error', message, errContext));
    }
  }

  public child(childName: string): Logger {
    return new Logger({
      name: `${this.name}:${childName}`,
      minLevel: (Object.keys(LEVEL_SEVERITY) as LogLevel[]).find(
        (lvl) => LEVEL_SEVERITY[lvl] === this.minLevelSeverity
      ) ?? 'info',
      json: this.json,
    });
  }
}

export function createLogger(name: string, options?: Partial<LoggerOptions>): Logger {
  return new Logger({
    name,
    minLevel: options?.minLevel ?? (process.env['COAGENT_LOG_LEVEL'] as LogLevel) ?? 'info',
    json: options?.json,
  });
}
