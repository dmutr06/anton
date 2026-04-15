import type { Provider, SearchableProvider, TrendingProvider } from "../provider";
import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";
import { createAddedToQueueEmbed } from "../utils/trackEmbeds";
import type { Track } from "../track";

export type PlayCommandDeps = {
    playerManager: PlayerManager;
    providers: Provider[];
    defaultProvider: SearchableProvider & TrendingProvider;
};

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const activeSearches = new Map<string, AbortController>();

export const PlayCommand = createCommand(
    "play",
    "play a track",
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
        { query: rawQuery, args },
        { playerManager, providers, defaultProvider }: PlayCommandDeps,
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

        const query = rawQuery.trim();
        let track: Track | null = null;
        let chosenProvider: Provider = defaultProvider;

        for (const provider of providers) {
            if (provider.urlMatches(query)) {
                track = await provider.resolveUrl(query);
                chosenProvider = provider;
                break;
            }
        }

        if (!track && defaultProvider.idMatches(query)) {
            track = await defaultProvider.resolveId(query);
        }

        if (!track) {
            track = (await defaultProvider.search(query))[0] || null;
        }

        if (!track) {
            await interaction.reply("Could not find a track...");
            return;
        }

        player.enqueue({
            track,
            args,
            voiceChannel: interaction.member.voice.channel,
            textChannel: interaction.channel,
            getStream: () => chosenProvider.getStream(track),
        });

        await interaction.editReply({
            embeds: [createAddedToQueueEmbed(track)],
        });
    },
    async (interaction, { defaultProvider, providers }) => {
        const focused = interaction.options.getFocused(true);

        if (focused.name !== "query") return;

        const query = focused.value.trim();


        const userId = interaction.user.id;

        activeSearches.get(userId)?.abort();

        const userController = new AbortController();
        activeSearches.set(userId, userController);

        const signals = AbortSignal.any([
            userController.signal,
            AbortSignal.timeout(2900),
        ]);

        try {
            if (!query) {
                const result = await defaultProvider.getTrending(signals);

                const suggestions = result.filter(Boolean).slice(0, 10).map((t) => ({
                    name: `${t.author} - ${t.title} (${formatDuration(t.duration)})`.slice(0, 100),
                    value: t.id,
                }));

                await interaction.respond(suggestions);
                return;
            };

            for (const provider of providers) {
                if (!provider.urlMatches(query)) continue

                const track = await provider.resolveUrl(query, signals);
                if (!track) break;

                const suggestion = {
                    name: `${track.author} - ${track.title} (${formatDuration(track.duration)})`,
                    value: track.url,
                };

                await interaction.respond([suggestion]);

                return;
            }

            const result = await defaultProvider.search(query, signals);
            const suggestions = result.filter(Boolean).slice(0, 10).map((t) => ({
                name: `${t.author} - ${t.title} (${formatDuration(t.duration)})`,
                value: t.id,
            }));
            await interaction.respond(suggestions);
        } catch (e) {
            if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
                return;
            }
            await interaction.respond([]);
            console.log(e);
        }
    }
);
