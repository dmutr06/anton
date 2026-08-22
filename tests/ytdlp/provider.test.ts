import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import type { YtdlpCatalogClient } from "../../src/ytdlp/client";
import { YtdlpProvider } from "../../src/ytdlp/provider";

const entry = {
    id: "abc123",
    title: "Track",
    uploader: "Artist",
    duration: 125,
    webpage_url: "https://www.youtube.com/watch?v=abc123",
    thumbnail: "https://img.youtube.com/vi/abc123/0.jpg",
    is_live: true,
    live_status: "is_live",
};

class TestClient implements YtdlpCatalogClient {
    constructor(private readonly resolvedEntry = entry) {}

    async search() {
        return [this.resolvedEntry];
    }

    async resolve() {
        return this.resolvedEntry;
    }

    async getStreamUrl(url: string): Promise<string> {
        return `https://media.youtube.test/${encodeURIComponent(url)}`;
    }

    getLiveAudioStream(): Readable {
        return Readable.from(["audio"]);
    }
}

describe("YtdlpProvider", () => {
    test("recognizes YouTube URLs and rejects lookalike hosts", () => {
        const provider = new YtdlpProvider(new TestClient());

        expect(provider.supportsUrl(entry.webpage_url)).toBe(true);
        expect(
            provider.supportsUrl("https://youtube.com.evil.test/watch"),
        ).toBe(false);
        expect(provider.supportsIdentifier("ytdlp:video:abc123")).toBe(false);
    });

    test("maps search results and resolves direct URLs", async () => {
        const provider = new YtdlpProvider(new TestClient());

        const searchResults = await provider.search(
            "track",
            new AbortController().signal,
        );
        const resolved = await provider.resolveUrl(
            entry.webpage_url,
            new AbortController().signal,
        );

        expect(searchResults[0]).toMatchObject({
            id: "ytdlp:video:abc123",
            title: "Track",
            author: "Artist",
            duration: 125,
            isLive: true,
            provider: "ytdlp",
            source: {
                providerId: "ytdlp",
                resourceId: entry.webpage_url,
            },
        });
        expect(resolved?.kind).toBe("track");
    });

    test("streams live tracks through yt-dlp", async () => {
        const provider = new YtdlpProvider(new TestClient());
        const track = (await provider.resolveUrl(
            entry.webpage_url,
            new AbortController().signal,
        )) as { kind: "track"; track: import("../../src/music/track").Track };

        const source = await provider.getAudioSource(
            track.track,
            new AbortController().signal,
        );

        expect(source.kind).toBe("stream");
    });

    test("resolves a fresh stream URL for a video-on-demand track", async () => {
        const provider = new YtdlpProvider(
            new TestClient({
                ...entry,
                is_live: false,
                live_status: "not_live",
            }),
        );
        const resolved = await provider.resolveUrl(
            entry.webpage_url,
            new AbortController().signal,
        );
        if (!resolved || resolved.kind !== "track") throw new Error("No track");

        const source = await provider.getAudioSource(
            resolved.track,
            new AbortController().signal,
        );

        expect(source).toMatchObject({
            kind: "fetch",
            url: expect.stringContaining("media.youtube.test"),
        });
    });
});
