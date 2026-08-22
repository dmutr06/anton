import { Readable } from "node:stream";
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
import type { AudioSource } from "../music/provider";
import type { Track } from "../music/track";
import {
    EmptyAudioStreamError,
    type VoiceConnectionEvents,
    type VoiceConnectionHandle,
    type VoicePlayerEvents,
    type VoicePlayerHandle,
    type VoiceRuntime,
} from "./voiceRuntime";

type DiscordPlayerHandle = {
    player: AudioPlayer;
    intentionalStop: boolean;
};

type DiscordConnectionHandle = {
    connection: VoiceConnection;
};

export class DiscordVoiceRuntime implements VoiceRuntime {
    createPlayer(events: VoicePlayerEvents): VoicePlayerHandle {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Stop,
                maxMissedFrames: 50,
            },
        });
        const handle: DiscordPlayerHandle = {
            player,
            intentionalStop: false,
        };
        const failedResources = new WeakSet<object>();

        player.on(AudioPlayerStatus.Idle, (oldState) => {
            if (oldState.status === AudioPlayerStatus.Idle) return;
            if (failedResources.delete(oldState.resource)) return;
            if (handle.intentionalStop) {
                handle.intentionalStop = false;
                events.idle();
                return;
            }
            if (oldState.resource.playbackDuration === 0) {
                events.error(new EmptyAudioStreamError());
                return;
            }
            events.idle();
        });
        player.on(AudioPlayerStatus.Playing, () => events.playing());
        player.on("error", (error) => {
            failedResources.add(error.resource);
            events.error(error);
        });

        return handle;
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
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5_000,
                    ),
                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5_000,
                    ),
                ]);
            } catch {
                events.disconnected();
            }
        });

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

    async play(
        player: VoicePlayerHandle,
        source: AudioSource,
        track: Track,
        signal: AbortSignal,
    ): Promise<void> {
        let input: string | Readable;

        if (source.kind === "stream") {
            input = source.stream;
        } else if (source.kind === "fetch") {
            const response = await fetch(source.url, { signal });
            if (!response.ok || !response.body) {
                throw new Error(
                    `Audio stream request failed (${response.status} ${response.statusText})`,
                );
            }
            input = Readable.fromWeb(response.body);
        } else {
            input = source.url;
        }

        const resource = createAudioResource(input, { metadata: track });
        this.player(player).play(resource);
    }

    pause(player: VoicePlayerHandle): boolean {
        return this.player(player).pause();
    }

    resume(player: VoicePlayerHandle): boolean {
        return this.player(player).unpause();
    }

    stop(player: VoicePlayerHandle): boolean {
        const handle = player as DiscordPlayerHandle;
        handle.intentionalStop = true;
        const stopped = handle.player.stop(true);
        if (!stopped) handle.intentionalStop = false;
        return stopped;
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
