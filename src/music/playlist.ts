import type { Track } from "./track";

export type Playlist = {
    title: string;
    author: string;
    url: string;
    thumbnail?: string;
    provider: string;
    tracks: readonly Track[];
};
