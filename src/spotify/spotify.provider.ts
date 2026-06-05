import type { SearchableProvider } from "../provider";
import type { Track, Playlist } from "../track";
import { SpotifyService } from "./spotify.api";
import type { SpotifyRawTrack } from "./spotify.schemas";

export type SpotifyTrack = Track & {
    provider: "spotify";
};

export class SpotifyProvider implements SearchableProvider<SpotifyTrack> {
    readonly providerId = "spotify";
    readonly urlRegex =
        /^https?:\/\/(?:open|play)\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i;
    private readonly service: SpotifyService | null = null;
    private readonly externalProvider: SearchableProvider<any>;

    constructor(externalProvider: SearchableProvider<any>) {
        this.externalProvider = externalProvider;
        try {
            this.service = new SpotifyService();
        } catch (error) {
            console.warn(
                "Spotify provider is disabled:",
                error instanceof Error ? error.message : error,
            );
        }
    }

    public matchUrl(url: string): boolean {
        if (!this.service) return false;
        return this.urlRegex.test(url);
    }

    public matchId(_id: string): boolean {
        return false;
    }

    public async search(
        query: string,
        signal?: AbortSignal,
    ): Promise<SpotifyTrack[]> {
        if (!this.service) return [];
        try {
            const tracks = await this.service.search(query, signal);
            return tracks.map((t) => this.mapToTrack(t));
        } catch (error) {
            if (
                error instanceof Error &&
                (error.name === "AbortError" || error.name === "TimeoutError")
            ) {
                return [];
            }
            console.error("Error searching Spotify tracks:", error);
            return [];
        }
    }

    public async resolveUrl(
        url: string,
        signal?: AbortSignal,
    ): Promise<SpotifyTrack | Playlist<SpotifyTrack> | null> {
        if (!this.service || !this.matchUrl(url)) return null;

        const match = url.match(this.urlRegex);
        if (!match || !match[1] || !match[2]) return null;

        const type = match[1];
        const id = match[2];

        if (type === "track") {
            const track = await this.service.resolveTrack(id, signal);
            return this.mapToTrack(track);
        }

        if (type === "album") {
            const album = await this.service.resolveAlbum(id, signal);
            const tracks = album.tracks.items.map((t) =>
                this.mapToTrack({
                    ...t,
                    album: {
                        images: album.images,
                    },
                }),
            );

            return {
                title: album.name,
                author: album.artists.map((a) => a.name).join(", "),
                url: album.external_urls.spotify,
                thumbnail: album.images?.[0]?.url,
                tracks,
                provider: "spotify",
            };
        }

        if (type === "playlist") {
            const playlist = await this.service.resolvePlaylist(id, signal);
            const tracks: SpotifyTrack[] = [];
            for (const item of playlist.tracks.items) {
                if (item.track) {
                    tracks.push(this.mapToTrack(item.track));
                }
            }

            return {
                title: playlist.name,
                author: playlist.owner?.display_name ?? "Unknown",
                url: playlist.external_urls.spotify,
                thumbnail: playlist.images?.[0]?.url,
                tracks,
                provider: "spotify",
            };
        }

        return null;
    }

    public async resolveId(
        _id: string,
        _signal?: AbortSignal,
    ): Promise<SpotifyTrack | null> {
        return null;
    }

    public async getStream(
        track: SpotifyTrack,
        signal?: AbortSignal,
    ): Promise<ReadableStream> {
        const searchQuery = `${track.author} - ${track.title}`;
        const results = await this.externalProvider.search(searchQuery, signal);
        if (results.length === 0) {
            throw new Error(`No search results found for: ${searchQuery}`);
        }
        const bestMatch = results[0];
        return this.externalProvider.getStream(bestMatch, signal);
    }

    private mapToTrack(t: SpotifyRawTrack): SpotifyTrack {
        return {
            id: t.id,
            title: t.name,
            author: t.artists.map((a) => a.name).join(", "),
            duration: t.duration_ms / 1000,
            url: t.external_urls.spotify,
            thumbnail: t.album?.images?.[0]?.url,
            provider: "spotify",
        };
    }
}
