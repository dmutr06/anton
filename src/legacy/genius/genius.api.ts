export class GeniusAPI {
    private readonly accessToken: string;

    constructor(accessToken?: string) {
        this.accessToken = accessToken || process.env.GENIUS_ACCESS_TOKEN || "";
    }

    public async searchSong(
        query: string,
        signal?: AbortSignal,
    ): Promise<{
        title: string;
        artist: string;
        url: string;
        thumbnail?: string;
    } | null> {
        if (!this.accessToken) {
            return null;
        }

        try {
            const url = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                signal,
            });

            if (!response.ok) {
                return null;
            }

            const data = (await response.json()) as any;
            const hits = data?.response?.hits || [];
            if (hits.length === 0) return null;

            const song = hits[0].result;
            return {
                title: song.title,
                artist: song.artist_names,
                url: song.url,
                thumbnail: song.song_art_image_thumbnail_url,
            };
        } catch (error) {
            return null;
        }
    }
}
