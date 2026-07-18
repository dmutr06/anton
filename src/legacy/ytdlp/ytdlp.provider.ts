import { spawn } from "bun";
import type { SearchableProvider } from "../provider";
import type { Track } from "../track";

export type YtdlpTrack = Track & {
    provider: "ytdlp";
};

export class YtdlpProvider implements SearchableProvider<YtdlpTrack> {
    readonly providerId = "ytdlp";
    readonly urlRegex =
        /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i;

    public async search(
        query: string,
        signal?: AbortSignal,
    ): Promise<YtdlpTrack[]> {
        try {
            const proc = spawn(
                [
                    "yt-dlp",
                    "-J",
                    "--flat-playlist",
                    "--no-warnings",
                    "--no-call-home",
                    `ytsearch20:${query}`,
                ],
                { stderr: null, signal },
            );

            const output = await new Response(proc.stdout).text();
            if (!output) return [];

            const data = JSON.parse(output);
            const entries = data.entries || [];

            return entries.map((entry: any) => ({
                id: entry.id || crypto.randomUUID(),
                title: entry.title ?? "Unknown Video",
                author:
                    entry.uploader ??
                    entry.creator ??
                    entry.channel ??
                    "Unknown",
                duration: entry.duration ?? 0,
                url:
                    entry.webpage_url ??
                    `https://www.youtube.com/watch?v=${entry.id}`,
                thumbnail: entry.thumbnail ?? undefined,
                provider: "ytdlp",
            }));
        } catch (_e) {
            return [];
        }
    }

    public matchUrl(url: string): boolean {
        return this.urlRegex.test(url);
    }

    public matchId(_id: string): boolean {
        return false;
    }

    public async resolveUrl(
        url: string,
        signal?: AbortSignal,
    ): Promise<YtdlpTrack | null> {
        if (!this.matchUrl(url)) return null;

        try {
            const proc = spawn(
                [
                    "yt-dlp",
                    "-J",
                    "--flat-playlist",
                    "--no-warnings",
                    "--no-call-home",
                    "--no-playlist",
                    url,
                ],
                { stderr: null, signal },
            );

            const output = await new Response(proc.stdout).text();
            if (!output) return null;

            const data = JSON.parse(output);

            return {
                id: data.id || crypto.randomUUID(),
                title: data.title ?? "Unknown Video",
                author:
                    data.uploader ?? data.creator ?? data.channel ?? "Unknown",
                duration: data.duration ?? 0,
                url: data.webpage_url ?? url,
                thumbnail: data.thumbnail ?? undefined,
                provider: "ytdlp",
            };
        } catch (_e) {
            return null;
        }
    }

    public async resolveId(
        _id: string,
        _signal?: AbortSignal,
    ): Promise<YtdlpTrack | null> {
        return null;
    }

    public async getStream(
        track: YtdlpTrack,
        signal?: AbortSignal,
    ): Promise<ReadableStream> {
        const proc = spawn(
            [
                "yt-dlp",
                "-o",
                "-",
                "-q",
                "-f",
                "ba/b",
                "--no-warnings",
                "--no-check-formats",
                "--no-call-home",
                "--no-playlist",
                "--extractor-args",
                "youtube:player-client=android,web",
                track.url,
            ],
            {
                signal,
                stdout: "pipe",
                stderr: null,
            },
        );

        return proc.stdout;
    }
}
