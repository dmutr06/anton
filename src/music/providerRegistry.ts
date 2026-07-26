import type {
    AudioSource,
    AudioSourceResolver,
    MusicProvider,
    ResolvedMedia,
    SearchableMusicProvider,
    TrendingMusicProvider,
} from "./provider";
import type { Track } from "./track";

export interface MusicCatalog extends AudioSourceResolver {
    resolve(query: string, signal: AbortSignal): Promise<ResolvedMedia | null>;
    resolveSupported(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null>;
    search(query: string, signal: AbortSignal): Promise<readonly Track[]>;
    getTrending(signal: AbortSignal): Promise<readonly Track[]>;
}

function isSearchable(
    provider: MusicProvider,
): provider is SearchableMusicProvider {
    return "search" in provider && typeof provider.search === "function";
}

function isTrending(
    provider: MusicProvider,
): provider is TrendingMusicProvider {
    return (
        "getTrending" in provider && typeof provider.getTrending === "function"
    );
}

export class MusicProviderRegistry implements MusicCatalog {
    private readonly providers = new Map<string, MusicProvider>();
    private readonly defaultProvider: SearchableMusicProvider;
    private readonly searchableProviders: readonly SearchableMusicProvider[];

    constructor(
        providers: readonly MusicProvider[],
        defaultProviderId: string,
    ) {
        for (const provider of providers) {
            if (this.providers.has(provider.id)) {
                throw new TypeError(`Duplicate music provider: ${provider.id}`);
            }

            this.providers.set(provider.id, provider);
        }

        const defaultProvider = this.providers.get(defaultProviderId);
        if (!defaultProvider || !isSearchable(defaultProvider)) {
            throw new TypeError(
                `Default music provider must be searchable: ${defaultProviderId}`,
            );
        }

        this.defaultProvider = defaultProvider;
        this.searchableProviders = providers.filter(isSearchable);
    }

    async resolve(
        query: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null> {
        const exact = await this.resolveSupported(query, signal);
        if (exact) return exact;

        const tracks = await this.searchProviders(query, signal);
        const track = tracks[0];
        return track ? { kind: "track", track } : null;
    }

    async resolveSupported(
        value: string,
        signal: AbortSignal,
    ): Promise<ResolvedMedia | null> {
        for (const provider of this.providers.values()) {
            if (provider.supportsUrl(value)) {
                return provider.resolveUrl(value, signal);
            }
        }

        for (const provider of this.providers.values()) {
            if (!provider.supportsIdentifier(value)) continue;

            const track = await provider.resolveIdentifier(value, signal);
            return track ? { kind: "track", track } : null;
        }

        return null;
    }

    search(query: string, signal: AbortSignal): Promise<readonly Track[]> {
        return this.searchProviders(query, signal);
    }

    getTrending(signal: AbortSignal): Promise<readonly Track[]> {
        return isTrending(this.defaultProvider)
            ? this.defaultProvider.getTrending(signal)
            : Promise.resolve([]);
    }

    getAudioSource(track: Track, signal: AbortSignal): Promise<AudioSource> {
        const provider = this.providers.get(track.source.providerId);

        if (!provider) {
            throw new TypeError(
                `Unknown music provider: ${track.source.providerId}`,
            );
        }

        return provider.getAudioSource(track, signal);
    }

    private async searchProviders(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly Track[]> {
        for (const provider of this.searchableProviders) {
            const tracks = await provider.search(query, signal);
            if (tracks.length > 0) return tracks;
        }

        return [];
    }
}
