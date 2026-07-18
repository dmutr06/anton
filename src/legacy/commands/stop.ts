import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";
import { validateVoice } from "../utils/voice";

export type StopCommandDeps = {
    playerManager: PlayerManager;
};

export const StopCommand = createCommand(
    "stop",
    "stop playing and clear queue",
    {},
    async (interaction, _, { playerManager }: StopCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        if (!(await validateVoice(interaction, player))) return;
        if (!player) {
            await interaction.reply("Nothing to stop");
            return;
        }

        player.stop();

        await interaction.reply("Stopped");
    },
);
