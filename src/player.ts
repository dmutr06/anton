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
import type { VoiceBasedChannel } from "discord.js";
import { toPlayError } from "./errors";
import { PlaybackSession, type TrackContext } from "./playbackSession";
import { createErrorEmbed, createNowPlayingEmbed } from "./utils/trackEmbeds";

export enum LoopMode {
    Off = "off",
    Track = "track",
    Queue = "queue",
}

export class Player {
    private queue: TrackContext[] = [];
    private audioPlayer: AudioPlayer = new AudioPlayer();
    private curChannel: VoiceBasedChannel | null = null;
    private voiceConn: VoiceConnection | null = null;
    private currentSession: PlaybackSession | null = null;
    private loopMode: LoopMode = LoopMode.Off;

    constructor() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () =>
            this.handlePlaybackIdle(),
        );
        this.audioPlayer.on("error", (error) =>
            this.handlePlaybackError(error),
        );
    }

    public async enqueue(trackCtx: TrackContext) {
        this.queue.push(trackCtx);

        if (!this.voiceConn && this.queue.length === 1) {
            this.next();
        }
    }

    public cleanupCurrentTrack() {
        if (this.currentSession) {
            this.currentSession.dispose();
            this.currentSession = null;
        }
    }

    public async next() {
        const trackCtx = this.queue[0];
        if (!trackCtx) {
            this.currentSession = null;
            return;
        }

        this.currentSession = new PlaybackSession(trackCtx);
        const signal = this.currentSession.signal;

        try {
            await this.ensureVoiceConnection(trackCtx.voiceChannel);

            if (signal.aborted) {
                if (this.queue[0] === trackCtx) {
                    this.queue.shift();
                }
                this.currentSession = null;
                return;
            }

            this.queue.shift();

            const outputStream = await this.currentSession.start();

            const resource = createAudioResource(outputStream, {
                inputType: StreamType.OggOpus,
            });

            this.voiceConn?.subscribe(this.audioPlayer);
            this.audioPlayer.play(resource);

            await this.sendNowPlaying(trackCtx);
        } catch (e) {
            await this.handlePlayError(trackCtx, e, signal);
        }
    }

    private async ensureVoiceConnection(channel: VoiceBasedChannel) {
        if (!this.voiceConn) {
            await this.connect(channel);
        } else if (this.curChannel?.id !== channel.id) {
            this.disconnect();
            await this.connect(channel);
        }
    }

    private async sendNowPlaying(trackCtx: TrackContext) {
        if (trackCtx.textChannel.isSendable()) {
            try {
                await trackCtx.textChannel.send({
                    embeds: [createNowPlayingEmbed(trackCtx.track)],
                });
            } catch (err) {
                console.error("Failed to send now playing embed:", err);
            }
        }
    }

    private async handlePlayError(
        trackCtx: TrackContext,
        error: unknown,
        signal: AbortSignal,
    ) {
        if (this.queue[0] === trackCtx) {
            this.queue.shift();
        }
        this.currentSession = null;

        if (signal.aborted) {
            this.next();
            return;
        }

        console.error(error);
        if (trackCtx.textChannel.isSendable()) {
            const playError = toPlayError(error);
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

        if (this.queue.length === 0) {
            this.disconnect();
        } else {
            this.next();
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

    public disconnect() {
        this.queue = [];
        this.cleanupCurrentTrack();
        this.curChannel = null;
        this.voiceConn?.destroy();
        this.voiceConn = null;
    }

    public stop() {
        this.audioPlayer.stop();
        this.disconnect();
    }

    public skip(): boolean {
        if (this.currentSession) {
            this.cleanupCurrentTrack();
            this.audioPlayer.stop();
            return true;
        }
        return false;
    }

    private handlePlaybackIdle() {
        if (this.currentSession) {
            if (this.loopMode === LoopMode.Track) {
                this.queue.unshift(this.currentSession.trackCtx);
            } else if (this.loopMode === LoopMode.Queue) {
                this.queue.push(this.currentSession.trackCtx);
            }
        }

        if (this.queue.length === 0) {
            this.disconnect();
        }
        this.next();
    }

    private handlePlaybackError(error: unknown) {
        console.error("AudioPlayer Error:", error);
        if (this.queue.length > 0) {
            this.next();
        } else {
            this.disconnect();
        }
    }

    public getQueue(): TrackContext[] {
        return this.queue;
    }

    public getCurrentTrack(): TrackContext | null {
        return this.currentSession ? this.currentSession.trackCtx : null;
    }

    public getVoiceChannel(): VoiceBasedChannel | null {
        return this.curChannel;
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
