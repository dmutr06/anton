import type { SearchableProvider, TrendingProvider } from "../provider";
import type { Track } from "../track";

const API_BASE = "https://api-v2.soundcloud.com";

export type SoundcloudTrack = Track & {
    provider: "soundcloud";
    progressiveUrl: string;
}

export class SoundcloudProvider implements SearchableProvider<SoundcloudTrack>, TrendingProvider<SoundcloudTrack> {
    readonly providerId = "soundcloud";
    readonly urlRegex = /^(?:https?:\/\/)?(?:m\.|www\.)?soundcloud\.com\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/i;
    readonly idRegex = /^\d+$/;
    private clientId: string | undefined;

    constructor(clientId?: string) {
        this.clientId = clientId ?? process.env.SOUNDCLOUD_CLIENT_ID;
    }

    public urlMatches(url: string): boolean {
        return this.urlRegex.test(url);
    }

    public idMatches(id: string): boolean {
        return this.idRegex.test(id);
    }

    public async search(query: string, signal?: AbortSignal): Promise<SoundcloudTrack[]> {
        const res = await fetch(
            `${API_BASE}/search/tracks?q=${encodeURIComponent(query)}&limit=20&client_id=${this.clientId}`,
            {
                signal,
            },
        );

        const data = (await res.json()) as any;

        return data.collection.map((t: any) => this.mapToTrack(t));
    }

    // TODO: trash, rewrite it later
    public async getTrending(signal?: AbortSignal): Promise<SoundcloudTrack[]> {
        const res = await fetch(
            `${API_BASE}/charts/selections?client_id=${this.clientId}`,
            {
                signal,
            },
        );

        const data = (await res.json()) as any;

        const playlistId = data.collection?.[0]?.items?.collection?.[0]?.id;

        const playlistRes = await fetch(`${API_BASE}/playlists/${playlistId}?client_id=${this.clientId}`);

        const playlist = await (playlistRes.json()) as any;

        const ids = playlist.tracks.map((track: any) => track.id as string);

        return this.resolveIds(ids, signal);
    }

    public async resolveUrl(url: string, signal?: AbortSignal): Promise<SoundcloudTrack | null> {
        if (!this.urlMatches(url)) return null;

        const res = await fetch(
            `${API_BASE}/resolve?url=${encodeURIComponent(url)}&client_id=${this.clientId}`,
            {
                signal,
            }
        );

        const t = await res.json();

        return this.mapToTrack(t);
    }

    public async resolveId(id: string, signal?: AbortSignal): Promise<SoundcloudTrack | null> {
        if (!this.idMatches(id)) return null;

        const res = await fetch(
            `${API_BASE}/tracks/${encodeURIComponent(id)}?client_id=${this.clientId}`,
            {
                signal,
            }
        );

        const t = await res.json();

        return this.mapToTrack(t);
    }

    public async getStream(track: SoundcloudTrack): Promise<ReadableStream> {
        const streamRes = await fetch(`${track.progressiveUrl}?client_id=${this.clientId}`);

        const { url: streamUrl } = (await streamRes.json()) as any;

        const stream = await fetch(streamUrl);

        if (!stream.ok || !stream.body) {
            throw new Error("Could not fetch a stream");
        }

        return stream.body;
    }

    private async resolveIds(ids: string[], signal?: AbortSignal): Promise<SoundcloudTrack[]> {
        const res = await fetch(
            `${API_BASE}/tracks?ids=${ids.join(",")}&client_id=${this.clientId}`,
            {
                signal,
            }
        );

        const data = (await res.json()) as any;

        return data.map(this.mapToTrack);
    }

    private mapToTrack(t: any): SoundcloudTrack | null {
        const progressive = t?.media?.transcodings?.find?.(
            (t: any) => t?.format?.protocol === "progressive",
        );

        if (!t || !t.id || !progressive || !progressive.url || t.policy != "ALLOW") return null;

        return {
            id: t.id.toString(),
            title: t.title,
            author: t.user?.username ?? "Unknown",
            duration: t.duration / 1000,
            url: t.permalink_url,
            thumbnail: t.artwork_url ?? t.user?.avatar_url ?? null,
            progressiveUrl: progressive.url,
            provider: "soundcloud",
        };
    }
}
