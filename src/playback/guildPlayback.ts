import type { VoiceBasedChannel } from "discord.js";
import type { Logger } from "../lib/logger";
import type { AudioSourceResolver } from "../music/provider";
import type { QueueSnapshot } from "../music/queue";
import type { Track } from "../music/track";
import { PlaybackError } from "./playback";
import type { PlaybackNotifier } from "./playbackNotifier";
import type {
    VoiceConnectionHandle,
    VoicePlayerHandle,
    VoiceRuntime,
} from "./voiceRuntime";

const VOICE_CONNECTION_TIMEOUT_MS = 15_000;

export type PlaybackQueueItem = {
    track: Track;
    voiceChannel: VoiceBasedChannel;
    textChannelId: string;
    requestedByUserId: string;
};

export type GuildPlaybackDependencies = {
    guildId: string;
    sources: AudioSourceResolver;
    voice: VoiceRuntime;
    notifier: PlaybackNotifier;
    logger: Logger;
    maxQueueTracks: number;
    onDestroy(): void;
};

export class GuildPlayback {
    private readonly player: VoicePlayerHandle;
    private readonly queue: PlaybackQueueItem[] = [];
    private current: PlaybackQueueItem | null = null;
    private currentController: AbortController | null = null;
    private connection: VoiceConnectionHandle | null = null;
    private voiceChannelId: string | null = null;
    private advancing = false;
    private destroyed = false;

    constructor(private readonly dependencies: GuildPlaybackDependencies) {
        dependencies.logger.info("playback.session_created", {
            maxQueueTracks: dependencies.maxQueueTracks,
        });
        this.player = dependencies.voice.createPlayer({
            idle: () => {
                const item = this.current;
                if (item) {
                    this.dependencies.logger.info("playback.track_ended", {
                        trackId: item.track.id,
                    });
                }
                this.disposeCurrent();
                this.scheduleAdvance();
            },
            error: (error) => {
                const item = this.current;
                this.dependencies.logger.error(
                    "playback.player_failed",
                    error,
                    {
                        trackId: item?.track.id,
                    },
                );
                if (item) void this.reportPlaybackError(item);
            },
        });
    }

    enqueue(items: readonly PlaybackQueueItem[]): void {
        if (items.length === 0) return;

        if (this.destroyed) {
            throw new PlaybackError(
                "The playback session is no longer available.",
            );
        }

        const channelId = items[0]?.voiceChannel.id;
        if (
            channelId &&
            this.voiceChannelId &&
            channelId !== this.voiceChannelId
        ) {
            this.dependencies.logger.warn("playback.voice_channel_conflict", {
                activeVoiceChannelId: this.voiceChannelId,
                requestedVoiceChannelId: channelId,
            });
            throw new PlaybackError(
                "The bot is already playing in another voice channel.",
            );
        }

        const nextSize = this.size + items.length;
        if (nextSize > this.dependencies.maxQueueTracks) {
            this.dependencies.logger.warn("playback.queue_limit_reached", {
                maxQueueTracks: this.dependencies.maxQueueTracks,
                queueSize: this.size,
                requestedTracks: items.length,
            });
            throw new PlaybackError(
                `The queue can hold at most ${this.dependencies.maxQueueTracks} tracks.`,
            );
        }

        if (channelId) this.voiceChannelId = channelId;
        this.queue.push(...items);
        this.dependencies.logger.info("playback.tracks_enqueued", {
            enqueuedTracks: items.length,
            queueSize: this.size,
            voiceChannelId: channelId,
        });

        if (!this.current && !this.advancing) this.scheduleAdvance();
    }

    getQueue(): QueueSnapshot {
        return {
            current: this.current?.track ?? null,
            upcoming: this.queue.map((item) => item.track),
            loopMode: "off",
        };
    }

    assertVoiceChannel(channelId: string): void {
        if (this.voiceChannelId && this.voiceChannelId !== channelId) {
            throw new PlaybackError(
                "You must be in the same voice channel as the bot.",
            );
        }
    }

    skip(channelId: string): boolean {
        this.assertVoiceChannel(channelId);
        if (!this.current) {
            this.dependencies.logger.debug("playback.skip_ignored", {
                reason: "nothing_playing",
            });
            return false;
        }

        this.dependencies.logger.info("playback.track_skipped", {
            trackId: this.current.track.id,
        });

        this.currentController?.abort();

        if (!this.dependencies.voice.stop(this.player) && !this.advancing) {
            this.disposeCurrent();
            this.scheduleAdvance();
        }

        return true;
    }

