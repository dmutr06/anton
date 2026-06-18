import { z } from "zod";
import {
    SoundcloudAPIError,
    SoundcloudError,
    SoundcloudValidationError,
} from "./soundcloud.errors";
import {
    SoundcloudChartsResponseSchema,
    SoundcloudPlaylistResponseSchema,
    type SoundcloudRawPlaylist,
    SoundcloudRawPlaylistSchema,
    type SoundcloudRawTrack,
    SoundcloudRawTrackSchema,
    SoundcloudSearchResponseSchema,
    SoundcloudStreamResponseSchema,
} from "./soundcloud.schemas";

export class SoundcloudService {
    private static readonly API_BASE = "https://api-v2.soundcloud.com";
    private readonly clientId: string;

    constructor(clientId?: string) {
        const id = clientId ?? process.env.SOUNDCLOUD_CLIENT_ID;
        if (!id) {
            throw new SoundcloudError(
                "SoundCloud Client ID is missing. Please set the SOUNDCLOUD_CLIENT_ID environment variable or pass it to the constructor.",
            );
        }
        this.clientId = id;
    }

    private async fetchJson(
        url: string,
        signal?: AbortSignal,
    ): Promise<unknown> {
        try {
            const res = await fetch(url, { signal });
            if (!res.ok) {
                throw new SoundcloudAPIError(
                    `SoundCloud API request failed for URL: ${url}`,
                    res.status,
                    res.statusText,
                );
            }
            return await res.json();
        } catch (error) {
            if (error instanceof SoundcloudError) {
                throw error;
            }
            if (
                error instanceof Error &&
                (error.name === "AbortError" || error.name === "TimeoutError")
            ) {
                throw error;
            }
            throw new SoundcloudError(
                `Failed to fetch from SoundCloud API: ${url}`,
                error,
            );
        }
    }

    public async search(
        query: string,
        signal?: AbortSignal,
    ): Promise<SoundcloudRawTrack[]> {
        const url = `${SoundcloudService.API_BASE}/search/tracks?q=${encodeURIComponent(
            query,
        )}&limit=20&client_id=${this.clientId}`;

        const data = await this.fetchJson(url, signal);
        const parsed = SoundcloudSearchResponseSchema.safeParse(data);
        if (!parsed.success) {
            throw new SoundcloudValidationError(
                "Failed to parse search response from SoundCloud",
                parsed.error,
                data,
            );
        }

        const validTracks: SoundcloudRawTrack[] = [];
        for (const item of parsed.data.collection) {
            const trackParse = SoundcloudRawTrackSchema.safeParse(item);
            if (trackParse.success) {
                validTracks.push(trackParse.data);
            }
        }

        return validTracks;
    }

    public async getTrending(
        signal?: AbortSignal,
    ): Promise<SoundcloudRawTrack[]> {
        const url = `${SoundcloudService.API_BASE}/charts/selections?client_id=${this.clientId}`;
        const data = await this.fetchJson(url, signal);

        const parsed = SoundcloudChartsResponseSchema.safeParse(data);
        if (!parsed.success) {
            throw new SoundcloudValidationError(
                "Failed to parse trending/charts response from SoundCloud",
                parsed.error,
                data,
            );
        }

        const playlistId =
            parsed.data.collection?.[0]?.items?.collection?.[0]?.id;
        if (!playlistId) {
            return [];
        }

        const playlistUrl = `${SoundcloudService.API_BASE}/playlists/${playlistId}?client_id=${this.clientId}`;
        const playlistData = await this.fetchJson(playlistUrl, signal);
        const playlistParsed =
            SoundcloudPlaylistResponseSchema.safeParse(playlistData);
        if (!playlistParsed.success) {
            throw new SoundcloudValidationError(
                "Failed to parse playlist response from SoundCloud",
                playlistParsed.error,
                playlistData,
            );
        }

        const ids = playlistParsed.data.tracks.map((track) => track.id);
        if (ids.length === 0) {
            return [];
        }

        return this.resolveIds(ids, signal);
    }

    public async resolveUrl(
        url: string,
        signal?: AbortSignal,
    ): Promise<SoundcloudRawTrack | SoundcloudRawPlaylist | null> {
        const resolveUrl = `${SoundcloudService.API_BASE}/resolve?url=${encodeURIComponent(
            url,
        )}&client_id=${this.clientId}`;

        const data = await this.fetchJson(resolveUrl, signal);
        const dataObj = data as Record<string, unknown> | null;
        if (!dataObj || typeof dataObj !== "object") {
            return null;
        }

        if (dataObj.kind === "track") {
            const parsed = SoundcloudRawTrackSchema.safeParse(dataObj);
            if (!parsed.success) {
                throw new SoundcloudValidationError(
                    `Failed to parse resolved SoundCloud track for URL: ${url}`,
                    parsed.error,
                    data,
                );
            }
            return parsed.data;
        }

        if (dataObj.kind === "playlist") {
            const parsed = SoundcloudRawPlaylistSchema.safeParse(dataObj);
            if (!parsed.success) {
                throw new SoundcloudValidationError(
                    `Failed to parse resolved SoundCloud playlist/album for URL: ${url}`,
                    parsed.error,
                    data,
                );
            }
            return parsed.data;
        }

        return null;
    }

    public async resolveId(
        id: string | number,
        signal?: AbortSignal,
    ): Promise<SoundcloudRawTrack | null> {
        const url = `${SoundcloudService.API_BASE}/tracks/${encodeURIComponent(
            id,
        )}?client_id=${this.clientId}`;

        const data = await this.fetchJson(url, signal);
        const parsed = SoundcloudRawTrackSchema.safeParse(data);
        if (!parsed.success) {
            throw new SoundcloudValidationError(
                `Failed to parse resolved SoundCloud track for ID: ${id}`,
                parsed.error,
                data,
            );
        }
        return parsed.data;
    }

    public async resolveIds(
        ids: (string | number)[],
        signal?: AbortSignal,
    ): Promise<SoundcloudRawTrack[]> {
        const url = `${SoundcloudService.API_BASE}/tracks?ids=${ids.join(",")}&client_id=${this.clientId}`;

        const data = await this.fetchJson(url, signal);
        const parsed = z.array(z.unknown()).safeParse(data);
        if (!parsed.success) {
            throw new SoundcloudValidationError(
                "Failed to parse resolveIds response from SoundCloud",
                parsed.error,
                data,
            );
        }

        const validTracks: SoundcloudRawTrack[] = [];
        for (const item of parsed.data) {
            const trackParse = SoundcloudRawTrackSchema.safeParse(item);
            if (trackParse.success) {
                validTracks.push(trackParse.data);
            }
        }

        return validTracks;
    }

    public async getStream(
        progressiveUrl: string,
        signal?: AbortSignal,
    ): Promise<ReadableStream> {
        const url = `${progressiveUrl}?client_id=${this.clientId}`;
        const data = await this.fetchJson(url, signal);

        const parsed = SoundcloudStreamResponseSchema.safeParse(data);
        if (!parsed.success) {
            throw new SoundcloudValidationError(
                "Failed to parse stream URL response from SoundCloud",
                parsed.error,
                data,
            );
        }

        const streamRes = await fetch(parsed.data.url, { signal });
        if (!streamRes.ok || !streamRes.body) {
            throw new SoundcloudAPIError(
                "Could not fetch a stream from the stream URL",
                streamRes.status,
                streamRes.statusText,
            );
        }

        return streamRes.body;
    }
}
