import { MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";

export type PauseCommandDeps = {
    playerManager: PlayerManager;
};

export const PauseCommand = createCommand(
    "pause",
    "pause playback",
    {},
    async (interaction, _, { playerManager }: PauseCommandDeps) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply({
                content: "Must be in voice channel",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const player = playerManager.getOrCreate(interaction.guildId);
        if (player.isPaused()) {
            await interaction.reply({
                content: "Playback is already paused",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (player.pause()) {
            await interaction.reply("Paused");
        } else {
            await interaction.reply({
                content: "Nothing is playing",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
);
