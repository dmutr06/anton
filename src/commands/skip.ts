import {
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { type PlaybackControl, PlaybackError } from "../playback/playback";

export class SkipCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current track");

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
            const skipped = this.playback.skip(
                interaction.guildId,
                voiceChannelId,
            );
            await interaction.reply({
                content: skipped
                    ? "Skipped the current track."
                    : "Nothing is playing.",
                flags: skipped ? undefined : MessageFlags.Ephemeral,
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
