export type TrackMatchMetadata = {
    title?: string;
    artist?: string;
    album?: string;
    isrc?: string;
    hints?: readonly string[];
};

export type Track = {
    id: string;
    title: string;
    author: string;
    duration: number;
    url: string;
    thumbnail?: string;
    provider: string;
    match?: TrackMatchMetadata;
    source: {
        providerId: string;
        resourceId: string;
    };
};
