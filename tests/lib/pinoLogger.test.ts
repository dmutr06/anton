import { describe, expect, test } from "bun:test";
import type { DestinationStream } from "pino";
import { createPinoLogger } from "../../src/lib/pinoLogger";

function captureLogs(level: "debug" | "info" = "debug") {
    const lines: string[] = [];
    const destination: DestinationStream = {
        write(message) {
            lines.push(message);
        },
    };
    const logger = createPinoLogger({
        level,
        pretty: false,
        destination,
    });

    return { lines, logger };
}

describe("PinoLogger", () => {
    test("writes structured events with child context", () => {
        const { lines, logger } = captureLogs();

        logger
            .child({ component: "playback", guildId: "guild" })
            .info("playback.track_started", { trackId: "track" });

        const entry = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
        expect(entry.msg).toBe("playback.track_started");
        expect(entry.service).toBe("anton");
        expect(entry.component).toBe("playback");
        expect(entry.guildId).toBe("guild");
        expect(entry.trackId).toBe("track");
    });

    test("redacts credentials", () => {
        const { lines, logger } = captureLogs();

        logger.info("credentials.test", {
            token: "discord-secret",
            soundCloudClientId: "soundcloud-secret",
            request: {
                authorization: "Bearer secret",
                clientId: "nested-secret",
            },
        });

        const entry = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
        const request = entry.request as Record<string, unknown>;
        expect(entry.token).toBe("[Redacted]");
        expect(entry.soundCloudClientId).toBe("[Redacted]");
        expect(request.authorization).toBe("[Redacted]");
        expect(request.clientId).toBe("[Redacted]");
    });

    test("serializes errors", () => {
        const { lines, logger } = captureLogs();

        logger.error("playback.failed", new Error("broken"), {
            trackId: "track",
        });

        const entry = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
        const error = entry.err as Record<string, unknown>;
        expect(error.message).toBe("broken");
        expect(error.type).toBe("Error");
        expect(entry.trackId).toBe("track");
    });

    test("respects the configured level", () => {
        const { lines, logger } = captureLogs("info");

        logger.debug("debug.event");
        logger.info("info.event");

        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0] ?? "").msg).toBe("info.event");
    });
});
