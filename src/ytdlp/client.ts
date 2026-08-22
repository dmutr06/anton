import { Readable } from "node:stream";
import { YtdlpProcessError, YtdlpValidationError } from "./errors";
import {
    type YtdlpEntry,
    ytdlpSearchSchema,
    ytdlpTrackSchema,
} from "./schemas";

export type YtdlpClientConfig = {
    executable: string;
};

export type YtdlpRun = (
    args: readonly string[],
    signal: AbortSignal,
) => Promise<string>;

const COMMON_ARGS = ["--no-warnings", "--ignore-config"] as const;
const EXTRACTOR_ARGS = "youtube:player-client=android,web";

export interface YtdlpCatalogClient {
    search(query: string, signal: AbortSignal): Promise<readonly YtdlpEntry[]>;
    resolve(url: string, signal: AbortSignal): Promise<YtdlpEntry | null>;
    getStreamUrl(url: string, signal: AbortSignal): Promise<string>;
    getLiveAudioStream(url: string, signal: AbortSignal): Readable;
}

export class YtdlpClient implements YtdlpCatalogClient {
    private readonly runCommand: YtdlpRun;

    constructor(
        private readonly config: YtdlpClientConfig,
        runner?: YtdlpRun,
    ) {
        this.runCommand =
            runner ??
            ((args, signal) => runYtdlp(this.config.executable, args, signal));
    }

    async search(
        query: string,
        signal: AbortSignal,
    ): Promise<readonly YtdlpEntry[]> {
        const output = await this.runCommand(
            [
                "--dump-single-json",
                "--flat-playlist",
                ...COMMON_ARGS,
                `ytsearch20:${query}`,
            ],
            signal,
        );
        const result = ytdlpSearchSchema.safeParse(this.parseJson(output));

        if (!result.success) {
            throw new YtdlpValidationError(
                "Invalid yt-dlp search response",
                result.error,
            );
        }

        return (
            result.data.entries?.flatMap((entry) => (entry ? [entry] : [])) ??
            []
        );
    }

    async resolve(
        url: string,
        signal: AbortSignal,
    ): Promise<YtdlpEntry | null> {
        const output = await this.runCommand(
            [
                "--dump-single-json",
                "--flat-playlist",
                ...COMMON_ARGS,
                "--no-playlist",
                url,
            ],
            signal,
        );
        const result = ytdlpTrackSchema.safeParse(this.parseJson(output));

        if (!result.success) {
            throw new YtdlpValidationError(
                "Invalid yt-dlp track response",
                result.error,
            );
        }

        return result.data;
    }

    async getStreamUrl(url: string, signal: AbortSignal): Promise<string> {
        const output = await this.runCommand(
            [
                "--get-url",
                "--format",
                "bestaudio/best",
                ...COMMON_ARGS,
                "--no-playlist",
                "--extractor-args",
                EXTRACTOR_ARGS,
                url,
            ],
            signal,
        );
        const streamUrl = output.trim().split(/\r?\n/, 1)[0] ?? "";

        try {
            return new URL(streamUrl).toString();
        } catch (error) {
            throw new YtdlpValidationError(
                "yt-dlp returned an invalid stream URL",
                { cause: error },
            );
        }
    }

    getLiveAudioStream(url: string, signal: AbortSignal): Readable {
        return streamYtdlp(
            this.config.executable,
            [
                "--format",
                "bestaudio/best",
                "--downloader",
                "ffmpeg",
                "--downloader-args",
                "ffmpeg_o:-map 0:a:0 -vn -f adts",
                "--output",
                "-",
                "--quiet",
                ...COMMON_ARGS,
                "--no-playlist",
                "--extractor-args",
                EXTRACTOR_ARGS,
                url,
            ],
            signal,
        );
    }

    private parseJson(output: string): unknown {
        try {
            return JSON.parse(output);
        } catch (error) {
            throw new YtdlpValidationError("yt-dlp returned invalid JSON", {
                cause: error,
            });
        }
    }
}

function streamYtdlp(
    executable: string,
    args: readonly string[],
    signal: AbortSignal,
): Readable {
    signal.throwIfAborted();

    let process: ReturnType<typeof Bun.spawn>;
    try {
        process = Bun.spawn([executable, ...args], {
            signal,
            stdout: "pipe",
            stderr: "pipe",
        });
    } catch {
        throw new YtdlpProcessError("Failed to start yt-dlp", undefined);
    }

    if (
        !(process.stdout instanceof ReadableStream) ||
        !(process.stderr instanceof ReadableStream)
    ) {
        throw new YtdlpProcessError("yt-dlp output is unavailable");
    }

    const stream = Readable.fromWeb(process.stdout);
    void Promise.all([process.exited, new Response(process.stderr).text()])
        .then(([exitCode, stderr]) => {
            if (exitCode === 0 || signal.aborted || stream.destroyed) return;

            const details = stderr.trim();
            stream.destroy(
                new YtdlpProcessError(
                    details ? `yt-dlp failed: ${details}` : "yt-dlp failed",
                    exitCode,
                ),
            );
        })
        .catch((error: unknown) => {
            if (signal.aborted || stream.destroyed) return;
            stream.destroy(
                error instanceof Error
                    ? error
                    : new YtdlpProcessError("yt-dlp failed"),
            );
        });

    return stream;
}

async function runYtdlp(
    executable: string,
    args: readonly string[],
    signal: AbortSignal,
): Promise<string> {
    signal.throwIfAborted();

    let process: ReturnType<typeof Bun.spawn>;
    try {
        process = Bun.spawn([executable, ...args], {
            signal,
            stdout: "pipe",
            stderr: "pipe",
        });
    } catch {
        throw new YtdlpProcessError("Failed to start yt-dlp", undefined);
    }

    if (
        !(process.stdout instanceof ReadableStream) ||
        !(process.stderr instanceof ReadableStream)
    ) {
        throw new YtdlpProcessError("yt-dlp output is unavailable");
    }

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
    ]);

    signal.throwIfAborted();

    if (exitCode !== 0) {
        const details = stderr.trim();
        throw new YtdlpProcessError(
            details ? `yt-dlp failed: ${details}` : "yt-dlp failed",
            exitCode,
        );
    }

    return stdout;
}
