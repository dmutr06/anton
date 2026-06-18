import { MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";

export type ClearCommandDeps = {
    playerManager: PlayerManager;
};

export const ClearCommand = createCommand(
    "clear",
    "clear the music queue",
    {},
    async (interaction, _, { playerManager }: ClearCommandDeps) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply({
                content: "Must be in voice channel",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const player = playerManager.getOrCreate(interaction.guildId);
        const queue = player.getQueue();

        if (queue.length === 0) {
            await interaction.reply({
                content: "The queue is already empty",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        player.clearQueue();
        await interaction.reply("Cleared the queue");
    },
);
