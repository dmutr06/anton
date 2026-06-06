import type {
    Provider,
    SearchableProvider,
    TrendingProvider,
} from "../provider";
import { createCommand, OptionType } from "../command";
import type { PlayerManager } from "../playerManager";
import {
    createAddedToQueueEmbed,
    createErrorEmbed,
    createAddedPlaylistToQueueEmbed,
} from "../utils/trackEmbeds";
import type { Track, Playlist } from "../track";
import { PlayError, PlayErrorKind, toPlayError } from "../errors";

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
        let resolved: Track | Playlist | null = null;
        let chosenProvider: Provider = defaultProvider;

        try {
            for (const provider of providers) {
                if (provider.matchUrl(query)) {
                    resolved = await provider.resolveUrl(query);
                    chosenProvider = provider;
                    break;
                }
            }

            if (!resolved && defaultProvider.matchId(query)) {
                resolved = await defaultProvider.resolveId(query);
            }

            if (!resolved) {
                resolved = (await defaultProvider.search(query))[0] || null;
            }
        } catch (error) {
            console.error("Error resolving track/playlist:", error);
            const playError = toPlayError(error);
            await interaction.editReply({
                embeds: [createErrorEmbed(playError)],
            });
            return;
        }

        if (!resolved) {
            const playError = new PlayError(
                PlayErrorKind.NotFound,
                `Could not find a track matching: "${query}"`,
            );
            await interaction.editReply({
                embeds: [createErrorEmbed(playError)],
            });
            return;
        }

        if ("tracks" in resolved) {
            for (const track of resolved.tracks) {
                player.enqueue({
                    track,
                    args,
                    voiceChannel: interaction.member.voice.channel,
                    textChannel: interaction.channel,
                    getStream: () => chosenProvider.getStream(track),
                });
            }

            await interaction.editReply({
                embeds: [createAddedPlaylistToQueueEmbed(resolved)],
            });
        } else {
            player.enqueue({
                track: resolved,
                args,
                voiceChannel: interaction.member.voice.channel,
                textChannel: interaction.channel,
                getStream: () => chosenProvider.getStream(resolved),
            });

            await interaction.editReply({
                embeds: [createAddedToQueueEmbed(resolved)],
            });
        }
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

                const suggestions = result
                    .filter(Boolean)
                    .slice(0, 20)
                    .map((t) => ({
                        name: `${t.author} - ${t.title} (${formatDuration(t.duration)})`.slice(
                            0,
                            100,
                        ),
                        value: t.id,
                    }));

                await interaction.respond(suggestions);
                return;
            }

            for (const provider of providers) {
                if (!provider.matchUrl(query)) continue;

                const resolved = await provider.resolveUrl(query, signals);
                if (!resolved) break;

                const suggestionName =
                    "tracks" in resolved
                        ? `${resolved.author} - ${resolved.title} (${resolved.tracks.length} tracks)`
                        : `${resolved.author} - ${resolved.title} (${formatDuration(resolved.duration)})`;

                const suggestion = {
                    name: suggestionName.slice(0, 100),
                    value: resolved.url,
                };

                await interaction.respond([suggestion]);

                return;
            }

            const result = await defaultProvider.search(query, signals);
            const suggestions = result
                .filter(Boolean)
                .slice(0, 20)
                .map((t) => ({
                    name: `${t.author} - ${t.title} (${formatDuration(t.duration)})`.slice(
                        0,
                        100,
                    ),
                    value: t.id,
                }));
            await interaction.respond(suggestions);
        } catch (e) {
            if (
                e instanceof Error &&
                (e.name === "AbortError" || e.name === "TimeoutError")
            ) {
                return;
            }
            await interaction.respond([]);
            console.log(e);
        }
    },
);
