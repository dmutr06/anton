import { MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";
import { validateVoice } from "../utils/voice";

export type ResumeCommandDeps = {
    playerManager: PlayerManager;
};

export const ResumeCommand = createCommand(
    "resume",
    "resume playback",
    {},
    async (interaction, _, { playerManager }: ResumeCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        if (!(await validateVoice(interaction, player))) return;
        if (!player.isPaused()) {
            await interaction.reply({
                content: "Playback is not paused",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (player.resume()) {
            await interaction.reply("Resumed");
        } else {
            await interaction.reply({
                content: "Nothing is playing",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
);