    destroy(
        reason: "failed" | "queue_finished" | "shutdown" | "stopped",
    ): void {
        if (this.destroyed) return;

        this.dependencies.logger.info("playback.session_destroyed", {
            queueSize: this.size,
            reason,
        });
        this.destroyed = true;
        this.queue.length = 0;
        this.disposeCurrent();
        this.dependencies.voice.stop(this.player);

        if (this.connection) {
            this.dependencies.voice.destroy(this.connection);
            this.connection = null;
        }

        this.voiceChannelId = null;
        this.dependencies.onDestroy();
    }

    private get size(): number {
        return this.queue.length + (this.current ? 1 : 0);
    }

    private scheduleAdvance(): void {
        void this.advance().catch((error) => {
            this.dependencies.logger.error("playback.session_failed", error);
            this.destroy("failed");
        });
    }

    private async advance(): Promise<void> {
        if (this.advancing || this.current || this.destroyed) return;

        this.advancing = true;

        try {
            while (!this.current && !this.destroyed) {
                const item = this.queue.shift();

                if (!item) {
                    this.destroy("queue_finished");
                    return;
                }

                const controller = new AbortController();
                this.current = item;
                this.currentController = controller;

                try {
                    this.dependencies.logger.debug("playback.track_loading", {
                        trackId: item.track.id,
                    });
                    const connection = await this.ensureConnection(
                        item.voiceChannel,
                    );
                    const source =
                        await this.dependencies.sources.getAudioSource(
                            item.track,
                            controller.signal,
                        );
                    controller.signal.throwIfAborted();

                    this.dependencies.voice.subscribe(connection, this.player);
                    this.dependencies.voice.play(
                        this.player,
                        source.url,
                        item.track,
                    );
                    this.dependencies.logger.info("playback.track_started", {
                        provider: item.track.provider,
                        trackId: item.track.id,
                    });
                } catch (error) {
                    if (!controller.signal.aborted) {
                        this.dependencies.logger.error(
                            "playback.track_start_failed",
                            error,
                            { trackId: item.track.id },
                        );
                        await this.reportPlaybackError(item);
                    }
                    this.disposeCurrent();
                }
            }
        } finally {
            this.advancing = false;

            if (!this.current && this.queue.length > 0 && !this.destroyed) {
                this.scheduleAdvance();
            }
        }
    }

    private async ensureConnection(
        channel: VoiceBasedChannel,
    ): Promise<VoiceConnectionHandle> {
        if (this.connection && this.voiceChannelId === channel.id) {
            this.dependencies.logger.debug(
                "playback.voice_connection_checking",
                { voiceChannelId: channel.id },
            );
            await this.dependencies.voice.waitUntilReady(
                this.connection,
                VOICE_CONNECTION_TIMEOUT_MS,
            );
            return this.connection;
        }

        if (this.connection) this.dependencies.voice.destroy(this.connection);

        this.dependencies.logger.info("playback.voice_connecting", {
            voiceChannelId: channel.id,
        });
        const connection = this.dependencies.voice.connect(channel, {
            error: (error) => {
                this.dependencies.logger.error(
                    "playback.voice_connection_failed",
                    error,
                    { voiceChannelId: channel.id },
                );
            },
        });

        try {
            await this.dependencies.voice.waitUntilReady(
                connection,
                VOICE_CONNECTION_TIMEOUT_MS,
            );
        } catch (error) {
            this.dependencies.voice.destroy(connection);
            throw new PlaybackError("Failed to join the voice channel.", {
                cause: error,
            });
        }

        this.connection = connection;
        this.voiceChannelId = channel.id;
        this.dependencies.logger.info("playback.voice_connected", {
            voiceChannelId: channel.id,
        });
        return connection;
    }

    private disposeCurrent(): void {
        this.currentController?.abort();
        this.currentController = null;
        this.current = null;
    }

    private async reportPlaybackError(item: PlaybackQueueItem): Promise<void> {
        await this.dependencies.notifier.trackFailed(
            item.textChannelId,
            item.track,
        );
    }
}
