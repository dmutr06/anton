import type { VoiceBasedChannel } from "discord.js";
import type { Logger } from "../lib/logger";
import type { AudioSourceResolver } from "../music/provider";
import type { LoopMode, QueueSnapshot } from "../music/queue";
import type { Track } from "../music/track";
import { type PauseResult, PlaybackError, type ResumeResult } from "./playback";
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

type QueueLoop = {
    items: PlaybackQueueItem[];
    nextIndex: number;
};

export class GuildPlayback {
    private readonly player: VoicePlayerHandle;
    private readonly queue: PlaybackQueueItem[] = [];
    private current: PlaybackQueueItem | null = null;
    private currentController: AbortController | null = null;
    private connection: VoiceConnectionHandle | null = null;
    private voiceChannelId: string | null = null;
    private loopMode: LoopMode = "off";
    private queueLoop: QueueLoop | null = null;
    private currentLoopIndex: number | null = null;
    private repeatedTrack: PlaybackQueueItem | null = null;
    private skipRequested = false;
    private paused = false;
    private started = false;
    private advancing = false;
    private destroyed = false;

    constructor(private readonly dependencies: GuildPlaybackDependencies) {
        dependencies.logger.info("playback.session_created", {
            maxQueueTracks: dependencies.maxQueueTracks,
        });
        this.player = dependencies.voice.createPlayer({
            idle: () => this.handleIdle(),
            error: (error) => this.handlePlayerError(error),
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
        if (this.queueLoop) this.queueLoop.items.push(...items);
        else this.queue.push(...items);
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
            upcoming: this.upcomingItems.map((item) => item.track),
            loopMode: this.loopMode,
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

        this.skipRequested = true;
        this.currentController?.abort();

        if (!this.dependencies.voice.stop(this.player) && !this.advancing) {
            this.skipRequested = false;
            this.disposeCurrent();
            this.scheduleAdvance();
        }

        return true;
    }

    pause(channelId: string): PauseResult {
        this.assertVoiceChannel(channelId);
        if (!this.current) return "nothing_playing";
        if (this.paused) return "already_paused";
        if (!this.started) {
            this.paused = true;
            return "paused";
        }
        if (!this.dependencies.voice.pause(this.player)) {
            return "nothing_playing";
        }

        this.paused = true;
        this.dependencies.logger.info("playback.paused", {
            trackId: this.current.track.id,
        });
        return "paused";
    }

    resume(channelId: string): ResumeResult {
        this.assertVoiceChannel(channelId);
        if (!this.current) return "nothing_playing";
        if (!this.paused) return "already_playing";
        if (!this.started) {
            this.paused = false;
            return "resumed";
        }
        if (!this.dependencies.voice.resume(this.player)) {
            return "nothing_playing";
        }

        this.paused = false;
        this.dependencies.logger.info("playback.resumed", {
            trackId: this.current.track.id,
        });
        return "resumed";
    }

    clear(channelId: string): number {
        this.assertVoiceChannel(channelId);
        const removedTracks = this.queueLoop
            ? Math.max(0, this.queueLoop.items.length - (this.current ? 1 : 0))
            : this.queue.length;

        if (this.queueLoop) {
            this.queueLoop.items = this.current ? [this.current] : [];
            this.queueLoop.nextIndex = this.current ? 1 : 0;
            this.currentLoopIndex = this.current ? 0 : null;
        } else {
            this.queue.length = 0;
        }

        this.dependencies.logger.info("playback.queue_cleared", {
            removedTracks,
        });
        return removedTracks;
    }

    setLoopMode(channelId: string, mode: LoopMode): void {
        this.assertVoiceChannel(channelId);
        if (mode === this.loopMode) return;

        if (mode === "queue") {
            this.queueLoop = {
                items: this.current
                    ? [this.current, ...this.queue]
                    : [...this.queue],
                nextIndex: this.current ? 1 : 0,
            };
            this.currentLoopIndex = this.current ? 0 : null;
            this.queue.length = 0;
        } else if (this.queueLoop) {
            this.queue.push(...this.upcomingItems);
            this.queueLoop = null;
            this.currentLoopIndex = null;
        }

        if (mode !== "track") this.repeatedTrack = null;
        this.loopMode = mode;
        this.dependencies.logger.info("playback.loop_mode_changed", { mode });
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
        this.queueLoop = null;
        this.repeatedTrack = null;
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
        return this.queueLoop
            ? this.queueLoop.items.length
            : this.queue.length + (this.current ? 1 : 0);
    }

    private get upcomingItems(): readonly PlaybackQueueItem[] {
        if (!this.queueLoop) return this.queue;
        return this.queueLoop.items.slice(this.queueLoop.nextIndex);
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
                const item = this.takeNextItem();

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
                    this.started = true;
                    if (this.paused) this.dependencies.voice.pause(this.player);
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
                        this.removeCurrentFromQueueLoop();
                    } else {
                        this.skipRequested = false;
                    }
                    this.disposeCurrent();
                }
            }
        } finally {
            this.advancing = false;

            if (!this.current && this.hasNextItem && !this.destroyed) {
                this.scheduleAdvance();
            }
        }
    }

    private get hasNextItem(): boolean {
        return Boolean(
            this.repeatedTrack ||
                this.queue.length > 0 ||
                (this.queueLoop && this.queueLoop.items.length > 0),
        );
    }

    private takeNextItem(): PlaybackQueueItem | undefined {
        if (this.repeatedTrack) {
            const item = this.repeatedTrack;
            this.repeatedTrack = null;
            this.currentLoopIndex = null;
            return item;
        }

        if (!this.queueLoop) {
            this.currentLoopIndex = null;
            return this.queue.shift();
        }

        if (this.queueLoop.items.length === 0) return undefined;
        if (this.queueLoop.nextIndex >= this.queueLoop.items.length) {
            this.queueLoop.nextIndex = 0;
        }

        this.currentLoopIndex = this.queueLoop.nextIndex;
        return this.queueLoop.items[this.queueLoop.nextIndex++];
    }

    private removeCurrentFromQueueLoop(): void {
        if (!this.queueLoop || this.currentLoopIndex === null) return;

        this.queueLoop.items.splice(this.currentLoopIndex, 1);
        if (this.currentLoopIndex < this.queueLoop.nextIndex) {
            this.queueLoop.nextIndex--;
        }
        this.currentLoopIndex = null;
    }

    private handleIdle(): void {
        const item = this.current;
        if (item) {
            this.dependencies.logger.info("playback.track_ended", {
                trackId: item.track.id,
            });
        }

        if (
            item &&
            (this.loopMode === "track" || item.track.isLive) &&
            !this.skipRequested
        ) {
            this.repeatedTrack = item;
        }

        this.skipRequested = false;
        this.disposeCurrent();
        this.scheduleAdvance();
    }

    private handlePlayerError(error: Error): void {
        const item = this.current;
        this.dependencies.logger.error("playback.player_failed", error, {
            trackId: item?.track.id,
        });
        if (!item) return;

        if (item.track.isLive && !this.skipRequested) {
            this.repeatedTrack = item;
        } else if (!this.skipRequested) {
            this.removeCurrentFromQueueLoop();
            void this.reportPlaybackError(item);
        }

        this.skipRequested = false;
        this.disposeCurrent();
        this.scheduleAdvance();
    }

    private async ensureConnection(
        channel: VoiceBasedChannel,
    ): Promise<VoiceConnectionHandle> {
        if (this.connection && this.voiceChannelId === channel.id) {
            this.dependencies.logger.debug(
                "playback.voice_connection_checking",
                { voiceChannelId: channel.id },
            );
            const connection = this.connection;
            try {
                await this.dependencies.voice.waitUntilReady(
                    connection,
                    VOICE_CONNECTION_TIMEOUT_MS,
                );
                return connection;
            } catch (error) {
                this.dependencies.voice.destroy(connection);
                if (this.connection === connection) this.connection = null;
                throw new PlaybackError("Failed to join the voice channel.", {
                    cause: error,
                });
            }
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
        this.currentLoopIndex = null;
        this.paused = false;
        this.started = false;
    }

    private async reportPlaybackError(item: PlaybackQueueItem): Promise<void> {
        await this.dependencies.notifier.trackFailed(
            item.textChannelId,
            item.track,
        );
    }
}
