import { describe, expect, test } from "bun:test";
import type { VoiceBasedChannel } from "discord.js";
import type { Logger } from "../../src/lib/logger";
import type { AudioSourceResolver } from "../../src/music/provider";
import type { Track } from "../../src/music/track";
import {
    GuildPlayback,
    type PlaybackQueueItem,
} from "../../src/playback/guildPlayback";
import type { PlaybackNotifier } from "../../src/playback/playbackNotifier";
import type {
    VoiceConnectionEvents,
    VoiceConnectionHandle,
    VoicePlayerEvents,
    VoicePlayerHandle,
    VoiceRuntime,
} from "../../src/playback/voiceRuntime";
import { EmptyAudioStreamError } from "../../src/playback/voiceRuntime";

const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child() {
        return this;
    },
};

const sources: AudioSourceResolver = {
    async getAudioSource(track) {
        return { kind: "url", url: `https://media.test/${track.id}` };
    },
};

class TestNotifier implements PlaybackNotifier {
    readonly failed: Track[] = [];

    async trackFailed(_textChannelId: string, track: Track): Promise<void> {
        this.failed.push(track);
    }
}

class TestVoiceRuntime implements VoiceRuntime {
    readonly played: Track[] = [];
    readonly player = {};
    readonly connections: object[] = [];
    readonly destroyedConnections: object[] = [];
    readonly connectionEvents: VoiceConnectionEvents[] = [];
    paused = false;
    waitFailures = 0;
    private playerEvents: VoicePlayerEvents | null = null;

    createPlayer(events: VoicePlayerEvents): VoicePlayerHandle {
        this.playerEvents = events;
        return this.player;
    }

    connect(
        _channel: VoiceBasedChannel,
        events: VoiceConnectionEvents,
    ): VoiceConnectionHandle {
        const connection = {};
        this.connections.push(connection);
        this.connectionEvents.push(events);
        return connection;
    }

    async waitUntilReady(): Promise<void> {
        if (this.waitFailures > 0) {
            this.waitFailures--;
            throw new Error("Connection failed");
        }
    }

    subscribe(): void {}

    async play(
        _player: VoicePlayerHandle,
        _source: import("../../src/music/provider").AudioSource,
        track: Track,
    ): Promise<void> {
        this.played.push(track);
        this.playerEvents?.playing();
    }

    pause(): boolean {
        if (this.paused) return false;
        this.paused = true;
        return true;
    }

    resume(): boolean {
        if (!this.paused) return false;
        this.paused = false;
        return true;
    }

    stop(): boolean {
        this.paused = false;
        return false;
    }

    destroy(connection: VoiceConnectionHandle): void {
        this.destroyedConnections.push(connection);
    }

    emitIdle(): void {
        this.playerEvents?.idle();
    }

    emitError(error = new Error("Player failed")): void {
        this.playerEvents?.error(error);
    }

    emitDisconnected(): void {
        this.connectionEvents.at(-1)?.disconnected();
    }
}

const voiceChannel = {
    id: "voice",
    guildId: "guild",
} as VoiceBasedChannel;

function createTrack(id: number, isLive = false): Track {
    return {
        id: `test:tracks:${id}`,
        title: `Track ${id}`,
        author: "Artist",
        duration: 120,
        ...(isLive ? { isLive: true } : {}),
        url: `https://music.test/${id}`,
        provider: "test",
        source: {
            providerId: "test",
            resourceId: String(id),
        },
    };
}

