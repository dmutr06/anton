import { AudioPlayer, AudioPlayerStatus, createAudioResource, entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { Track } from "./track";
import type { VoiceBasedChannel } from "discord.js";

export class Player {
    private queue: Track[] = [];
    private audioPlayer: AudioPlayer = new AudioPlayer();
    private curChannel: VoiceBasedChannel | null = null;
    private voiceConn: VoiceConnection | null = null;

    constructor() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.queue.length === 0) {
                this.curChannel = null;
                this.voiceConn?.destroy();
                this.voiceConn = null;
                return;
            }
            this.next();
        });
    }

    public enqueue(url: string, channel: VoiceBasedChannel) {
        this.queue.push(new Track(url, channel));

        if (!this.voiceConn) {
            this.next();
        }
    }

    public async next() {
        const track = this.queue.shift();
        if (!track) return;

        const stream = track.fetch();

        if (!this.voiceConn) {
            await this.connect(track.channel);
        } else if (this.curChannel?.id !== track.channel.id) {
            this.voiceConn?.destroy();
            await this.connect(track.channel);
        }

        const resource = createAudioResource(stream);
        this.voiceConn?.subscribe(this.audioPlayer);
        this.audioPlayer.play(resource);
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

    public stop() {
        this.queue = [];
        this.audioPlayer.stop();
    }
}
