import {
    type AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    NoSubscriberBehavior,
    type VoiceConnection,
    VoiceConnectionStatus,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { Track } from "../music/track";
import type {
    VoiceConnectionEvents,
    VoiceConnectionHandle,
    VoicePlayerEvents,
    VoicePlayerHandle,
    VoiceRuntime,
} from "./voiceRuntime";

type DiscordPlayerHandle = {
    player: AudioPlayer;
};

type DiscordConnectionHandle = {
    connection: VoiceConnection;
};

export class DiscordVoiceRuntime implements VoiceRuntime {
    createPlayer(events: VoicePlayerEvents): VoicePlayerHandle {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Stop,
            },
        });

        player.on(AudioPlayerStatus.Idle, (oldState) => {
            if (oldState.status !== AudioPlayerStatus.Idle) events.idle();
        });
        player.on("error", events.error);

        return { player } satisfies DiscordPlayerHandle;
    }

    connect(
        channel: VoiceBasedChannel,
        events: VoiceConnectionEvents,
    ): VoiceConnectionHandle {
        const connection = joinVoiceChannel({
            adapterCreator: channel.guild.voiceAdapterCreator,
            channelId: channel.id,
            guildId: channel.guildId,
            selfDeaf: true,
            selfMute: false,
        });
        connection.on("error", events.error);

        return { connection } satisfies DiscordConnectionHandle;
    }

    async waitUntilReady(
        handle: VoiceConnectionHandle,
        timeoutMs: number,
    ): Promise<void> {
        await entersState(
            this.connection(handle),
            VoiceConnectionStatus.Ready,
            timeoutMs,
        );
    }

    subscribe(
        connection: VoiceConnectionHandle,
        player: VoicePlayerHandle,
    ): void {
        this.connection(connection).subscribe(this.player(player));
    }

    play(player: VoicePlayerHandle, sourceUrl: string, track: Track): void {
        const resource = createAudioResource(sourceUrl, { metadata: track });
        this.player(player).play(resource);
    }

    stop(player: VoicePlayerHandle): boolean {
        return this.player(player).stop(true);
    }

    destroy(connection: VoiceConnectionHandle): void {
        this.connection(connection).destroy();
    }

    private player(handle: VoicePlayerHandle): AudioPlayer {
        return (handle as DiscordPlayerHandle).player;
    }

    private connection(handle: VoiceConnectionHandle): VoiceConnection {
        return (handle as DiscordConnectionHandle).connection;
    }
}
