import { describe, expect, test } from "bun:test";
import type { AudioSourceResolver } from "../../src/music/provider";
import type { Track } from "../../src/music/track";
import type { SpotifyCatalogClient } from "../../src/spotify/client";
import { SpotifyProvider } from "../../src/spotify/provider";
import type {
    SpotifyAlbumData,
    SpotifyPlaylistData,
    SpotifyTrackData,
} from "../../src/spotify/schemas";

const spotifyTrack: SpotifyTrackData = {
    id: "track1",
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

class TestSpotifyClient implements SpotifyCatalogClient {
    async getTrack(): Promise<SpotifyTrackData> {
        return spotifyTrack;
    }

    async getAlbum(): Promise<SpotifyAlbumData> {
        return {
            name: "Album",
            artists: spotifyTrack.artists,
            external_urls: {
                spotify: "https://open.spotify.com/album/album1",
            },
            images: [{ url: "https://i.scdn.co/image/album" }],
            tracks: [{ ...spotifyTrack, album: undefined }],
        };
    }

    async getPlaylist(): Promise<SpotifyPlaylistData> {
        return {
            name: "Playlist",
            owner: { display_name: "Owner" },
            external_urls: {
                spotify: "https://open.spotify.com/playlist/playlist1",
            },
            images: [],
            tracks: [spotifyTrack],
        };
    }
}

class TestSources implements AudioSourceResolver {
    readonly tracks: Track[] = [];

    async getAudioSource(track: Track) {
        this.tracks.push(track);
        return { kind: "url" as const, url: "https://media.test/track.m3u8" };
    }
}

describe("SpotifyProvider", () => {
    test("recognizes Spotify URLs and identifiers safely", () => {
        const provider = new SpotifyProvider(
            new TestSpotifyClient(),
            new TestSources(),
        );

        expect(provider.supportsUrl("open.spotify.com/track/track1")).toBe(
            true,
        );
        expect(
            provider.supportsUrl(
                "https://open.spotify.com/intl-de/album/album1?si=value",
            ),
        ).toBe(true);
        expect(
            provider.supportsUrl(
                "https://open.spotify.com.attacker.test/track/track1",
            ),
        ).toBe(false);
        expect(provider.supportsIdentifier("spotify:track:track1")).toBe(true);
    });

    test("maps tracks and defers playable source matching", async () => {
        const sources = new TestSources();
        const provider = new SpotifyProvider(new TestSpotifyClient(), sources);

        const resolved = await provider.resolveUrl(
            "https://open.spotify.com/track/track1",
            new AbortController().signal,
        );

        expect(resolved).toEqual({
            kind: "track",
            track: {
                id: "spotify:track:track1",
                title: "Track",
                author: "Artist",
                duration: 125,
                url: "https://open.spotify.com/track/track1",
                thumbnail: "https://i.scdn.co/image/cover",
                provider: "spotify",
                match: {
                    album: "Album",
                    isrc: "USAAA0000001",
                },
                source: {
                    providerId: "spotify",
                    resourceId: "track1",
                },
            },
        });
        expect(sources.tracks).toHaveLength(0);

        if (!resolved || resolved.kind !== "track") {
            throw new Error("Expected a track");
        }
        await provider.getAudioSource(
            resolved.track,
            new AbortController().signal,
        );
        expect(sources.tracks).toEqual([resolved.track]);
    });

    test("maps albums and playlists", async () => {
        const provider = new SpotifyProvider(
            new TestSpotifyClient(),
            new TestSources(),
        );

        const album = await provider.resolveUrl(
            "https://open.spotify.com/album/album1",
            new AbortController().signal,
        );
        const playlist = await provider.resolveUrl(
            "https://open.spotify.com/playlist/playlist1",
            new AbortController().signal,
        );

        expect(album?.kind).toBe("playlist");
        expect(
            album?.kind === "playlist" && album.playlist.tracks[0]?.thumbnail,
        ).toBe("https://i.scdn.co/image/album");
        expect(playlist?.kind).toBe("playlist");
        expect(playlist?.kind === "playlist" && playlist.playlist.author).toBe(
            "Owner",
        );
    });
});
