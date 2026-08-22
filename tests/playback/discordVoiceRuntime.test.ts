import { describe, expect, test } from "bun:test";
import type { Track } from "../../src/music/track";
import { DiscordVoiceRuntime } from "../../src/playback/discordVoiceRuntime";
import { EmptyAudioStreamError } from "../../src/playback/voiceRuntime";

const track: Track = {
    id: "test:tracks:1",
    title: "Track",
    author: "Artist",
    duration: 120,
    url: "https://music.test/1",
    provider: "test",
    source: { providerId: "test", resourceId: "1" },
};

describe("DiscordVoiceRuntime", () => {
    test("reports a fetched stream that ends before producing audio", async () => {
        const voice = new DiscordVoiceRuntime();
        let idle = false;
        const failure = Promise.withResolvers<Error>();
        const player = voice.createPlayer({
            idle: () => {
                idle = true;
            },
            playing: () => {},
            error: failure.resolve,
        });

        await voice.play(
            player,
            { kind: "fetch", url: "data:audio/mpeg;base64," },
            track,
            new AbortController().signal,
        );
        const error = await Promise.race([
            failure.promise,
            Bun.sleep(2_000).then(() => {
                throw new Error("Playback failure was not reported");
            }),
        ]);

        expect(error.message).toBe(
            "Audio stream ended before producing audio.",
        );
        expect(error).toBeInstanceOf(EmptyAudioStreamError);
        expect(idle).toBe(false);
    });
});
