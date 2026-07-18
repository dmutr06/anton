import { describe, expect, test } from "bun:test";
import type {
    AudioSource,
    ResolvedMedia,
    SearchableMusicProvider,
} from "../../src/music/provider";
import {
    AudioSourceNotFoundError,
    SearchAudioSourceResolver,
} from "../../src/music/searchAudioSource";
import type { Track } from "../../src/music/track";

const requested: Track = {
    id: "spotify:track:1",
    title: "Чужое",
    author: "Grazhdanskaya Oborona",
    duration: 240,
    url: "https://open.spotify.com/track/1",
    provider: "spotify",
    match: {
        album: "Русское поле экспериментов",
        isrc: "RU-AAA-00-00001",
    },
    source: { providerId: "spotify", resourceId: "1" },
};

function candidate(id: string, values: Partial<Track> = {}): Track {
    return {
        ...requested,
        id,
        provider: "test",
        source: { providerId: "test", resourceId: id },
        ...values,
    };
}

class TestProvider implements SearchableMusicProvider {
    readonly id = "test";
    readonly queries: string[] = [];
    readonly results = new Map<string, readonly Track[]>();
    selected?: Track;

    supportsUrl(): boolean {
        return false;
    }

    supportsIdentifier(): boolean {
        return false;
    }

    async resolveUrl(): Promise<ResolvedMedia | null> {
        return null;
    }

    async resolveIdentifier(): Promise<Track | null> {
        return null;
    }

    async search(query: string): Promise<readonly Track[]> {
        this.queries.push(query);
        return this.results.get(query) ?? [];
    }

    async getAudioSource(track: Track): Promise<AudioSource> {
        this.selected = track;
        return { kind: "url", url: "https://media.test/track.m3u8" };
    }
}

describe("SearchAudioSourceResolver", () => {
    test("uses title and album when Spotify transliterates the artist", async () => {
        const provider = new TestProvider();
        provider.results.set("Grazhdanskaya Oborona - Чужое", [
            candidate("wrong", {
                author: "Wrong artist",
                match: undefined,
            }),
        ]);
        provider.results.set("Чужое", [
            candidate("correct", {
                author: "Гражданская Оборона",
                match: {
                    album: "Русское поле экспериментов",
                },
            }),
        ]);
        const resolver = new SearchAudioSourceResolver([provider]);

        await resolver.getAudioSource(requested, new AbortController().signal);

        expect(provider.queries).toEqual([
            "Grazhdanskaya Oborona - Чужое",
            "Русское поле экспериментов - Чужое",
            "Чужое",
            "RU-AAA-00-00001",
        ]);
        expect(provider.selected?.id).toBe("correct");
    });

    test("prioritizes an exact ISRC", async () => {
        const provider = new TestProvider();
        provider.results.set("Чужое", [
            candidate("wrong", {
                match: { isrc: "RU-BBB-00-00002" },
            }),
            candidate("correct", {
                title: "Foreign title",
                author: "Другой алфавит",
                match: { isrc: "RUAAA0000001" },
            }),
        ]);
        const resolver = new SearchAudioSourceResolver([provider]);

        await resolver.getAudioSource(requested, new AbortController().signal);

        expect(provider.selected?.id).toBe("correct");
    });

    test("rejects low-confidence candidates", async () => {
        const provider = new TestProvider();
        provider.results.set("Чужое", [
            candidate("unrelated", {
                title: "Different song",
                author: "Different artist",
                match: undefined,
            }),
        ]);
        const resolver = new SearchAudioSourceResolver([provider]);

        await expect(
            resolver.getAudioSource(requested, new AbortController().signal),
        ).rejects.toBeInstanceOf(AudioSourceNotFoundError);
        expect(provider.selected).toBeUndefined();
    });
});
