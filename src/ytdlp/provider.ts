import type {
    AudioSource,
    MusicProvider,
    ResolvedMedia,
    SearchableMusicProvider,
} from "../music/provider";
import type { Track } from "../music/track";
import type { YtdlpCatalogClient } from "./client";
import type { YtdlpEntry } from "./schemas";

const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
]);

export class YtdlpProvider implements MusicProvider, SearchableMusicProvider {
    readonly id = "ytdlp";

    constructor(private readonly client: YtdlpCatalogClient) {}

    supportsUrl(value: string): boolean {
        return this.normalizeUrl(value) !== null;
    }

    supportsIdentifier(_value: string): boolean {
        return false;
    }

    async search(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly Track[]> {
        const entries = await this.client.search(query, signal);
        return entries.flatMap((entry) => {
            const track = this.toTrack(entry);
            return track ? [track] : [];
        });
    }

    async resolveUrl(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null> {
        const url = this.normalizeUrl(value);
        if (!url) return null;

        const entry = await this.client.resolve(url, signal);
        const track = entry ? this.toTrack(entry, url) : null;
        return track ? { kind: "track", track } : null;
    }

    async resolveIdentifier(
        _value: string,
        _signal: AbortSignal,
    ): Promise<Track | null> {
        return null;
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
            url: await this.client.getStreamUrl(
                track.source.resourceId,
                signal,
            ),
        };
    }

    private toTrack(entry: YtdlpEntry, fallbackUrl?: string): Track | null {
        if (!entry.id) return null;

        const url = entry.webpage_url ?? fallbackUrl ?? this.videoUrl(entry.id);
        if (!url) return null;

        return {
            id: `ytdlp:video:${entry.id}`,
            title: entry.title ?? "Unknown video",
            author:
                entry.uploader ?? entry.creator ?? entry.channel ?? "Unknown",
            duration: entry.duration ?? 0,
            ...(entry.is_live === true || entry.live_status === "is_live"
                ? { isLive: true }
                : {}),
            url,
            thumbnail: entry.thumbnail ?? undefined,
            provider: this.id,
            source: {
                providerId: this.id,
                resourceId: url,
            },
        };
    }

    private videoUrl(id: string): string | null {
        return /^[A-Za-z0-9_-]{6,}$/.test(id)
            ? `https://www.youtube.com/watch?v=${id}`
            : null;
    }

    private normalizeUrl(value: string): string | null {
        try {
            const url = new URL(
                /^https?:\/\//i.test(value) ? value : `https://${value}`,
            );
            if (
                (url.protocol !== "http:" && url.protocol !== "https:") ||
                !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
            ) {
                return null;
            }

            return url.toString();
        } catch {
            return null;
        }
    }
}
