import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";

export type StopCommandDeps = {
    playerManager: PlayerManager;
};

export const StopCommand = createCommand(
    "stop",
    "stop playing and clear queue",
    {},
    async (interaction, _, { playerManager }: StopCommandDeps) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply("Must be in voice channel");
            return;
        }

        const player = playerManager.getOrCreate(interaction.guildId);
        if (!player) {
            await interaction.reply("Nothing to stop");
            return;
        }

        player.stop();

        await interaction.reply("Stopped");
    },
);
