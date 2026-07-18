import type { SearchableProvider, TrendingProvider } from "../provider";
import type { Playlist, Track } from "../track";
import { SoundcloudService } from "./soundcloud.api";
import type { SoundcloudRawTrack } from "./soundcloud.schemas";

export type SoundcloudTrack = Track & {
    provider: "soundcloud";
    progressiveUrl: string;
};

export class SoundcloudProvider
    implements
        SearchableProvider<SoundcloudTrack>,
        TrendingProvider<SoundcloudTrack>
{
    readonly providerId = "soundcloud";
    readonly urlRegex =
        /^(?:https?:\/\/)?(?:m\.|www\.)?soundcloud\.com\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/i;
    readonly idRegex = /^\d+$/;
    private readonly service: SoundcloudService;

    constructor(clientId?: string) {
        this.service = new SoundcloudService(clientId);
    }

    public matchUrl(url: string): boolean {
        return this.urlRegex.test(url);
    }

    public matchId(id: string): boolean {
        return this.idRegex.test(id);
    }

    public async search(
        query: string,
        signal?: AbortSignal,
    ): Promise<SoundcloudTrack[]> {
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
            console.error("Error searching SoundCloud tracks:", error);
            return [];
        }
    }

    public async getTrending(signal?: AbortSignal): Promise<SoundcloudTrack[]> {
        try {
            const tracks = await this.service.getTrending(signal);
            return tracks.map((t) => this.mapToTrack(t));
        } catch (error) {
            if (
                error instanceof Error &&
                (error.name === "AbortError" || error.name === "TimeoutError")
            ) {
                return [];
            }
            console.error("Error getting trending SoundCloud tracks:", error);
            return [];
        }
    }

    public async resolveUrl(
        url: string,
        signal?: AbortSignal,
    ): Promise<SoundcloudTrack | Playlist<SoundcloudTrack> | null> {
        if (!this.matchUrl(url)) return null;

        const resolved = await this.service.resolveUrl(url, signal);
        if (!resolved) return null;

        if ("tracks" in resolved) {
            const ids = resolved.tracks.map((t) => t.id);
            if (ids.length === 0) {
                return {
                    title: resolved.title,
                    author: resolved.user?.username ?? "Unknown",
                    url: resolved.permalink_url,
                    thumbnail:
                        resolved.artwork_url ??
                        resolved.user?.avatar_url ??
                        undefined,
                    tracks: [],
                    provider: "soundcloud",
                };
            }

            const fullTracks = await this.service.resolveIds(ids, signal);
            const trackMap = new Map<number, SoundcloudRawTrack>();
            for (const t of fullTracks) {
                trackMap.set(t.id, t);
            }

            const mappedTracks: SoundcloudTrack[] = [];
            for (const id of ids) {
                const t = trackMap.get(id);
                if (t) {
                    try {
                        mappedTracks.push(this.mapToTrack(t));
                    } catch (_e) {
                        // Skip if mapping throws (e.g. progressive stream not found)
                    }
                }
            }

            return {
                title: resolved.title,
                author: resolved.user?.username ?? "Unknown",
                url: resolved.permalink_url,
                thumbnail:
                    resolved.artwork_url ??
                    resolved.user?.avatar_url ??
                    undefined,
                tracks: mappedTracks,
                provider: "soundcloud",
            };
        }

        return this.mapToTrack(resolved);
    }

    public async resolveId(
        id: string,
        signal?: AbortSignal,
    ): Promise<SoundcloudTrack | null> {
        if (!this.matchId(id)) return null;

        const track = await this.service.resolveId(id, signal);
        return track ? this.mapToTrack(track) : null;
    }

    public async getStream(
        track: SoundcloudTrack,
        signal?: AbortSignal,
    ): Promise<ReadableStream> {
        return this.service.getStream(track.progressiveUrl, signal);
    }

    private mapToTrack(t: SoundcloudRawTrack): SoundcloudTrack {
        const progressive = t.media.transcodings.find(
            (tc) => tc.format.protocol === "progressive",
        );

        if (!progressive) {
            throw new Error(
                "Assertion failed: Progressive transcoding not found",
            );
        }

        return {
            id: t.id.toString(),
            title: t.title,
            author: t.user?.username ?? "Unknown",
            duration: t.duration / 1000,
            url: t.permalink_url,
            thumbnail: t.artwork_url ?? t.user?.avatar_url ?? undefined,
            progressiveUrl: progressive.url,
            provider: "soundcloud",
        };
    }
}
