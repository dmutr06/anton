import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";

export type PlayCommandDeps = {
    playerManager: PlayerManager;
};

export const PlayCommand = createCommand(
    "play",
    "play youtube video",
    {
        url: {
            type: OptionType.String,
            description: "video url",
            required: true,
        },
    },
    async (interaction, { url }, { playerManager }: PlayCommandDeps) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply("Must be in voice channel");
            return;
        }

        await interaction.deferReply();

        const player = playerManager.getOrCreate(interaction.guildId);
        try {
            player.enqueue(url, interaction.member.voice.channel);
        } catch (e) {
            if (e instanceof Error) {
                await interaction.editReply(`Error: ${e.message}`);
            } else {
                await interaction.editReply("Something went wrong...");
            }
        }

        await interaction.editReply("Added to queue");
    }
);
