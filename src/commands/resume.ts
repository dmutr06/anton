import {
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { type PlaybackControl, PlaybackError } from "../playback/playback";

export class ResumeCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume the paused track");

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
            const result = this.playback.resume(
                interaction.guildId,
                voiceChannelId,
            );
            await interaction.reply({
                content:
                    result === "resumed"
                        ? "Resumed playback."
                        : result === "already_playing"
                          ? "Playback is already running."
                          : "Nothing is playing.",
                flags:
                    result === "resumed" ? undefined : MessageFlags.Ephemeral,
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
