export type Track = {
    id: string;
    title: string;
    author: string;
    duration: number;
    url: string;
    thumbnail?: string;
    provider: string;
    source: {
        providerId: string;
        resourceId: string;
    };
};