function createItem(id: number, isLive = false): PlaybackQueueItem {
    return {
        track: createTrack(id, isLive),
        voiceChannel,
        textChannelId: "text",
        requestedByUserId: "user",
    };
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function createPlayback(
    maxQueueTracks: number,
    sourceResolver: AudioSourceResolver = sources,
): {
    playback: GuildPlayback;
    voice: TestVoiceRuntime;
    notifier: TestNotifier;
    destroyed: { value: boolean };
} {
    const voice = new TestVoiceRuntime();
    const notifier = new TestNotifier();
    const destroyed = { value: false };
    const playback = new GuildPlayback({
        guildId: "guild",
        sources: sourceResolver,
        voice,
        notifier,
        logger,
        maxQueueTracks,
        onDestroy: () => {
            destroyed.value = true;
        },
    });

    return { playback, voice, notifier, destroyed };
}

describe("GuildPlayback", () => {
    test("plays queued tracks in order", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2)]);
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
        expect(playback.getQueue().upcoming).toHaveLength(1);

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:2",
        ]);
    });

    test("destroys the session after the queue finishes", async () => {
        const { playback, voice, destroyed } = createPlayback(10);

        playback.enqueue([createItem(1)]);
        await settle();
        voice.emitIdle();
        await settle();

        expect(destroyed.value).toBe(true);
    });

    test("rejects tracks above the guild queue limit", () => {
        const { playback } = createPlayback(2);

        playback.enqueue([createItem(1), createItem(2)]);

        expect(() => playback.enqueue([createItem(3)])).toThrow(
            "The queue can hold at most 2 tracks.",
        );
    });

    test("pauses and resumes the current track", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1)]);
        await settle();

        expect(playback.pause("voice")).toBe("paused");
        expect(voice.paused).toBe(true);
        expect(playback.pause("voice")).toBe("already_paused");

        expect(playback.resume("voice")).toBe("resumed");
        expect(voice.paused).toBe(false);
        expect(playback.resume("voice")).toBe("already_playing");
    });

    test("keeps a pause requested while a track is loading", async () => {
        let release!: () => void;
        const delayedSources: AudioSourceResolver = {
            async getAudioSource(track) {
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
                return { kind: "url", url: `https://media.test/${track.id}` };
            },
        };
        const { playback, voice } = createPlayback(10, delayedSources);

        playback.enqueue([createItem(1)]);
        expect(playback.pause("voice")).toBe("paused");
        await settle();
        release();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
        expect(voice.paused).toBe(true);
    });

    test("clears upcoming tracks without stopping the current track", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2), createItem(3)]);
        await settle();

        expect(playback.clear("voice")).toBe(2);
        expect(playback.getQueue()).toMatchObject({
            current: { title: "Track 1" },
            upcoming: [],
        });
        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
    });

    test("rejects controls from another voice channel", async () => {
        const { playback } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2)]);
        await settle();

        expect(() => playback.pause("other-voice")).toThrow(
            "You must be in the same voice channel as the bot.",
        );
        expect(() => playback.resume("other-voice")).toThrow(
            "You must be in the same voice channel as the bot.",
        );
        expect(() => playback.clear("other-voice")).toThrow(
            "You must be in the same voice channel as the bot.",
        );
        expect(() => playback.setLoopMode("other-voice", "queue")).toThrow(
            "You must be in the same voice channel as the bot.",
        );
    });

    test("repeats the current track without changing the upcoming queue", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2)]);
        await settle();
        playback.setLoopMode("voice", "track");

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
        ]);
        expect(playback.getQueue()).toMatchObject({
            upcoming: [{ title: "Track 2" }],
            loopMode: "track",
        });

        playback.skip("voice");
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
            "test:tracks:2",
        ]);
    });

    test("loops a stable queue cycle with a cursor", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2), createItem(3)]);
        await settle();
        playback.setLoopMode("voice", "queue");

        voice.emitIdle();
        await settle();
        expect(
            playback.getQueue().upcoming.map((track) => track.title),
        ).toEqual(["Track 3"]);

        voice.emitIdle();
        await settle();
        expect(playback.getQueue().upcoming).toEqual([]);

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:2",
            "test:tracks:3",
            "test:tracks:1",
        ]);
        expect(playback.getQueue()).toMatchObject({
            upcoming: [{ title: "Track 2" }, { title: "Track 3" }],
            loopMode: "queue",
        });
    });

    test("adds a new track to an active single-track queue loop", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1)]);
        await settle();
        playback.setLoopMode("voice", "queue");

        voice.emitIdle();
        await settle();
        playback.enqueue([createItem(2)]);

        expect(playback.getQueue()).toMatchObject({
            current: { title: "Track 1" },
            upcoming: [{ title: "Track 2" }],
            loopMode: "queue",
        });

        voice.emitIdle();
        await settle();
        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
            "test:tracks:2",
            "test:tracks:1",
        ]);
    });

    test("keeps a newly queued track pending during track loop", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1)]);
        await settle();
        playback.setLoopMode("voice", "track");

        voice.emitIdle();
        await settle();
        playback.enqueue([createItem(2)]);
        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
            "test:tracks:1",
        ]);
        expect(playback.getQueue()).toMatchObject({
            upcoming: [{ title: "Track 2" }],
            loopMode: "track",
        });
    });

    test("reconnects live tracks after idle without enabling loop mode", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1, true), createItem(2)]);
        await settle();
        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
        ]);
        expect(playback.getQueue().loopMode).toBe("off");

        playback.skip("voice");
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
            "test:tracks:2",
        ]);
    });

    test("reconnects live tracks after player errors", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1, true)]);
        await settle();
        voice.emitError();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
        ]);
    });

    test("reports an empty live stream without retrying forever", async () => {
        const { playback, voice, notifier, destroyed } = createPlayback(10);

        playback.enqueue([createItem(1, true)]);
        await settle();
        voice.emitError(new EmptyAudioStreamError());
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
        expect(notifier.failed.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
        expect(destroyed.value).toBe(true);
    });

    test("skips failed non-live tracks in a queue loop", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2)]);
        playback.setLoopMode("voice", "queue");
        await settle();

        voice.emitError();
        await settle();
        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:2",
        ]);

        voice.emitIdle();
        await settle();
        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:2",
            "test:tracks:2",
        ]);
    });

    test("reconnects after an existing voice connection fails", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2), createItem(3)]);
        await settle();
        voice.waitFailures = 1;
        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:3",
        ]);
        expect(voice.connections).toHaveLength(2);
        expect(voice.destroyedConnections).toHaveLength(1);
    });

    test("destroys and reports after an unrecoverable voice disconnect", async () => {
        const { playback, voice, notifier, destroyed } = createPlayback(10);

        playback.enqueue([createItem(1)]);
        await settle();
        voice.emitDisconnected();
        await settle();

        expect(destroyed.value).toBe(true);
        expect(notifier.failed.map((track) => track.id)).toEqual([
            "test:tracks:1",
        ]);
        expect(voice.destroyedConnections).toHaveLength(1);
    });

    test("disabling queue loop keeps only the remaining current cycle", async () => {
        const { playback, voice, destroyed } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2), createItem(3)]);
        await settle();
        playback.setLoopMode("voice", "queue");

        voice.emitIdle();
        await settle();
        playback.setLoopMode("voice", "off");

        expect(
            playback.getQueue().upcoming.map((track) => track.title),
        ).toEqual(["Track 3"]);

        voice.emitIdle();
        await settle();
        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:2",
            "test:tracks:3",
        ]);
        expect(destroyed.value).toBe(true);
    });

    test("clearing a queue loop keeps only the current track", async () => {
        const { playback, voice } = createPlayback(10);

        playback.enqueue([createItem(1), createItem(2), createItem(3)]);
        await settle();
        playback.setLoopMode("voice", "queue");

        expect(playback.clear("voice")).toBe(2);
        expect(playback.getQueue().upcoming).toEqual([]);

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:1",
            "test:tracks:1",
        ]);
    });

    test("removes failed tracks from a queue loop cycle", async () => {
        const failingSources: AudioSourceResolver = {
            async getAudioSource(track) {
                if (track.id === "test:tracks:1") {
                    throw new Error("Source failed");
                }
                return { kind: "url", url: `https://media.test/${track.id}` };
            },
        };
        const { playback, voice } = createPlayback(10, failingSources);

        playback.enqueue([createItem(1), createItem(2)]);
        playback.setLoopMode("voice", "queue");
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:2",
        ]);

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:2",
            "test:tracks:2",
        ]);
    });

    test("keeps a skipped loading track in the next queue loop cycle", async () => {
        let firstAttempt = true;
        const delayedSources: AudioSourceResolver = {
            async getAudioSource(track, signal) {
                if (track.id === "test:tracks:1" && firstAttempt) {
                    firstAttempt = false;
                    await new Promise<void>((_resolve, reject) => {
                        signal.addEventListener(
                            "abort",
                            () => reject(signal.reason),
                            { once: true },
                        );
                    });
                }
                return { kind: "url", url: `https://media.test/${track.id}` };
            },
        };
        const { playback, voice } = createPlayback(10, delayedSources);

        playback.enqueue([createItem(1), createItem(2)]);
        playback.setLoopMode("voice", "queue");
        await settle();
        playback.skip("voice");
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:2",
        ]);

        voice.emitIdle();
        await settle();

        expect(voice.played.map((track) => track.id)).toEqual([
            "test:tracks:2",
            "test:tracks:1",
        ]);
    });
});
