export type Track = {
    id: string;
    title: string;
    author: string;
    duration: number;
    url: string;
    thumbnail?: string;
    provider: string;
};

export type Playlist<TTrack extends Track = Track> = {
    title: string;
    author: string;
    url: string;
    thumbnail?: string;
    tracks: TTrack[];
    provider: string;
};
