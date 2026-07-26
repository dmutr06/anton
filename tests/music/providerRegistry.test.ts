import { describe, expect, test } from "bun:test";
import type {
    ResolvedMedia,
    SearchableMusicProvider,
} from "../../src/music/provider";
import { MusicProviderRegistry } from "../../src/music/providerRegistry";
import type { Track } from "../../src/music/track";

const track: Track = {
    id: "fallback:video:1",
    title: "Fallback track",
    author: "Fallback artist",
    duration: 120,
    url: "https://youtube.com/watch?v=fallback1",
    provider: "fallback",
    source: {
        providerId: "fallback",
        resourceId: "https://youtube.com/watch?v=fallback1",
    },
};

function provider(
    id: string,
    results: readonly Track[],
): SearchableMusicProvider {
    return {
        id,
        supportsUrl: () => false,
        supportsIdentifier: () => false,
        resolveUrl: async (): Promise<ResolvedMedia | null> => null,
        resolveIdentifier: async (): Promise<Track | null> => null,
        search: async () => results,
        getAudioSource: async () => ({
            kind: "url",
            url: "https://media.test/track",
        }),
    };
}

describe("MusicProviderRegistry", () => {
    test("falls back to the next searchable provider", async () => {
        const registry = new MusicProviderRegistry(
            [provider("soundcloud", []), provider("ytdlp", [track])],
            "soundcloud",
        );

        const resolved = await registry.resolve(
            "fallback query",
            new AbortController().signal,
        );

        expect(resolved).toEqual({ kind: "track", track });
    });
});
