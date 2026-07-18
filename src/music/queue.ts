import type { Track } from "./track";

export type QueueTrack = Pick<Track, "title" | "url" | "duration">;

export type QueueSnapshot = {
    current: QueueTrack | null;
    upcoming: readonly QueueTrack[];
    loopMode: "off" | "track" | "queue";
};

export interface QueueReader {
    getQueue(guildId: string): Promise<QueueSnapshot>;
}
