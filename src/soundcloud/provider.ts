import type { Playlist } from "../music/playlist";
import type {
    AudioSource,
    MusicProvider,
    ResolvedMedia,
    SearchableMusicProvider,
    TrendingMusicProvider,
} from "../music/provider";
import type { Track } from "../music/track";
import type { SoundCloudClient } from "./client";
import type { SoundCloudPlaylistData, SoundCloudTrackData } from "./schemas";

const RESOLVE_BATCH_SIZE = 50;
const TRENDING_CACHE_TTL_MS = 5 * 60_000;
const TRACK_URN_PATTERN = /^soundcloud:tracks:\d+$/;
const HLS_PRESETS = ["aac_160k", "aac_96k", "mp3_1_0"] as const;
const BLOCKED_POLICIES = new Set(["BLOCK", "BLOCKED"]);
const SOUNDCLOUD_HOSTS = new Set([
    "soundcloud.com",
    "www.soundcloud.com",
    "m.soundcloud.com",
    "on.soundcloud.com",
]);

export class SoundCloudProvider
    implements MusicProvider, SearchableMusicProvider, TrendingMusicProvider
{
    readonly id = "soundcloud";
    private trendingCache:
        | { expiresAt: number; tracks: readonly Track[] }
        | undefined;

    constructor(private readonly client: SoundCloudClient) {}

    supportsUrl(value: string): boolean {
        return this.normalizeUrl(value) !== null;
    }

    supportsIdentifier(value: string): boolean {
        return TRACK_URN_PATTERN.test(value);
    }

    async search(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly Track[]> {
        const tracks = await this.client.search(query, signal);
        return tracks.flatMap((track) => {
            const mapped = this.toTrack(track);
            return mapped ? [mapped] : [];
        });
    }

    async getTrending(signal: AbortSignal): Promise<readonly Track[]> {
        signal.throwIfAborted();

        if (this.trendingCache && this.trendingCache.expiresAt > Date.now()) {
            return this.trendingCache.tracks;
        }

        const tracks = await this.client.getTrending(signal);
        const playableTracks = tracks.flatMap((track) => {
            const mapped = this.toTrack(track);
            return mapped ? [mapped] : [];
        });

        this.trendingCache = {
            expiresAt: Date.now() + TRENDING_CACHE_TTL_MS,
            tracks: playableTracks,
        };

        return playableTracks;
    }

    async resolveUrl(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null> {
        const url = this.normalizeUrl(value);
        if (!url) return null;

        const media = await this.client.resolveUrl(url, signal);
        if (!media) return null;

        if ("tracks" in media) {
            return {
                kind: "playlist",
                playlist: await this.toPlaylist(media, signal),
            };
        }

        const track = this.toTrack(media);
        return track ? { kind: "track", track } : null;
    }

    async resolveIdentifier(
        value: string,
        signal: AbortSignal,
    ): Promise<Track | null> {
        if (!this.supportsIdentifier(value)) return null;
        return this.toTrack(await this.client.resolveUrn(value, signal));
    }

    async getAudioSource(
        track: Track,
        signal: AbortSignal,
    ): Promise<AudioSource> {
        if (track.source.providerId !== this.id) {
            throw new TypeError(
                `Cannot resolve ${track.source.providerId} audio with ${this.id}`,
            );
        }

        return {
            kind: "url",
            url: await this.client.resolveStreamUrl(
                track.source.resourceId,
                signal,
            ),
        };
    }

    private async toPlaylist(
        playlist: SoundCloudPlaylistData,
        signal: AbortSignal,
    ): Promise<Playlist> {
        const urns = playlist.tracks.map((track) => track.urn);
        const resolvedTracks: SoundCloudTrackData[] = [];

        for (let index = 0; index < urns.length; index += RESOLVE_BATCH_SIZE) {
            const batch = urns.slice(index, index + RESOLVE_BATCH_SIZE);
            const tracks = await this.client.resolveUrns(batch, signal);
            resolvedTracks.push(...tracks);
        }

        const tracksById = new Map(
            resolvedTracks.map((track) => [track.urn, track]),
        );
        const tracks = urns.flatMap((urn) => {
            const track = tracksById.get(urn);
            if (!track) return [];

            const mapped = this.toTrack(track);
            return mapped ? [mapped] : [];
        });

        return {
            title: playlist.title,
            author: playlist.user?.username ?? "Unknown",
            url: playlist.permalink_url,
            thumbnail:
                playlist.artwork_url ?? playlist.user?.avatar_url ?? undefined,
            provider: this.id,
            tracks,
        };
    }

    private toTrack(track: SoundCloudTrackData): Track | null {
        if (track.policy && BLOCKED_POLICIES.has(track.policy.toUpperCase())) {
            return null;
        }

        const transcoding = HLS_PRESETS.map((preset) =>
            track.media.transcodings.find(
                (candidate) =>
                    candidate.format.protocol === "hls" &&
                    candidate.preset === preset &&
                    candidate.snipped !== true,
            ),
        ).find((candidate) => candidate !== undefined);

        if (!transcoding) return null;

        return {
            id: track.urn,
            title: track.title,
            author: track.user?.username ?? "Unknown",
            duration: track.duration / 1000,
            url: track.permalink_url,
            thumbnail: track.artwork_url ?? track.user?.avatar_url ?? undefined,
            provider: this.id,
            source: {
                providerId: this.id,
                resourceId: transcoding.url,
            },
        };
    }

    private normalizeUrl(value: string): string | null {
        try {
            const url = new URL(
                /^https?:\/\//i.test(value) ? value : `https://${value}`,
            );

            if (!SOUNDCLOUD_HOSTS.has(url.hostname.toLowerCase())) return null;
            if (url.pathname === "/") return null;

            return url.toString();
        } catch {
            return null;
        }
    }
}
