import { describe, expect, test } from "bun:test";
import { MusicService, PlayMusicError } from "../../src/music/play";
import type { Playlist } from "../../src/music/playlist";
import type {
    AudioSource,
    ResolvedMedia,
    SearchableMusicProvider,
    TrendingMusicProvider,
} from "../../src/music/provider";
import { MusicProviderRegistry } from "../../src/music/providerRegistry";
import type { Track } from "../../src/music/track";
import type {
    EnqueueTracksRequest,
    Playback,
} from "../../src/playback/playback";

const track: Track = {
    id: "test:tracks:1",
    title: "Track",
    author: "Artist",
    duration: 125,
    url: "https://music.test/track",
    provider: "test",
    source: {
        providerId: "test",
        resourceId: "source-1",
    },
};

class TestProvider implements SearchableMusicProvider, TrendingMusicProvider {
    readonly id = "test";

    supportsUrl(value: string): boolean {
        return value.startsWith("https://music.test/");
    }

    supportsIdentifier(value: string): boolean {
        return value.startsWith("test:tracks:");
    }

    async resolveUrl(): Promise<ResolvedMedia> {
        return { kind: "track", track };
    }

    async resolveIdentifier(): Promise<Track> {
        return track;
    }

    async search(): Promise<readonly Track[]> {
        return [track];
    }

    async getTrending(): Promise<readonly Track[]> {
        return [track];
    }

    async getAudioSource(): Promise<AudioSource> {
        return { kind: "url", url: "https://media.test/track.m3u8" };
    }
}

class TestPlayback implements Playback {
    readonly requests: EnqueueTracksRequest[] = [];

    async enqueue(request: EnqueueTracksRequest): Promise<void> {
        this.requests.push(request);
    }
}

describe("MusicService", () => {
    test("resolves and enqueues without knowing the concrete provider", async () => {
        const playback = new TestPlayback();
        const providers = new MusicProviderRegistry(
            [new TestProvider()],
            "test",
        );
        const music = new MusicService(providers, playback);

        const result = await music.enqueue(
            {
                query: "search query",
                guildId: "guild",
                voiceChannelId: "voice",
                textChannelId: "text",
                requestedByUserId: "user",
            },
            new AbortController().signal,
        );

        expect(result).toEqual({ kind: "track", track });
        expect(playback.requests).toEqual([
            {
                guildId: "guild",
                voiceChannelId: "voice",
                textChannelId: "text",
                requestedByUserId: "user",
                tracks: [track],
            },
        ]);
    });

    test("uses provider identifiers as autocomplete values", async () => {
        const providers = new MusicProviderRegistry(
            [new TestProvider()],
            "test",
        );
        const music = new MusicService(providers, new TestPlayback());

        const suggestions = await music.suggest(
            "Track",
            new AbortController().signal,
        );

        expect(suggestions).toEqual([
            {
                name: "Artist - Track (2:05)",
                value: "test:tracks:1",
            },
        ]);
    });

    test("uses trending tracks when autocomplete is empty", async () => {
        const providers = new MusicProviderRegistry(
            [new TestProvider()],
            "test",
        );
        const music = new MusicService(providers, new TestPlayback());

        const suggestions = await music.suggest(
            "",
            new AbortController().signal,
        );

        expect(suggestions[0]?.value).toBe("test:tracks:1");
    });

    test("reports empty search results", async () => {
        const provider = new TestProvider();
        provider.search = async () => [];
        const providers = new MusicProviderRegistry([provider], "test");
        const music = new MusicService(providers, new TestPlayback());

        const error = await music
            .enqueue(
                {
                    query: "missing",
                    guildId: "guild",
                    voiceChannelId: "voice",
                    textChannelId: "text",
                    requestedByUserId: "user",
                },
                new AbortController().signal,
            )
            .catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(PlayMusicError);
    });

    test("rejects playlists larger than the configured limit", async () => {
        const provider = new TestProvider();
        const playlist: Playlist = {
            title: "Large playlist",
            author: "Artist",
            url: "https://music.test/playlist",
            provider: "test",
            tracks: [track, { ...track, id: "test:tracks:2" }],
        };
        provider.resolveUrl = async () => ({ kind: "playlist", playlist });
        const providers = new MusicProviderRegistry([provider], "test");
        const playback = new TestPlayback();
        const music = new MusicService(providers, playback, {
            maxPlaylistTracks: 1,
        });

        const error = await music
            .enqueue(
                {
                    query: playlist.url,
                    guildId: "guild",
                    voiceChannelId: "voice",
                    textChannelId: "text",
                    requestedByUserId: "user",
                },
                new AbortController().signal,
            )
            .catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(PlayMusicError);
        expect((error as Error).message).toBe(
            "This playlist has 2 tracks, but the limit is 1.",
        );
        expect(playback.requests).toHaveLength(0);
    });
});
