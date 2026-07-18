import { type Playback, PlaybackError } from "../playback/playback";
import { MusicProviderError, type ResolvedMedia } from "./provider";
import type { MusicCatalog } from "./providerRegistry";
import type { Track } from "./track";

export type PlayRequest = {
    query: string;
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    requestedByUserId: string;
};

export type QueuedPlaylist = {
    title: string;
    author: string;
    url: string;
    thumbnail?: string;
    provider: string;
    trackCount: number;
};

export type PlayResult =
    | { kind: "track"; track: Track }
    | { kind: "playlist"; playlist: QueuedPlaylist };

export type PlaySuggestion = {
    name: string;
    value: string;
};

export interface PlayMusic {
    enqueue(request: PlayRequest, signal: AbortSignal): Promise<PlayResult>;
    suggest(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly PlaySuggestion[]>;
}

export type MusicServiceOptions = {
    maxPlaylistTracks: number;
};

const DEFAULT_MAX_PLAYLIST_TRACKS = 100;

export class PlayMusicError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "PlayMusicError";
    }
}

export class MusicService implements PlayMusic {
    constructor(
        private readonly providers: MusicCatalog,
        private readonly playback: Playback,
        private readonly options: MusicServiceOptions = {
            maxPlaylistTracks: DEFAULT_MAX_PLAYLIST_TRACKS,
        },
    ) {}

    async enqueue(
        request: PlayRequest,
        signal: AbortSignal,
    ): Promise<PlayResult> {
        let resolved: ResolvedMedia | null;

        try {
            resolved = await this.providers.resolve(request.query, signal);
        } catch (error) {
            if (error instanceof MusicProviderError) {
                throw new PlayMusicError(error.message, { cause: error });
            }
            throw error;
        }

        if (!resolved) {
            throw new PlayMusicError(
                `Could not find anything matching "${request.query}".`,
            );
        }

        signal.throwIfAborted();

        if (
            resolved.kind === "playlist" &&
            resolved.playlist.tracks.length > this.options.maxPlaylistTracks
        ) {
            throw new PlayMusicError(
                `This playlist has ${resolved.playlist.tracks.length} tracks, but the limit is ${this.options.maxPlaylistTracks}.`,
            );
        }

        const tracks =
            resolved.kind === "track"
                ? [resolved.track]
                : resolved.playlist.tracks;

        if (tracks.length === 0) {
            throw new PlayMusicError(
                "The resolved playlist has no playable tracks.",
            );
        }

        try {
            await this.playback.enqueue({
                guildId: request.guildId,
                voiceChannelId: request.voiceChannelId,
                textChannelId: request.textChannelId,
                requestedByUserId: request.requestedByUserId,
                tracks,
            });
        } catch (error) {
            if (error instanceof PlaybackError) {
                throw new PlayMusicError(error.message, { cause: error });
            }

            throw error;
        }

        if (resolved.kind === "track") {
            return resolved;
        }

        return {
            kind: "playlist",
            playlist: {
                title: resolved.playlist.title,
                author: resolved.playlist.author,
                url: resolved.playlist.url,
                thumbnail: resolved.playlist.thumbnail,
                provider: resolved.playlist.provider,
                trackCount: resolved.playlist.tracks.length,
            },
        };
    }

    async suggest(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly PlaySuggestion[]> {
        if (!query) {
            return (await this.providers.getTrending(signal)).map((track) =>
                this.toTrackSuggestion(track),
            );
        }

        const resolved = await this.providers.resolveSupported(query, signal);
        if (resolved?.kind === "track") {
            return [this.toTrackSuggestion(resolved.track)];
        }

        if (resolved?.kind === "playlist") {
            return [
                {
                    name: `${resolved.playlist.author} - ${resolved.playlist.title} (${resolved.playlist.tracks.length} tracks)`,
                    value: resolved.playlist.url,
                },
            ];
        }

        return (await this.providers.search(query, signal)).map((track) =>
            this.toTrackSuggestion(track),
        );
    }

    private toTrackSuggestion(track: Track): PlaySuggestion {
        return {
            name: `${track.author} - ${track.title} (${this.formatDuration(track.duration)})`,
            value: track.id,
        };
    }

    private formatDuration(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
}
