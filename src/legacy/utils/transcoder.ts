import { Readable } from "node:stream";
import type { Track } from "../track";

export class Transcoder {
    private process: ReturnType<typeof Bun.spawn> | null = null;

    constructor(
        public readonly track: Track,
        private inputStream: ReadableStream,
        private filters?: string,
    ) {}

    public start(): Readable {
        this.process = Bun.spawn(
            [
                "ffmpeg",
                "-i",
                "pipe:0",
                ...(this.filters ? ["-af", this.filters] : []),
                "-f",
                "opus",
                "pipe:1",
            ],
            {
                stdin: this.inputStream,
                stdout: "pipe",
                stderr: null,
            },
        );

        if (!this.process.stdout) {
            throw new Error(
                `FFmpeg stdout is not available for track: "${this.track.title}"`,
            );
        }

        return Readable.from(this.process.stdout as any);
    }

    public kill() {
        if (this.process) {
            try {
                this.process.kill();
            } catch {}
            this.process = null;
        }
    }
}
