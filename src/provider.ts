import type { Track } from "./track";

export interface Provider {
    search(query: string): Promise<Track[]>;
    getStream(track: Track): Promise<ReadableStream>;
}
