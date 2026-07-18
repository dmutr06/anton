import type { Client, VoiceBasedChannel } from "discord.js";
import type { Logger } from "../lib/logger";
import type { AudioSourceResolver } from "../music/provider";
import type { QueueReader, QueueSnapshot } from "../music/queue";
import { GuildPlayback } from "./guildPlayback";
import {
    type EnqueueTracksRequest,
    type Playback,
    type PlaybackControl,
    PlaybackError,
} from "./playback";
import type { PlaybackNotifier } from "./playbackNotifier";
import type { VoiceRuntime } from "./voiceRuntime";

export type DiscordPlaybackDependencies = {
    client: Client;
    sources: AudioSourceResolver;
    voice: VoiceRuntime;
    notifier: PlaybackNotifier;
    logger: Logger;
    maxQueueTracks: number;
};

export class DiscordPlaybackManager
    implements Playback, PlaybackControl, QueueReader
{
    private readonly players = new Map<string, GuildPlayback>();

    constructor(private readonly dependencies: DiscordPlaybackDependencies) {}

    async enqueue(request: EnqueueTracksRequest): Promise<void> {
        if (request.tracks.length === 0) return;
        if (request.tracks.length > this.dependencies.maxQueueTracks) {
            this.dependencies.logger.warn("playback.queue_limit_reached", {
                guildId: request.guildId,
                maxQueueTracks: this.dependencies.maxQueueTracks,
                requestedTracks: request.tracks.length,
            });
            throw new PlaybackError(
                `The queue can hold at most ${this.dependencies.maxQueueTracks} tracks.`,
            );
        }

        const voiceChannel = await this.getVoiceChannel(
            request.guildId,
            request.voiceChannelId,
        );
        const player = this.getOrCreate(request.guildId);

        player.enqueue(
            request.tracks.map((track) => ({
                track,
                voiceChannel,
                textChannelId: request.textChannelId,
                requestedByUserId: request.requestedByUserId,
            })),
        );
    }

    async getQueue(guildId: string): Promise<QueueSnapshot> {
        return (
            this.players.get(guildId)?.getQueue() ?? {
                current: null,
                upcoming: [],
                loopMode: "off",
            }
        );
    }

    skip(guildId: string, voiceChannelId: string): boolean {
        return this.players.get(guildId)?.skip(voiceChannelId) ?? false;
    }

    stop(guildId: string, voiceChannelId: string): boolean {
        const player = this.players.get(guildId);
        if (!player) return false;

        player.assertVoiceChannel(voiceChannelId);
        player.destroy("stopped");
        return true;
    }

    destroy(): void {
        this.dependencies.logger.info("playback.manager_stopping", {
            sessionCount: this.players.size,
        });
        for (const player of [...this.players.values()]) {
            player.destroy("shutdown");
        }
        this.players.clear();
    }

    private getOrCreate(guildId: string): GuildPlayback {
        const existing = this.players.get(guildId);
        if (existing) return existing;

        let player: GuildPlayback;
        player = new GuildPlayback({
            guildId,
            sources: this.dependencies.sources,
            voice: this.dependencies.voice,
            notifier: this.dependencies.notifier,
            logger: this.dependencies.logger.child({ guildId }),
            maxQueueTracks: this.dependencies.maxQueueTracks,
            onDestroy: () => {
                if (this.players.get(guildId) === player) {
                    this.players.delete(guildId);
                }
            },
        });
        this.players.set(guildId, player);
        return player;
    }

    private async getVoiceChannel(
        guildId: string,
        channelId: string,
    ): Promise<VoiceBasedChannel> {
        const channel =
            this.dependencies.client.channels.cache.get(channelId) ??
            (await this.dependencies.client.channels.fetch(channelId));

        if (!channel?.isVoiceBased() || channel.guildId !== guildId) {
            this.dependencies.logger.warn(
                "playback.voice_channel_unavailable",
                {
                    channelId,
                    guildId,
                },
            );
            throw new PlaybackError(
                "The selected voice channel is unavailable.",
            );
        }

        return channel;
    }
}
