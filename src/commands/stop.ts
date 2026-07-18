import {
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { type PlaybackControl, PlaybackError } from "../playback/playback";

export class StopCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop playback and clear the queue");

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
            const stopped = this.playback.stop(
                interaction.guildId,
                voiceChannelId,
            );
            await interaction.reply({
                content: stopped
                    ? "Stopped playback and cleared the queue."
                    : "Nothing is playing.",
                flags: stopped ? undefined : MessageFlags.Ephemeral,
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
