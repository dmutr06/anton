import type { Provider } from "../provider";
import type { PlayableTrack, Track } from "../track";

const API_BASE = "https://api-v2.soundcloud.com";

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

    public async resolveTrack(query: string): Promise<PlayableTrack | null> {
        if (!this.clientId) throw new Error("Get client id first");

        let t: any;

        if (this.isSoundcloudUrl(query)) {
            const res = await fetch(
                `${API_BASE}/resolve?url=${encodeURIComponent(query)}&client_id=${this.clientId}`,
            );
            if (res.ok) t = await res.json();
        } else {
            if (this.isNumericId(query)) {
                const res = await fetch(
                    `${API_BASE}/tracks/${encodeURIComponent(query)}?client_id=${this.clientId}`,
                );
                if (res.ok) t = await res.json();
            }

            if (!t) {
                const res = await fetch(
                    `${API_BASE}/search/tracks?q=${encodeURIComponent(query)}&client_id=${this.clientId}`,
                );
                if (res.ok) {
                    const data = await res.json() as any;
                    t = data.collection?.[0];
                }
            }
        }

        if (!t) {
            return null;
        }

        const progressive = t?.media?.transcodings?.find?.(
            (t: any) => t?.format?.protocol === "progressive",
        );
        if (!t || !t.id || !progressive || !progressive.url) return null;

        const streamRes = await fetch(
            `${progressive.url}?client_id=${this.clientId}`,
        );

        const { url: streamUrl } = (await streamRes.json()) as any;
        if (!streamUrl) return null;

        return { ...this.mapToTrack(t), streamUrl };
    }

    public async getStream(track: PlayableTrack): Promise<ReadableStream> {
        const stream = await fetch(track.streamUrl);

        if (!stream.ok || !stream.body) {
            throw new Error("Could not fetch a stream");
        }

        return stream.body;
    }

    private mapToTrack(t: any): Track {
        return {
            id: t.id.toString(),
            title: t.title,
            author: t.user?.username ?? "Unknown",
            duration: t.duration / 1000,
            url: t.permalink_url,
            thumbnail: t.artwork_url ?? t.user?.avatar_url ?? null,
        };
    }

    private isSoundcloudUrl(query: string): boolean {
        return query.startsWith("http") && query.includes("soundcloud.com");
    }

    private isNumericId(query: string): boolean {
        return /^\d+$/.test(query);
    }
}
