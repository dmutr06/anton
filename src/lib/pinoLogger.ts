import pino, { type DestinationStream, type Logger as Pino } from "pino";
import pretty from "pino-pretty";
import type { LogContext, Logger, LogLevel } from "./logger";

const REDACTED_PATHS = [
    "token",
    "discordToken",
    "soundCloudClientId",
    "clientId",
    "clientSecret",
    "spotifyClientSecret",
    "authorization",
    "headers.authorization",
    "*.token",
    "*.clientId",
    "*.clientSecret",
    "*.authorization",
];

export type PinoLoggerOptions = {
    level: LogLevel;
    pretty: boolean;
    destination?: DestinationStream;
};

export function createPinoLogger(options: PinoLoggerOptions): Logger {
    const destination = options.pretty
        ? pretty({
              colorize: true,
              destination: options.destination,
              singleLine: true,
              translateTime: "SYS:standard",
          })
        : options.destination;
    const instance = pino(
        {
            base: { service: "anton" },
            level: options.level,
            redact: {
                paths: REDACTED_PATHS,
                censor: "[Redacted]",
            },
        },
        destination,
    );

    return new PinoLogger(instance);
}

class PinoLogger implements Logger {
    constructor(private readonly logger: Pino) {}

    debug(event: string, context?: LogContext): void {
        this.logger.debug(context, event);
    }

    info(event: string, context?: LogContext): void {
        this.logger.info(context, event);
    }

    warn(event: string, context?: LogContext): void {
        this.logger.warn(context, event);
    }

    error(event: string, error: unknown, context?: LogContext): void {
        this.logger.error({ ...context, err: error }, event);
    }

    child(context: LogContext): Logger {
        return new PinoLogger(this.logger.child(context));
    }
}
