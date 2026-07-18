import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../src/config";

describe("loadConfig", () => {
    test("loads the Discord token and registration flag", () => {
        expect(
            loadConfig(
                {
                    TOKEN: " token ",
                    SOUNDCLOUD_CLIENT_ID: " soundcloud-client ",
                },
                ["--register"],
            ),
        ).toEqual({
            discordToken: "token",
            soundCloudClientId: "soundcloud-client",
            registerCommands: true,
            maxPlaylistTracks: 100,
            maxQueueTracks: 200,
            logLevel: "info",
            logPretty: false,
        });
    });

    test("loads playback limits", () => {
        const config = loadConfig(
            {
                TOKEN: "token",
                SOUNDCLOUD_CLIENT_ID: "soundcloud-client",
                MAX_PLAYLIST_TRACKS: "25",
                MAX_QUEUE_TRACKS: "50",
                LOG_LEVEL: "debug",
                LOG_PRETTY: "true",
            },
            [],
        );

        expect(config.maxPlaylistTracks).toBe(25);
        expect(config.maxQueueTracks).toBe(50);
        expect(config.logLevel).toBe("debug");
        expect(config.logPretty).toBe(true);
    });

    test("rejects invalid logging configuration", () => {
        expect(() =>
            loadConfig(
                {
                    TOKEN: "token",
                    SOUNDCLOUD_CLIENT_ID: "soundcloud-client",
                    LOG_LEVEL: "verbose",
                },
                [],
            ),
        ).toThrow("LOG_LEVEL must be debug, info, warn, or error");

        expect(() =>
            loadConfig(
                {
                    TOKEN: "token",
                    SOUNDCLOUD_CLIENT_ID: "soundcloud-client",
                    LOG_PRETTY: "yes",
                },
                [],
            ),
        ).toThrow("LOG_PRETTY must be true or false");
    });

    test("rejects invalid playback limits", () => {
        expect(() =>
            loadConfig(
                {
                    TOKEN: "token",
                    SOUNDCLOUD_CLIENT_ID: "soundcloud-client",
                    MAX_QUEUE_TRACKS: "0",
                },
                [],
            ),
        ).toThrow("MAX_QUEUE_TRACKS must be a positive integer");
    });

    test("requires a Discord token", () => {
        expect(() => loadConfig({}, [])).toThrow(ConfigError);
    });

    test("requires a SoundCloud client ID", () => {
        expect(() => loadConfig({ TOKEN: "token" }, [])).toThrow(
            "SOUNDCLOUD_CLIENT_ID is required",
        );
    });
});
