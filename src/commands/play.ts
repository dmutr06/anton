import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";
import { createAddedToQueueEmbed } from "../utils/trackEmbeds";

export type PlayCommandDeps = {
    playerManager: PlayerManager;
};

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const PlayCommand = createCommand(
    "play",
    "play youtube video",
    {
        query: {
            type: OptionType.String,
            description: "query or url",
            required: true,
            autocomplete: true,
        },
        args: {
            type: OptionType.String,
            description: "ffmpeg args",
            required: false,
        },
    },
    async (
        interaction,
        { query, args },
        { playerManager }: PlayCommandDeps,
    ) => {
        if (!interaction.channel) {
            await interaction.reply("Must be in guild");
            return;
        }
        if (!interaction.member.voice.channel) {
            await interaction.reply("Must be in voice channel");
            return;
        }

        await interaction.deferReply();

        const player = playerManager.getOrCreate(interaction.guildId);
        try {
            const track = await player.enqueue({
                query,
                args,
                voiceChannel: interaction.member.voice.channel,
                textChannel: interaction.channel,
            });

            await interaction.editReply({
                embeds: [createAddedToQueueEmbed(track)],
            });
        } catch (e) {
            if (e instanceof Error) {
                await interaction.editReply(`Error: ${e.message}`);
            } else {
                await interaction.editReply("Something went wrong...");
            }
        }
    },
    async (interaction, { playerManager }) => {
        const focused = interaction.options.getFocused(true);

        console.log(focused);

        if (focused.name !== "query") return;

        const query = focused.value.trim();

        if (!query) {
            await interaction.respond([]);
            return;
        };

        const player = playerManager.getOrCreate(interaction.guildId);
        const provider = player.providers[0]!;

        try {
            const result = await provider.search(query);
            const suggestions = result.slice(0, 5).map((t) => ({
                name: `${t.author} - ${t.title} (${formatDuration(t.duration)})`,
                value: t.id,
            }));
            await interaction.respond(suggestions);
        } catch (e) {
            await interaction.respond([]);
        }
    }
);
