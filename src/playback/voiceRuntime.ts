import type { VoiceBasedChannel } from "discord.js";
import type { Track } from "../music/track";

export type VoicePlayerHandle = object;
export type VoiceConnectionHandle = object;

export type VoicePlayerEvents = {
    idle(): void;
    error(error: Error): void;
};

export type VoiceConnectionEvents = {
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
    play(player: VoicePlayerHandle, sourceUrl: string, track: Track): void;
    pause(player: VoicePlayerHandle): boolean;
    resume(player: VoicePlayerHandle): boolean;
    stop(player: VoicePlayerHandle): boolean;
    destroy(connection: VoiceConnectionHandle): void;
}
