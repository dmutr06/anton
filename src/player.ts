import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Track } from "./track";
import type { VoiceBasedChannel } from "discord.js";
import type { Provider } from "./provider";
import { Readable } from "stream";

export type TrackContext = {
    track: Track;
    channel: VoiceBasedChannel;
    provider: Provider;
};

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

    public async enqueue(query: string, channel: VoiceBasedChannel) {
        const provider = this.providers[0]!;
        const tracks = await provider.search(query);

        this.queue.push({ track: tracks[0]!, channel, provider });

        if (!this.voiceConn) {
            this.next();
        }
    }

    public async next() {
        const track = this.queue.shift();
        if (!track) return;

        if (!this.voiceConn) {
            await this.connect(track.channel);
        } else if (this.curChannel?.id !== track.channel.id) {
            this.disconnect();
            await this.connect(track.channel);
        }

        try {
            const stream = await track.provider.getStream(track.track);

            const ffmpeg = Bun.spawn(
                [
                    "ffmpeg",
                    "-i", "pipe:0",
                    "-f", "opus",
                    "-ar", "48000",
                    "-ac", "2",
                    "pipe:1",
                ],
                {
                stdin: stream,
                stdout: "pipe",
            });

            const resource = createAudioResource(Readable.from(ffmpeg.stdout));
            this.voiceConn?.subscribe(this.audioPlayer);
            this.audioPlayer.play(resource);
        } catch (e) {
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
}
