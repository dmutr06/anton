import { spawn } from "bun";
import type { Provider } from "../provider";
import type { Track } from "../track";

export type YtdlpTrack = Track & {
    provider: "ytdlp";
};

export class YtdlpProvider implements Provider<YtdlpTrack> {
    readonly providerId = "ytdlp";
    readonly urlRegex = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i;

    public urlMatches(url: string): boolean {
        return this.urlRegex.test(url);
    }

    // TODO
    public idMatches(id: string): boolean {
        return false;
    }

    public async resolveUrl(url: string, signal?: AbortSignal): Promise<YtdlpTrack | null> {
        if (!this.urlMatches(url)) return null;

        try {
            const proc = spawn(
                ["yt-dlp", "-J", "--no-warnings", "--no-playlist", url],
                { stderr: null, signal }
            );

            const output = await new Response(proc.stdout).text();
            if (!output) return null;

            const data = JSON.parse(output);

            return {
                id: data.id || crypto.randomUUID(),
                title: data.title ?? "Unknown Video",
                author: data.uploader ?? data.creator ?? data.channel ?? "Unknown",
                duration: data.duration ?? 0,
                url: data.webpage_url ?? url,
                thumbnail: data.thumbnail ?? null,
                provider: "ytdlp",
            };
        } catch (e) {
            return null;
        }
    }

    // TODO
    public async resolveId(_id: string, _signal?: AbortSignal): Promise<YtdlpTrack | null> {
        return null;
    }

    public async getStream(track: YtdlpTrack, signal?: AbortSignal): Promise<ReadableStream> {
        const proc = spawn(
            ["yt-dlp", "-o", "-", "-q", "-f", "ba/b", "--no-warnings", "--no-playlist", track.url],
            {
                signal,
                stdout: "pipe",
                stderr: null,
            }
        );

        return proc.stdout;
    }
}
