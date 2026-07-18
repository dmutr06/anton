import type { LogLevel } from "./lib/logger";

export type AppConfig = {
    discordToken: string;
    soundCloudClientId: string;
    spotify: SpotifyConfig | null;
    registerCommands: boolean;
    maxPlaylistTracks: number;
    maxQueueTracks: number;
    logLevel: LogLevel;
    logPretty: boolean;
};

export type SpotifyConfig = {
    clientId: string;
    clientSecret: string;
};

const DEFAULT_MAX_PLAYLIST_TRACKS = 100;
const DEFAULT_MAX_QUEUE_TRACKS = 200;

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConfigError";
    }
}

export function loadConfig(
    environment: Readonly<Record<string, string | undefined>> = process.env,
    args: readonly string[] = process.argv.slice(2),
): AppConfig {
    const discordToken = readRequired(environment, "TOKEN");
    const soundCloudClientId = readRequired(
        environment,
        "SOUNDCLOUD_CLIENT_ID",
    );

    return {
        discordToken,
        soundCloudClientId,
        spotify: readSpotifyConfig(environment),
        registerCommands: args.includes("--register"),
        maxPlaylistTracks: readPositiveInteger(
            environment,
            "MAX_PLAYLIST_TRACKS",
            DEFAULT_MAX_PLAYLIST_TRACKS,
        ),
        maxQueueTracks: readPositiveInteger(
            environment,
            "MAX_QUEUE_TRACKS",
            DEFAULT_MAX_QUEUE_TRACKS,
        ),
        logLevel: readLogLevel(environment),
        logPretty: readBoolean(environment, "LOG_PRETTY", false),
    };
}

function readSpotifyConfig(
    environment: Readonly<Record<string, string | undefined>>,
): SpotifyConfig | null {
    const clientId = environment.SPOTIFY_CLIENT_ID?.trim();
    const clientSecret = environment.SPOTIFY_CLIENT_SECRET?.trim();

    if (!clientId && !clientSecret) return null;
    if (!clientId || !clientSecret) {
        throw new ConfigError(
            "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be provided together",
        );
    }

    return { clientId, clientSecret };
}

function readLogLevel(
    environment: Readonly<Record<string, string | undefined>>,
): LogLevel {
    const value = environment.LOG_LEVEL?.trim().toLowerCase() ?? "info";

    if (
        value !== "debug" &&
        value !== "info" &&
        value !== "warn" &&
        value !== "error"
    ) {
        throw new ConfigError("LOG_LEVEL must be debug, info, warn, or error");
    }

    return value;
}

function readBoolean(
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
    defaultValue: boolean,
): boolean {
    const value = environment[name]?.trim().toLowerCase();
    if (!value) return defaultValue;
    if (value === "true") return true;
    if (value === "false") return false;

    throw new ConfigError(`${name} must be true or false`);
}

function readRequired(
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
): string {
    const value = environment[name]?.trim();

    if (!value) {
        throw new ConfigError(`${name} is required`);
    }

    return value;
}

function readPositiveInteger(
    environment: Readonly<Record<string, string | undefined>>,
    name: string,
    defaultValue: number,
): number {
    const value = environment[name]?.trim();
    if (!value) return defaultValue;

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new ConfigError(`${name} must be a positive integer`);
    }

    return parsed;
}
