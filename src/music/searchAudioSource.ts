import type {
    AudioSource,
    AudioSourceResolver,
    SearchableMusicProvider,
} from "./provider";
import type { Track } from "./track";
import { TrackMatcher } from "./trackMatcher";

export class AudioSourceNotFoundError extends Error {
    constructor(track: Track) {
        super(`No playable source found for ${track.author} - ${track.title}`);
        this.name = "AudioSourceNotFoundError";
    }
}

export class SearchAudioSourceResolver implements AudioSourceResolver {
    constructor(
        private readonly providers: readonly SearchableMusicProvider[],
        private readonly matcher = new TrackMatcher(),
    ) {}

    async getAudioSource(
        track: Track,
        signal: AbortSignal,
    ): Promise<AudioSource> {
        const candidates = (
            await Promise.all(
                this.providers.flatMap((provider) =>
                    this.matcher.queries(track).map(async (query) => ({
                        provider,
                        tracks: await provider.search(query, signal),
                    })),
                ),
            )
        ).flatMap(({ provider, tracks }) =>
            tracks.map((candidate) => ({ provider, track: candidate })),
        );
        const unique = [
            ...new Map(
                candidates.map((candidate) => [
                    `${candidate.provider.id}:${candidate.track.id}`,
                    candidate,
                ]),
            ).values(),
        ];
        const best = unique
            .map((candidate) => ({
                ...candidate,
                score: this.matcher.score(track, candidate.track),
            }))
            .sort((left, right) => right.score - left.score)[0];

        if (best && this.matcher.accepts(best.score)) {
            return best.provider.getAudioSource(best.track, signal);
        }

        throw new AudioSourceNotFoundError(track);
    }
}
