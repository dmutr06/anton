import { describe, expect, test } from "bun:test";
import { SpotifyClient, type SpotifyFetch } from "../../src/spotify/client";
import { SpotifyRequestError } from "../../src/spotify/errors";

const rawTrack = {
    id: "track-1",
    name: "Track",
    duration_ms: 125_000,
    external_urls: { spotify: "https://open.spotify.com/track/track1" },
    artists: [{ name: "Artist" }],
    external_ids: { isrc: "USAAA0000001" },
    album: {
        name: "Album",
        images: [{ url: "https://i.scdn.co/image/cover" }],
    },
};

const tokenResponse = {
    access_token: "access-token",
    expires_in: 3600,
};

describe("SpotifyClient", () => {
    test("authenticates once and forwards cancellation", async () => {
        let tokenRequests = 0;
        const apiRequests: Array<{
            authorization: string | null;
            signal: AbortSignal | null;
        }> = [];
        const fetcher: SpotifyFetch = async (input, init) => {
            const url = new URL(input);

            if (url.hostname === "accounts.spotify.com") {
                tokenRequests += 1;
                return Response.json(tokenResponse);
            }

            const headers = new Headers(init?.headers);
            apiRequests.push({
                authorization: headers.get("Authorization"),
                signal: init?.signal ?? null,
            });
            return Response.json(rawTrack);
        };
        const client = new SpotifyClient(
            { clientId: "client", clientSecret: "secret" },
            fetcher,
        );
        const controller = new AbortController();

        await client.getTrack("track-1", controller.signal);
        const track = await client.getTrack("track-1", controller.signal);

        expect(tokenRequests).toBe(1);
        expect(track.external_ids?.isrc).toBe("USAAA0000001");
        expect(apiRequests).toEqual([
            {
                authorization: "Bearer access-token",
                signal: controller.signal,
            },
            {
                authorization: "Bearer access-token",
                signal: controller.signal,
            },
        ]);
    });

    test("loads every playlist page", async () => {
        const requestedPaths: string[] = [];
        const fetcher: SpotifyFetch = async (input) => {
            const url = new URL(input);
            if (url.hostname === "accounts.spotify.com") {
                return Response.json(tokenResponse);
            }

            requestedPaths.push(`${url.pathname}${url.search}`);
            if (url.searchParams.get("offset") === "1") {
                return Response.json({
                    items: [
                        {
                            item: {
                                ...rawTrack,
                                id: "track-2",
                                name: "Second",
                            },
                        },
                    ],
                    next: null,
                });
            }

            return Response.json({
                name: "Playlist",
                owner: { display_name: "Owner" },
                external_urls: {
                    spotify: "https://open.spotify.com/playlist/playlist1",
                },
                images: [],
                items: {
                    items: [{ item: rawTrack }, { item: null }],
                    next: "https://api.spotify.com/v1/playlists/playlist1/items?offset=1",
                },
            });
        };
        const client = new SpotifyClient(
            { clientId: "client", clientSecret: "secret" },
            fetcher,
        );

        const playlist = await client.getPlaylist(
            "playlist1",
            new AbortController().signal,
        );

        expect(playlist.tracks.map((track) => track.id)).toEqual([
            "track-1",
            "track-2",
        ]);
        expect(requestedPaths).toEqual([
            "/v1/playlists/playlist1",
            "/v1/playlists/playlist1/items?offset=1",
        ]);
    });

    test("reports unavailable playlist items clearly", async () => {
        const fetcher: SpotifyFetch = async (input) => {
            const url = new URL(input);
            return url.hostname === "accounts.spotify.com"
                ? Response.json(tokenResponse)
                : Response.json({
                      name: "Playlist",
                      external_urls: {
                          spotify:
                              "https://open.spotify.com/playlist/playlist1",
                      },
                  });
        };
        const client = new SpotifyClient(
            { clientId: "client", clientSecret: "secret" },
            fetcher,
        );

        await expect(
            client.getPlaylist("playlist1", new AbortController().signal),
        ).rejects.toThrow(
            "Spotify playlist items are unavailable for this application",
        );
    });

    test("does not expose credentials in request errors", async () => {
        const fetcher: SpotifyFetch = async (input) => {
            const url = new URL(input);
            return url.hostname === "accounts.spotify.com"
                ? Response.json(tokenResponse)
                : new Response(null, {
                      status: 500,
                      statusText: "Internal Server Error",
                  });
        };
        const client = new SpotifyClient(
            {
                clientId: "secret-client",
                clientSecret: "secret-value",
            },
            fetcher,
        );

        const error = await client
            .getTrack("track-1", new AbortController().signal)
            .catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(SpotifyRequestError);
        expect(String(error)).not.toContain("secret-client");
        expect(String(error)).not.toContain("secret-value");
    });
});
