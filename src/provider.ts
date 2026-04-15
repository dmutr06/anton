import type { Track } from "./track";

export interface Provider<TTrack extends Track = Track> {
    readonly providerId: TTrack["provider"];
    urlMatches(url: string): boolean;
    idMatches(id: string): boolean;

    resolveUrl(url: string, signal?: AbortSignal): Promise<TTrack | null>;
    resolveId(id: string, signal?: AbortSignal): Promise<TTrack | null>;
    getStream(track: TTrack, signal?: AbortSignal): Promise<ReadableStream>;
}

export interface SearchableProvider<TTrack extends Track = Track> extends Provider<TTrack> {
    search(query: string, signal?: AbortSignal): Promise<TTrack[]>;
}

export interface TrendingProvider<TTrack extends Track = Track> extends Provider<TTrack> {
    getTrending(signal?: AbortSignal): Promise<TTrack[]>;
}

export function isTrendingProvider<TTrack extends Track>(
    provider: Provider<TTrack>
): provider is TrendingProvider<TTrack> {
    return "getTrending" in provider && typeof provider.getTrending === "function";
}
