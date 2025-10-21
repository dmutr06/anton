import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";

export type PlayCommandDeps = {
    playerManager: PlayerManager;
};

export const PlayCommand = createCommand(
    "play",
    "play youtube video",
    {
        query: {
            type: OptionType.String,
            description: "query or url",
            required: true,
        },
        args: {
            type: OptionType.String,
            description: "ffmpeg args",
            required: false,
        }
    },
    async (interaction, { query, args }, { playerManager }: PlayCommandDeps) => {
        if (!interaction.member.voice.channel) {
            await interaction.reply("Must be in voice channel");
            return;
        }

        await interaction.deferReply();

        const player = playerManager.getOrCreate(interaction.guildId);
        try {
            await player.enqueue({ query, args }, interaction.member.voice.channel);
        } catch (e) {
            if (e instanceof Error) {
                await interaction.editReply(`Error: ${e.message}`);
            } else {
                await interaction.editReply("Something went wrong...");
            }
        }

        await interaction.editReply("Added to queue");
    },
);
