import { MessageFlags } from "discord.js";
import { createCommand } from "../command";
import type { PlayerManager } from "../playerManager";
import { createNowPlayingEmbed } from "../utils/trackEmbeds";

export type NowPlayingCommandDeps = {
    playerManager: PlayerManager;
};

export const NowPlayingCommand = createCommand(
    "nowplaying",
    "show the currently playing track",
    {},
    async (interaction, _, { playerManager }: NowPlayingCommandDeps) => {
        const player = playerManager.getOrCreate(interaction.guildId);
        const currentTrack = player.getCurrentTrack();

        if (!currentTrack) {
            await interaction.reply({
                content: "Nothing is currently playing",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.reply({
            embeds: [createNowPlayingEmbed(currentTrack.track)],
        });
    },
);
