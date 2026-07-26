import type { LoopMode } from "../music/queue";
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
    pause(guildId: string, voiceChannelId: string): PauseResult;
    resume(guildId: string, voiceChannelId: string): ResumeResult;
    clear(guildId: string, voiceChannelId: string): number;
    setLoopMode(
        guildId: string,
        voiceChannelId: string,
        mode: LoopMode,
    ): boolean;
}

export type PauseResult = "paused" | "already_paused" | "nothing_playing";
export type ResumeResult = "resumed" | "already_playing" | "nothing_playing";

export class PlaybackError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "PlaybackError";
    }
}
