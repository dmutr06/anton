import { describe, expect, test } from "bun:test";
import {
    SoundCloudClient,
    type SoundCloudFetch,
} from "../../src/soundcloud/client";
import { SoundCloudProvider } from "../../src/soundcloud/provider";

const rawTrack = {
    kind: "track",
    urn: "soundcloud:tracks:123",
    title: "Track",
    permalink_url: "https://soundcloud.com/artist/track",
    duration: 125_000,
    policy: "ALLOW",
    artwork_url: null,
    user: {
        username: "Artist",
        avatar_url: "https://i1.sndcdn.com/avatars-test.jpg",
    },
    media: {
        transcodings: [
            {
                url: "https://api-v2.soundcloud.com/media/123/aac-96",
                preset: "aac_96k",
                snipped: false,
                format: { protocol: "hls" },
            },
            {
                url: "https://api-v2.soundcloud.com/media/123/progressive",
                preset: "mp3_0_1",
                snipped: false,
                format: { protocol: "progressive" },
            },
            {
                url: "https://api-v2.soundcloud.com/media/123/aac-160",
                preset: "aac_160k",
                snipped: false,
                format: { protocol: "hls" },
            },
        ],
    },
};

describe("SoundCloudProvider", () => {
    test("recognizes SoundCloud URLs without trusting lookalike hosts", () => {
        const client = new SoundCloudClient(
            { clientId: "client-id" },
            async () => Response.json({}),
        );
        const provider = new SoundCloudProvider(client);

        expect(provider.supportsUrl("soundcloud.com/artist/track")).toBe(true);
        expect(provider.supportsUrl("https://on.soundcloud.com/example")).toBe(
            true,
        );
        expect(
            provider.supportsUrl("https://soundcloud.com.attacker.test/track"),
        ).toBe(false);
        expect(provider.supportsUrl("https://soundcloud.com")).toBe(false);
        expect(provider.supportsIdentifier("soundcloud:tracks:123")).toBe(true);
        expect(provider.supportsIdentifier("123")).toBe(false);
    });

    test("resolves a track into the shared music model", async () => {
        let requestedUrl: URL | undefined;
        const fetcher: SoundCloudFetch = async (input) => {
            requestedUrl = new URL(input);
            return Response.json(rawTrack);
        };
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const resolved = await provider.resolveUrl(
            "soundcloud.com/artist/track",
            new AbortController().signal,
        );

        expect(requestedUrl?.pathname).toBe("/resolve");
        expect(requestedUrl?.searchParams.get("url")).toBe(
            "https://soundcloud.com/artist/track",
        );
        expect(resolved).toEqual({
            kind: "track",
            track: {
                id: "soundcloud:tracks:123",
                title: "Track",
                author: "Artist",
                duration: 125,
                url: "https://soundcloud.com/artist/track",
                thumbnail: "https://i1.sndcdn.com/avatars-test.jpg",
                provider: "soundcloud",
                source: {
                    providerId: "soundcloud",
                    resourceId:
                        "https://api-v2.soundcloud.com/media/123/aac-160",
                },
            },
        });
    });

    test("resolves the selected transcoding to an HLS audio source", async () => {
        let requestedUrl: URL | undefined;
        const fetcher: SoundCloudFetch = async (input) => {
            requestedUrl = new URL(input);
            return Response.json({
                url: "https://playback.media-streaming.soundcloud.cloud/123/playlist.m3u8",
            });
        };
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const source = await provider.getAudioSource(
            {
                id: "soundcloud:tracks:123",
                title: "Track",
                author: "Artist",
                duration: 125,
                url: "https://soundcloud.com/artist/track",
                provider: "soundcloud",
                source: {
                    providerId: "soundcloud",
                    resourceId:
                        "https://api-v2.soundcloud.com/media/123/aac-160",
                },
            },
            new AbortController().signal,
        );

        expect(requestedUrl?.searchParams.get("client_id")).toBe("client-id");
        expect(source).toEqual({
            kind: "url",
            url: "https://playback.media-streaming.soundcloud.cloud/123/playlist.m3u8",
        });
    });

    test("uses the 96k AAC stream when 160k is unavailable", async () => {
        const fetcher: SoundCloudFetch = async () =>
            Response.json({
                ...rawTrack,
                media: {
                    transcodings: [rawTrack.media.transcodings[0]],
                },
            });
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const resolved = await provider.resolveIdentifier(
            "soundcloud:tracks:123",
            new AbortController().signal,
        );

        expect(resolved?.source.resourceId).toBe(
            "https://api-v2.soundcloud.com/media/123/aac-96",
        );
    });

    test("uses HLS MP3 when AAC is unavailable", async () => {
        const fetcher: SoundCloudFetch = async () =>
            Response.json({
                ...rawTrack,
                media: {
                    transcodings: [
                        {
                            url: "https://api-v2.soundcloud.com/media/123/hls-mp3",
                            preset: "mp3_1_0",
                            snipped: false,
                            format: { protocol: "hls" },
                        },
                        {
                            url: "https://api-v2.soundcloud.com/media/123/progressive",
                            preset: "mp3_1_0",
                            snipped: false,
                            format: { protocol: "progressive" },
                        },
                    ],
                },
            });
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const resolved = await provider.resolveIdentifier(
            "soundcloud:tracks:123",
            new AbortController().signal,
        );

        expect(resolved?.source.resourceId).toBe(
            "https://api-v2.soundcloud.com/media/123/hls-mp3",
        );
    });

    test("filters snipped transcodings", async () => {
        const fetcher: SoundCloudFetch = async () =>
            Response.json({
                ...rawTrack,
                media: {
                    transcodings: rawTrack.media.transcodings.map(
                        (transcoding) => ({ ...transcoding, snipped: true }),
                    ),
                },
            });
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const resolved = await provider.resolveIdentifier(
            "soundcloud:tracks:123",
            new AbortController().signal,
        );

        expect(resolved).toBeNull();
    });

    test("filters blocked policies", async () => {
        for (const policy of ["BLOCK", "BLOCKED", "blocked"]) {
            const fetcher: SoundCloudFetch = async () =>
                Response.json({ ...rawTrack, policy });
            const provider = new SoundCloudProvider(
                new SoundCloudClient({ clientId: "client-id" }, fetcher),
            );

            const resolved = await provider.resolveIdentifier(
                "soundcloud:tracks:123",
                new AbortController().signal,
            );

            expect(resolved).toBeNull();
        }
    });

    test("maps publisher metadata for cross-provider matching", async () => {
        const fetcher: SoundCloudFetch = async () =>
            Response.json({
                ...rawTrack,
                publisher_metadata: {
                    artist: "Гражданская Оборона",
                    album_title: "Русское поле экспериментов",
                    isrc: "RUAAA0000001",
                    release_title: "Чужое",
                },
            });
        const provider = new SoundCloudProvider(
            new SoundCloudClient({ clientId: "client-id" }, fetcher),
        );

        const track = await provider.resolveIdentifier(
            "soundcloud:tracks:123",
            new AbortController().signal,
        );

        expect(track?.match).toEqual({
            title: "Чужое",
            artist: "Гражданская Оборона",
            album: "Русское поле экспериментов",
            isrc: "RUAAA0000001",
        });
    });
});
