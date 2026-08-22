import { describe, expect, test } from "bun:test";
import { YtdlpClient, type YtdlpRun } from "../../src/ytdlp/client";
import { YtdlpValidationError } from "../../src/ytdlp/errors";

const entry = {
    id: "abc123",
    title: "Track",
    uploader: "Artist",
    duration: 125,
    webpage_url: "https://www.youtube.com/watch?v=abc123",
    thumbnail: "https://img.youtube.com/vi/abc123/0.jpg",
    is_live: true,
    live_status: "is_live",
};

describe("YtdlpClient", () => {
    test("builds search commands and forwards cancellation", async () => {
        const controller = new AbortController();
        let args: readonly string[] = [];
        let requestedSignal: AbortSignal | undefined;
        const runner: YtdlpRun = async (commandArgs, signal) => {
            args = commandArgs;
            requestedSignal = signal;
            return JSON.stringify({ entries: [entry, null] });
        };
        const client = new YtdlpClient({ executable: "yt-dlp" }, runner);

        const tracks = await client.search("artist & track", controller.signal);

        expect(tracks).toEqual([entry]);
        expect(args).toContain("ytsearch20:artist & track");
        expect(args).toContain("--flat-playlist");
        expect(args).toContain("--ignore-config");
        expect(requestedSignal).toBe(controller.signal);
    });

    test("resolves a URL and extracts the first stream URL", async () => {
        const calls: readonly string[][] = [];
        const runner: YtdlpRun = async (args) => {
            (calls as string[][]).push([...args]);
            return args.includes("--get-url")
                ? "https://media.youtube.test/audio\nhttps://media.youtube.test/video\n"
                : JSON.stringify(entry);
        };
        const client = new YtdlpClient({ executable: "yt-dlp" }, runner);

        const resolved = await client.resolve(
            entry.webpage_url,
            new AbortController().signal,
        );
        const streamUrl = await client.getStreamUrl(
            entry.webpage_url,
            new AbortController().signal,
        );

        expect(resolved).toEqual(entry);
        expect(streamUrl).toBe("https://media.youtube.test/audio");
        expect(calls[1]).toContain("--get-url");
        expect(calls[1]).toContain("--extractor-args");
    });

    test("rejects malformed command output", async () => {
        const runner: YtdlpRun = async () => "not-json";
        const client = new YtdlpClient({ executable: "yt-dlp" }, runner);

        await expect(
            client.resolve(entry.webpage_url, new AbortController().signal),
        ).rejects.toBeInstanceOf(YtdlpValidationError);
    });

    test("rejects invalid stream URLs", async () => {
        const runner: YtdlpRun = async () => "not-a-url";
        const client = new YtdlpClient({ executable: "yt-dlp" }, runner);

        await expect(
            client.getStreamUrl(
                entry.webpage_url,
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(YtdlpValidationError);
    });

    test("streams live audio as ADTS without video", async () => {
        const client = new YtdlpClient({ executable: "echo" });
        const stream = client.getLiveAudioStream(
            entry.webpage_url,
            new AbortController().signal,
        );
        let output = "";
        for await (const chunk of stream) output += chunk.toString();

        expect(output).toContain("--downloader ffmpeg");
        expect(output).toContain("ffmpeg_o:-map 0:a:0 -vn -f adts");
        expect(output).toContain("--output -");
    });
});
