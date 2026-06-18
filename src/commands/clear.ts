import { MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";
import { validateVoice } from "../utils/voice";

export type ClearCommandDeps = {
    playerManager: PlayerManager;
};

export const ClearCommand = createCommand(
    "clear",
    "clear the music queue",
    {},
    async (interaction, _, { playerManager }: ClearCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        if (!(await validateVoice(interaction, player))) return;

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
