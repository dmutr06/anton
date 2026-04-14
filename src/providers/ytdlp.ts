import type { Provider } from "../provider";
import type { PlayableTrack, Track } from "../track";

export class YtdlpProvider implements Provider {
    public async search(query: string): Promise<Track[]> {
        const proc = Bun.spawn(
            [
                "yt-dlp",
                `ytsearch5:${query}`,
                "--dump-json",
                "--flat-playlist",
                "--no-download",
                "--no-warnings",
                "--no-check-certificates",
            ],
            { stdout: "pipe", stderr: "pipe" },
        );

        const output = await new Response(proc.stdout).text();
        await proc.exited;

        if (proc.exitCode !== 0) {
            return [];
        }

        const tracks: Track[] = [];
        for (const line of output.split("\n")) {
            if (!line.trim()) continue;

            try {
                const info = JSON.parse(line);
                tracks.push(this.mapToTrack(info));
            } catch {
                continue;
            }
        }

        return tracks;
    }

    public async resolveTrack(query: string): Promise<PlayableTrack | null> {
        const proc = Bun.spawn(
            [
                "yt-dlp",
                query,
                "--dump-json",
                "--no-download",
                "--no-warnings",
                "--no-check-certificates",
                "--no-playlist",
            ],
            { stdout: "pipe", stderr: "pipe" },
        );

        const output = await new Response(proc.stdout).text();
        await proc.exited;

        if (proc.exitCode !== 0) {
            return null;
        }

        try {
            const info = JSON.parse(output.trim());
            const streamUrl = info.webpage_url ?? info.url ?? query;
            return { ...this.mapToTrack(info), streamUrl };
        } catch {
            return null;
        }
    }

    public async getStream(track: PlayableTrack): Promise<ReadableStream> {
        const proc = Bun.spawn(
            [
                "yt-dlp",
                "-f",
                "bestaudio",
                "-o",
                "-",
                "--no-warnings",
                "--no-check-certificates",
                "--no-playlist",
                track.streamUrl,
            ],
            { stdout: "pipe", stderr: "pipe" },
        );

        return proc.stdout as ReadableStream;
    }

    private mapToTrack(info: any): Track {
        return {
            id: info.id ?? info.url ?? "",
            title: info.title ?? "Unknown",
            author: info.uploader ?? info.channel ?? "Unknown",
            duration: info.duration ?? 0,
            url: info.webpage_url ?? info.url ?? "",
            thumbnail:
                info.thumbnail ??
                info.thumbnails?.at(-1)?.url ??
                undefined,
        };
    }
}
