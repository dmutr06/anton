import type { VoiceBasedChannel } from "discord.js";
import { Readable } from "stream";

export class Track {
    constructor(public readonly url: string, public readonly channel: VoiceBasedChannel) {}

    public fetch(): Readable {
        const ytdlp = Bun.spawn([
            "yt-dlp",
            this.url,
            "-o", "-",
            "-f", "bestaudio",
            "--no-playlist",
            "--limit-rate",
            "500K",
        ], { stdout: "pipe" });

        const ffmpeg = Bun.spawn([
            "ffmpeg",
            "-i", "pipe:0",
            "-c:a", "libopus",
            "-f", "opus",
            "pipe:1",
        ], { stdin: ytdlp.stdout, stdout: "pipe" });

        ffmpeg.stdout

        return Readable.from(ffmpeg.stdout);
    }
}
