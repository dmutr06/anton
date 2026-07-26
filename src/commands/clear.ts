import {
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { type PlaybackControl, PlaybackError } from "../playback/playback";

export class ClearCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Clear the upcoming track queue");

    constructor(private readonly playback: PlaybackControl) {}

    async execute(
        interaction: ChatInputCommandInteraction<"cached">,
    ): Promise<void> {
        const voiceChannelId = interaction.member.voice.channelId;

        if (!voiceChannelId) {
            await interaction.reply({
                content: "You must be in a voice channel to use this command.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            const removedTracks = this.playback.clear(
                interaction.guildId,
                voiceChannelId,
            );
            await interaction.reply({
                content:
                    removedTracks > 0
                        ? `Cleared ${removedTracks} queued ${removedTracks === 1 ? "track" : "tracks"}.`
                        : "The queue is already empty.",
                flags: removedTracks > 0 ? undefined : MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (!(error instanceof PlaybackError)) throw error;

            await interaction.reply({
                content: error.message,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
