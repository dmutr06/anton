import type { Readable } from "node:stream";
import type { Playlist } from "./playlist";
import type { Track } from "./track";

export class MusicProviderError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "MusicProviderError";
    }
}

export type ResolvedMedia =
    | { kind: "track"; track: Track }
    | { kind: "playlist"; playlist: Playlist };

export type AudioSource =
    | { kind: "fetch" | "url"; url: string }
    | { kind: "stream"; stream: Readable };

export interface AudioSourceResolver {
    getAudioSource(track: Track, signal: AbortSignal): Promise<AudioSource>;
}

export interface MusicProvider extends AudioSourceResolver {
    readonly id: string;
    supportsUrl(value: string): boolean;
    supportsIdentifier(value: string): boolean;
    resolveUrl(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null>;
    resolveIdentifier(
        value: string,
        signal: AbortSignal,
    ): Promise<Track | null>;
    getAudioSource(track: Track, signal: AbortSignal): Promise<AudioSource>;
}

export interface SearchableMusicProvider extends MusicProvider {
    search(query: string, signal: AbortSignal): Promise<readonly Track[]>;
}

export interface TrendingMusicProvider extends MusicProvider {
    getTrending(signal: AbortSignal): Promise<readonly Track[]>;
}
