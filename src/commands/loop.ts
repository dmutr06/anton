import {
    type ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../bot/command";
import { LOOP_MODES, type LoopMode } from "../music/queue";
import { type PlaybackControl, PlaybackError } from "../playback/playback";

export class LoopCommand implements Command {
    readonly data = new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Set the playback loop mode")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("Choose what should repeat")
                .setRequired(true)
                .addChoices(
                    { name: "Off", value: "off" },
                    { name: "Current track", value: "track" },
                    { name: "Entire queue", value: "queue" },
                ),
        );

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

        const value = interaction.options.getString("mode", true);
        if (!this.isLoopMode(value)) {
            await interaction.reply({
                content: "Invalid loop mode.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            const updated = this.playback.setLoopMode(
                interaction.guildId,
                voiceChannelId,
                value,
            );
            await interaction.reply({
                content: updated
                    ? `Loop mode set to **${value}**.`
                    : "Nothing is playing.",
                flags: updated ? undefined : MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (!(error instanceof PlaybackError)) throw error;

            await interaction.reply({
                content: error.message,
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    private isLoopMode(value: string): value is LoopMode {
        return LOOP_MODES.some((mode) => mode === value);
    }
}
