import type { Track } from "./track";

export const LOOP_MODES = ["off", "track", "queue"] as const;

export type LoopMode = (typeof LOOP_MODES)[number];

export type QueueTrack = Pick<Track, "title" | "url" | "duration" | "isLive">;

export type QueueSnapshot = {
    current: QueueTrack | null;
    upcoming: readonly QueueTrack[];
    loopMode: LoopMode;
};

export interface QueueReader {
    getQueue(guildId: string): Promise<QueueSnapshot>;
}
