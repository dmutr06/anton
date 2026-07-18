import type { Playlist } from "../music/playlist";
import type {
    AudioSource,
    AudioSourceResolver,
    MusicProvider,
    ResolvedMedia,
} from "../music/provider";
import type { Track } from "../music/track";
import type { SpotifyCatalogClient } from "./client";
import type {
    SpotifyAlbumData,
    SpotifyPlaylistData,
    SpotifyTrackData,
} from "./schemas";

const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);
const TRACK_ID_PATTERN = /^spotify:track:([a-zA-Z0-9]+)$/;

type SpotifyReference = {
    type: "album" | "playlist" | "track";
    id: string;
};

type TrackFallback = {
    album?: string;
    thumbnail?: string;
};

export class SpotifyProvider implements MusicProvider {
    readonly id = "spotify";

    constructor(
        private readonly client: SpotifyCatalogClient,
        private readonly sources: AudioSourceResolver,
    ) {}

    supportsUrl(value: string): boolean {
        return this.parseUrl(value) !== null;
    }

    supportsIdentifier(value: string): boolean {
        return TRACK_ID_PATTERN.test(value);
    }

    async resolveUrl(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null> {
        const reference = this.parseUrl(value);
        if (!reference) return null;

        if (reference.type === "track") {
            return {
                kind: "track",
                track: this.toTrack(
                    await this.client.getTrack(reference.id, signal),
                ),
            };
        }

        const playlist =
            reference.type === "album"
                ? this.toAlbum(await this.client.getAlbum(reference.id, signal))
                : this.toPlaylist(
                      await this.client.getPlaylist(reference.id, signal),
                  );
        return { kind: "playlist", playlist };
    }

    async resolveIdentifier(
        value: string,
        signal: AbortSignal,
    ): Promise<Track | null> {
        const id = value.match(TRACK_ID_PATTERN)?.[1];
        return id ? this.toTrack(await this.client.getTrack(id, signal)) : null;
    }

    getAudioSource(track: Track, signal: AbortSignal): Promise<AudioSource> {
        if (track.source.providerId !== this.id) {
            throw new TypeError(
                `Cannot resolve ${track.source.providerId} audio with ${this.id}`,
            );
        }

        return this.sources.getAudioSource(track, signal);
    }

    private toTrack(
        track: SpotifyTrackData,
        fallback: TrackFallback = {},
    ): Track {
        const album = track.album?.name ?? fallback.album;
        const isrc = track.external_ids?.isrc;

        return {
            id: `spotify:track:${track.id}`,
            title: track.name,
            author: track.artists.map((artist) => artist.name).join(", "),
            duration: track.duration_ms / 1000,
            url: track.external_urls.spotify,
            thumbnail: track.album?.images?.[0]?.url ?? fallback.thumbnail,
            provider: this.id,
            ...(album || isrc ? { match: { album, isrc } } : {}),
            source: {
                providerId: this.id,
                resourceId: track.id,
            },
        };
    }

    private toAlbum(album: SpotifyAlbumData): Playlist {
        const thumbnail = album.images?.[0]?.url;
        return {
            title: album.name,
            author: album.artists.map((artist) => artist.name).join(", "),
            url: album.external_urls.spotify,
            thumbnail,
            provider: this.id,
            tracks: album.tracks.map((track) =>
                this.toTrack(track, { album: album.name, thumbnail }),
            ),
        };
    }

    private toPlaylist(playlist: SpotifyPlaylistData): Playlist {
        return {
            title: playlist.name,
            author: playlist.owner?.display_name ?? "Unknown",
            url: playlist.external_urls.spotify,
            thumbnail: playlist.images?.[0]?.url,
            provider: this.id,
            tracks: playlist.tracks.map((track) => this.toTrack(track)),
        };
    }

    private parseUrl(value: string): SpotifyReference | null {
        try {
            const url = new URL(
                /^https?:\/\//i.test(value) ? value : `https://${value}`,
            );
            if (
                (url.protocol !== "http:" && url.protocol !== "https:") ||
                !SPOTIFY_HOSTS.has(url.hostname.toLowerCase())
            ) {
                return null;
            }

            const parts = url.pathname.split("/").filter(Boolean);
            const start = parts[0]?.startsWith("intl-") ? 1 : 0;
            const type = parts[start];
            const id = parts[start + 1];

            if (
                (type !== "track" && type !== "album" && type !== "playlist") ||
                !id ||
                parts.length !== start + 2 ||
                !/^[a-zA-Z0-9]+$/.test(id)
            ) {
                return null;
            }

            return { type, id };
        } catch {
            return null;
        }
    }
}
