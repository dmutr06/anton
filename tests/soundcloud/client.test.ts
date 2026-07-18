import { describe, expect, test } from "bun:test";
import {
    SoundCloudClient,
    type SoundCloudFetch,
} from "../../src/soundcloud/client";
import { SoundCloudRequestError } from "../../src/soundcloud/errors";

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
                url: "https://api-v2.soundcloud.com/media/123/hls",
                preset: "aac_160k",
                snipped: false,
                format: {
                    protocol: "hls",
                    mime_type: 'audio/mp4; codecs="mp4a.40.2"',
                },
            },
        ],
    },
};

describe("SoundCloudClient", () => {
    test("builds search requests and forwards cancellation", async () => {
        const controller = new AbortController();
        let requestedUrl: URL | undefined;
        let requestedSignal: AbortSignal | null | undefined;
        const fetcher: SoundCloudFetch = async (input, init) => {
            requestedUrl = new URL(input);
            requestedSignal = init?.signal;
            return Response.json({ collection: [rawTrack] });
        };
        const client = new SoundCloudClient({ clientId: "client-id" }, fetcher);

        const tracks = await client.search("artist & track", controller.signal);

        expect(tracks).toHaveLength(1);
        expect(requestedUrl?.pathname).toBe("/search/tracks");
        expect(requestedUrl?.searchParams.get("q")).toBe("artist & track");
        expect(requestedUrl?.searchParams.get("limit")).toBe("20");
        expect(requestedUrl?.searchParams.get("client_id")).toBe("client-id");
        expect(requestedSignal).toBe(controller.signal);
    });

    test("does not expose the client ID in request errors", async () => {
        const fetcher: SoundCloudFetch = async () =>
            new Response(null, { status: 401, statusText: "Unauthorized" });
        const client = new SoundCloudClient(
            { clientId: "secret-client-id" },
            fetcher,
        );

        const error = await client
            .search("track", new AbortController().signal)
            .catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(SoundCloudRequestError);
        expect(String(error)).not.toContain("secret-client-id");
    });

    test("resolves collections by URN", async () => {
        let requestedUrl: URL | undefined;
        const fetcher: SoundCloudFetch = async (input) => {
            requestedUrl = new URL(input);
            return Response.json([rawTrack]);
        };
        const client = new SoundCloudClient({ clientId: "client-id" }, fetcher);

        const tracks = await client.resolveUrns(
            ["soundcloud:tracks:123", "soundcloud:tracks:456"],
            new AbortController().signal,
        );

        expect(tracks).toHaveLength(1);
        expect(requestedUrl?.searchParams.get("urns")).toBe(
            "soundcloud:tracks:123,soundcloud:tracks:456",
        );
        expect(requestedUrl?.searchParams.has("ids")).toBe(false);
    });

    test("rejects transcoding endpoints outside the SoundCloud API", async () => {
        let requestCount = 0;
        const fetcher: SoundCloudFetch = async () => {
            requestCount += 1;
            return Response.json({});
        };
        const client = new SoundCloudClient({ clientId: "client-id" }, fetcher);

        const error = await client
            .resolveStreamUrl(
                "https://example.com/transcoding",
                new AbortController().signal,
            )
            .catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(Error);
        expect(requestCount).toBe(0);
    });

    test("loads trending tracks from numeric chart playlist IDs", async () => {
        const requestedPaths: string[] = [];
        const fetcher: SoundCloudFetch = async (input) => {
            const url = new URL(input);
            requestedPaths.push(url.pathname);

            if (url.pathname === "/charts/selections") {
                return Response.json({
                    collection: [
                        {
                            items: {
                                collection: [
                                    { id: 456, kind: "playlist" },
                                    { id: 789, kind: "playlist" },
                                ],
                            },
                        },
                    ],
                });
            }

            if (url.pathname === "/playlists/456") {
                return Response.json({
                    tracks: [
                        { urn: "soundcloud:tracks:123" },
                        { id: 999 },
                        null,
                    ],
                });
            }

            if (url.pathname === "/playlists/789") {
                return Response.json({
                    tracks: [{ urn: "soundcloud:tracks:124" }],
                });
            }

            return Response.json([
                rawTrack,
                { ...rawTrack, urn: "soundcloud:tracks:124" },
            ]);
        };
        const client = new SoundCloudClient({ clientId: "client-id" }, fetcher);

        const tracks = await client.getTrending(new AbortController().signal);

        expect(tracks).toHaveLength(2);
        expect(requestedPaths).toEqual([
            "/charts/selections",
            "/playlists/456",
            "/playlists/789",
            "/tracks",
        ]);
    });
});
