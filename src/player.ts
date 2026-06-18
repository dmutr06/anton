import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    StreamType,
    type VoiceConnection,
    VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Track } from "./track";
import type { TextBasedChannel, VoiceBasedChannel } from "discord.js";
import { Readable } from "node:stream";
import { createNowPlayingEmbed, createErrorEmbed } from "./utils/trackEmbeds";
import { toPlayError } from "./errors";

export enum LoopMode {
    Off = "off",
    Track = "track",
    Queue = "queue",
}

export type TrackContext = {
    track: Track;
    getStream: (signal?: AbortSignal) => Promise<ReadableStream>;
    args?: string;
    voiceChannel: VoiceBasedChannel;
    textChannel: TextBasedChannel;
};

export class Player {
    private queue: TrackContext[] = [];
    private audioPlayer: AudioPlayer = new AudioPlayer();
    private curChannel: VoiceBasedChannel | null = null;
    private voiceConn: VoiceConnection | null = null;
    private currentTrack: TrackContext | null = null;
    private currentAbortController: AbortController | null = null;
    private currentFfmpegProcess: ReturnType<typeof Bun.spawn> | null = null;
    private isLoading = false;
    private loopMode: LoopMode = LoopMode.Off;
    constructor() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.currentTrack) {
                if (this.loopMode === LoopMode.Track) {
                    this.queue.unshift(this.currentTrack);
                } else if (this.loopMode === LoopMode.Queue) {
                    this.queue.push(this.currentTrack);
                }
            }

            if (this.queue.length === 0) {
                this.disconnect();
            }
            this.next();
        });

        this.audioPlayer.on("error", (error) => {
            console.error("AudioPlayer Error:", error);
            if (this.queue.length > 0) {
                this.next();
            } else {
                this.disconnect();
            }
        });
    }

    public async enqueue(trackCtx: TrackContext) {
        this.queue.push(trackCtx);

        if (!this.voiceConn && this.queue.length === 1) {
            this.next();
        }
    }

    public cleanupCurrentTrack() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        if (this.currentFfmpegProcess) {
            try {
                this.currentFfmpegProcess.kill();
            } catch (e) {
                console.error("Failed to kill ffmpeg process:", e);
            }
            this.currentFfmpegProcess = null;
        }
    }

    public async next() {
        if (this.isLoading) return;

        const trackCtx = this.queue[0];
        if (!trackCtx) {
            this.currentTrack = null;
            return;
        }

        this.isLoading = true;
        this.currentTrack = trackCtx;
        this.currentAbortController = new AbortController();
        const signal = this.currentAbortController.signal;

        try {
            if (!this.voiceConn) {
                await this.connect(trackCtx.voiceChannel);
            } else if (this.curChannel?.id !== trackCtx.voiceChannel.id) {
                this.disconnect();
                await this.connect(trackCtx.voiceChannel);
            }

            if (signal.aborted) {
                this.isLoading = false;
                this.currentTrack = null;
                this.next();
                return;
            }

            this.queue.shift();

            const stream = await trackCtx.getStream(signal);

            if (signal.aborted) {
                this.isLoading = false;
                this.currentTrack = null;
                this.next();
                return;
            }

            const ffmpeg = Bun.spawn(
                [
                    "ffmpeg",
                    "-i",
                    "pipe:0",
                    ...(trackCtx.args ? ["-af", trackCtx.args] : []),
                    "-f",
                    "opus",
                    "pipe:1",
                ],
                {
                    stdin: stream,
                    stdout: "pipe",
                    stderr: null,
                },
            );

            if (signal.aborted) {
                try {
                    ffmpeg.kill();
                } catch {}
                this.isLoading = false;
                this.currentTrack = null;
                this.next();
                return;
            }

            this.currentFfmpegProcess = ffmpeg;
            this.isLoading = false;

            const resource = createAudioResource(Readable.from(ffmpeg.stdout), {
                inputType: StreamType.OggOpus,
            });

            this.voiceConn?.subscribe(this.audioPlayer);
            this.audioPlayer.play(resource);

            if (trackCtx.textChannel.isSendable()) {
                await trackCtx.textChannel.send({
                    embeds: [createNowPlayingEmbed(trackCtx.track)],
                });
            }
        } catch (e) {
            this.isLoading = false;
            this.currentFfmpegProcess = null;

            if (signal.aborted) {
                this.currentTrack = null;
                this.next();
                return;
            }

            console.error(e);
            if (trackCtx.textChannel.isSendable()) {
                const playError = toPlayError(e);
                try {
                    await trackCtx.textChannel.send({
                        embeds: [createErrorEmbed(playError)],
                    });
                } catch (sendError) {
                    console.error(
                        "Failed to send error embed to text channel:",
                        sendError,
                    );
                }
            }
            if (this.queue[0] === trackCtx) {
                this.queue.shift();
            }
            this.currentTrack = null;
            if (this.queue.length === 0) {
                this.disconnect();
            } else {
                this.next();
            }
        }
    }

    private async connect(channel: VoiceBasedChannel) {
        const connection = joinVoiceChannel({
            adapterCreator: channel.guild.voiceAdapterCreator,
            channelId: channel.id,
            guildId: channel.guildId,
            selfDeaf: true,
            selfMute: false,
        });

        connection.on("error", (error) => {
            console.error("VoiceConnection Error:", error);
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        } catch {
            try {
                connection.destroy();
            } catch {}
            throw new Error("Failed to join voice channel");
        }

        this.voiceConn = connection;
        this.curChannel = channel;
    }

    public async disconnect() {
        this.queue = [];
        this.cleanupCurrentTrack();
        this.currentTrack = null;
        this.curChannel = null;
        this.voiceConn?.destroy();
        this.voiceConn = null;
    }

    public stop() {
        this.queue = [];
        this.cleanupCurrentTrack();
        this.currentTrack = null;
        this.audioPlayer.stop();
        this.disconnect();
    }

    public skip(): boolean {
        if (this.currentTrack) {
            this.cleanupCurrentTrack();
            this.currentTrack = null;
            const wasIdle =
                this.audioPlayer.state.status === AudioPlayerStatus.Idle;
            this.audioPlayer.stop();
            if (wasIdle) {
                this.next();
            }
            return true;
        }
        return false;
    }

    public getQueue(): TrackContext[] {
        return this.queue;
    }

    public getCurrentTrack(): TrackContext | null {
        return this.currentTrack;
    }

    public pause(): boolean {
        return this.audioPlayer.pause();
    }

    public resume(): boolean {
        return this.audioPlayer.unpause();
    }

    public isPaused(): boolean {
        return this.audioPlayer.state.status === AudioPlayerStatus.Paused;
    }

    public clearQueue() {
        this.queue = [];
    }

    public setLoopMode(mode: LoopMode) {
        this.loopMode = mode;
    }

    public getLoopMode(): LoopMode {
        return this.loopMode;
    }
}
