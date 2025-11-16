import type { Provider } from "../provider";
import type { Track } from "../track";

const API_BASE = "https://api-v2.soundcloud.com";

export interface SoundcloudTrack extends Track {
    progressiveUrl?: string;
}

export class SoundcloudProvider implements Provider {
    private clientId: string | undefined;

    public async loadClientId() {
        // TODO: probably do it dynamically
        this.clientId = process.env.SOUNDCLOUD_CLIENT_ID;
    }

    public async search(query: string): Promise<Track[]> {
        const res = await fetch(
            `${API_BASE}/search/tracks?q=${encodeURIComponent(query)}&client_id=${this.clientId}`,
        );

        const data = (await res.json()) as any;

        return data.collection.map((t: any) => this.mapToTrack(t));
    }

    public async resolveTrack(id: string): Promise<SoundcloudTrack | null> {
        if (!this.clientId) throw new Error("Get client id first");

        const res = await fetch(
            `${API_BASE}/tracks/${encodeURIComponent(id)}?client_id=${this.clientId}`,
        );

        if (!res.ok) {
            return null;
        }

        const t = await (res.json()) as any;
        const progressive = t?.media?.transcodings?.find?.(
            (t: any) => t?.format?.protocol === "progressive",
        );
        if (!t || !t.id || !progressive || !progressive.url) return null;

        return this.mapToTrack(t, progressive.url);
    }

    public async getStreamUrl(track: SoundcloudTrack): Promise<string> {
        if (!this.clientId) throw new Error("Get client id first");
        if (!track.progressiveUrl) {
            const resolvedTrack = await this.resolveTrack(track.id);
            if (!resolvedTrack) throw new Error("Track doesn't have progressive url");

            track = resolvedTrack;
        }

        const streamRes = await fetch(
            `${track.progressiveUrl}?client_id=${this.clientId}`,
        );

        const { url: mp3 } = (await streamRes.json()) as any;

        if (!mp3) throw new Error("No stream was found");

        return mp3;
    }

    public async getStream(track: Track): Promise<ReadableStream> {
        const streamUrl = await this.getStreamUrl(track);

        const stream = await fetch(streamUrl);

        if (!stream.ok || !stream.body) {
            throw new Error("Could not fetch a stream");
        }

        return stream.body;
    }

    private mapToTrack(t: any, progressiveUrl?: string): SoundcloudTrack {
        return {
            id: t.id.toString(),
            title: t.title,
            author: t.user?.username ?? "Unknown",
            duration: t.duration / 1000,
            url: t.permalink_url,
            thumbnail: t.artwork_url ?? t.user?.avatar_url ?? null,
            progressiveUrl,
        };
    }
}
