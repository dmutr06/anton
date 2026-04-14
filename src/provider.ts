import type { PlayableTrack, Track } from "./track";

export interface Provider {
    search(query: string): Promise<Track[]>;
    resolveTrack(id: string): Promise<PlayableTrack | null>;
    getStream(track: PlayableTrack): Promise<ReadableStream>;
}
