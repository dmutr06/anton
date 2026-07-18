export type LogContext = Readonly<Record<string, unknown>>;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
    debug(event: string, context?: LogContext): void;
    info(event: string, context?: LogContext): void;
    warn(event: string, context?: LogContext): void;
    error(event: string, error: unknown, context?: LogContext): void;
    child(context: LogContext): Logger;
}
