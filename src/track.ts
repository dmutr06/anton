export type Track = {
    id: string;
    title: string;
    author: string;
    duration: number;
    url: string;
    thumbnail?: string;
};

export type PlayableTrack = Track & {
    streamUrl: string;
};
