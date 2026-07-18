import type { Track } from "../music/track";

export type EnqueueTracksRequest = {
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    requestedByUserId: string;
    tracks: readonly Track[];
};

export interface Playback {
    enqueue(request: EnqueueTracksRequest): Promise<void>;
}

export interface PlaybackControl {
    skip(guildId: string, voiceChannelId: string): boolean;
    stop(guildId: string, voiceChannelId: string): boolean;
}

export class PlaybackError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "PlaybackError";
    }
}
