import type { Track } from "./track";

export interface Provider {
    search(query: string): Promise<Track[]>;
    resolveTrack(id: string): Promise<Track | null>;
    getStream(track: Track): Promise<ReadableStream>;
}
