import {
    SpotifyError,
    SpotifyValidationError,
    SpotifyAPIError,
} from "./spotify.errors";
import {
    SpotifyTokenResponseSchema,
    SpotifyTrackSchema,
    SpotifyAlbumSchema,
    SpotifyPlaylistSchema,
    SpotifySearchResponseSchema,
    type SpotifyRawTrack,
    type SpotifyRawAlbum,
    type SpotifyRawPlaylist,
} from "./spotify.schemas";

export class SpotifyService {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private accessToken: string | null = null;
    private tokenExpiresAt = 0;

    constructor() {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new SpotifyError(
                "Spotify credentials are missing. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.",
            );
        }
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    private async getAccessToken(): Promise<string> {
        const now = Date.now();
        if (this.accessToken && now < this.tokenExpiresAt) {
            return this.accessToken;
        }

        const credentials = Buffer.from(
            `${this.clientId}:${this.clientSecret}`,
        ).toString("base64");
        const res = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        });

        if (!res.ok) {
            throw new SpotifyAPIError(
                "Failed to authenticate with Spotify accounts service",
                res.status,
                res.statusText,
            );
        }

        const data = await res.json();
        const parsed = SpotifyTokenResponseSchema.safeParse(data);
        if (!parsed.success) {
            throw new SpotifyValidationError(
                "Failed to parse Spotify token response",
                parsed.error,
                data,
            );
        }

        this.accessToken = parsed.data.access_token;
        this.tokenExpiresAt =
            Date.now() + parsed.data.expires_in * 1000 - 60000;
        return this.accessToken;
    }

    private async fetchJson(
        url: string,
        signal?: AbortSignal,
    ): Promise<unknown> {
        try {
            const token = await this.getAccessToken();
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                signal,
            });

            if (!res.ok) {
                throw new SpotifyAPIError(
                    `Spotify API request failed for URL: ${url}`,
                    res.status,
                    res.statusText,
                );
            }
            return await res.json();
        } catch (error) {
            if (error instanceof SpotifyError) {
                throw error;
            }
            if (
                error instanceof Error &&
                (error.name === "AbortError" || error.name === "TimeoutError")
            ) {
                throw error;
            }
            throw new SpotifyError(
                `Failed to fetch from Spotify API: ${url}`,
                error,
            );
        }
    }

    public async search(
        query: string,
        signal?: AbortSignal,
    ): Promise<SpotifyRawTrack[]> {
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
            query,
        )}&type=track&limit=20`;

        const data = await this.fetchJson(url, signal);
        const parsed = SpotifySearchResponseSchema.safeParse(data);
        if (!parsed.success) {
            throw new SpotifyValidationError(
                "Failed to parse search response from Spotify",
                parsed.error,
                data,
            );
        }
        return parsed.data.tracks.items;
    }

    public async resolveTrack(
        id: string,
        signal?: AbortSignal,
    ): Promise<SpotifyRawTrack> {
        const url = `https://api.spotify.com/v1/tracks/${id}`;
        const data = await this.fetchJson(url, signal);
        const parsed = SpotifyTrackSchema.safeParse(data);
        if (!parsed.success) {
            throw new SpotifyValidationError(
                `Failed to parse resolved Spotify track for ID: ${id}`,
                parsed.error,
                data,
            );
        }
        return parsed.data;
    }

    public async resolveAlbum(
        id: string,
        signal?: AbortSignal,
    ): Promise<SpotifyRawAlbum> {
        const url = `https://api.spotify.com/v1/albums/${id}`;
        const data = await this.fetchJson(url, signal);
        const parsed = SpotifyAlbumSchema.safeParse(data);
        if (!parsed.success) {
            throw new SpotifyValidationError(
                `Failed to parse resolved Spotify album for ID: ${id}`,
                parsed.error,
                data,
            );
        }
        return parsed.data;
    }

    public async resolvePlaylist(
        id: string,
        signal?: AbortSignal,
    ): Promise<SpotifyRawPlaylist> {
        const url = `https://api.spotify.com/v1/playlists/${id}`;
        const data = await this.fetchJson(url, signal);
        const parsed = SpotifyPlaylistSchema.safeParse(data);
        if (!parsed.success) {
            throw new SpotifyValidationError(
                `Failed to parse resolved Spotify playlist for ID: ${id}`,
                parsed.error,
                data,
            );
        }
        return parsed.data;
    }
}
