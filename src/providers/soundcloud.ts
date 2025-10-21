import type { Provider } from "../provider";
import type { Track } from "../track";
import { Readable } from "stream";

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

        return data.collection.map((t: any) => ({
            id: t.id.toString(),
            title: t.title,
            author: t.user.username,
            duration: t.duration / 1000,
            url: t.permalink_url,
        }));
    }

    public async getStreamUrl(track: Track): Promise<string> {
        if (!this.clientId) throw new Error("Get client id first");

        const res = await fetch(
            `${API_BASE}/tracks/${track.id}?client_id=${this.clientId}`,
        );
        const data = (await res.json()) as any;

        const progressive = data.media.transcodings.find(
            (t: any) => t?.format?.protocol === "progressive",
        );

        if (!progressive) throw new Error("No stream was found");

        const streamRes = await fetch(
            `${progressive.url}?client_id=${this.clientId}`,
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
}
