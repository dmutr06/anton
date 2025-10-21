import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    type VoiceConnection,
    VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Track } from "./track";
import type { TextBasedChannel, VoiceBasedChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import type { Provider } from "./provider";
import { Readable } from "stream";
import { createNowPlayingEmbed } from "./utils/trackEmbeds";

export type TrackContext = {
    track: Track;
    args?: string;
    voiceChannel: VoiceBasedChannel;
    textChannel: TextBasedChannel;
    provider: Provider;
};

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export class Player {
    private queue: TrackContext[] = [];
    private audioPlayer: AudioPlayer = new AudioPlayer();
    private curChannel: VoiceBasedChannel | null = null;
    private voiceConn: VoiceConnection | null = null;

    constructor(public readonly providers: Provider[]) {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.queue.length === 0) {
                this.disconnect();
            }
            this.next();
        });
    }

    public async enqueue({
        query,
        args,
        voiceChannel,
        textChannel,
    }: {
        query: string;
        args?: string;
        voiceChannel: VoiceBasedChannel;
        textChannel: TextBasedChannel;
    }): Promise<Track> {
        const provider = this.providers[0]!;
        const tracks = await provider.search(query);
        const track = tracks[0]!;

        this.queue.push({ track, args, voiceChannel, textChannel, provider });

        if (!this.voiceConn) {
            this.next();
        }

        return track;
    }

    public async next() {
        const trackCtx = this.queue.shift();
        if (!trackCtx) return;

        if (!this.voiceConn) {
            await this.connect(trackCtx.voiceChannel);
        } else if (this.curChannel?.id !== trackCtx.voiceChannel.id) {
            this.disconnect();
            await this.connect(trackCtx.voiceChannel);
        }

        try {
            const stream = await trackCtx.provider.getStream(trackCtx.track);
            const ffmpeg = Bun.spawn(
                [
                    "ffmpeg",
                    "-i",
                    "pipe:0",
                    "-f",
                    "opus",
                    ...(trackCtx.args ? ["-af", trackCtx.args] : []),
                    "pipe:1",
                ],
                {
                    stdin: stream,
                    stdout: "pipe",
                },
            );

            const resource = createAudioResource(Readable.from(ffmpeg.stdout));
            this.voiceConn?.subscribe(this.audioPlayer);
            this.audioPlayer.play(resource);

            if (trackCtx.textChannel.isSendable()) {
                await trackCtx.textChannel.send({
                    embeds: [createNowPlayingEmbed(trackCtx.track)],
                });
            }
        } catch (e) {
            console.log(e);
            if (this.queue.length == 0) {
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
