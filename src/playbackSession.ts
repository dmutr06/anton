import type { Readable } from "node:stream";
import type { TextBasedChannel, VoiceBasedChannel } from "discord.js";
import type { Track } from "./track";
import { Transcoder } from "./utils/transcoder";

export type TrackContext = {
    track: Track;
    getStream: (signal?: AbortSignal) => Promise<ReadableStream>;
    args?: string;
    voiceChannel: VoiceBasedChannel;
    textChannel: TextBasedChannel;
};

export class PlaybackSession {
    public readonly abortController = new AbortController();
    private transcoder: Transcoder | null = null;

    constructor(public readonly trackCtx: TrackContext) {}

    public get signal(): AbortSignal {
        return this.abortController.signal;
    }

    public async start(): Promise<Readable> {
        const stream = await this.trackCtx.getStream(this.signal);

        if (this.signal.aborted) {
            throw new Error("Playback session aborted");
        }

        this.transcoder = new Transcoder(
            this.trackCtx.track,
            stream,
            this.trackCtx.args,
        );
        return this.transcoder.start();
    }

    public dispose() {
        this.abortController.abort();
        if (this.transcoder) {
            this.transcoder.kill();
            this.transcoder = null;
        }
    }
}
