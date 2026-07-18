import type { Client } from "discord.js";
import type { Logger } from "../lib/logger";
import type { Track } from "../music/track";

export interface PlaybackNotifier {
    trackFailed(textChannelId: string, track: Track): Promise<void>;
}

export class DiscordPlaybackNotifier implements PlaybackNotifier {
    constructor(
        private readonly client: Client,
        private readonly logger: Logger,
    ) {}

    async trackFailed(textChannelId: string, track: Track): Promise<void> {
        try {
            const channel =
                this.client.channels.cache.get(textChannelId) ??
                (await this.client.channels.fetch(textChannelId));

            if (!channel?.isSendable()) return;

            await channel.send({
                content: `Failed to play **${track.title}**.`,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            this.logger.error("playback.notification_failed", error, {
                textChannelId,
                trackId: track.id,
            });
        }
    }
}
