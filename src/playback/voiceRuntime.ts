import type { VoiceBasedChannel } from "discord.js";
import type { AudioSource } from "../music/provider";
import type { Track } from "../music/track";

export type VoicePlayerHandle = object;
export type VoiceConnectionHandle = object;

export class EmptyAudioStreamError extends Error {
    constructor() {
        super("Audio stream ended before producing audio.");
        this.name = "EmptyAudioStreamError";
    }
}

export type VoicePlayerEvents = {
    idle(): void;
    playing(): void;
    error(error: Error): void;
};

export type VoiceConnectionEvents = {
    disconnected(): void;
    error(error: Error): void;
};

export interface VoiceRuntime {
    createPlayer(events: VoicePlayerEvents): VoicePlayerHandle;
    connect(
        channel: VoiceBasedChannel,
        events: VoiceConnectionEvents,
    ): VoiceConnectionHandle;
    waitUntilReady(
        connection: VoiceConnectionHandle,
        timeoutMs: number,
    ): Promise<void>;
    subscribe(
        connection: VoiceConnectionHandle,
        player: VoicePlayerHandle,
    ): void;
    play(
        player: VoicePlayerHandle,
        source: AudioSource,
        track: Track,
        signal: AbortSignal,
    ): Promise<void>;
    pause(player: VoicePlayerHandle): boolean;
    resume(player: VoicePlayerHandle): boolean;
    stop(player: VoicePlayerHandle): boolean;
    destroy(connection: VoiceConnectionHandle): void;
}
