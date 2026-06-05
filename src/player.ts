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
import { createNowPlayingEmbed } from "./utils/trackEmbeds";

export type TrackContext = {
    track: Track;
    getStream: () => Promise<ReadableStream>;
    args?: string;
    voiceChannel: VoiceBasedChannel;
    textChannel: TextBasedChannel;
};

export class Player {
    private queue: TrackContext[] = [];
    private audioPlayer: AudioPlayer = new AudioPlayer();
    private curChannel: VoiceBasedChannel | null = null;
    private voiceConn: VoiceConnection | null = null;
    constructor() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.queue.length === 0) {
                this.disconnect();
            }
            this.next();
        });
    }

    public async enqueue(trackCtx: TrackContext) {
        this.queue.push(trackCtx);

        if (!this.voiceConn && this.queue.length === 1) {
            this.next();
        }
    }

    public async next() {
        const trackCtx = this.queue[0];
        if (!trackCtx) return;

        try {
            if (!this.voiceConn) {
                await this.connect(trackCtx.voiceChannel);
            } else if (this.curChannel?.id !== trackCtx.voiceChannel.id) {
                this.disconnect();
                await this.connect(trackCtx.voiceChannel);
            }

            this.queue.shift();

            const stream = await trackCtx.getStream();
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
            console.error(e);
            if (this.queue[0] === trackCtx) {
                this.queue.shift();
            }
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
        this.curChannel = null;
        this.voiceConn?.destroy();
        this.voiceConn = null;
    }

    public stop() {
        this.queue = [];
        this.audioPlayer.stop();
    }

    public skip(): boolean {
        if (this.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
            this.audioPlayer.stop();
            return true;
        }
        return false;
    }
}
