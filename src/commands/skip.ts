import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";

export type SkipCommandDeps = {
    playerManager: PlayerManager;
};

export const SkipCommand = createCommand(
    "skip",
    "skip current track",
    {},
    async (interaction, _, { playerManager }: SkipCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        if (!player) {
            await interaction.reply("Not playing anything");
            return;
        }

        if (player.skip()) {
            await interaction.reply("Skipped");
        } else {
            await interaction.reply("Nothing to skip");
        }
    },
);
