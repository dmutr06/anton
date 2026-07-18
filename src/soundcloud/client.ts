import {
    SoundCloudError,
    SoundCloudRequestError,
    SoundCloudValidationError,
} from "./errors";
import {
    type SoundCloudPlaylistData,
    type SoundCloudTrackData,
    soundCloudChartsSchema,
    soundCloudPlaylistSchema,
    soundCloudPlaylistTracksSchema,
    soundCloudSearchSchema,
    soundCloudStreamSchema,
    soundCloudTrackListSchema,
    soundCloudTrackSchema,
} from "./schemas";

export type SoundCloudClientConfig = {
    clientId: string;
};

export type SoundCloudFetch = (
    input: string | URL,
    init?: RequestInit,
) => Promise<Response>;

const TRENDING_PLAYLIST_LIMIT = 5;
const TRENDING_TRACK_LIMIT = 100;
const RESOLVE_BATCH_SIZE = 50;

export class SoundCloudClient {
    private readonly apiUrl = new URL("https://api-v2.soundcloud.com");

    constructor(
        private readonly config: SoundCloudClientConfig,
        private readonly fetcher: SoundCloudFetch = globalThis.fetch,
    ) {}

    async search(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly SoundCloudTrackData[]> {
        const data = await this.fetchJson(
            "/search/tracks",
            { q: query, limit: "20" },
            signal,
        );
        const result = soundCloudSearchSchema.safeParse(data);

        if (!result.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud search response",
                result.error,
            );
        }

        return result.data.collection.flatMap((item) => {
            const track = soundCloudTrackSchema.safeParse(item);
            return track.success ? [track.data] : [];
        });
    }

    async getTrending(
        signal: AbortSignal,
    ): Promise<readonly SoundCloudTrackData[]> {
        const chartData = await this.fetchJson(
            "/charts/selections",
            {},
            signal,
        );
        const chart = soundCloudChartsSchema.safeParse(chartData);

        if (!chart.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud charts response",
                chart.error,
            );
        }

        const playlistIds = [
            ...new Set(
                chart.data.collection.flatMap((selection) =>
                    selection.items.collection.map((playlist) => playlist.id),
                ),
            ),
        ].slice(0, TRENDING_PLAYLIST_LIMIT);

        const playlists = await Promise.all(
            playlistIds.map(async (playlistId) => {
                const data = await this.fetchJson(
                    `/playlists/${playlistId}`,
                    {},
                    signal,
                );
                const result = soundCloudPlaylistTracksSchema.safeParse(data);

                if (!result.success) {
                    throw new SoundCloudValidationError(
                        "Invalid SoundCloud chart playlist response",
                        result.error,
                    );
                }

                return result.data;
            }),
        );

        const urns = [
            ...new Set(
                playlists.flatMap((playlist) =>
                    playlist.tracks.map((track) => track.urn),
                ),
            ),
        ].slice(0, TRENDING_TRACK_LIMIT);
        const batches: string[][] = [];

        for (let index = 0; index < urns.length; index += RESOLVE_BATCH_SIZE) {
            batches.push(urns.slice(index, index + RESOLVE_BATCH_SIZE));
        }

        const resolved = (
            await Promise.all(
                batches.map((batch) => this.resolveUrns(batch, signal)),
            )
        ).flat();
        const tracksByUrn = new Map(
            resolved.map((track) => [track.urn, track]),
        );

        return urns.flatMap((urn) => {
            const track = tracksByUrn.get(urn);
            return track ? [track] : [];
        });
    }

    async resolveUrl(
        value: string,
        signal: AbortSignal,
    ): Promise<SoundCloudTrackData | SoundCloudPlaylistData | null> {
        const data = await this.fetchJson("/resolve", { url: value }, signal);

        if (!data || typeof data !== "object") return null;

        const kind = Reflect.get(data, "kind");
        const result =
            kind === "track"
                ? soundCloudTrackSchema.safeParse(data)
                : kind === "playlist"
                  ? soundCloudPlaylistSchema.safeParse(data)
                  : null;

        if (!result) return null;

        if (!result.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud resolve response",
                result.error,
            );
        }

        return result.data;
    }

    async resolveUrn(
        urn: string,
        signal: AbortSignal,
    ): Promise<SoundCloudTrackData> {
        const data = await this.fetchJson(
            `/tracks/${encodeURIComponent(urn)}`,
            {},
            signal,
        );
        const result = soundCloudTrackSchema.safeParse(data);

        if (!result.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud track response",
                result.error,
            );
        }

        return result.data;
    }

    async resolveUrns(
        urns: readonly string[],
        signal: AbortSignal,
    ): Promise<readonly SoundCloudTrackData[]> {
        if (urns.length === 0) return [];

        const data = await this.fetchJson(
            "/tracks",
            { urns: urns.join(",") },
            signal,
        );
        const result = soundCloudTrackListSchema.safeParse(data);

        if (!result.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud track list response",
                result.error,
            );
        }

        return result.data.flatMap((item) => {
            const track = soundCloudTrackSchema.safeParse(item);
            return track.success ? [track.data] : [];
        });
    }

    async resolveStreamUrl(
        transcodingUrl: string,
        signal: AbortSignal,
    ): Promise<string> {
        const streamData = await this.fetchAbsoluteJson(transcodingUrl, signal);
        const stream = soundCloudStreamSchema.safeParse(streamData);

        if (!stream.success) {
            throw new SoundCloudValidationError(
                "Invalid SoundCloud stream response",
                stream.error,
            );
        }

        return stream.data.url;
    }

    private async fetchJson(
        path: string,
        params: Readonly<Record<string, string>>,
        signal: AbortSignal,
    ): Promise<unknown> {
        const url = new URL(path, this.apiUrl);

        for (const [name, value] of Object.entries(params)) {
            url.searchParams.set(name, value);
        }

        url.searchParams.set("client_id", this.config.clientId);
        return this.requestJson(url, signal);
    }

    private async fetchAbsoluteJson(
        value: string,
        signal: AbortSignal,
    ): Promise<unknown> {
        const url = new URL(value);

        if (
            url.protocol !== "https:" ||
            url.hostname !== this.apiUrl.hostname
        ) {
            throw new SoundCloudError("Invalid SoundCloud transcoding URL");
        }

        url.searchParams.set("client_id", this.config.clientId);
        return this.requestJson(url, signal);
    }

    private async requestJson(url: URL, signal: AbortSignal): Promise<unknown> {
        const response = await this.fetcher(url, { signal });

        if (!response.ok) {
            throw new SoundCloudRequestError(
                "SoundCloud API request failed",
                response.status,
                response.statusText,
            );
        }

        return response.json();
    }
}
