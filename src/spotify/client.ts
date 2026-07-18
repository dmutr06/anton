import type { ZodType } from "zod";
import {
    SpotifyError,
    SpotifyRequestError,
    SpotifyValidationError,
} from "./errors";
import {
    type SpotifyAlbumData,
    type SpotifyPlaylistData,
    type SpotifyTrackData,
    spotifyAlbumSchema,
    spotifyPlaylistPageSchema,
    spotifyPlaylistSchema,
    spotifyTokenSchema,
    spotifyTrackPageSchema,
    spotifyTrackSchema,
} from "./schemas";

export type SpotifyClientConfig = {
    clientId: string;
    clientSecret: string;
};

export type SpotifyFetch = (
    input: string | URL,
    init?: RequestInit,
) => Promise<Response>;

export interface SpotifyCatalogClient {
    getTrack(id: string, signal: AbortSignal): Promise<SpotifyTrackData>;
    getAlbum(id: string, signal: AbortSignal): Promise<SpotifyAlbumData>;
    getPlaylist(id: string, signal: AbortSignal): Promise<SpotifyPlaylistData>;
}

export class SpotifyClient implements SpotifyCatalogClient {
    private readonly apiUrl = new URL("https://api.spotify.com/v1/");
    private token?: { value: string; expiresAt: number };

    constructor(
        private readonly config: SpotifyClientConfig,
        private readonly fetcher: SpotifyFetch = globalThis.fetch,
    ) {}

    async getTrack(id: string, signal: AbortSignal): Promise<SpotifyTrackData> {
        const data = await this.request(`/v1/tracks/${id}`, signal);
        return this.parse(spotifyTrackSchema, data, "Invalid Spotify track");
    }

    async getAlbum(id: string, signal: AbortSignal): Promise<SpotifyAlbumData> {
        const data = await this.request(`/v1/albums/${id}`, signal);
        const album = this.parse(
            spotifyAlbumSchema,
            data,
            "Invalid Spotify album",
        );
        const tracks = [...album.tracks.items];
        let next = album.tracks.next;

        while (next) {
            const page = this.parse(
                spotifyTrackPageSchema,
                await this.request(next, signal),
                "Invalid Spotify album tracks",
            );
            tracks.push(...page.items);
            next = page.next;
        }

        return { ...album, tracks };
    }

    async getPlaylist(
        id: string,
        signal: AbortSignal,
    ): Promise<SpotifyPlaylistData> {
        const data = await this.request(`/v1/playlists/${id}`, signal);
        const playlist = this.parse(
            spotifyPlaylistSchema,
            data,
            "Invalid Spotify playlist",
        );
        const firstPage = playlist.items ?? playlist.tracks;

        if (!firstPage) {
            throw new SpotifyError(
                "Spotify playlist items are unavailable for this application",
            );
        }

        const tracks = firstPage.items.filter(
            (track): track is SpotifyTrackData => track !== null,
        );
        let next = firstPage.next;

        while (next) {
            const page = this.parse(
                spotifyPlaylistPageSchema,
                await this.request(next, signal),
                "Invalid Spotify playlist items",
            );
            tracks.push(
                ...page.items.filter(
                    (track): track is SpotifyTrackData => track !== null,
                ),
            );
            next = page.next;
        }

        return {
            name: playlist.name,
            owner: playlist.owner,
            external_urls: playlist.external_urls,
            images: playlist.images,
            tracks,
        };
    }

    private async request(
        path: string,
        signal: AbortSignal,
        retry = true,
    ): Promise<unknown> {
        const url = new URL(path, this.apiUrl);
        if (url.origin !== this.apiUrl.origin) {
            throw new SpotifyError("Invalid Spotify API URL");
        }

        const response = await this.fetcher(url, {
            headers: { Authorization: `Bearer ${await this.getToken(signal)}` },
            signal,
        });

        if (response.status === 401 && retry) {
            this.token = undefined;
            return this.request(path, signal, false);
        }

        if (!response.ok) {
            throw new SpotifyRequestError(
                "Spotify API request failed",
                response.status,
                response.statusText,
            );
        }

        return response.json();
    }

    private async getToken(signal: AbortSignal): Promise<string> {
        if (this.token && this.token.expiresAt > Date.now()) {
            return this.token.value;
        }

        const credentials = btoa(
            `${this.config.clientId}:${this.config.clientSecret}`,
        );
        const response = await this.fetcher(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials",
                signal,
            },
        );

        if (!response.ok) {
            throw new SpotifyRequestError(
                "Spotify authentication failed",
                response.status,
                response.statusText,
            );
        }

        const token = this.parse(
            spotifyTokenSchema,
            await response.json(),
            "Invalid Spotify token",
        );
        this.token = {
            value: token.access_token,
            expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000,
        };
        return this.token.value;
    }

    private parse<T>(schema: ZodType<T>, value: unknown, message: string): T {
        const result = schema.safeParse(value);
        if (!result.success) {
            throw new SpotifyValidationError(message, result.error);
        }
        return result.data;
    }
}
