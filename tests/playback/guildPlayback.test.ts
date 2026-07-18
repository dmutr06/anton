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
    readonly connection = {};
    private playerEvents: VoicePlayerEvents | null = null;

    createPlayer(events: VoicePlayerEvents): VoicePlayerHandle {
        this.playerEvents = events;
        return this.player;
    }

    connect(
        _channel: VoiceBasedChannel,
        _events: VoiceConnectionEvents,
    ): VoiceConnectionHandle {
        return this.connection;
    }

    async waitUntilReady(): Promise<void> {}

    subscribe(): void {}

    play(_player: VoicePlayerHandle, _sourceUrl: string, track: Track): void {
        this.played.push(track);
    }

    stop(): boolean {
        return false;
    }

    destroy(): void {}

    emitIdle(): void {
        this.playerEvents?.idle();
    }
}

const voiceChannel = {
    id: "voice",
    guildId: "guild",
} as VoiceBasedChannel;

function createTrack(id: number): Track {
    return {
        id: `test:tracks:${id}`,
        title: `Track ${id}`,
        author: "Artist",
        duration: 120,
        url: `https://music.test/${id}`,
        provider: "test",
        source: {
            providerId: "test",
            resourceId: String(id),
        },
    };
}

function createItem(id: number): PlaybackQueueItem {
    return {
        track: createTrack(id),
        voiceChannel,
        textChannelId: "text",
        requestedByUserId: "user",
    };
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function createPlayback(maxQueueTracks: number): {
    playback: GuildPlayback;
    voice: TestVoiceRuntime;
    destroyed: { value: boolean };
} {
    const voice = new TestVoiceRuntime();
    const destroyed = { value: false };
    const playback = new GuildPlayback({
        guildId: "guild",
        sources,
        voice,
        notifier: new TestNotifier(),
        logger,
        maxQueueTracks,
        onDestroy: () => {
            destroyed.value = true;
        },
    });

    return { playback, voice, destroyed };
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
});
